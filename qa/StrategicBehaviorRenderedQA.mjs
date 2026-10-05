import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const browsers=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright'),engine=process.env.STRATEGY_QA_BROWSER||'chromium',root=fileURLToPath(new URL('../',import.meta.url)),output=process.env.STRATEGY_RENDERED_OUTPUT||`/tmp/strategy-rendered-${engine}`;
fs.mkdirSync(output,{recursive:true});
const server=http.createServer((req,res)=>{const f=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));if(!f.startsWith(root)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){res.writeHead(404);res.end();return;}res.setHeader('Content-Type',({'.js':'text/javascript','.html':'text/html','.css':'text/css','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg'})[path.extname(f)]||'application/octet-stream');fs.createReadStream(f).pipe(res);});await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;const errors=[],checks=[];
try{browser=await browsers[engine].launch({headless:true,args:engine==='chromium'?['--no-sandbox']:[]});const page=await browser.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(`http://127.0.0.1:${server.address().port}/qa/strategy-refinement.html`);await page.waitForFunction(()=>window.behaviorQaReady);
for(const viewport of [{width:375,height:812},{width:430,height:932},{width:844,height:390},{width:1280,height:800}]){await page.setViewportSize(viewport);for(const kind of ['offer','sincere','cover','group','bottom','warning','verification','recap']){
 const before=await page.evaluate(kind=>window.behaviorQa.scene(kind),kind);
 if(['sincere','cover'].includes(kind))await page.evaluate(cover=>window.behaviorQa.accept(cover),kind==='cover');
 const surface=page.locator(kind==='recap'?'#refinement-summary':'#conversation-overlay');await surface.waitFor();
 const state=await surface.evaluate(e=>{const r=e.getBoundingClientRect();return {bounds:{x:r.x,y:r.y,w:r.width,h:r.height},text:e.innerText,buttons:[...e.querySelectorAll('button')].filter(b=>b.offsetParent).map(b=>({text:b.textContent,h:b.getBoundingClientRect().height})),focus:e.contains(document.activeElement)};});
 assert.ok(state.bounds.x>=-1&&state.bounds.y>=-1&&state.bounds.x+state.bounds.w<=viewport.width+1&&state.bounds.y+state.bounds.h<=viewport.height+1,`${kind} viewport`);
 assert.doesNotMatch(state.text,/sincerity|loyalty\s*\d|fake member|priority\s*\d|Blindside risk|83%/i);
 if(kind==='cover'||kind==='sincere'){const privateState=await page.evaluate(()=>{const A=window.behaviorQa.gm.systems.allianceSystem,p=A.proposals.find(p=>p.id==='qa:offer'),a=A.getAlliance(p.allianceId);return a.memberStates[window.behaviorQa.gm.player.id].sincerity;});assert.equal(privateState,kind==='cover'?'cover':'real');}
 if(kind==='offer')assert.ok(state.text.includes('Agree, but keep your options open'));
 if(kind==='recap')assert.ok(state.text.includes('What You Heard'));
 for(const b of state.buttons)assert.ok(b.h>=43,`${kind}: ${b.text} touch height ${b.h}`);
 const time=await page.evaluate(()=>window.behaviorQa.gm.dayTimer);await page.waitForTimeout(10);assert.equal(await page.evaluate(()=>window.behaviorQa.gm.dayTimer),time);
 await page.screenshot({path:path.join(output,`${kind}-${viewport.width}.png`)});checks.push({kind,viewport,buttons:state.buttons.length,privacy:true,readingTimeFree:true});
 if(kind!=='recap'){await page.keyboard.press('Tab');assert.ok(await surface.evaluate(e=>e.contains(document.activeElement)),`${kind} keyboard focus`);await page.keyboard.press('Escape');}
 }}
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({engine,version:browser.version(),checks,errors,physicalIPhoneVerified:false},null,2));console.log(JSON.stringify({engine,version:browser.version(),checks:checks.length,errors}));
}finally{await browser?.close();server.close();}
