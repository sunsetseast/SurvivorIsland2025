import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const root = fileURLToPath(new URL("../", import.meta.url)),
  output = process.env.CONVERSATION_QA_OUTPUT || "/tmp/conversation-rendered";
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
      ".png": "image/png",
      ".jpeg": "image/jpeg",
    }[path.extname(file)] || "application/octet-stream",
  );
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const checks = [],
  errors = [];
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CAMP_QA_EXECUTABLE
    ? {
        executablePath: process.env.CAMP_QA_EXECUTABLE,
        args: ["--no-sandbox", "--disable-dev-shm-usage"],
      }
    : {}),
});
try {
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `http://127.0.0.1:${server.address().port}/qa/scramble-experience.html`,
  );
  await page.waitForFunction(() => window.experienceQaReady);
  const button = (name) =>
    page
      .locator("#conversation-overlay")
      .getByRole("button", { name, exact: true });
  const capture = async (scene, viewport) => {
    await page.evaluate(() =>
      document.getAnimations().forEach((a) => a.finish()),
    );
    const geometry = await page
      .locator("#conversation-overlay")
      .evaluate((e) => {
        const box = e.getBoundingClientRect(),
          footer = e
            .querySelector(".conversation-nav-row")
            .getBoundingClientRect(),
          options = e.querySelector(".conversation-options-region");
        return {
          overflow: document.body.scrollWidth > innerWidth + 1,
          fits: box.top >= -1 && box.bottom <= innerHeight + 1,
          endVisible: footer.top >= 0 && footer.bottom <= innerHeight,
          buttons: [...options.querySelectorAll("button")].map((b) => ({
            text: b.textContent.trim(),
            width: b.getBoundingClientRect().width,
            height: b.getBoundingClientRect().height,
          })),
          transcriptScrollable:
            e.querySelector(".conversation-transcript-region").scrollHeight >
            e.querySelector(".conversation-transcript-region").clientHeight,
        };
      });
    assert.equal(geometry.overflow, false, `${scene} overflow`);
    assert.equal(geometry.fits, true, `${scene} viewport`);
    assert.equal(geometry.endVisible, true, `${scene} end button`);
    assert.ok(
      geometry.buttons.every((b) => b.width >= 44 && b.height >= 44),
      `${scene} touch targets`,
    );
    const options = page.locator(
      "#conversation-overlay .conversation-options-region button",
    );
    for (let i = 0; i < (await options.count()); i++) {
      await options.nth(i).scrollIntoViewIfNeeded();
      assert.ok(
        await options.nth(i).evaluate((b) => {
          const r = b.getBoundingClientRect(),
            p = b
              .closest(".conversation-options-region")
              .getBoundingClientRect();
          return r.top >= p.top - 1 && r.bottom <= p.bottom + 1;
        }),
        `${scene} option reachable`,
      );
    }
    await page
      .locator(".conversation-options-region")
      .evaluate((e) => (e.scrollTop = 0));
    await page.screenshot({
      path: path.join(output, `${scene}-${viewport.width}.png`),
    });
    checks.push({ scene, viewport, ...geometry });
  };
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    await page.reload();
    await page.waitForFunction(() => window.experienceQaReady);
    await page.evaluate(() => {
      window.experienceQa.scene("conversation");
      window.scrambleQa.gm.systems.conversationSystem.engine.deserialize();
    });
    await capture("suggestions", viewport);
    await button("Make a Move").click();
    await capture("intent-groups", viewport);
    await button("Votes and promises").click();
    await button("Ask for their vote").click();
    await capture("person-selection", viewport);
    const before = await page.evaluate(() =>
      JSON.stringify(
        window.scrambleQa.gm.systems.socialMemorySystem.serialize(),
      ),
    );
    await button("Back").click();
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify(
          window.scrambleQa.gm.systems.socialMemorySystem.serialize(),
        ),
      ),
      before,
    );
    await button("Make a conditional vote promise").click();
    await button("Tony").click();
    await capture("conditional-selection", viewport);
    await button("Only if Sandra commits").click();
    assert.ok(
      (await page.locator(".conversation-transcript").innerText()).includes(
        "if Sandra",
      ),
    );
    await capture("conditional-transcript", viewport);
    await button("Make a Move").click();
    await button("Ask someone to help").click();
    await button("Ask them to talk to someone").click();
    await button("Sandra").click();
    await button("Their vote").click();
    await button("Get their vote").click();
    await capture("delegation-attribution", viewport);
    await button("Don’t use my name").click();
    assert.equal(
      await page.evaluate(
        () =>
          Object.values(
            window.scrambleQa.gm.systems.conversationSystem.engine.tasks
              .records,
          ).length,
      ),
      1,
    );
    const cp = await page.evaluate(() =>
      JSON.stringify(window.scrambleQa.activity.conversation.checkpoint),
    );
    await page.evaluate(() => window.experienceQa.restore());
    await page
      .getByRole("button", { name: "Resume conversation", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify(window.scrambleQa.activity.conversation.checkpoint),
      ),
      cp,
    );
    await capture("save-resume", viewport);
    await button("End chat").click();
    assert.equal(await page.locator("#conversation-overlay").count(), 0);
    await page.evaluate(() => {
      const { gm, activity } = window.scrambleQa;
      window.experienceQa.scene("conversation");
      gm.systems.conversationSystem.closeConversation("qa-group");
      for (const p of activity.npcs()) {
        p.campActivity = null;
        activity.start(p, {
          type: "idle_at_camp",
          location: "beach",
          duration: 3000,
        });
      }
      const people = activity.npcs();
      people[0].firstName = "Alexandria Montgomery-Wellington";
      people[1].firstName = "Christopher Alexander";
      gm.systems.conversationSystem.startPlayerConversation({
        npcId: people[0].id,
        phase: "post",
        context: {
          location: "beach",
          groupParticipantIds: people.slice(0, 4).map((p) => p.id),
        },
      });
      const h = gm.systems.conversationSystem,
        s = h.view.session(people[0], {});
      for (let i = 0; i < 25; i++) {
        s.addYou(
          "Who actually told you that, and what exactly did they say about our numbers?",
        );
        s.transcript.push({
          speaker: "NPC",
          name: people[i % 4].firstName,
          text: "I heard a different story, but I still need to speak to the people involved before making a promise.",
        });
      }
      h.view.show(people[0], {});
    });
    assert.equal(await page.locator(".scramble-participant").count(), 4);
    await capture("group-long-transcript", viewport);
    await button("Connect").click();
    await button("Check in").click();
    await capture("group-reactions", viewport);
    assert.equal(
      (await page.locator(".convo-npc .convo-speaker").count()) > 4,
      true,
    );
    await page.keyboard.press("Escape");
    assert.equal(await page.locator("#conversation-overlay").count(), 0);
    await page.evaluate(() => {
      const { gm, activity, strategy } = window.scrambleQa;
      window.experienceQa.scene("conversation");
      gm.systems.conversationSystem.closeConversation("qa-pre");
      gm.gamePhase = "preChallenge";
      gm.dayTimer = 7200;
      strategy.isActive = false;
      activity.phaseId = activity.phase;
      for (const p of activity.npcs()) {
        p.campActivity = null;
        activity.start(p, {
          type: "idle_at_camp",
          location: "beach",
          duration: 3000,
        });
      }
      gm.systems.conversationSystem.startPlayerConversation({
        npcId: activity.npcs()[0].id,
        phase: "pre",
        context: { location: "beach" },
      });
    });
    await button("Connect").click();
    await button("Have a personal conversation").click();
    await capture("pre-bonding", viewport);
    await button("Idols & Advantages").click();
    await button("Ask and investigate").click();
    await button("Ask if they found an idol").click();
    await capture("pre-idol-follow-ups", viewport);
    await button("End chat").click();
    await page.evaluate(() => {
      window.experienceQa.scene("conversation");
      const { gm, activity } = window.scrambleQa,
        tribe = gm.getPlayerTribe(),
        base = activity.npcs()[0];
      for (let i = 0; i < 10; i++) {
        const p = {
          ...base,
          id: 2000 + i,
          firstName: `Contestant with a long name ${i}`,
          campActivity: null,
          hasIdol: false,
        };
        gm.survivors.push(p);
        if (tribe.members !== gm.survivors) tribe.members.push(p);
        activity.start(p, {
          type: "idle_at_camp",
          location: "beach",
          duration: 3000,
        });
      }
    });
    await button("Make a Move").click();
    await button("Votes and promises").click();
    await button("Pitch a target").click();
    assert.equal(
      await page.locator(".conversation-options-region button").count(),
      16,
    );
    await capture("many-targets", viewport);
    await page.locator(".conversation-options-region button").last().click();
    await button("End chat").click();
  }
  assert.deepEqual(errors, []);
  fs.writeFileSync(
    path.join(output, "report.json"),
    JSON.stringify({ checks, errors }, null, 2),
  );
  console.log(
    JSON.stringify({
      checks: checks.length,
      errors: errors.length,
      viewports: 4,
      output,
    }),
  );
} finally {
  await browser.close();
  server.close();
}
