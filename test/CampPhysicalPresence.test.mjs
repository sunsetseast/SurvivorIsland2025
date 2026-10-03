import test from 'node:test';
import assert from 'node:assert/strict';
import { makeLivingCampQa, quiet } from '../qa/LivingCampSimulationHarness.mjs';
import { isCampPhysicallyPresent, eligibleCampMember } from '../src/modules/locations/CampPresence.js';
import { campGroups } from '../src/modules/ui/CampPresentation.js';
import { narrationBeat } from '../src/modules/ui/CampNarration.js';
import { LocationKeys as L } from '../src/modules/core/LocationKeys.js';
const { default: CampInteractionSystem } = await import('../src/modules/systems/CampInteractionSystem.js');
const { resolveNpcCampExchange } = await import('../src/modules/systems/CampSocialResolution.js');
const { default: eventManager } = await import('../src/modules/core/EventManager.js');

function fixture() {
  const s = quiet(() => makeLivingCampQa({ seed: 91 }));
  s.activity.phaseId = s.activity.phase;
  const [a,b,c,d] = s.activity.npcs();
  for (const p of s.activity.npcs()) s.activity.start(p, { type:'rest', location:L.BEACH, duration:5000 });
  const setView = place => { window.campScreen.currentView=place; s.gm.player.location=place; };
  const interactions = new CampInteractionSystem(s.gm,{random:()=>.5,navigate:setView});
  s.gm.systems.campInteractionSystem=interactions;
  const present = (person,place) => isCampPhysicallyPresent(person,s.gm.systems.npcLocationSystem,place,s.gm);
  const owned = person => s.memory.getCampObservations(person.id);
  const travel = (person=a, more={}) => s.activity.start(person,{type:'travel',location:L.TRIBE_FLAG,
    goal:{type:'rest',location:L.TRIBE_FLAG,duration:1000},...more});
  return {...s,a,b,c,d,setView,interactions,present,owned,travel};
}

test('one semantic presence contract excludes missing, out, absent, travelers and subview mismatch',()=>{
  const s=fixture(),positions=s.gm.systems.npcLocationSystem;
  assert.equal(s.present(null,L.BEACH),false); assert.ok(s.present(s.a,L.BEACH));
  s.a.isOut=true;assert.equal(s.present(s.a,L.BEACH),false);s.a.isOut=false;
  for(const absent of [new Set([String(s.a.id)]),[s.a.id]]) {
    s.gm.flags.absentFromCampIds=absent;assert.equal(eligibleCampMember(s.gm,s.a),false);
  }
  s.gm.flags.absentFromCampIds=[];s.travel();
  assert.equal(positions.getLocation(s.a.id),L.TRIBE_FLAG);
  assert.equal(s.present(s.a,L.BEACH),false);assert.equal(s.present(s.a,L.TRIBE_FLAG),false);
  assert.equal(positions.getSurvivorsAtLocation(L.TRIBE_FLAG).length,0);
  s.gm.player.location=L.FIREWOOD;assert.ok(s.present(s.gm.player,L.JUNGLE_TRAIL));
});

test('departure now, no arrival at start/midstep, arrival exactly once at completion-time witnesses',()=>{
  const s=fixture();s.activity.start(s.b,{type:'rest',location:L.TRIBE_FLAG,duration:1000});
  const a=s.travel(),before=s.gm.dayTimer;
  assert.equal(s.owned(s.gm.player).find(e=>e.id===`${a.id}:departure`).campTime,before);
  assert.ok(!s.owned(s.b).some(e=>e.type==='arrived'));
  s.gm.consumeCampTime(20,{source:'clock'});assert.equal(s.activity.complete(s.a,a),false);
  assert.ok(!s.owned(s.b).some(e=>e.type==='arrived'));assert.equal(s.present(s.a,L.TRIBE_FLAG),false);
  s.setView(L.TRIBE_FLAG);s.gm.consumeCampTime(25,{source:'clock'});
  for(const owner of [s.a,s.b,s.gm.player]) {
    const arrivals=s.owned(owner).filter(e=>e.id===`${a.id}:arrival`);
    assert.equal(arrivals.length,1);assert.equal(arrivals[0].campTime,before-45);assert.equal(arrivals[0].fromLocation,L.BEACH);
  }
  assert.ok(s.present(s.a,L.TRIBE_FLAG));assert.equal(s.activity.complete(s.a,a),false);
  assert.ok(narrationBeat(s.owned(s.gm.player).find(e=>e.type==='arrived'),s.owned(s.gm.player),id=>String(id),s.gm.player.id)===null,'ordinary traffic stays visual');
});

