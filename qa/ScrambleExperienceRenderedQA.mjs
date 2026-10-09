import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import crypto from "node:crypto";
const require = createRequire(import.meta.url),
  browsers = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const engine = process.env.CAMP_QA_BROWSER || "chromium",
  root = path.resolve(fileURLToPath(new URL("../", import.meta.url)));
const output =
  process.env.CAMP_QA_OUTPUT || "/tmp/scramble-experience-rendered";
fs.mkdirSync(output, { recursive: true });
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".png": "image/png",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
};
const server = http.createServer((req, res) => {
  const f = path.resolve(
    root,
    "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
  );
  if (
    !f.startsWith(root + path.sep) ||
    !fs.existsSync(f) ||
    fs.statSync(f).isDirectory()
  ) {
    res.writeHead(404);
    return res.end();
  }
  res.setHeader(
    "Content-Type",
    mime[path.extname(f)] || "application/octet-stream",
  );
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const checks = [],
  errors = [],
  playthroughs = [];
let browser;
const viewports = [
  { width: 375, height: 812 },
  { width: 430, height: 932 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 },
];
const scenes = [
  "start",
  "departures",
  "pair",
  "three",
  "meeting",
  "outsider",
  "invitation",
  "conversation",
  "group-dialogue",
  "knowledge",
  "contradiction",
  "alliances",
  "final-five",
  "before",
  "restore",
  "landscape-dialogue",
  "dense-long",
  "warning",
  "verification",
  "bottom",
];
try {
  browser = await browsers[engine].launch({
    headless: true,
    ...(engine === "chromium" && process.env.CAMP_QA_EXECUTABLE
      ? {
          executablePath: process.env.CAMP_QA_EXECUTABLE,
          args: ["--no-sandbox"],
        }
      : {}),
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => {
    errors.push(e.message);
    console.error("PAGE ERROR", e.message);
  });
  await page.goto(
    `http://127.0.0.1:${server.address().port}/qa/scramble-experience.html`,
  );
  await page.waitForFunction(() => window.experienceQaReady);
  const shot = async (name) => {
    await page.evaluate(() =>
      document.getAnimations().forEach((a) => a.finish()),
    );
    await page.screenshot({ path: path.join(output, `${name}.png`) });
  };
  const geometry = async () =>
    page.evaluate(() => {
      const dialog =
        document.querySelector(
          ".scramble-notebook[open],#conversation-overlay,.camp-encounter-sheet[open]",
        ) ||
        document.querySelector(".before-tribal") ||
        document.querySelector('#alliances-overlay[style*="flex"]');
      const surface = dialog || document.querySelector(".camp-presence");
      const bounds = (e) => {
        const r = e.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      };
      const buttons = [...surface.querySelectorAll("button,summary")]
        .filter((e) => e.getClientRects().length && !e.disabled)
        .map((e) => ({ label: e.textContent.trim(), ...bounds(e) }));
      return {
        overflow: document.body.scrollWidth > innerWidth + 1,
        surface: bounds(surface),
        buttons,
        dialog: !!dialog,
        focused: !dialog || dialog.contains(document.activeElement),
      };
    });
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const scene of scenes) {
      await page.evaluate((scene) => window.experienceQa.scene(scene), scene);
      await page.waitForTimeout(50);
      const g = await geometry();
      assert.equal(g.overflow, false, `${scene} page overflow`);
      assert.ok(
        g.surface.y >= -1 && g.surface.y + g.surface.h <= viewport.height + 1,
        `${scene} surface fits`,
      );
      assert.ok(
        g.buttons.every((b) => b.w >= 43.9 && b.h >= 43.9),
        `${scene} touch targets ${JSON.stringify(g.buttons.filter((b) => b.w < 43.9 || b.h < 43.9))}`,
      );
      if (scene === "start")
        assert.equal(
          await page.locator("#clock-time-text").innerText(),
          "60:00",
        );
      if (scene === "departures")
        assert.ok(
          (await page.locator(".camp-witnessed-departure").count()) >= 2,
          "two observed departure directions",
        );
      if (scene === "outsider")
        assert.ok(
          !(await page.locator(".camp-presence").innerText()).includes(
            "Your alliance",
          ),
        );
      if (scene === "invitation")
        assert.ok(
          await page.getByRole("button", { name: /Talk now/ }).count(),
        );
      if (scene === "group-dialogue") {
        assert.ok((await page.locator(".scramble-participant").count()) >= 3);
        assert.ok(
          (await page.locator(".convo-npc .convo-speaker").count()) >= 3,
        );
      }
      if (scene === "knowledge") {
        assert.equal(
          await page
            .locator(".scramble-read-section summary")
            .filter({ hasText: "Your promises" })
            .count(),
          1,
        );
        const initial = await page.evaluate(
          () => window.experienceQa.read().promisesToYou.length,
        );
        await page.evaluate(() => window.experienceQa.addNote());
        assert.ok(
          (await page.evaluate(
            () => window.experienceQa.read().promisesToYou.length,
          )) > initial,
        );
        assert.ok(
          (await page.locator(".scramble-notebook").innerText()).includes(
            "I’m voting",
          ),
        );
      }
      if (scene === "dense-long") {
        await page
          .getByRole("button", { name: "Promises", exact: true })
          .click();
        assert.ok(
          await page
            .locator(".scramble-read-section summary")
            .filter({ hasText: "Your promises" })
            .evaluate((e) => {
              const r = e.getBoundingClientRect();
              return r.top >= 0 && r.bottom <= innerHeight;
            }),
        );
      }
      if (scene === "final-five") {
        assert.equal(
          await page.locator("#clock-day-text").innerText(),
          "FINAL SCRAMBLE",
        );
        assert.match(
          await page.locator(".camp-observable-beat").innerText(),
          /Final scramble/,
        );
      }
      if (scene === "before") {
        assert.ok(
          await page
            .getByRole("button", { name: "Head to Tribal Council" })
            .count(),
        );
        assert.ok(
          !(await page.locator(".before-tribal").innerText()).match(
            /cohesion|confidence|locked|vote total|intentStatus|safetyBelief/,
          ),
        );
        const timer = await page.evaluate(
          () => window.experienceQa.gm.dayTimer,
        );
        await page.waitForTimeout(200);
        assert.equal(
          await page.evaluate(() => window.experienceQa.gm.dayTimer),
          timer,
        );
      }
      if (scene === "restore") {
        const before = await page.evaluate(() =>
          window.experienceQa.snapshot(),
        );
        await page.evaluate(() => window.experienceQa.restore());
        assert.deepEqual(
          await page.evaluate(() => window.experienceQa.snapshot()),
          before,
        );
        assert.equal(await page.locator(".camp-arriving").count(), 0);
        assert.equal(
          await page.locator("#clock-time-text").innerText(),
          "18:30",
        );
      }
      if (scene.includes("dialogue") || scene === "conversation") {
        assert.ok(g.focused, "dialogue focus");
        assert.ok(
          await page
            .getByRole("button", { name: "End chat", exact: true })
            .evaluate((e) => {
              const r = e.getBoundingClientRect();
              if (r.top < 0 || r.bottom > innerHeight) return false;
              for (let p = e.parentElement; p; p = p.parentElement) {
                const c = getComputedStyle(p);
                if (["hidden", "auto", "scroll"].includes(c.overflowY)) {
                  const b = p.getBoundingClientRect();
                  if (r.top < b.top - 1 || r.bottom > b.bottom + 1)
                    return false;
                }
              }
              return true;
            }),
          "End button is not clipped by an ancestor",
        );
        assert.ok(
          await page.locator(".conversation-nav-row").evaluate((e) => {
            const r = e.getBoundingClientRect();
            return r.top >= 0 && r.bottom <= innerHeight;
          }),
          "End visible",
        );
        await page.keyboard.press("Tab");
        assert.ok(
          await page
            .locator("#conversation-overlay")
            .evaluate((e) => e.contains(document.activeElement)),
        );
        await page.keyboard.press("Escape");
        assert.equal(await page.locator("#conversation-overlay").count(), 0);
        await page.evaluate((scene) => window.experienceQa.scene(scene), scene);
      }
      await shot(`${scene}-${viewport.width}`);
      checks.push({ scene, viewport, ...g });
    }
    await page.evaluate(() => window.experienceQa.scene("group-dialogue"));
    const transcript = await page
        .locator(".conversation-transcript")
        .innerText(),
      groupCp = await page.evaluate(() =>
        JSON.stringify(window.experienceQa.activity.conversation.checkpoint),
      );
    await page.evaluate(() => window.experienceQa.restore());
    await page
      .getByRole("button", { name: "Resume conversation", exact: true })
      .click();
    assert.equal(
      await page.locator(".conversation-transcript").innerText(),
      transcript,
    );
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify(window.experienceQa.activity.conversation.checkpoint),
      ),
      groupCp,
    );
    assert.ok((await page.locator(".scramble-participant").count()) >= 3);
    await page.keyboard.press("Escape");
    checks.push({ type: "group-checkpoint-resume", viewport });
    await page.evaluate(() => window.experienceQa.scene("conversation"));
    await page
      .getByRole("button", { name: "Make a Move", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Votes and promises", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Promise your vote", exact: true })
      .click();
    await page.getByRole("button", { name: "Jeremy", exact: true }).click();
    assert.ok(
      (await page.locator(".camp-observable-beat").innerText()).includes(
        "Promise remembered",
      ),
    );
    const cp = await page.evaluate(() =>
      JSON.stringify(window.experienceQa.activity.conversation.checkpoint),
    );
    await page.evaluate(() => window.experienceQa.restore());
    await page
      .getByRole("button", { name: "Resume conversation", exact: true })
      .click();
    assert.equal(
      await page.evaluate(() =>
        JSON.stringify(window.experienceQa.activity.conversation.checkpoint),
      ),
      cp,
    );
    assert.ok(
      (await page.locator(".conversation-transcript").innerText()).includes(
        "I’m voting Jeremy",
      ),
    );
    await shot(`resume-dialogue-${viewport.width}`);
    await page.keyboard.press("Escape");
    checks.push({ type: "promise-checkpoint-resume", viewport });
    await page.evaluate(() => window.experienceQa.scene("knowledge"));
    await page
      .getByRole("button", { name: "Back to camp", exact: true })
      .click();
    await page
      .getByRole("button", { name: "What I Know", exact: true })
      .click();
    await page.keyboard.press("Escape");
    assert.equal(await page.locator(".scramble-notebook").count(), 0);
    assert.ok(
      await page.evaluate(
        () => document.activeElement?.dataset.focusKey === "scramble:read",
      ),
    );
  }
  for (const [index, policy] of [
    "passive observer",
    "social player",
    "strategic player",
    "player in danger",
    "alliance-heavy player",
    "mobile landscape",
  ].entries()) {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.evaluate(
      (seed) => window.experienceQa.natural(seed),
      79 + index,
    );
    if (policy === "player in danger")
      await page.evaluate(() => {
        const q = window.experienceQa,
          p = q.activity
            .npcs()
            .find((p) => window.campQa.present(p, q.gm.player.location));
        if (p)
          q.strategy.reasoning.statement({
            id: "rendered:danger",
            speakerId: p.id,
            listenerIds: [q.gm.player.id],
            subjectId: q.gm.player.id,
            topic: "safety",
            stance: "warned",
            random: () => 0,
          });
      });
    let actions = 0,
      conversations = 0,
      groupConversations = 0,
      watches = 0,
      moves = 0,
      restores = 0;
    while (
      (await page.evaluate(() => window.experienceQa.gm.dayTimer > 0)) &&
      actions < 90
    ) {
      // Visit public meeting places; choose Join only from the visible owned label.
      if (
        policy === "alliance-heavy player" &&
        actions < 16 &&
        !(await page
          .getByRole("button", { name: "Join alliance meeting", exact: true })
          .count())
      ) {
        if (actions === 6) {
          await page.evaluate(() => window.experienceQa.restore());
          restores++;
        }
        if (actions % 2 === 0) {
          await page.getByRole("button", { name: "Move", exact: true }).click();
          const place = ["water well", "shelter", "fire"][
            Math.floor(actions / 2) % 3
          ];
          const dest = page
            .locator(".camp-encounter-sheet button")
            .filter({ hasText: new RegExp(place, "i") })
            .first();
          if (await dest.count()) {
            await dest.click();
            moves++;
          } else {
            await page.keyboard.press("Escape");
            await page
              .getByRole("button", { name: "Wait · 1 minute", exact: true })
              .click();
          }
        } else
          await page
            .getByRole("button", { name: "Wait · 1 minute", exact: true })
            .click();
        actions++;
        continue;
      }
      if (policy === "mobile landscape" && actions === 4)
        await page.setViewportSize({ width: 844, height: 390 });
      if (actions === 6) {
        await page.evaluate(() => window.experienceQa.restore());
        restores++;
      }
      const invite = page
          .getByRole("button", { name: /Talk now/ })
          .first(),
        join = page
          .getByRole("button", { name: "Join alliance meeting", exact: true })
          .first(),
        talk = page
          .locator(".camp-cluster")
          .getByRole("button", { name: "Talk", exact: true })
          .first();
      if (
        policy !== "passive observer" &&
        ((await invite.count()) ||
          (policy === "alliance-heavy player" && (await join.count())) ||
          (await talk.count()))
      ) {
        if ((await join.count()) && policy === "alliance-heavy player")
          await join.click();
        else if (await invite.count()) await invite.click();
        else await talk.click();
        const overlay = page.locator("#conversation-overlay");
        if (await overlay.count()) {
          if (
            (await overlay.getAttribute("data-conversation-menu")) ===
            "semantic"
          ) {
            if (["strategic player", "player in danger"].includes(policy)) {
              await overlay
                .getByRole("button", { name: "Make a Move", exact: true })
                .click();
              await overlay
                .getByRole("button", {
                  name: "Votes and promises",
                  exact: true,
                })
                .click();
              await overlay
                .getByRole("button", {
                  name:
                    policy === "strategic player"
                      ? "Ask for their vote"
                      : "Pitch a target",
                  exact: true,
                })
                .click();
              await overlay
                .locator(".conversation-options-region button")
                .first()
                .click();
            } else if (policy === "social player") {
              await overlay
                .getByRole("button", { name: "Connect", exact: true })
                .click();
              await overlay
                .getByRole("button", { name: "Check in", exact: true })
                .click();
            }
          }
          const option =
            policy === "strategic player"
              ? overlay.getByRole("button", { name: /^I’m voting / }).first()
              : policy === "player in danger"
                ? overlay
                    .getByRole("button", { name: /^What if we do / })
                    .first()
                : overlay
                    .getByRole("button", {
                      name: /What have you heard|Ask who is actually committed|Support /,
                    })
                    .first();
          if ((await page.locator(".scramble-participant").count()) > 1)
            groupConversations++;
          if (await option.count()) await option.click();
          await page.keyboard.press("Escape");
          conversations++;
        }
      } else if (
        policy === "passive observer" &&
        actions % 3 === 0 &&
        (await page
          .getByRole("button", { name: "Approach", exact: true })
          .count())
      ) {
        await page
          .getByRole("button", { name: "Approach", exact: true })
          .first()
          .click();
        await page
          .getByRole("button", { name: "Watch nearby · 1 minute", exact: true })
          .click();
        await page.keyboard.press("Escape");
        watches++;
      } else if (
        actions % 4 === 2 &&
        (await page.getByRole("button", { name: "Move", exact: true }).count())
      ) {
        await page.getByRole("button", { name: "Move", exact: true }).click();
        const choices = page
          .locator(".camp-encounter-sheet button")
          .filter({ hasText: /beach|water well|shelter/i });
        await choices.nth(moves % (await choices.count())).click();
        moves++;
      } else
        await page
          .getByRole("button", { name: "Wait · 1 minute", exact: true })
          .click();
      actions++;
    }
    assert.equal(
      await page.evaluate(() => window.experienceQa.gm.dayTimer),
      0,
      `${policy} expiry`,
    );
    assert.ok(
      await page
        .getByRole("button", { name: "Head to Tribal Council" })
        .count(),
    );
    assert.equal((await geometry()).overflow, false);
    await shot(`playthrough-${index}`);
    playthroughs.push({
      policy,
      seed: 79 + index,
      actions,
      conversations,
      groupConversations,
      watches,
      moves,
      restores,
      expired: true,
      staged:
        policy === "player in danger"
          ? "One owned warning plus starting core; production activity afterward"
          : "Starting known core; production activities/responses afterward",
    });
  }
  // Separate controlled group opportunity; never claimed as organic meeting emergence.
  await page.setViewportSize({ width: 375, height: 812 });
  const destination = await page.evaluate(() =>
    window.experienceQa.plannedMeeting(),
  );
  await page.getByRole("button", { name: "Move", exact: true }).click();
  const place = {
    waterWell: "water well",
    shelter: "shelter",
    campfire: "fire",
  }[destination];
  await page
    .locator(".camp-encounter-sheet button")
    .filter({ hasText: new RegExp(place, "i") })
    .first()
    .click();
  await page
    .getByRole("button", { name: "Join alliance meeting", exact: true })
    .click();
  assert.ok((await page.locator(".scramble-participant").count()) >= 3);
  await page
    .getByRole("button", { name: /Ask who is actually committed|Support / })
    .first()
    .click();
  await shot("controlled-group-play");
  await page.keyboard.press("Escape");
  while (await page.evaluate(() => window.experienceQa.gm.dayTimer > 0))
    await page
      .getByRole("button", { name: "Wait · 1 minute", exact: true })
      .click();
  const beforeHandoff = await page.evaluate(() =>
    JSON.stringify([
      window.experienceQa.strategy.reasoning.serialize(),
      window.experienceQa.gm.systems.socialMemorySystem.serialize(),
      window.experienceQa.gm.systems.allianceSystem.serialize(),
    ]),
  );
  await page
    .getByRole("button", { name: "Head to Tribal Council", exact: true })
    .click();
  assert.equal(
    await page.evaluate(() => window.experienceQa.gm.gameState),
    "tribalCouncil",
  );
  assert.equal(
    await page.evaluate(() =>
      JSON.stringify([
        window.experienceQa.strategy.reasoning.serialize(),
        window.experienceQa.gm.systems.socialMemorySystem.serialize(),
        window.experienceQa.gm.systems.allianceSystem.serialize(),
      ]),
    ),
    beforeHandoff,
    "handoff does not reseed or reconsider",
  );
  checks.push({
    type: "controlled-group-play-and-existing-tribal-handoff",
    staged:
      "A scheduled appointment is due at phase start; travel, group choice and rest of hour use actual UI and production systems.",
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.experienceQa.scene("start"));
  assert.ok(
    await page
      .locator(".camp-person")
      .first()
      .evaluate((e) => getComputedStyle(e).animationName === "none"),
  );
  assert.equal(errors.length, 0, JSON.stringify(errors));
  const files = execFileSync(
    "git",
    [
      "ls-files",
      "src",
      "qa",
      "test",
      "styles.css",
      "index.html",
      "package.json",
    ],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n");
  const hash = crypto.createHash("sha256");
  for (const f of files)
    hash.update(f + "\0").update(fs.readFileSync(path.join(root, f)));
  const screenshots = fs
    .readdirSync(output)
    .filter((f) => f.endsWith(".png"))
    .map((f) => ({
      file: f,
      sha256: crypto
        .createHash("sha256")
        .update(fs.readFileSync(path.join(output, f)))
        .digest("hex"),
    }));
  const report = {
    engine,
    version: browser.version(),
    sourceCommit: execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    sourceFingerprint: hash.digest("hex"),
    workingTree: execFileSync("git", ["diff", "--stat"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    viewports,
    scenes,
    checks,
    playthroughs,
    errors,
    screenshots,
    physicalIPhone: false,
  };
  fs.writeFileSync(
    path.join(output, "report.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      engine,
      version: report.version,
      checks: checks.length,
      playthroughs,
      errors,
    }),
  );
} finally {
  await browser?.close();
  await new Promise((r) => server.close(r));
}
