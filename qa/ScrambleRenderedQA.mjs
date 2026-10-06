import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const browsers = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.CAMP_QA_BROWSER || 'chromium';
const root = fileURLToPath(new URL('../', import.meta.url));
const output = process.env.CAMP_QA_OUTPUT || '/tmp/scramble-rendered-qa'; fs.mkdirSync(output, { recursive: true });
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.png': 'image/png', '.jpeg': 'image/jpeg', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream'); fs.createReadStream(file).pipe(res);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser; const checks = [], errors = [], playtests = [];
try {
  browser = await browsers[engine].launch({ headless: true, ...(engine === 'chromium' && process.env.CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] } : {}) });
  const page = await browser.newPage(); page.on('pageerror', e => { errors.push(e.message); console.error('PAGE ERROR', e.message); });
  await page.goto(`http://127.0.0.1:${server.address().port}/qa/scramble-presentation.html`);
  await page.waitForFunction(() => window.scrambleQaReady, null, { timeout: 15000 });
  const shot = async name => {
    await page.evaluate(() => document.querySelectorAll('.camp-person,.conversation-parchment').forEach(e => e.getAnimations({ subtree: true }).forEach(a => a.finish())));
    return page.screenshot({ path: path.join(output, `${name}.png`) });
  };
  const geometry = () => page.evaluate(() => {
    const bounds = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; };
    return { overflow: document.body.scrollWidth > innerWidth + 1,
      rail: bounds(document.querySelector('.camp-presence')),
      buttons: [...document.querySelectorAll('.camp-context-button,.camp-portrait,.camp-nav-button')].filter(e => !e.disabled).map(bounds) };
  });
  for (const viewport of [{ width: 375, height: 812 }, { width: 430, height: 932 }, { width: 844, height: 390 }, { width: 1280, height: 800 }]) {
    await page.setViewportSize(viewport);
    for (const view of ['beach', 'waterWell', 'campfire', 'shelter', 'jungleTrail', 'rockyShore']) {
      await page.evaluate(view => window.scrambleQa.local(view), view);
      assert.equal(await page.locator('#clock-time-text').innerText(), '60:00', 'restored semantic clock displayed');
      const g = await geometry(); assert.equal(g.overflow, false); assert.ok(g.rail.y + g.rail.h <= viewport.height);
      for (const button of g.buttons) assert.ok(button.w >= 44 && button.h >= 44);
      assert.equal(await page.locator('.camp-cluster.quiet').count(), 1);
      assert.equal(await page.getByRole('button', { name: 'Wait · 1 minute', exact: true }).count(), 1);
      await shot(`${view}-${viewport.width}`); checks.push({ view, viewport, type: 'nearby' });
    }
    const npc = await page.evaluate(() => window.scrambleQa.local('beach'));
    const timer = await page.evaluate(() => window.scrambleQa.gm.dayTimer);
    // Actual human dwell causes neither NPC action nor countdown progress.
    await page.waitForTimeout(2100); assert.equal(await page.evaluate(() => window.scrambleQa.gm.dayTimer), timer);
    await page.getByRole('button', { name: 'Approach', exact: true }).click();
    const sheet = page.locator('.camp-encounter-sheet'); assert.ok((await sheet.boundingBox()).height < viewport.height);
    await page.keyboard.press('Escape'); assert.equal(await sheet.count(), 0);
    await page.locator(`[data-npc-id="${npc.cId}"]`).click();
    const overlay = page.locator('#conversation-overlay'); await overlay.waitFor(); await overlay.evaluate(e => e.getAnimations({ subtree: true }).forEach(a => a.finish()));
    await shot(`conversation-${viewport.width}`);
    const ui = await overlay.evaluate(e => {
      const buttons = [...e.querySelectorAll('button')].map(b => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
      return { buttons, focused: e.contains(document.activeElement) };
    });
    assert.ok(ui.buttons.length > 0); assert.ok(ui.buttons.every(b => b.h >= 43.95), 'conversation touch target');
    assert.ok(await overlay.locator('.conversation-nav-row').evaluate(e => { const b = e.getBoundingClientRect(); return b.top >= 0 && b.bottom <= innerHeight; }), 'End chat remains reachable');
    assert.ok(ui.focused, 'conversation focus');
    await page.waitForTimeout(2100); assert.equal(await page.evaluate(() => window.scrambleQa.gm.dayTimer), timer);
    await page.keyboard.press('Escape'); assert.equal(await overlay.count(), 0, 'Escape releases conversation');
    assert.ok(await page.evaluate(() => window.scrambleQa.gm.dayTimer < 3600 && !window.scrambleQa.activity.conversation));
    checks.push({ viewport, type: 'conversation-reading-and-close' });
    await page.evaluate(() => window.scrambleQa.intelligence());
    await page.getByRole('button', { name: 'More…', exact: true }).click();
    await page.getByRole('button', { name: 'Confront', exact: true }).click();
    await page.getByRole('button', { name: /^Bluff:/ }).first().click();
    await shot(`bluff-${viewport.width}`);
    assert.ok(await overlay.evaluate(e => e.contains(document.activeElement)), 'focus retained after resolving bluff');
    assert.equal(await page.evaluate(() => window.scrambleQa.gm.dayTimer), 3600);
    await page.getByRole('button', { name: /^What if we do/ }).first().click();
    const resolved = await page.evaluate(() => JSON.stringify(window.scrambleQa.activity.conversation.checkpoint));
    await page.evaluate(() => window.scrambleQa.restore());
    await page.getByRole('button', { name: 'Resume conversation', exact: true }).click();
    assert.equal(await page.getByRole('button', { name: /^What if we do/ }).count(), 0, 'resolved counter hidden on restore');
    assert.equal(await page.evaluate(() => JSON.stringify(window.scrambleQa.activity.conversation.checkpoint)), resolved, 'resolved choice cannot replay after production restore');
    await shot(`resumed-${viewport.width}`);
    await page.setViewportSize({ width: viewport.height, height: viewport.width });
    await page.keyboard.press('Escape');
    assert.equal(await overlay.count(), 0);
    assert.equal(await page.evaluate(() => window.scrambleQa.gm.dayTimer), 3360, 'two strategic choices bill four minutes exactly once');
    await page.setViewportSize(viewport);
    checks.push({ viewport, type: 'bluff-checkpoint-resume-focus-orientation-billing' });
    await page.evaluate(() => window.scrambleQa.invite());
    const beforeInvite = await page.evaluate(() => window.scrambleQa.gm.dayTimer);
    await page.waitForTimeout(2100); assert.equal(await page.locator('#conversation-overlay').count(), 0, 'no wall-time autoaccept');
    assert.equal(await page.evaluate(() => window.scrambleQa.gm.dayTimer), beforeInvite, 'reading invitation does not tick');
    await shot(`invitation-${viewport.width}`);
    await page.getByRole('button', { name: /wants to talk/ }).click();
    assert.ok(await page.evaluate(() => !!window.scrambleQa.activity.conversation)); await page.keyboard.press('Escape');
    checks.push({ viewport, type: 'physical-npc-approach' });
    const meeting = await page.evaluate(() => window.scrambleQa.meeting()); assert.equal(meeting.status, 'active');
    await shot(`meeting-${viewport.width}`); await page.getByRole('button', { name: 'Join alliance meeting', exact: true }).click();
    assert.equal(await page.locator('#conversation-overlay').count(), 1); assert.equal(await page.locator('.strategy-overlay').count(), 0);
    assert.equal(await page.evaluate(() => window.scrambleQa.activity.conversation.groupIds.length), 2);
    await page.keyboard.press('Escape'); assert.equal(await page.evaluate(() => window.scrambleQa.activity.conversation), null);
    checks.push({ viewport, type: 'meeting-join' });
    await page.evaluate(() => window.scrambleQa.local('beach')); const beforeMove = await page.evaluate(() => window.scrambleQa.gm.dayTimer);
    await page.evaluate(() => window.scrambleQa.screen.loadView('waterWell'));
    assert.ok(await page.evaluate(before => window.scrambleQa.gm.dayTimer < before, beforeMove)); checks.push({ viewport, type: 'paid-navigation' });
  }
  await page.setViewportSize({ width: 375, height: 812 });
  for (const style of ['passive', 'social', 'mixed']) {
    await page.evaluate(() => window.scrambleQa.natural(81)); const outcomes = [];
    for (let step = 0; step < 12; step++) {
      if (style !== 'passive' && step % 4 === 0) await page.evaluate(step => window.scrambleQa.screen.loadView(['waterWell', 'campfire', 'beach'][step / 4 % 3]), step);
      if (style !== 'passive' && step % 4 === 2) {
        const portrait = page.locator('.camp-portrait:not(:disabled)').first();
        if (await portrait.count()) {
          await portrait.click();
          const sheet = page.locator('.camp-encounter-sheet');
          if (await sheet.count()) {
            const approach = sheet.getByRole('button', { name: 'Approach', exact: true });
            if (await approach.count()) await approach.click();
            const join = page.getByRole('button', { name: 'Join conversation', exact: true });
            const talk = sheet.getByRole('button', { name: 'Talk', exact: true });
            if (await join.count()) await join.click(); else if (await talk.count()) await talk.click();
            outcomes.push('approach');
          }
          if (await page.locator('#conversation-overlay').count()) outcomes.push('talk');
          await page.keyboard.press('Escape');
        }
      }
      await page.evaluate(() => window.scrambleQa.wait(60));
      const audit = await page.evaluate(() => { const q = window.scrambleQa;
        return { time: q.gm.dayTimer, groups: document.querySelectorAll('.camp-cluster').length,
          travelling: q.activity.npcs().filter(s => s.campActivity?.type === 'travel').map(s => s.id),
          visible: [...document.querySelectorAll('[data-npc-id]')].map(e => Number(e.dataset.npcId)) }; });
      assert.ok(audit.travelling.every(id => !audit.visible.includes(id))); outcomes.push(audit);
      if (step === 6) await page.evaluate(() => window.scrambleQa.restore());
    }
    await shot(`natural-${style}`); playtests.push({ style, outcomes });
  }
  await page.emulateMedia({ reducedMotion: 'reduce' }); await page.evaluate(() => window.scrambleQa.local('beach'));
  assert.equal(await page.locator('.camp-person').first().evaluate(e => getComputedStyle(e).animationName), 'none');
  await page.evaluate(() => window.scrambleQa.wait(3600));
  assert.equal(await page.locator('.post-challenge-summary').count(), 1); await shot('summary-375');
  assert.equal(await page.getByRole('button', { name: 'Wait · 1 minute', exact: true }).count(), 0);
  assert.deepEqual(errors, []);
  const report = { engine, version: browser.version(), checks, playtests, errors, actualIOS: false };
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ engine, version: browser.version(), checks: checks.length, playtests: playtests.length, errors }));
} finally { await browser?.close(); server.close(); }
