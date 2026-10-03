import assert from 'node:assert/strict';
import path from 'node:path';

// Supplements all #346/#347 scenes and real Help/social/spy loops. No mock
// renderer or time/memory logic: each assertion reads the production systems.
export async function presenceQa(page,output) {
  const checks=[],qa=fn=>page.evaluate(fn);
  for(const viewport of [{width:375,height:812},{width:430,height:932},{width:844,height:390},{width:1280,height:800}]) {
    await page.setViewportSize(viewport);
    for(const paired of [false,true]) {
      await qa(()=>{campQa.gm.dayTimer=7200;campQa.gm.systems.socialMemorySystem.deserialize(null);campQa.scene('beach',3,'workers');campQa.renderer.resetNarration();});
      await page.evaluate(paired=>{
        const p=campQa.activity.npcs(),actor=p.find(p=>p.firstName==='Tony'),companion=p[0];
        const a=campQa.activity.start(actor,{type:'travel',location:'tribeFlag',travelWithId:paired?companion.id:null,
          goal:{type:'rest',location:'tribeFlag',duration:1000}});window.qaDepartureId=a.id;
      },paired);
      assert.equal(await page.locator('.camp-witnessed-departure').count(),1);
      assert.match(await page.locator('.camp-witnessed-departure').innerText(),/Tony/);
      const follow=page.getByRole('button',{name:'Follow Tony',exact:true});assert.ok(await follow.isVisible());
      await page.screenshot({path:path.join(output,`presence-beach-${paired?'pair':'solo'}-${viewport.width}.png`)});
      await qa(()=>campQa.screen.loadView('campfire'));
      assert.equal(await page.locator('.camp-witnessed-departure').count(),0);
      await qa(()=>campQa.screen.loadView('beach'));assert.equal(await page.locator('.camp-witnessed-departure').count(),0);
      checks.push({view:'beach',mode:paired?'paired departure':'solo departure',viewport});
    }
    for(const view of ['waterWell','jungleTrail','campfire','shelter','rockyShore']) {
      const move=await page.evaluate(view=>campQa.movement(view,true),view);
      const actorSelector=`.camp-portrait[data-npc-id="${move.actorId}"]`;
      assert.equal(await page.locator(actorSelector).count(),0);
      assert.ok(await page.evaluate(({move,view})=>!campQa.present(campQa.activity.npcs().find(p=>p.id===move.actorId),view),{move,view}));
      assert.ok(await qa(()=>!campQa.gm.systems.socialMemorySystem.getCampObservations(campQa.gm.player.id).some(e=>e.type==='arrived')));
      await page.screenshot({path:path.join(output,`presence-${view}-inbound-${viewport.width}.png`)});
      await qa(()=>campQa.advance(20));await qa(()=>campQa.restore());
      assert.equal(await page.locator(actorSelector).count(),0,'mid-route reload does not arrive');
      await qa(()=>campQa.advance(25));
      assert.equal(await page.locator(actorSelector).count(),1);
      const arrival=await page.evaluate(move=>campQa.gm.systems.socialMemorySystem.getCampObservations(campQa.gm.player.id).filter(e=>e.id===`${move.activityId}:arrival`),move);
      assert.equal(arrival.length,1);assert.equal(arrival[0].campTime,7155);assert.equal(arrival[0].participantIds.length,1);
      assert.match(await page.locator('.camp-observable-beat').innerText(),/walk up from/);
      assert.ok(await qa(()=>document.documentElement.scrollWidth<=innerWidth));
      const rail=await page.locator('.camp-presence').boundingBox();assert.ok(rail.height<=viewport.height-160);
      await page.screenshot({path:path.join(output,`presence-${view}-arrived-${viewport.width}.png`)});
      await qa(()=>campQa.restore());assert.equal(await page.locator('.camp-observable-beat').innerText(),'');
      checks.push({view,mode:'inbound/save/paired arrival',viewport});
    }
    await qa(()=>{
      campQa.scene('campfire',6,'workers');const p=campQa.activity.npcs();
      campQa.gm.getPlayerTribe().stockpile.water=0;campQa.gm.getPlayerTribe().stockpile.firewood=0;
      for(let i=0;i<6;i+=2) campQa.activity.start(p[i],{type:'socialize',location:'campfire',targetId:p[i+1].id,duration:3000});
      campQa.renderer.refresh();
    });
    const cues=await page.locator('.camp-public-cue').allTextContents();assert.equal(new Set(cues).size,cues.length);
    const references=await qa(()=>{window.qaStable=[...document.querySelectorAll('.camp-portrait')];return true;});
    await qa(()=>campQa.renderer.refresh());assert.ok(references);
    assert.ok(await qa(()=>window.qaStable.every((p,i)=>p===document.querySelectorAll('.camp-portrait')[i])));
    await page.screenshot({path:path.join(output,`presence-campfire-cues-${viewport.width}.png`)});
    checks.push({view:'campfire',mode:'multiple public groups and deduped needs',viewport});
    // A paid Follow is transit throughout the walk; a finished destination
    // conversation does not become player-owned intel during synchronous time.
    await qa(()=>{
      campQa.gm.dayTimer=7200;campQa.gm.systems.socialMemorySystem.deserialize(null);campQa.scene('beach',3,'workers');
      const p=campQa.activity.npcs(),actor=p.find(p=>p.firstName==='Tony');
      campQa.activity.start(actor,{type:'travel',location:'jungleTrail',duration:180,goal:{type:'idol_hunt',location:'jungleTrail'}});
    });
    await page.getByRole('button',{name:'Follow Tony',exact:true}).click();
    assert.match(await page.locator('dialog').innerText(),/lose sight/);
    assert.ok(await page.locator('dialog').evaluate(d=>d.contains(document.activeElement)));
    assert.ok(await page.locator('dialog').getByRole('button',{name:'Back to camp',exact:true}).isVisible());
    await page.screenshot({path:path.join(output,`presence-follow-result-${viewport.width}.png`)});
    await page.keyboard.press('Escape');
    checks.push({view:'jungleTrail',mode:'in-transit Follow result',viewport});
    await qa(()=>{
      campQa.movement('jungleTrail',false);campQa.activity.random=()=>0;const p=campQa.activity.npcs(),actor=p.find(p=>p.firstName==='Tony'),searcher=p[0];
      campQa.activity.start(searcher,{type:'idol_hunt',location:'jungleTrail',duration:10});
      actor.campActivity.goal={type:'investigate',location:'jungleTrail',targetId:searcher.id,duration:10};
      campQa.advance(55);
    });
    assert.ok(await qa(()=>!campQa.gm.systems.socialMemorySystem.getCampClaims(campQa.activity.npcs().find(p=>p.firstName==='Tony').id).some(c=>c.topic==='idol_suspicion' && c.origin==='firsthand')));
    await page.screenshot({path:path.join(output,`presence-investigator-late-${viewport.width}.png`)});
    checks.push({view:'jungleTrail',mode:'investigator too late',viewport});
  }
  return checks;
}
