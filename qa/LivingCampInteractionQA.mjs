import assert from 'node:assert/strict';
import path from 'node:path';

export async function interactionQa(page, output) {
  const reports=[];
  const qa=fn=>page.evaluate(fn);
  const timer=()=>qa(()=>campQa.gm.dayTimer);
  const dismiss=()=>page.keyboard.press('Escape');
  // Scene variation supplements the inherited 96 real-renderer crowd scenes.
  for(const viewport of [{width:375,height:812},{width:430,height:932},{width:844,height:390},{width:1280,height:800}]) {
    await page.setViewportSize(viewport);
    for(const [view,mode] of [['beach','casual'],['beach','mixed'],['campfire','casual'],['shelter','workers'],['jungleTrail','search'],['jungleTrail','follower'],['rockyShore','casual'],['waterWell','mixed']]) {
      await page.evaluate(({view,mode})=>campQa.scene(view,view==='campfire'?4:3,mode),{view,mode});
      await page.waitForTimeout(300);
      assert.ok(await qa(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal body scroll');
      await page.screenshot({path:path.join(output,`polish-${view}-${mode}-${viewport.width}.png`)});
    }
    await qa(()=>campQa.scene('beach',2,'casual'));
    const before=await timer();
    await page.getByRole('button',{name:'Approach',exact:true}).click();
    assert.equal(await timer(),before,'opening a sheet costs nothing');
    await page.locator('dialog').getByRole('button',{name:'Approach',exact:true}).click();
    assert.equal(before-await timer(),45);
    await dismiss();
    await qa(()=>{campQa.scene('waterWell',2,'mixed');const rolls=[.99,.01];campQa.renderer.interactions.random=()=>rolls.shift()??.99;});
    await page.getByRole('button',{name:'Approach',exact:true}).click();
    await page.locator('dialog').getByRole('button',{name:'Approach',exact:true}).click();
    assert.match(await page.locator('dialog').innerText(),/head down the path/);
    assert.equal(await page.locator('dialog').getByRole('button',{name:'Talk',exact:true}).count(),0);
    assert.equal(await page.locator('.camp-portrait').count(),0);
    await page.screenshot({path:path.join(output,`polish-well-relocation-${viewport.width}.png`)});
    await dismiss();
    assert.ok(await qa(()=>document.activeElement!==document.body),'focus restored');
    await qa(()=>campQa.scene('waterWell',2,'mixed'));
    await page.getByRole('button',{name:'Approach',exact:true}).click();
    // Simulate the exact shared activity naturally ending while walking over.
    await qa(()=>{
      const g=campQa.renderer.sheet;
      for(const p of campQa.gm.getPlayerTribe().members) if(p.campActivity?.id===g.activityId) p.campActivity.endsAt=campQa.gm.dayTimer-10;
      campQa.renderer.interactions.random=()=>.99;
    });
    await page.locator('dialog').getByRole('button',{name:'Approach',exact:true}).click();
    assert.match(await page.locator('dialog').innerText(),/already moved on/);
    assert.equal(await page.locator('dialog').getByRole('button',{name:'Talk',exact:true}).count(),0);
    await dismiss();
    // A disappeared group must close its sheet and give focus to real controls.
    await qa(()=>campQa.scene('waterWell',2,'mixed'));
    await page.getByRole('button',{name:'Approach',exact:true}).click();
    await qa(()=>{const npc=campQa.gm.getPlayerTribe().members.find(p=>!p.isPlayer);campQa.activity.interrupt(npc);campQa.renderer.refresh();});
    assert.equal(await page.locator('dialog').count(),0);
    assert.ok(await qa(()=>document.activeElement!==document.body));
  }
  await page.setViewportSize({width:375,height:812});
  await qa(()=>{campQa.scene('jungleTrail',2);const pair=campQa.gm.getPlayerTribe().members.filter(p=>!p.isPlayer);campQa.activity.moveTogether(pair[0],pair[1],'waterWell');});
  assert.ok(await page.locator('.camp-departures button').count(),'Jungle pair departure is witnessed locally');
  await page.screenshot({path:path.join(output,'polish-jungle-pair-departure-375.png')});
  await qa(()=>campQa.scene('beach',2));
  await qa(()=>campQa.travel());
  assert.ok(await page.locator('.camp-departures button').count());
  await qa(()=>campQa.screen.loadView('campfire'));
  await qa(()=>campQa.screen.loadView('beach'));
  assert.equal(await page.locator('.camp-departures button').count(),0,'leave and return misses Follow');
  await qa(()=>campQa.restore());
  assert.equal(await page.locator('.camp-departures button').count(),0,'reload cannot revive it');
  // Destination portraits stay absent until the semantic route step completes.
  await qa(()=>{campQa.scene('beach',2);campQa.travel();campQa.screen.loadView('tribeFlag',{travelPaid:true});});
  assert.equal(await page.locator('.camp-portrait').count(),0);
  await qa(()=>campQa.advance(45));
  assert.equal(await page.locator('.camp-portrait').count(),2);
  await page.screenshot({path:path.join(output,'polish-pair-arrival-375.png')});
  // Portraits in an unchanged group survive an unrelated worker refresh.
  await qa(()=>{campQa.scene('campfire',3,'casual');window.qaPortrait=document.querySelector('.camp-portrait');
    const p=campQa.gm.getPlayerTribe().members.filter(p=>!p.isPlayer)[2];campQa.activity.start(p,{type:'rest',location:'campfire',duration:3000});campQa.renderer.refresh();});
  assert.ok(await qa(()=>window.qaPortrait===document.querySelector('.camp-portrait')));
  // Narration progresses by a single dwell timer; saved evidence never replays.
  await qa(()=>{campQa.renderer.resetNarration();const i=campQa.renderer.interactions,p=campQa.gm.getPlayerTribe().members.filter(p=>!p.isPlayer);
    i.observe({id:'qa-queued-search',actorId:p[0].id,type:'idol_search_seen',witnessOnly:true});
    i.observe({id:'qa-queued-quiet',actorId:p[1].id,type:'conversation_guarded',witnessOnly:true});campQa.renderer.narrate();});
  const firstBeat=await page.locator('.camp-observable-beat').innerText();assert.match(firstBeat,/brush/);
  await page.waitForTimeout(5700);
  assert.match(await page.locator('.camp-observable-beat').innerText(),/quiet/);
  await qa(()=>campQa.restore());
  assert.equal(await page.locator('.camp-observable-beat').innerText(),'');
  assert.ok(await qa(()=>campQa.gm.systems.socialMemorySystem.getCampObservations(campQa.gm.player.id).some(e=>e.id==='qa-queued-quiet')));
  // Orientation change while a sheet is open preserves focus and reachable actions.
  await qa(()=>campQa.scene('waterWell',2,'casual'));
  await page.getByRole('button',{name:'Approach',exact:true}).click();
  await page.setViewportSize({width:844,height:390});
  assert.ok(await page.locator('dialog').evaluate(d=>d.contains(document.activeElement)));
  assert.ok(await page.locator('dialog').getByRole('button',{name:'Leave',exact:true}).isVisible());
  await dismiss();
  await page.setViewportSize({width:375,height:812});
  // Help routes use the original work/minigame UI; opening Help is free.
  for(const [view,target] of [['rockyShore','fishing'],['shelter','shelter'],['campfire','fire']]) {
    await page.evaluate(view=>campQa.scene(view,1,'workers'),view);
    const before=await timer();await page.getByRole('button',{name:'Help',exact:true}).click();
    assert.equal(await qa(()=>campQa.screen.currentView),target);assert.equal(await timer(),before);
    assert.equal(await page.locator('.camp-presence.minigame.collapsed').count(),1);
    assert.match(await page.getByRole('button',{name:/People nearby/}).innerText(),/Helping/);
    await page.screenshot({path:path.join(output,`polish-help-${view}-375.png`)});
    await page.setViewportSize({width:844,height:390});
    await page.screenshot({path:path.join(output,`polish-help-${view}-844.png`)});
    await page.setViewportSize({width:375,height:812});
    const buttons=await page.locator('#action-buttons button').all();assert.ok(buttons.length);
    assert.ok(await qa(()=>document.activeElement!==document.body),'Help preserves keyboard focus');
    await buttons[0].focus();assert.ok(await buttons[0].evaluate(b=>b===document.activeElement));
    if(target==='fishing') {
      await page.locator('#result-popup').click();
      await page.locator('#tap-area').click({position:{x:100,y:250}});
      const started=await timer();await page.locator('#tap-area').click({position:{x:100,y:250}});
      await page.locator('#tap-area').dispatchEvent('click');
      await page.waitForFunction(t=>campQa.gm.dayTimer<t,started);
      assert.equal(started-await timer(),300,'one original fishing attempt');
      await page.locator('#result-popup').click();
      await page.getByRole('button',{name:'Return to Rocky Shore'}).click();
      assert.equal(await qa(()=>campQa.screen.currentView),'rockyShore');
      assert.equal(await page.locator('.camp-portrait').count(),1,'return reconstructs one fisher');
    } else if(target==='shelter') {
      const start=await timer();await page.getByRole('button',{name:'Center',exact:true}).click();
      await page.getByRole('button',{name:'Build Shelter',exact:true}).click();
      assert.ok(await page.getByRole('button',{name:/Work together with/}).count(),'Help can join actual shelter work without a stale Day 1 assignment gate');
      await page.getByRole('button',{name:/Work together with/}).click();
      const entry=await qa(()=>campQa.gm.campLog.filter(e=>e.type==='camp_shelter_build' && e.actorId===campQa.gm.player.id).at(-1));
      assert.ok(entry);assert.equal(start-await timer(),entry.secondsSpent,'one original shelter block');
      const reputation=await qa(()=>{campQa.activity.ingestNewCampLog();return campQa.gm.player.teamPlayer;});
      assert.equal(await qa(()=>{campQa.activity.ingestNewCampLog();return campQa.gm.player.teamPlayer;}),reputation);
      await page.screenshot({path:path.join(output,'polish-help-shelter-result-375.png')});
    } else if(target==='fire') {
      const start=await timer();await page.getByRole('button',{name:'Tend Fire',exact:true}).click();
      await page.locator('#tend-fire-instructions-overlay').click();
      await page.screenshot({path:path.join(output,'polish-fire-game-375.png')});
      await page.setViewportSize({width:844,height:390});
      assert.ok(await page.locator('#fireCanvas').evaluate(c=>c.getBoundingClientRect().bottom<=document.querySelector('#action-buttons').getBoundingClientRect().top),'landscape spiral clears navigation');
      assert.ok(await page.locator('#progress-rings-container').evaluate(e=>e.getBoundingClientRect().top>=document.querySelector('#camp-clock').getBoundingClientRect().bottom),'fire rings clear the production clock');
      await page.screenshot({path:path.join(output,'polish-fire-game-844.png')});
      await page.setViewportSize({width:375,height:812});
      // One tap can legitimately light a ring instead of ending the attempt.
      // Keep playing through the production handler rather than assuming loss.
      for(let tap=0;tap<12 && await timer()===start;tap++) {
        await page.locator('#fireCanvas').click();
        await page.waitForTimeout(400);
        if(await page.locator('#fireVictoryOverlay').isVisible()) await page.locator('#fireVictoryOverlay').click();
      }
      assert.equal(start-await timer(),300,'one original fire attempt');
      await page.waitForTimeout(700);
      await page.screenshot({path:path.join(output,'polish-fire-result-375.png')});
      await qa(()=>{document.querySelectorAll('#fireFailureOverlay,#fireVictoryOverlay').forEach(n=>n.remove());campQa.screen.loadView('campfire');});
    }
  }
  // Five actual camp sequences. No activity choices are forced after natural().
  // Controls are the production renderer/dialogue/minigame handlers; only the
  // setup/clock pacing is deterministic. This is not a full-season playthrough.
  for(const [index,style] of ['passive','worker','social','spy','mixed'].entries()) {
    await qa(()=>{document.querySelectorAll('#fireFailureOverlay,#fireVictoryOverlay').forEach(n=>n.remove());});
    await page.evaluate(seed=>campQa.natural(seed),47+index);
    const actions=[],signatures=new Set();
    let lingered=0;
    for(let step=0;step<24 && await timer()>240;step++) {
      // Decide from local evidence before leaving: navigation closes a Follow
      // opening. This deliberately never consults the NPC location map.
      if(['spy','mixed'].includes(style)) {
        const departure=await qa(()=>campQa.renderer.interactions.recentDepartures()[0]);
        if(departure) {const result=await page.evaluate(e=>campQa.renderer.interactions.follow(e),departure);actions.push(`follow: ${result.text}`);}
      }
      if(['social','spy','mixed'].includes(style) && step%3===0 && !await qa(()=>campQa.renderer.interactions.seeGroups().some(g=>g.social))) {
        const places=['beach','campfire','shelter','jungleTrail','waterWell','rockyShore'];
        await page.evaluate(view=>campQa.screen.loadView(view),places[step/3%places.length]);
        actions.push('navigate');
      }
      const groups=await qa(()=>campQa.renderer.interactions.seeGroups());
      signatures.add(JSON.stringify(groups.map(g=>({id:g.id,activity:g.activityId}))));
      const social=groups.find(g=>g.social);
      if(social && (['passive','spy'].includes(style) || style==='mixed' && actions.some(a=>a.startsWith('approach:')) && step%2===0)) {
        const result=await page.evaluate(g=>campQa.renderer.interactions.watch(g),social);actions.push(`watch: ${result.text}`);
      } else if(social && ['social','mixed'].includes(style)) {
        const result=await page.evaluate(g=>campQa.renderer.interactions.approach(g),social);actions.push(`approach: ${result.text}`);
        if(result.join) {
          await page.evaluate(({g,context})=>campQa.renderer.interactions.join(g,context),{g:social,context:result.context});
          await page.getByRole('button',{name:'Build Connection',exact:true}).click();
          await page.locator('#conversation-overlay .conversation-options-region button:not(:disabled)').first().click();
          await page.screenshot({path:path.join(output,`playtest-${style}-conversation.png`)});
          const beforeChatEnd=await timer();await page.getByRole('button',{name:/^(End chat|Close)$/i}).click();
          assert.ok(await timer()<beforeChatEnd,'existing conversation time remains separate from walking');actions.push('join/exchange/end chat');
        }
      }
      if(['worker','mixed'].includes(style) && step===4) {
        await qa(()=>campQa.screen.loadView('waterWell'));
        await page.getByRole('button',{name:'Center',exact:true}).click();
        await page.locator('#water-info-popup').click();
        const before=await timer();await page.getByRole('button',{name:'For the Tribe',exact:true}).click();
        assert.equal(before-await timer(),2100,'one original 35-minute tribe-water block');
        const reward=await qa(()=>{campQa.activity.ingestNewCampLog();return campQa.gm.player.teamPlayer;});
        assert.equal(await qa(()=>{campQa.activity.ingestNewCampLog();return campQa.gm.player.teamPlayer;}),reward);
        actions.push('filled tribe water: 35 minutes');
        await page.screenshot({path:path.join(output,`playtest-${style}-water.png`)});
        await qa(()=>campQa.screen.loadView('shelter'));
      }
      await qa(()=>campQa.advance(60));
      lingered++;
      await page.screenshot({path:path.join(output,`playtest-${style}-latest.png`)});
    }
    const result=await qa(()=>({remaining:campQa.gm.dayTimer,owned:campQa.gm.systems.socialMemorySystem.getCampObservations(campQa.gm.player.id).length,
      completed:campQa.gm.campLog.filter(e=>e.source==='camp_activity').length,needs:campQa.gm.campNeedElapsed,
      supplies:campQa.gm.getPlayerTribe().stockpile,npcs:campQa.activity.npcs().filter(p=>p.campActivity).length}));
    assert.ok(result.npcs>0);assert.ok(result.completed>0);assert.ok(result.remaining>0 && result.remaining<7200);
    reports.push({style,actions,minutesLingering:lingered,distinctNearbyGroups:signatures.size,...result});
    await qa(()=>campQa.screen.loadView('summary',{travelPaid:true}));
    assert.ok(await page.locator('.camp-human-recap').count());
    assert.equal(await page.locator('#task-icon').isVisible(),false,'task shortcut stays clear of recap title');
    assert.ok(await page.locator('.summary-wrapper > h2').evaluate(e=>e.getBoundingClientRect().top>=document.querySelector('#camp-clock').getBoundingClientRect().bottom),'recap heading clears clock');
    await page.screenshot({path:path.join(output,`playtest-${style}-recap.png`)});
    await page.locator('.summary-wrapper').evaluate(e=>e.scrollTop=e.scrollHeight);
    assert.ok(await page.locator('.camp-human-recap li').last().evaluate(e=>e.getBoundingClientRect().bottom<=document.querySelector('#camp-action-bar').getBoundingClientRect().top),'recap can scroll fully above Continue');
    assert.ok(await qa(()=>document.documentElement.scrollWidth<=innerWidth),'recap has no horizontal body scroll');
  }
  return reports;
}