test('inbound traveler cannot witness destination conversation, work, departure or hear a claim',()=>{
  const s=fixture();s.activity.start(s.b,{type:'rest',location:L.TRIBE_FLAG,duration:2000});
  const chat=s.activity.start(s.c,{type:'strategy_conversation',location:L.TRIBE_FLAG,targetId:s.b.id,duration:20});
  s.travel();s.gm.consumeCampTime(20,{source:'clock'});
  assert.ok(!s.owned(s.a).some(e=>e.type==='seen_together'));
  assert.equal(s.memory.getCampClaims(s.a.id).length,0);
  s.activity.observe({actor:s.b,type:'work',location:L.TRIBE_FLAG,activityId:'midwork',at:s.gm.dayTimer});
  assert.ok(!s.owned(s.a).some(e=>e.id==='midwork'));
  s.activity.start(s.b,{type:'travel',location:L.BEACH,goal:{type:'rest',location:L.BEACH}});
  assert.ok(!s.owned(s.a).some(e=>e.type==='departed' && e.actorId===s.b.id));
  s.gm.consumeCampTime(25,{source:'clock'});
  s.activity.observe({actor:s.c,type:'work',location:L.TRIBE_FLAG,activityId:'later',at:s.gm.dayTimer});
  assert.ok(s.owned(s.a).some(e=>e.id==='later'));
  // Neither speaker nor listener may resolve an exchange from a route marker.
  s.travel(s.c,{location:L.TRIBE_FLAG});
  assert.equal(resolveNpcCampExchange({gm:s.gm,memory:s.memory,speaker:s.c,listener:s.a,activity:{...chat,targetId:s.a.id}}),null);
});

test('origin departure witnesses exclude inbound travelers and elsewhere player',()=>{
  const s=fixture();s.travel(s.b,{location:L.BEACH});s.setView(L.CAMPFIRE);const a=s.travel();
  assert.ok(!s.owned(s.b).some(e=>e.id===`${a.id}:departure`));
  assert.ok(!s.owned(s.gm.player).some(e=>e.id===`${a.id}:departure`));
});

test('travelers have no group/Talk/Approach/Help until actually arriving',()=>{
  const s=fixture();s.setView(L.TRIBE_FLAG);s.travel();
  assert.equal(s.interactions.visible(s.a.id),false);
  assert.equal(campGroups(s.gm,L.TRIBE_FLAG).length,0);
  assert.equal(s.activity.beginConversation(s.a,{location:L.TRIBE_FLAG}),false);
  assert.equal(s.activity.approachPlayer(s.a,L.TRIBE_FLAG),false);
  s.gm.consumeCampTime(45,{source:'clock'});
  assert.ok(s.interactions.visible(s.a.id));assert.equal(campGroups(s.gm,L.TRIBE_FLAG).length,1);
  assert.ok(s.activity.beginConversation(s.a,{location:L.TRIBE_FLAG}));
});

test('mid-travel production JSON restoration retains route/time and completes arrival once',()=>{
  const s=fixture(),a=s.travel();s.setView(L.TRIBE_FLAG);s.gm.consumeCampTime(20,{source:'clock'});
  const snapshot=JSON.parse(JSON.stringify(s.gm.createSavePayload()));assert.ok(s.gm.restoreSavePayload(snapshot));
  const actor=s.activity.npcs().find(p=>String(p.id)===String(s.a.id));
  assert.equal(actor.campActivity.id,a.id);assert.equal(s.present(actor,L.TRIBE_FLAG),false);
  assert.ok(!s.owned(s.gm.player).some(e=>e.id===`${a.id}:arrival`));
  s.gm.consumeCampTime(24,{source:'clock'});assert.equal(s.present(actor,L.TRIBE_FLAG),false);
  s.gm.consumeCampTime(1,{source:'clock'});assert.ok(s.present(actor,L.TRIBE_FLAG));
  assert.equal(s.owned(s.gm.player).filter(e=>e.id===`${a.id}:arrival`).length,1);
  assert.ok(s.gm.restoreSavePayload(JSON.parse(JSON.stringify(s.gm.createSavePayload()))));
  s.gm.consumeCampTime(1,{source:'clock'});
  assert.equal(s.owned(s.gm.player).filter(e=>e.id===`${a.id}:arrival`).length,1);
});

