// Optional developer QA, not an npm/game dependency. Install Playwright locally
// and run: node qa/LivingCampRenderedQA.mjs. Screenshots go to /tmp by default.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { presenceQa } from './LivingCampPresenceQA.mjs';
import { interactionQa } from './LivingCampInteractionQA.mjs';
const require = createRequire(import.meta.url);
const browsers = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browserName = process.env.CAMP_QA_BROWSER || 'chromium';
const root = fileURLToPath(new URL('../',import.meta.url));
const output = process.env.CAMP_QA_OUTPUT || '/tmp/living-camp-rendered-qa';
fs.mkdirSync(output,{recursive:true});
const mime = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.jpeg':'image/jpeg','.jpg':'image/jpeg','.svg':'image/svg+xml'};
const server = http.createServer((req,res)=>{
  const file = path.resolve(root, '.' + decodeURIComponent(new URL(req.url,'http://localhost').pathname));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');fs.createReadStream(file).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const browser = await browsers[browserName].launch({headless:true, ...(browserName === 'chromium' && process.env.CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.CHROMIUM_EXECUTABLE_PATH,args:['--no-sandbox','--disable-gpu']} : {})});
const errors = [], checks = [];
try {
  const page = await browser.newPage();
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}/qa/living-camp-presentation.html`);
  await page.waitForFunction(()=>window.campQaReady,null,{timeout:10000});
  const views = ['beach','campfire','shelter','jungleTrail','rockyShore','waterWell'];
  const viewports = [{width:375,height:812},{width:430,height:932},{width:844,height:390},{width:1280,height:800}];
  for (const viewport of viewports) {
    await page.setViewportSize(viewport);
    for (const view of views) for (const count of [1,2,3,6]) {
      const rendered = await page.evaluate(({view,count})=>window.campQa.scene(view,count),{view,count});
      assert.equal(rendered,count,`${view} ${count} count`);
      const geometry = await page.evaluate(()=>{
        const rail=document.querySelector('.camp-presence');
        const b=rail.getBoundingClientRect();
        const buttons=[...document.querySelectorAll('.camp-portrait,.camp-context-button,.camp-nav-button')].map(e=>{const r=e.getBoundingClientRect();return {width:r.width,height:r.height};});
        const boxes=[...document.querySelectorAll('.camp-portrait')].map(e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height};});
        return {rail:{x:b.x,y:b.y,w:b.width,h:b.height},overflow:rail.scrollWidth>rail.clientWidth+1,buttons,boxes,layers:document.querySelectorAll('#npc-layer').length};
      });
      assert.equal(geometry.layers,1);
      assert.ok(await page.locator('.camp-location-intro').evaluate(e=>e.getBoundingClientRect().top>=document.querySelector('#camp-clock').getBoundingClientRect().bottom),'location identity clears production clock');
      assert.ok(!geometry.overflow,`${view} ${count}: horizontal rail overflow`);
      assert.ok(geometry.rail.x>=0 && geometry.rail.y>=0 && geometry.rail.x+geometry.rail.w<=viewport.width+1 && geometry.rail.y+geometry.rail.h<=viewport.height,`${view} rail bounds`);
      if (view === 'campfire') {
        const clearSupply = await page.evaluate(() => {
          const a = document.querySelector('.camp-presence').getBoundingClientRect();
          const b = document.querySelector('#campfire-stockpile-banner').getBoundingClientRect();
          return a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        });
        assert.ok(clearSupply, 'Campfire stockpile must not cover nearby people');
      }
      for(const button of geometry.buttons) assert.ok(button.width>=44 && button.height>=44,`${view} touch size ${JSON.stringify(button)}`);
      for(const [i,a] of geometry.boxes.entries()) for(const b of geometry.boxes.slice(i+1))
        assert.ok(a.x+a.w<=b.x+.5 || b.x+b.w<=a.x+.5 || a.y+a.h<=b.y+.5 || b.y+b.h<=a.y+.5,`${view} portraits overlap`);
      checks.push({view,count,viewport});
      if(count===6) { await page.waitForTimeout(300); await page.screenshot({path:path.join(output,`${view}-${viewport.width}.png`)}); }
    }
    // Casual and guarded groups, watch time, accessible sheet and Escape.
    await page.evaluate(()=>window.campQa.scene('waterWell',2,'casual'));
    await page.getByRole('button',{name:'Approach',exact:true}).click();
    const dialog=page.locator('.camp-encounter-sheet'); await dialog.waitFor();
    const bounds=await dialog.boundingBox();assert.ok(bounds.width<=viewport.width-16 && bounds.height<=viewport.height-16);
    assert.ok(await dialog.evaluate(d=>d.contains(document.activeElement)));
    await page.screenshot({path:path.join(output,`sheet-${viewport.width}.png`)});
    await page.keyboard.press('Escape'); assert.equal(await dialog.count(),0);
    await page.getByRole('button',{name:'Approach',exact:true}).click();
    const before=await page.evaluate(()=>window.campQa.gm.dayTimer);
    await page.getByRole('button',{name:'Watch nearby · 1 minute',exact:true}).click();
    assert.equal(before - await page.evaluate(()=>window.campQa.gm.dayTimer),60);
    await page.keyboard.press('Escape');
  }
  await page.setViewportSize({width:375,height:812});
  await page.evaluate(()=>window.campQa.scene('beach',2));
  await page.evaluate(()=>{window.campQa.travel();window.campQa.advance(1);});
  assert.equal(await page.locator('.camp-portrait').count(),0);
  assert.ok(await page.locator('.camp-departures button').count());
  await page.screenshot({path:path.join(output,'departure-375.png')});
  const beforeFollow=await page.evaluate(()=>window.campQa.gm.dayTimer);
  await page.locator('.camp-departures button').first().click();
  assert.equal(beforeFollow-await page.evaluate(()=>window.campQa.gm.dayTimer),120);
  assert.ok(await page.locator('.camp-encounter-sheet').count());
  await page.screenshot({path:path.join(output,'follow-375.png')});
  await page.keyboard.press('Escape');
  await page.evaluate(()=>window.campQa.scene('shelter',3));
  const beforeGroups=await page.locator('.camp-clusters').innerText();
  await page.evaluate(()=>window.campQa.restore());
  assert.equal(await page.locator('#npc-layer').count(),1);
  assert.equal(await page.locator('.camp-clusters').innerText(),beforeGroups);
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await page.locator('.camp-person').first().evaluate(e=>getComputedStyle(e).animationName),'none');
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.evaluate(()=>window.campQa.scene('beach',2,'casual'));
  await page.getByRole('button',{name:'Approach',exact:true}).click();
  await page.locator('.camp-encounter-sheet').getByRole('button',{name:'Approach',exact:true}).click();
  await page.getByRole('button',{name:'Join conversation',exact:true}).click();
  assert.ok(await page.evaluate(()=>Boolean(window.campQa.activity.conversation)),'existing dialogue starts');
  assert.equal(await page.evaluate(()=>window.campQa.activity.conversation.groupIds.length),1);
  assert.equal(await page.evaluate(()=>window.campQa.gm.systems.conversationSystem.activeConversationContext.groupParticipantIds.length),2);
  assert.ok(await page.locator('#conversation-overlay').evaluate(d=>d.contains(document.activeElement)));
  await page.screenshot({path:path.join(output,'joined-conversation-375.png')});
  await page.setViewportSize({width:844,height:390});
  const endChat=page.getByRole('button',{name:'End chat',exact:true});
  const endBounds=await endChat.boundingBox();assert.ok(endBounds.y+endBounds.height<=390,'joined conversation exit fits landscape');
  await page.screenshot({path:path.join(output,'joined-conversation-844.png')});
  await endChat.click();
  assert.equal(await page.evaluate(()=>window.campQa.activity.conversation),null);
  assert.ok(await page.evaluate(()=>document.activeElement!==document.body));
  await page.setViewportSize({width:375,height:812});
  // A minigame subview stays physically normalized, with its NPC rail closed.
  await page.evaluate(()=>{window.campQa.scene('jungleTrail',3);window.campQa.screen.loadView('firewood',{travelPaid:true});});
  assert.equal(await page.locator('.camp-presence.minigame.collapsed').count(),1);
  assert.ok(await page.getByRole('button',{name:/People nearby/}).count());
  await page.screenshot({path:path.join(output,'firewood-375.png')});
  // Resize an existing view without re-entering it: measured portrait placement
  // must follow its live container rather than stale pixel coordinates.
  await page.evaluate(()=>window.campQa.scene('shelter',6));
  await page.setViewportSize({width:1280,height:800});
  await page.waitForTimeout(100);
  assert.ok(await page.locator('.camp-presence').evaluate(e=>e.scrollWidth<=e.clientWidth+1));
  const playtests = await interactionQa(page,output);
  const presenceChecks = await presenceQa(page,output);
  assert.deepEqual(errors,[],'uncaught page errors');
  fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({browserName,browser:browser.version(),scenes:checks.length+32+presenceChecks.length,viewports,errors,playtests,presenceChecks,interactionChecks:['dialog focus/Escape','watch time','semantic paired travel','follow time','save/load groups','reduced motion','existing group dialogue','minigame collapsed presence','live resize','timed stale approach','missed follow reload','narration dwell/queue/reload','stable portraits','orientation focus','Help fishing/shelter/fire','actual tribe water time/idempotence']},null,2));
  console.log(JSON.stringify({scenes:checks.length+32+presenceChecks.length,errors,output}));
} finally {await browser.close();server.close();}
