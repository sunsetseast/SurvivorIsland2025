import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root=fileURLToPath(new URL('../',import.meta.url));
const output=process.env.FIRST_DAY_QA_OUTPUT || '/tmp/first-day-rendered';
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{
 const rel=new URL(req.url,'http://localhost').pathname;
 const file=path.resolve(root,'.'+(rel==='/'?'/index.html':rel));
 if(!file.startsWith(root)||!fs.existsSync(file)||fs.statSync(file).isDirectory()){res.writeHead(404);res.end();return;}
 res.setHeader('Content-Type',({'.js':'text/javascript','.css':'text/css','.html':'text/html','.jpeg':'image/jpeg','.png':'image/png','.json':'application/json'}[path.extname(file)]||'application/octet-stream'));
 fs.createReadStream(file).pipe(res);
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({headless:true,...(process.env.CAMP_QA_EXECUTABLE?{executablePath:process.env.CAMP_QA_EXECUTABLE,args:['--no-sandbox','--disable-dev-shm-usage']}:{})});
const base=`http://127.0.0.1:${server.address().port}`,checks=[],errors=[];
try{
 for(const viewport of [{width:375,height:812},{width:430,height:932},{width:844,height:390},{width:1280,height:800}]){
  const page=await browser.newPage({viewport});page.on('pageerror',e=>errors.push(e.stack));
  await page.goto(base);
  await page.getByText('New Game',{exact:true}).click();
  await page.getByRole('button',{name:'Choose Survivor',exact:true}).first().click();
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.getByText('Start Game',{exact:true}).click();
  await page.getByText('2 Tribes',{exact:true}).click();
  for(let n=0;n<6&&!await page.getByRole('button',{name:'Begin Day 1',exact:true}).isVisible();n++) await page.getByRole('button',{name:'Next',exact:true}).click();
  await page.getByRole('button',{name:'Begin Day 1',exact:true}).click();
  await page.waitForFunction(()=>[...document.querySelectorAll('button')].some(e=>e.offsetParent!==null&&(/stay out of it/i.test(e.textContent)||e.getAttribute('aria-label')==='Skip leader introduction'))||[...document.querySelectorAll('.day1-setup__tasks button')].some(e=>e.offsetParent!==null));
  const stay=page.getByRole('button',{name:/^Stay out of it$/i});
  if(await stay.isVisible())await stay.click();
  else if(await page.getByRole('button',{name:'Skip leader introduction',exact:true}).isVisible())await page.getByRole('button',{name:'Skip leader introduction',exact:true}).click();
  await page.getByText('Resources',{exact:true}).click().catch(async e=>{await page.screenshot({path:path.join(output,`failure-${viewport.width}.png`)});fs.writeFileSync(path.join(output,`failure-${viewport.width}.txt`),await page.locator('body').innerText());throw e;});
  await page.getByRole('button',{name:'Start Camp',exact:true}).click();
  const entry=page.getByRole('button',{name:'Step into camp',exact:true});await entry.waitFor();
  await entry.scrollIntoViewIfNeeded();
  const box=await entry.boundingBox();assert.ok(box.height>=44&&box.y>=0&&box.y+box.height<=viewport.height,'camp entry reachable');
  assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(output,`entry-${viewport.width}.png`)});
  await page.getByRole('button',{name:/^View /}).last().click();
  await page.locator('.survivor-card-overlay .overlay-close').click();
  await entry.click();
  assert.match(await page.locator('.camp-presence-heading').innerText(),/beach/i);
  await page.getByRole('button',{name:'Move around camp',exact:true}).click();
  await page.getByRole('button',{name:/water well ·/i}).click();
  await page.getByRole('button',{name:'Move around camp',exact:true}).click();
  await page.getByRole('button',{name:/beach ·/i}).click();
  assert.ok(!/setGameState\(CAMP\) executed|renderShakeView\(\) called/.test(await page.locator('body').innerText()));
  await page.getByRole('button',{name:'Beach actions',exact:true}).click();
  await page.getByRole('button',{name:'Back to camp',exact:true}).click();
  assert.equal(await page.getByRole('dialog',{name:'Beach actions'}).isVisible(),false);
  await page.getByRole('button',{name:'Beach actions',exact:true}).click();await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog',{name:'Beach actions'}).isVisible(),false);
  assert.equal(await page.getByRole('button',{name:'Beach actions',exact:true}).evaluate(e=>e===document.activeElement),true);
  checks.push({viewport,scene:'production new season → role → roster → paid camp entry → beach popup/keyboard exit'});
  // Controlled presentation-only scene, separate from the unforced season path.
  await page.evaluate(async()=>{const {default:view}=await import('/src/modules/views/FirstContactView.js');view.tribes=[{id:1,name:'Moto'},{id:2,name:'Luvu'}];const root=document.createElement('div');root.id='qa-outro';root.style.cssText='position:fixed;inset:0;z-index:9999';document.body.appendChild(root);window.qaOutroDone=view._showNoJourneyOutro(root,{winningTribeKeys:[1]});});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  assert.match(await page.locator('#qa-outro').innerText(),/Luvu, I’ll see you tonight/);
  assert.ok(!(await page.locator('#qa-outro').innerText()).includes('<span'));
  assert.equal(await page.evaluate(()=>document.body.scrollWidth>innerWidth+1),false);
  await page.screenshot({path:path.join(output,`outro-${viewport.width}.png`)});
  await page.getByRole('button',{name:'Continue',exact:true}).click();
  await page.evaluate(async()=>{await window.qaOutroDone;document.getElementById('qa-outro')?.remove();});
  checks.push({viewport,scene:'controlled first challenge plain-text Tribal outro'});
  await page.close();
  // Controlled projection checks, explicitly separate from the new-season path.
  const fixture=await browser.newPage({viewport});fixture.on('pageerror',e=>errors.push(e.stack));
  await fixture.goto(base+'/qa/living-camp-presentation.html');await fixture.waitForFunction(()=>window.campQaReady);
  await fixture.evaluate(()=>{const q=window.campQa;q.scene('campfire',0,'workers');});
  await fixture.evaluate(()=>{const q=window.campQa;q.gm.player.location='shelter';q.screen.currentView='shelter';q.renderer.renderFor('shelter');});
  assert.match(await fixture.locator('.camp-presence-heading').innerText(),/shelter/i);
  await fixture.evaluate(()=>{const q=window.campQa;q.gm.player.location='campfire';q.renderer.renderFor('campfire');});
  assert.match(await fixture.locator('.camp-presence-heading').innerText(),/fire/i);
  checks.push({viewport,scene:'empty-location cache invalidation'});await fixture.close();
 }
 assert.deepEqual(errors,[]);
 fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({checks,errors},null,2));
 console.log(JSON.stringify({checks:checks.length,errors:errors.length,output}));
}finally{await browser.close();await new Promise(r=>server.close(r));}
