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
    // Actual request semantics rendered through the existing conversation and task UI.
    await page.evaluate(() => {
      window.experienceQa.scene("conversation");
      const { gm, activity } = window.scrambleQa,
        h = gm.systems.conversationSystem,
        e = h.engine;
      h.closeConversation("incoming-request");
      e.deserialize();
      const sand = activity.npcs().find((p) => p.firstName === "Sandra"),
        target = activity.npcs().find((p) => p.firstName === "Wendell");
      target.firstName = "Michele Alexandria Montgomery-Wellington";
      const o = e.objectives.establish(sand.id, {
        type: "blindside",
        targetId: activity.npcs().find((p) => p.firstName === "Tony").id,
        explicit: true,
      });
      h.startPlayerConversation({
        npcId: sand.id,
        phase: "post",
        context: { location: "beach" },
      });
      h.view.startNpc(sand, {
        agenda: {
          purpose: "objective_delegate",
          objectiveId: o.id,
          delegateTargetId: target.id,
          requestedAction: "bring",
        },
      });
      window.requestQa = {
        sandId: sand.id,
        targetId: target.id,
        taskId: Object.keys(e.tasks.records)[0],
      };
    });
    await capture("incoming-request", viewport);
    assert.equal(await button("Agree to the request").count(), 1);
    assert.equal(await button("Decline the request").count(), 1);
    await button("Agree to the request").click();
    await button("End chat").click();
    await page.evaluate(() => {
      const { gm, activity, screen } = window.scrambleQa,
        e = gm.systems.conversationSystem.engine;
      for (const name of ["Jeremy", "Parvati"]) {
        const requester = activity.npcs().find((p) => p.firstName === name);
        e.resolve(
          e.action("delegate", {
            speakerId: requester.id,
            listenerIds: [gm.player.id],
            subjectId: window.requestQa.targetId,
            requestedAction: name === "Jeremy" ? "verify_vote" : "recruit",
            planTargetId: activity.npcs().find((p) => p.firstName === "Tony")
              .id,
          }),
        );
        const t = Object.values(e.tasks.records).at(-1);
        e.tasks.respond(t.id, gm.player.id, true);
      }
      screen.ensureTaskIcon();
      screen.openTaskOverlay();
    });
    const taskCapture = async (scene) => {
      await page.waitForFunction(() =>
        document
          .querySelector("#task-panel")
          ?.classList.contains("task-panel-open"),
      );
      await page.evaluate(() => {
        getComputedStyle(document.querySelector("#task-panel")).transform;
        document.getAnimations().forEach((a) => a.finish());
      });
      const geometry = await page.locator("#task-panel").evaluate((panel) => {
        const r = panel.getBoundingClientRect(),
          close = panel
            .querySelector("#task-close-hit")
            .getBoundingClientRect();
        return {
          overflow: document.body.scrollWidth > innerWidth + 1,
          fits: r.top >= -1 && r.bottom <= innerHeight + 1,
          closeVisible: close.top >= 0 && close.bottom <= innerHeight,
          requests: panel.querySelectorAll(".strategic-request-card").length,
        };
      });
      assert.equal(geometry.overflow, false, scene + " overflow");
      assert.equal(geometry.fits, true, scene + " viewport");
      assert.equal(geometry.closeVisible, true, scene + " close");
      const controls = page.locator("#task-panel button");
      for (let i = 0; i < (await controls.count()); i++) {
        await controls
          .nth(i)
          .evaluate((b) => b.scrollIntoView({ block: "center" }));
        const control = await controls.nth(i).evaluate((b) => {
          const r = b.getBoundingClientRect(),
            p = b.closest("#task-panel").getBoundingClientRect(),
            close = b
              .closest("#task-panel")
              .querySelector("#task-close-hit")
              .getBoundingClientRect();
          return {
            text: b.textContent,
            width: r.width,
            height: r.height,
            top: r.top,
            bottom: r.bottom,
            panelTop: p.top,
            panelBottom: p.bottom,
            closeTop: close.top,
            valid:
              // Chromium can report a 44px target as 43.999969 after the
              // panel transform. Allow subpixel rounding, not smaller controls.
              r.width >= 44 - 0.01 &&
              r.height >= 44 - 0.01 &&
              r.top >= p.top - 1 &&
              r.bottom <= p.bottom + 1 &&
              (b.id === "task-close-hit" || r.bottom <= close.top + 1),
          };
        });
        if (!control.valid)
          await page.screenshot({
            path: path.join(output, `failure-${scene}-${viewport.width}.png`),
          });
        assert.ok(
          control.valid,
          scene +
            " reachable control " +
            JSON.stringify({ viewport, i, ...control }),
        );
      }
      await page.locator("#task-panel").evaluate((p) => (p.scrollTop = 0));
      await page.screenshot({
        path: path.join(output, `${scene}-${viewport.width}.png`),
      });
      checks.push({ scene, viewport, ...geometry });
    };
    await taskCapture("strategic-requests");
    await page
      .locator(".strategic-request-card")
      .nth(1)
      .getByRole("button", { name: "Leave undone", exact: true })
      .click();
    assert.ok(
      (await page.locator("#task-panel").innerText()).includes("Left undone"),
    );
    await taskCapture("request-left-undone");
    await page
      .getByRole("button", { name: "Close camp responsibilities", exact: true })
      .click();
    await page.evaluate(() => {
      window.scrambleQa.gm.systems.conversationSystem.startPlayerConversation({
        npcId: window.requestQa.targetId,
        phase: "post",
        context: { location: "beach" },
      });
    });
    assert.match(
      await page
        .locator(".conversation-options-region button")
        .first()
        .innerText(),
      /Sandra wants to talk/,
    );
    await capture("task-context-first", viewport);
    await page.locator(".conversation-options-region button").first().click();
    await capture("bring-response", viewport);
    await button("End chat").click();
    await page.evaluate(() => {
      const { gm, screen } = window.scrambleQa,
        e = gm.systems.conversationSystem.engine,
        t = Object.values(e.tasks.records).find((t) => t.purpose === "recruit");
      e.resolve(
        e.action("ask_vote", {
          speakerId: gm.player.id,
          listenerIds: [t.targetId],
          subjectId: t.subjectId,
        }),
      );
      screen.openTaskOverlay();
    });
    assert.ok(
      (await page.locator("#task-panel").innerText()).includes(
        "Ready to report",
      ),
    );
    await taskCapture("request-ready-report");
    await page
      .getByRole("button", { name: "Close camp responsibilities", exact: true })
      .click();
    await page.evaluate(() => {
      window.scrambleQa.gm.systems.conversationSystem.startPlayerConversation({
        npcId: window.requestQa.targetId,
        phase: "post",
        context: {
          location: "beach",
          groupParticipantIds: [window.requestQa.sandId],
        },
      });
    });
    await capture("group-active-request", viewport);
    await button("End chat").click();
    // Continuity scenes exercise the live semantic resolver, never hidden UI labels.
    for (const scene of [
      "bring-clarification",
      "bring-later",
      "report-confrontation",
      "delegated-decoy",
      "protected-source",
    ]) {
      await page.evaluate((scene) => {
        window.experienceQa.scene("conversation");
        const { gm, activity } = window.scrambleQa,
          h = gm.systems.conversationSystem,
          e = h.engine;
        h.closeConversation("delegation-continuity");
        e.deserialize();
        const sand = activity.npcs().find((p) => p.firstName === "Sandra"),
          target = activity.npcs().find((p) => p.firstName === "Wendell"),
          tony = activity.npcs().find((p) => p.firstName === "Tony"),
          jeremy = activity.npcs().find((p) => p.firstName === "Jeremy");
        target.firstName = "Michele Alexandria Montgomery-Wellington";
        Object.assign(target, {
          gameplayStyle: "Social Genius",
          honesty: 9,
          paratend: 8,
          risk: 3,
        });
        const purpose =
          scene === "delegated-decoy"
            ? "decoy"
            : scene === "protected-source"
              ? "protect_source"
              : scene === "report-confrontation"
                ? "warn"
                : "bring";
        let claimId;
        if (scene === "protected-source") {
          e.resolve(
            e.action("promise", {
              speakerId: jeremy.id,
              listenerIds: [sand.id],
              subjectId: tony.id,
            }),
          );
          claimId = e
            .knowledge(sand.id)
            .find(
              (k) => k.topic === "commitment" && k.speakerId === jeremy.id,
            ).id;
        }
        e.resolve(
          e.action("delegate", {
            speakerId: sand.id,
            listenerIds: [gm.player.id],
            subjectId: target.id,
            requestedAction: purpose,
            planTargetId: tony.id,
            claimId,
            keepSourcePrivate: scene === "protected-source",
            reasonLine:
              purpose === "bring" ? "I want to talk about our numbers." : null,
          }),
        );
        const task = Object.values(e.tasks.records).at(-1);
        e.tasks.respond(task.id, gm.player.id, true);
        if (scene === "report-confrontation") {
          e.resolve(
            e.action("report", {
              speakerId: gm.player.id,
              listenerIds: [sand.id],
              delegationId: task.id,
              truthMode: "fabrication",
            }),
          );
          const report = e
            .knowledge(sand.id)
            .find((k) => k.topic === "task_report");
          e.resolve(
            e.action("verify", {
              speakerId: sand.id,
              listenerIds: [target.id],
              claimId: report.id,
            }),
          );
          const dispute = e
            .events(sand.id)
            .find((k) => k.topic === "task_report_dispute");
          h.startPlayerConversation({
            npcId: sand.id,
            phase: "post",
            context: { location: "beach" },
          });
          const r = e.resolve(
            e.action("confront", {
              speakerId: sand.id,
              listenerIds: [gm.player.id],
              eventId: dispute.id,
            }),
          );
          h.view.session(sand, {}).addNpc(r.playerLine);
          h.view.show(sand, {});
        } else {
          h.startPlayerConversation({
            npcId: target.id,
            phase: "post",
            context: { location: "beach" },
          });
          if (scene.startsWith("bring-")) {
            gm.systems.trustSystem.setTrust(
              target.id,
              gm.player.id,
              scene === "bring-later" ? 40 : 55,
            );
            gm.systems.trustSystem.setTrust(
              target.id,
              sand.id,
              scene === "bring-later" ? 55 : 62,
            );
            const r = e.resolve(
              e.action("come_with_me", {
                speakerId: gm.player.id,
                listenerIds: [target.id],
                subjectId: sand.id,
                delegationId: task.id,
              }),
            );
            h.view.session(target, {}).addNpc(r.responses[0].line);
            h.view.show(target, {});
          }
        }
        window.continuityTaskId = task.id;
      }, scene);
      if (scene === "bring-clarification") {
        assert.match(
          await page.locator(".conversation-transcript").innerText(),
          /Why do they want me/,
        );
        assert.equal(await button("Tell the reason they gave you").count(), 1);
        assert.equal(
          await button("Bluff: say it is nothing serious").count(),
          1,
        );
      }
      if (scene === "bring-later") {
        assert.equal(
          await page.evaluate(
            () =>
              window.scrambleQa.gm.systems.conversationSystem.engine.tasks.get(
                window.continuityTaskId,
              ).status,
          ),
          "maybe_later",
        );
      }
      if (scene === "report-confrontation") {
        assert.equal(await button("Admit your report was wrong").count(), 1);
        assert.equal(
          await button("Explain a possible misunderstanding").count(),
          1,
        );
      }
      if (scene === "delegated-decoy")
        assert.match(
          await page
            .locator(".conversation-options-region button")
            .first()
            .innerText(),
          /cover story/,
        );
      await capture(scene, viewport);
      if (scene === "protected-source") {
        assert.match(
          await page
            .locator(".conversation-options-region button")
            .first()
            .innerText(),
          /protecting the source/,
        );
        await page
          .locator(".conversation-options-region button")
          .first()
          .click();
        const text = await page.locator(".conversation-transcript").innerText();
        assert.equal(
          text.includes("Jeremy"),
          false,
          "protected attribution must stay out of spoken text",
        );
        await capture("protected-source-delivery", viewport);
      }
      if (scene === "bring-clarification") {
        await button("Tell the reason they gave you").click();
        assert.equal(
          await page.evaluate(
            () =>
              window.scrambleQa.gm.systems.conversationSystem.engine.tasks.get(
                window.continuityTaskId,
              ).status,
          ),
          "ready_to_walk",
        );
        await capture("bring-reconsideration", viewport);
      }
      await button("End chat").click();
    }
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
