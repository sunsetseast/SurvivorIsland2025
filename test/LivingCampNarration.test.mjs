import test from 'node:test';
import assert from 'node:assert/strict';
import { CampNarrationQueue, narrationBeat, NARRATION } from '../src/modules/ui/CampNarration.js';
const entry = (id,type='idol_search_seen',more={}) => ({id,type,actorId:id,origin:'witness',campTime:1000,location:'jungleTrail',...more});
const project = e => narrationBeat(e,[e],id=>id,'player');
test('simultaneous meaningful beats both display in priority order with readable dwell and no replay',()=>{
  const q=new CampNarrationQueue(),owned=[entry('pair','departed',{participantIds:['friend']}),entry('idol'),entry('guarded','conversation_guarded')];
  q.ingest(owned,project,1000,0);assert.equal(q.advance(1000,0).id,'idol');
  assert.equal(q.advance(999,3000).id,'idol');
  q.ingest(owned,project,999,5500);assert.equal(q.advance(999,5500).id,'guarded');
  q.ingest(owned,project,998,11000);assert.equal(q.advance(998,11000).id,'pair');
  q.ingest(owned,project,997,16500);assert.equal(q.advance(997,16500),null);
});
test('three pending beats are bounded, duplicates merge, routine/low value events are dropped',()=>{
  const q=new CampNarrationQueue(),owned=[entry('low','departed'),entry('a'),entry('b'),entry('c'),entry('d','departed',{participantIds:['friend']}),entry('dupe','idol_search_seen',{actorId:'a'})];
  q.ingest(owned,project,1000,0);assert.equal(q.pending.length,3);
  assert.deepEqual(q.pending.map(e=>e.id),['a','b','c']);
});
test('pending narration expires in semantic and wall time; reload empties queue without replaying saved evidence',()=>{
  const owned=[entry('a')],q=new CampNarrationQueue();q.ingest(owned,project,1000,0);
  assert.equal(q.advance(819,100),null);
  q.reset();q.ingest(owned,project,1000,0);assert.equal(q.advance(1000,NARRATION.lifetimeMs),null);
  q.reset(owned);q.ingest(owned,project,1000,0);assert.equal(q.advance(1000,0),null);assert.equal(owned.length,1);
});
test('hearsay/routine life never enters queue; repeated witnessed direction escalates once without inventing intent',()=>{
  assert.equal(project(entry('secret','idol_search_seen',{origin:'hearsay'})),null);
  assert.equal(project(entry('work','work')),null);
  const owned=[entry('one','departed',{actorId:'Tony',campTime:1100}),entry('two','departed',{actorId:'Tony'})];
  const make=e=>narrationBeat(e,owned,id=>id,'player'),q=new CampNarrationQueue();
  q.ingest(owned,make,1000,0);const beat=q.advance(1000,0);
  assert.match(beat.text,/more than once/);assert.ok(!beat.text.includes('idol'));
  const third=entry('three','departed',{actorId:'Tony',campTime:999});owned.push(third);
  q.ingest(owned,make,999,5500);assert.equal(q.advance(999,5500),null);
});

test('only owned witnessed meaningful arrivals become restrained cues; ordinary/hearsay arrivals stay visual',()=>{
  const pair=entry('arrival','arrived',{actorId:'Jeremy',participantIds:['Parvati'],location:'waterWell',fromLocation:'beach'});
  const beat=project(pair);assert.equal(beat.priority,2);assert.match(beat.text,/Jeremy and Parvati walk up from the beach/);
  assert.equal(project({...pair,origin:'hearsay'}),null);
  assert.equal(project({...pair,participantIds:[]}),null);
  const owned=[entry('depart','departed',{actorId:'Jeremy'}),entry('depart:follow:player','followed',{actorId:'player'}),{...pair,participantIds:[]}];
  assert.ok(narrationBeat(owned[2],owned,id=>id,'player'));
  const q=new CampNarrationQueue();q.reset(owned);q.ingest(owned,e=>narrationBeat(e,owned,id=>id,'player'),1000,0);
  assert.equal(q.advance(1000,0),null,'reload never replays arrival');
});