test('paired route chains arrive together, emit one paired memory, and restore mid-route',()=>{
  const s=fixture();s.setView(L.TRIBE_FLAG);
  const travel=s.travel(s.a,{travelWithId:s.b.id,route:[L.CAMPFIRE,L.SHELTER],goal:{type:'strategy_conversation',location:L.SHELTER,targetId:s.b.id}});
  assert.equal(s.a.campActivity.id,s.b.campActivity.id);
  s.gm.consumeCampTime(20,{source:'clock'});s.gm.restoreSavePayload(JSON.parse(JSON.stringify(s.gm.createSavePayload())));
  const [a,b]=[s.a,s.b].map(p=>s.activity.npcs().find(n=>n.id===p.id));
  let halfPair=false;const off=eventManager.subscribe('camp:activityChanged',()=>{
    for(const place of [L.TRIBE_FLAG,L.CAMPFIRE,L.SHELTER]) if(s.present(a,place)!==s.present(b,place)) halfPair=true;
  });
  s.gm.consumeCampTime(25,{source:'clock'});
  const first=s.owned(s.gm.player).find(e=>e.id===`${travel.id}:arrival`);
  assert.deepEqual(first.participantIds,[b.id]);assert.equal(first.campTime,7155);
  assert.equal(s.present(a,L.TRIBE_FLAG),false,'already proceeding along route');
  s.setView(L.CAMPFIRE);s.gm.consumeCampTime(45,{source:'clock'});
  s.setView(L.SHELTER);s.gm.consumeCampTime(45,{source:'clock'});off();
  assert.equal(halfPair,false);assert.ok(s.present(a,L.SHELTER));assert.ok(s.present(b,L.SHELTER));
  assert.equal(a.campActivity.id,b.campActivity.id);
  const arrivals=s.owned(s.gm.player).filter(e=>e.type==='arrived');
  assert.equal(arrivals.length,3);assert.deepEqual(arrivals.map(e=>e.campTime),[7155,7110,7065]);
  assert.ok(arrivals.every(e=>e.participantIds.length===1));
});

test('simultaneous independent arrivals cannot resurrect resolved travel or interrupt a newly accepted group',()=>{
  const s=fixture();s.travel(s.a,{goal:{type:'strategy_conversation',location:L.TRIBE_FLAG,targetId:s.b.id}});
  s.travel(s.b);s.gm.consumeCampTime(45,{source:'clock'});
  for(const person of [s.a,s.b]) assert.ok(!s.activity.resolved.has(person.campActivity.id));
  assert.equal(s.a.campActivity.id,s.b.campActivity.id);
});

test('investigation discovers only current search after actual arrival, never a finished search',()=>{
  for(const duration of [20,1000]) {
    const s=fixture();s.activity.start(s.b,{type:'idol_hunt',location:L.TRIBE_FLAG,duration});
    s.travel(s.a,{goal:{type:'investigate',location:L.TRIBE_FLAG,targetId:s.b.id,duration:10}});
    s.gm.consumeCampTime(44,{source:'clock'});assert.equal(s.memory.getCampClaims(s.a.id).length,0);
    s.gm.consumeCampTime(11,{source:'clock'});
    assert.equal(s.memory.getCampClaims(s.a.id).some(e=>e.topic==='idol_suspicion' && e.origin==='firsthand'),duration===1000);
  }
});

test('player navigation and following cannot overhear destination events while paying travel time',()=>{
  for(const follow of [false,true]) {
    const s=fixture();s.activity.start(s.b,{type:'rest',location:L.TRIBE_FLAG,duration:1000});
    s.activity.start(s.c,{type:'strategy_conversation',location:L.TRIBE_FLAG,targetId:s.b.id,duration:15});
    s.memory.recordCampClaim({id:'secret',speakerId:s.c.id,listenerIds:[s.b.id],subjectId:s.d.id,topic:'target',stance:'consider',day:1});
    s.interactions.random=()=>0;
    if(follow) {s.travel();s.interactions.follow(s.interactions.recentDepartures()[0]);}
    else {
      const block=s.activity.start(s.gm.player,{type:'travel',location:L.TRIBE_FLAG,duration:30,external:true});
      window.campScreen.currentView=L.TRIBE_FLAG;
      s.gm.consumeCampTime(30,{source:'camp_travel'});s.activity.finishPlayerBlock(block);s.gm.player.location=L.TRIBE_FLAG;
    }
    assert.equal(s.memory.getCampClaims(s.gm.player.id).length,0);
    assert.ok(!s.owned(s.gm.player).some(e=>e.type.startsWith('overheard')));
  }
});

