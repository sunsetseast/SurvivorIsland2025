import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)(
  process.env.PLAYWRIGHT_MODULE || "playwright",
);
const root = fileURLToPath(new URL("../", import.meta.url)),
  output = process.env.INITIATIVE_RENDERED_OUTPUT || "/tmp/initiative-rendered";
fs.mkdirSync(output, { recursive: true });
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    "." + new URL(req.url, "http://localhost").pathname,
  );
  if (
    !file.startsWith(root) ||
    !fs.existsSync(file) ||
    fs.statSync(file).isDirectory()
  ) {
    res.writeHead(404);
    res.end();
    return;
  }
  res.setHeader(
    "Content-Type",
    {
      ".js": "text/javascript",
      ".css": "text/css",
      ".html": "text/html",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
    }[path.extname(file)] || "application/octet-stream",
  );
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CAMP_QA_EXECUTABLE
    ? {
        executablePath: process.env.CAMP_QA_EXECUTABLE,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      }
    : {}),
});
const checks = [],
  errors = [];
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.stack));
  await page.goto(
    `http://127.0.0.1:${server.address().port}/qa/scramble-experience.html`,
  );
  await page.waitForFunction(() => window.experienceQaReady);
  const incoming = async (pre = false) =>
    page.evaluate((pre) => {
      window.experienceQa.scene("start");
      const { gm, activity, renderer } = window.scrambleQa,
        e = gm.systems.conversationSystem.engine;
      gm.systems.allianceSystem.reset();
      e.deserialize();
      if (pre) {
        gm.gamePhase = "preChallenge";
        gm.systems.strategyPhaseSystem.isActive = false;
        activity.phaseId = activity.phase;
      }
      const [npc, , , target] = activity.npcs();
      npc.firstName = "Alexandria Montgomery-Wellington";
      target.firstName = "Christopher Alexander";
      e.initiative.create(npc, gm.player.id, {
        type: pre ? "check_in" : "ask_vote",
        fields: pre ? {} : { subjectId: target.id },
        key: "qa:meaningful-approach",
        reason: "PRIVATE MOTIVE SHOULD NEVER BE SHOWN",
        private: true,
      });
      activity.interrupt(npc, "qa motive");
      activity.chooseNext(npc, gm.dayTimer);
      window.scrambleQa.wait(45);
      renderer.refresh();
      window.initiativeQa = { npcId: npc.id, targetId: target.id };
    }, pre);
  const inspect = async (scene, viewport, selector) => {
    const region = page.locator(selector);
    await region.waitFor({ state: "visible" });
    const box = await region.evaluate((e) => ({
      overflow: document.body.scrollWidth > innerWidth + 1,
      hidden: e.innerText.includes("PRIVATE MOTIVE"),
      buttons: [...e.querySelectorAll("button")].map((b) => ({
        width: b.getBoundingClientRect().width,
        height: b.getBoundingClientRect().height,
      })),
      text: e.innerText,
    }));
    assert.equal(box.overflow, false, `${scene}: horizontal overflow`);
    assert.equal(box.hidden, false, `${scene}: private intent`);
    assert.ok(
      box.buttons.every((b) => b.width >= 44 && b.height >= 44),
      `${scene}: tap targets`,
    );
    for (const button of await region.locator("button").all()) {
      await button.scrollIntoViewIfNeeded();
      assert.ok(
        await button.evaluate((b) => {
          const r = b.getBoundingClientRect();
          return (
            r.top >= 0 &&
            r.bottom <= innerHeight &&
            r.left >= 0 &&
            r.right <= innerWidth + 1
          );
        }),
        `${scene}: reachable control`,
      );
    }
    checks.push({ scene, viewport, ...box });
    await page.screenshot({
      path: path.join(
        output,
        `${scene}-${viewport.width}x${viewport.height}.png`,
      ),
    });
  };
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await incoming(true);
    await inspect("pre-invitation", viewport, ".npc-initiative-notice");
    assert.equal(
      await page
        .locator(".npc-initiative-notice p")
        .evaluate((p) => getComputedStyle(p).color),
      "rgb(255, 241, 216)",
      "readable invitation speech in pre-immunity camp",
    );
    checks.push({ scene: "invitation-speech-contrast", viewport });
    await page.waitForTimeout(2100);
    assert.equal(
      await page.locator("#conversation-overlay").count(),
      0,
      "no wall-time consent",
    );
    checks.push({ scene: "no-auto-accept", viewport });
    const trust = await page.evaluate(() =>
      window.scrambleQa.gm.getTrust(
        window.initiativeQa.npcId,
        window.scrambleQa.gm.player.id,
      ),
    );
    await page.getByRole("button", { name: /Give me a minute/ }).click();
    assert.equal(
      await page.evaluate(() =>
        window.scrambleQa.gm.getTrust(
          window.initiativeQa.npcId,
          window.scrambleQa.gm.player.id,
        ),
      ),
      trust,
    );
    assert.equal(await page.locator("#conversation-overlay").count(), 0);
    checks.push({ scene: "defer-no-penalty", viewport });
    await incoming();
    await inspect("strategic-invitation", viewport, ".npc-initiative-notice");
    await page.getByRole("button", { name: /Talk now/ }).focus();
    await page.keyboard.press("Enter");
    await inspect("initiator-proposal", viewport, "#conversation-overlay");
    const button = (name) =>
      page
        .locator("#conversation-overlay")
        .getByRole("button", { name, exact: true });
    await button("Why Christopher Alexander?").click();
    await inspect("npc-followup", viewport, "#conversation-overlay");
    assert.ok(
      (await page.locator(".conversation-transcript").innerText()).includes(
        "What would make",
      ),
    );
    await button("Only if someone else is really in").click();
    await inspect("conditional-person", viewport, "#conversation-overlay");
    await page
      .locator("#conversation-overlay button")
      .filter({ hasText: "Only if" })
      .first()
      .click();
    await inspect("conditional-negotiation", viewport, "#conversation-overlay");
    const cp = await page.evaluate(() =>
      JSON.stringify(
        window.scrambleQa.activity.conversation.checkpoint.npcNegotiation,
      ),
    );
    await page.evaluate(() => window.experienceQa.restore());
    await page
      .getByRole("button", { name: "Resume conversation", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify(
          window.scrambleQa.activity.conversation.checkpoint.npcNegotiation,
        ),
      ),
      cp,
    );
    await inspect("conditional-resume", viewport, "#conversation-overlay");
    await button("End chat").click();
    await incoming();
    await page.getByRole("button", { name: /Not right now/ }).click();
    assert.equal(await page.locator("#conversation-overlay").count(), 0);
    checks.push({ scene: "explicit-refusal", viewport });
    await incoming();
    await page.getByRole("button", { name: /Go somewhere quiet/ }).click();
    assert.equal(await page.locator("#conversation-overlay").count(), 0);
    assert.equal(
      await page.evaluate(() => window.scrambleQa.gm.player.campActivity.type),
      "travel",
    );
    await page.evaluate(() => {
      window.scrambleQa.wait(180);
      const { gm, screen, renderer } = window.scrambleQa;
      screen.loadView(gm.player.location, { travelPaid: true });
      renderer.refresh();
    });
    await inspect("private-arrival", viewport, ".npc-initiative-notice");
    await page.getByRole("button", { name: /Talk now/ }).click();
    await inspect("private-dialogue", viewport, "#conversation-overlay");
    await button("End chat").click();
    await incoming();
    await page.getByRole("button", { name: /Talk now/ }).click();
    await page.evaluate(() => {
      const { gm, activity } = window.scrambleQa,
        host = gm.systems.conversationSystem;
      const nearby = activity
        .npcs()
        .find(
          (p) =>
            p.id !== window.initiativeQa.npcId &&
            activity.present(p, gm.player.location),
        );
      activity.reserveConversationGroup([nearby.id]);
      host.view.session(host.engine.person(window.initiativeQa.npcId), {
        location: gm.player.location,
        groupParticipantIds: [nearby.id],
      });
      const cp = activity.conversation.checkpoint;
      for (let n = 0; n < 16; n++)
        host.nodeSession.addNpc(
          "We need to talk through the numbers and check each person separately before assuming anything.",
        );
      cp.semanticTranscript = JSON.parse(
        JSON.stringify(host.nodeSession.transcript),
      );
      host.view.show(host.engine.person(window.initiativeQa.npcId), {
        location: gm.player.location,
      });
    });
    await inspect("group-long-transcript", viewport, "#conversation-overlay");
    await button("End chat").click();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(output, "report.json"),
    JSON.stringify({ passed: checks.length, checks, errors }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, errors }));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
