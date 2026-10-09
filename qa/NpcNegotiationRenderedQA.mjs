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
  output =
    process.env.NEGOTIATION_RENDERED_OUTPUT || "/tmp/negotiation-rendered";
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
  const incoming = async (type = "ask_vote", pre = false) =>
    page.evaluate(
      ({ type, pre }) => {
        window.scrambleQa.gm.dayTimer = 3600;
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
        const [npc, voter, alternate, target] = activity.npcs();
        npc.firstName = "Alexandria Montgomery-Wellington";
        npc.gameplayStyle = "Wildcard";
        alternate.firstName = "Michele";
        target.firstName = "Tony";
        for (const p of activity.npcs())
          gm.systems.trustSystem.setTrust(
            npc.id,
            p.id,
            p.id === alternate.id ? 0 : 100,
          );
        gm.systems.strategyPhaseSystem.updateNpcIntentTarget(
          npc.id,
          target.id,
          {
            reason: "controlled initial proposal",
            absoluteConfidence: 0.6,
          },
        );
        e.initiative.create(npc, gm.player.id, {
          type,
          fields: { subjectId: target.id },
          key: "qa:proposal",
          private: true,
          reason: "PRIVATE MOTIVE NOT FOR UI",
        });
        activity.interrupt(npc);
        activity.chooseNext(npc, gm.dayTimer);
        window.scrambleQa.wait(45);
        renderer.refresh();
        window.negotiationQa = {
          npcId: npc.id,
          voterId: voter.id,
          alternateId: alternate.id,
          targetId: target.id,
        };
      },
      { type, pre },
    );
  const inspect = async (
    scene,
    viewport,
    selector = "#conversation-overlay",
  ) => {
    const region = page.locator(selector);
    await region.waitFor({ state: "visible" });
    const geometry = await region.evaluate((e) => ({
      overflow: document.body.scrollWidth > innerWidth + 1,
      text: e.innerText,
      buttons: [...e.querySelectorAll("button")].map((b) => ({
        w: b.getBoundingClientRect().width,
        h: b.getBoundingClientRect().height,
      })),
    }));
    assert.equal(geometry.overflow, false, scene);
    assert.ok(
      !/PRIVATE MOTIVE|objective:|success chance|npcNegotiation/.test(
        geometry.text,
      ),
    );
    assert.ok(
      geometry.buttons.every((b) => b.w >= 44 && b.h >= 44),
      `${scene}: tap controls`,
    );
    for (const b of await region.locator("button").all()) {
      await b.scrollIntoViewIfNeeded();
      assert.ok(
        await b.evaluate((b) => {
          const r = b.getBoundingClientRect();
          return (
            r.top >= 0 &&
            r.bottom <= innerHeight + 1 &&
            r.left >= 0 &&
            r.right <= innerWidth + 1
          );
        }),
        `${scene}: reachable`,
      );
    }
    checks.push({ scene, viewport, buttons: geometry.buttons.length });
    // Inspect every control above, then capture the primary responses in their
    // initial scroll position while retaining the latest transcript exchange.
    await region.evaluate((e) => {
      for (const options of e.querySelectorAll(
        ".conversation-options-region,.convo-options",
      ))
        options.scrollTop = 0;
      if (e.classList.contains("npc-initiative-notice")) {
        for (let p = e; p && p !== document.body; p = p.parentElement)
          if (p.scrollHeight > p.clientHeight) p.scrollTop = 0;
      }
    });
    await page.screenshot({
      path: path.join(
        output,
        `${scene}-${viewport.width}x${viewport.height}.png`,
      ),
    });
  };
  const button = (name) =>
    page
      .locator("#conversation-overlay")
      .getByRole("button", { name, exact: true });
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await incoming();
    await page.getByRole("button", { name: /^Talk now/ }).click();
    await inspect("original-proposal", viewport);
    await button("I’m not voting Tony").click();
    const active = await page.evaluate(() => {
      const s = window.scrambleQa,
        e = s.gm.systems.conversationSystem.engine,
        n = s.activity.conversation.checkpoint.npcNegotiation;
      return {
        subjectId: n.subjectId,
        name: e.name(n.subjectId),
        status: n.status,
        rejected: n.proposals[0].status,
      };
    });
    assert.equal(active.status, "awaiting_response");
    assert.equal(active.rejected, "rejected");
    assert.notEqual(active.name, "Tony");
    await inspect("active-counteroffer", viewport);
    checks.push({ scene: "correct-alternative", viewport });
    await button(`Why ${active.name}?`).click();
    await inspect("alternative-question", viewport);
    const before = await page.evaluate(
      () =>
        Object.keys(
          window.scrambleQa.gm.systems.conversationSystem.engine.receipts,
        ).length,
    );
    await button("Only if someone else is really in").click();
    await inspect("conditional-person-picker", viewport);
    // Keyboard Back must not speak or agree.
    await page
      .locator("#conversation-overlay")
      .getByRole("button", { name: /Back/ })
      .last()
      .focus();
    await page.keyboard.press("Enter");
    assert.equal(
      await page.evaluate(
        () =>
          Object.keys(
            window.scrambleQa.gm.systems.conversationSystem.engine.receipts,
          ).length,
      ),
      before,
    );
    checks.push({ scene: "back-without-agreement", viewport });
    await button("Only if someone else is really in").click();
    await page
      .locator("#conversation-overlay")
      .getByRole("button", { name: /^Only if .+ is in$/ })
      .first()
      .click();
    await inspect("conditional-alternative", viewport);
    const ordering = await page.evaluate(
      () =>
        window.scrambleQa.activity.conversation.checkpoint.semanticTranscript,
    );
    assert.ok(ordering.length >= 6);
    checks.push({ scene: "ordered-transcript", viewport });
    await incoming("vote_read");
    await page.getByRole("button", { name: /^Talk now/ }).click();
    await button("Keep your plans private").click();
    await inspect("valid-withholding", viewport);
    assert.ok(
      (await page.locator("#conversation-overlay").innerText()).includes(
        "I’m keeping my plans to myself for now.",
      ),
    );
    checks.push({ scene: "withheld-without-picker", viewport });
    await incoming();
    await page.evaluate(() => {
      window.scrambleQa.gm.dayTimer = 100;
      window.scrambleQa.renderer.refresh();
    });
    await page.getByRole("button", { name: /^Go somewhere quiet/ }).click();
    await inspect(
      "private-walk-unavailable",
      viewport,
      ".npc-initiative-notice",
    );
    assert.ok(
      await page.getByText(/We can’t get somewhere private in time/).count(),
    );
    await page.getByRole("button", { name: /^Talk now/ }).click();
    await inspect("talk-here-recovery", viewport);
    await page.evaluate(() => {
      const { gm, activity } = window.scrambleQa,
        e = gm.systems.conversationSystem.engine;
      const n = activity.conversation.checkpoint.npcNegotiation,
        npc = e.person(n.npcId);
      npc.gameplayStyle = "Social Genius";
      gm.systems.trustSystem.setTrust(npc.id, gm.player.id, 90);
    });
    await button("I’ll consider it — no promise").click();
    await inspect("real-protection-offer", viewport);
    assert.ok(await button("Agree to their proposed deal").count());
    checks.push({ scene: "explicit-deal-consent", viewport });
    await page.evaluate(() => {
      const { gm, activity, renderer } = window.scrambleQa,
        e = gm.systems.conversationSystem.engine;
      activity.reserveConversationGroup([window.negotiationQa.voterId]);
      gm.systems.conversationSystem._renderScrambleParticipants(
        gm.systems.conversationSystem.activeOverlay,
        e.person(window.negotiationQa.npcId),
      );
      gm.systems.conversationSystem.view.show(
        e.person(window.negotiationQa.npcId),
        {},
      );
      renderer.refresh();
    });
    await inspect("group-negotiation", viewport);
    await button("Why Tony?").click();
    await inspect("group-negotiation-responses", viewport);
    assert.ok(
      await page.evaluate(() => {
        const { gm, activity } = window.scrambleQa;
        const name = gm.systems.conversationSystem.engine.name(
          window.negotiationQa.voterId,
        );
        return activity.conversation.checkpoint.semanticTranscript.some(
          (line) => line.name === name,
        );
      }),
    );
    await incoming("ask_vote", true);
    await page.getByRole("button", { name: /^Talk now/ }).click();
    await inspect("pre-immunity-hypothetical-proposal", viewport);
    await button("If we lose, I won’t vote Tony").click();
    await inspect("pre-immunity-explicit-refusal", viewport);
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify({ passed: checks.length, errors, checks }, null, 2),
  );
  console.log(JSON.stringify({ passed: checks.length, errors }));
} finally {
  await browser.close();
  await new Promise((r) => server.close(r));
}