test('Follow loses a target still in transit without learning destination goal',()=>{
  const s=fixture();s.travel(s.a,{duration:180,goal:{type:'idol_hunt',location:L.TRIBE_FLAG}});
  const response=s.interactions.follow(s.interactions.recentDepartures()[0]);
  assert.match(response.text,/lose sight/);assert.equal(s.memory.getCampClaims(s.gm.player.id).length,0);
  assert.ok(!s.owned(s.gm.player).some(e=>e.type==='idol_search_seen' || e.type==='arrived'));
});

test('legacy in-flight JSON save drops only premature arrival and restores dependencies before activity validation',()=>{
  const s=fixture();s.setView(L.TRIBE_FLAG);const a=s.travel();delete s.a.campActivity.fromLocation;
  s.memory.recordCampObservation({id:`${a.id}:arrival`,actorId:s.a.id,witnessIds:[s.gm.player.id],type:'arrived',location:L.TRIBE_FLAG,fromLocation:L.BEACH,day:1,campTime:7200});
  s.memory.recordCampObservation({id:'keep',actorId:s.a.id,witnessIds:[s.gm.player.id],type:'work',location:L.BEACH,day:1,campTime:7190});
  s.gm.consumeCampTime(20,{source:'clock'});
  // The real GameManager constructs CampActivitySystem before installing its dependencies.
  s.gm.systems={campActivitySystem:s.activity,...s.gm.systems};
  const saved=JSON.parse(JSON.stringify(s.gm.createSavePayload()));s.memory.deserialize(null);
  assert.ok(s.gm.restoreSavePayload(saved));
  const actor=s.activity.npcs().find(p=>p.id===s.a.id);
  assert.equal(actor.campActivity.fromLocation,L.BEACH);
  assert.ok(!s.owned(s.gm.player).some(e=>e.type==='arrived'));
  assert.ok(s.owned(s.gm.player).some(e=>e.id==='keep'));
  assert.ok(!s.memory.getCampImpression(s.gm.player.id,s.a.id,'arrived'));
  s.gm.consumeCampTime(25,{source:'clock'});
  assert.equal(s.owned(s.gm.player).filter(e=>e.type==='arrived').length,1);
  assert.equal(s.owned(s.gm.player).find(e=>e.type==='arrived').campTime,7155);
});

test('an out companion is never restored or included in a paired arrival',()=>{
  const s=fixture();s.setView(L.TRIBE_FLAG);const a=s.travel(s.a,{travelWithId:s.b.id});
  s.b.isOut=true;s.gm.consumeCampTime(45,{source:'clock'});
  const arrival=s.owned(s.gm.player).find(e=>e.id===`${a.id}:arrival`);
  assert.deepEqual(arrival.participantIds,[]);assert.equal(s.present(s.b,L.TRIBE_FLAG),false);
});

test('external NPC approach pays arrival before conversation, without immediately choosing another route',()=>{
  const s=fixture();s.setView(L.TRIBE_FLAG);const before=s.gm.dayTimer;
  assert.equal(s.activity.approachPlayer(s.a,L.TRIBE_FLAG),true);
  assert.equal(before-s.gm.dayTimer,45);assert.ok(s.present(s.a,L.TRIBE_FLAG));
  assert.equal(s.a.campActivity,null);assert.ok(s.activity.beginConversation(s.a,{location:L.TRIBE_FLAG}));
});

test('Follow ending the camp phase cannot navigate over the phase/event handoff',()=>{
  const s=fixture();s.gm.dayTimer=60;s.travel();let navigated=false;s.interactions.navigate=()=>{navigated=true;};
  s.interactions.follow(s.interactions.recentDepartures()[0]);
  assert.equal(s.gm.dayTimer,0);assert.equal(navigated,false);
});

test('a returning route marker closes Follow only on real arrival, permanently after return',()=>{
  const s=fixture();const outgoing=s.travel();s.gm.consumeCampTime(45,{source:'clock'});
  s.travel(s.a,{location:L.BEACH,goal:{type:'rest',location:L.BEACH,duration:1000}});
  assert.ok(s.interactions.recentDepartures().some(e=>e.id===`${outgoing.id}:departure`),'inbound return is still transit');
  s.gm.consumeCampTime(45,{source:'clock'});
  assert.ok(!s.interactions.recentDepartures().some(e=>e.id===`${outgoing.id}:departure`));
  s.travel();assert.ok(!s.interactions.recentDepartures().some(e=>e.id===`${outgoing.id}:departure`));
});
