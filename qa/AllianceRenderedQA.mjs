import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url),
  browsers = require(process.env.PLAYWRIGHT_MODULE || "playwright"),
  engine = process.env.ALLIANCE_QA_BROWSER || "chromium";
const root = fileURLToPath(new URL("../", import.meta.url)),
  output =
    process.env.ALLIANCE_RENDERED_OUTPUT || `/tmp/alliance-rendered-${engine}`;
fs.mkdirSync(output, { recursive: true });
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".png": "image/png",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
};
const server = http.createServer((req, res) => {
  const file = path.resolve(
    root,
    "." + decodeURIComponent(new URL(req.url, "http://localhost").pathname),
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
    mime[path.extname(file)] || "application/octet-stream",
  );
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
let browser;
const errors = [],
  checks = [];
try {
  browser = await browsers[engine].launch({
    headless: true,
    args: engine === "chromium" ? ["--no-sandbox"] : [],
  });
  const page = await browser.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(
    `http://127.0.0.1:${server.address().port}/qa/alliance-presentation.html`,
  );
  await page.waitForFunction(() => window.allianceQaReady);
  const scenes = [
    "overview",
    "detail",
    "starter",
    "offer",
    "group",
    "disagreement",
    "recruitment",
    "strained",
    "dormant",
    "bottom",
  ];
  for (const viewport of [
    { width: 375, height: 812 },
    { width: 430, height: 932 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 },
  ]) {
    await page.setViewportSize(viewport);
    for (const scene of scenes) {
      const before = await page.evaluate(
        (scene) => window.allianceQa.scene(scene),
        scene,
      );
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await dialog.evaluate((e) =>
        e.getAnimations({ subtree: true }).forEach((a) => a.finish()),
      );
      const state = await dialog.evaluate((e) => {
        const r = e.getBoundingClientRect();
        return {
          bounds: { x: r.x, y: r.y, w: r.width, h: r.height },
          focused: e.contains(document.activeElement),
          text: e.innerText,
          controls: [...e.querySelectorAll("button,input")]
            .filter((b) => !b.disabled)
            .map((b) => {
              const r = b.getBoundingClientRect();
              return { w: r.width, h: r.height };
            }),
        };
      });
      assert.ok(
        state.bounds.x >= -0.5 &&
          state.bounds.x + state.bounds.w <= viewport.width + 0.5,
        `${scene} fits width`,
      );
      assert.ok(
        state.bounds.y >= -0.5 &&
          state.bounds.y + state.bounds.h <= viewport.height + 0.5,
        `${scene} fits height`,
      );
      assert.ok(state.focused, `${scene} focus inside dialog`);
      assert.ok(
        state.controls.every((b) => b.w >= 43.9 && b.h >= 43.9),
        `${scene} touch targets`,
      );
      assert.doesNotMatch(
        state.text,
        /fake|sincerity|loyalty\s*\d|priority\s*\d|strength:\s*\d|cohesion/i,
      );
      if (scene === "bottom") assert.match(state.text, /Your read: Working/);
      if (scene === "dormant") assert.match(state.text, /Dormant/);
      if (scene === "offer")
        assert.equal(
          await dialog
            .getByRole("button", { name: "Accept pact", exact: true })
            .count(),
          1,
        );
      if (scene === "group" || scene === "disagreement")
        assert.ok((await dialog.innerText()).includes("I prefer"));
      const timer = await page.evaluate(() => window.allianceQa.gm.dayTimer);
      await page.waitForTimeout(80);
      assert.equal(
        await page.evaluate(() => window.allianceQa.gm.dayTimer),
        timer,
        "reading is free",
      );
      await page.screenshot({
        path: path.join(output, `${scene}-${viewport.width}.png`),
      });
      // Keyboard traverses a scrollable landscape dialog and remains contained.
      for (let i = 0; i < state.controls.length + 2; i++)
        await page.keyboard.press("Tab");
      assert.ok(
        await dialog.evaluate((e) => e.contains(document.activeElement)),
        "Tab containment",
      );
      await page.keyboard.press("Escape");
      assert.equal(
        await page.getByRole("dialog").count(),
        0,
        "Escape closes dialog",
      );
      checks.push({
        scene,
        viewport,
        controls: state.controls.length,
        timeBefore: timer,
        allianceCount: before.allianceCount,
      });
    }
    await page.evaluate(() => window.allianceQa.scene("starter"));
    const count = await page.evaluate(
      () => window.allianceQa.gm.systems.allianceSystem.alliances.length,
    );
    await page.locator("#create-alliance-members button").first().click();
    await page
      .getByRole("button", { name: "Start conversation", exact: true })
      .click();
    assert.equal(
      await page.evaluate(
        () => window.allianceQa.gm.systems.allianceSystem.alliances.length,
      ),
      count,
      "starter cannot create social reality",
    );
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.allianceQa.scene("offer"));
    await page
      .getByRole("button", { name: "Accept pact", exact: true })
      .click();
    assert.doesNotMatch(
      await page.getByRole("dialog").innerText(),
      /fake|sincerity|cohesion/i,
    );
    await page.keyboard.press("Escape");
  }
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => window.allianceQa.scene("overview"));
  assert.equal(
    await page
      .getByRole("dialog")
      .evaluate((e) => getComputedStyle(e).animationName),
    "none",
  );
  await page.keyboard.press("Escape");
  assert.deepEqual(errors, []);
  const report = {
    engine,
    version: browser.version(),
    checks,
    errors,
    actualIOS: false,
  };
  fs.writeFileSync(
    path.join(output, "results.json"),
    JSON.stringify(report, null, 2),
  );
  console.log(
    JSON.stringify({
      engine,
      version: browser.version(),
      checks: checks.length,
      errors,
    }),
  );
} finally {
  await browser?.close();
  server.close();
}
