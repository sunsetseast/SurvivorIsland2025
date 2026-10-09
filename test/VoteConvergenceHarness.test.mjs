import test from 'node:test';
import assert from 'node:assert/strict';
import { runNegotiatedVote } from '../qa/VoteConvergenceHarness.mjs';

test('a sincere five-person majority negotiates from mixed preferences through actual camp meetings',()=>{
 const r=runNegotiatedVote({size:7,seed:80});
 assert.ok(new Set(r.groups[0].memberIds.map(id=>r.initial[id].preference)).size>=3);
 assert.ok(r.groupAlignment[0]>=4);
 assert.ok(r.meetings.some(m=>m.status==='completed'&&m.outcome?.outcome==='consensus'));
 assert.ok(Object.entries(r.final).every(([id,s])=>s.preference===r.initial[id].preference));
 assert.ok(Object.values(r.final).some(s=>s.targetId!==s.preference));
});
test('two sincere blocs negotiate two distinct competing plans rather than isolated wishes',()=>{
 const r=runNegotiatedVote({size:8,structure:'divided',seed:81});
 assert.deepEqual(r.groupAlignment,[3,3]);assert.equal(r.distinctTargets,2);
 assert.notEqual(r.final[r.groups[0].memberIds[0]].targetId,r.final[r.groups[1].memberIds[0]].targetId);
});
test('a tribe without formal starting alliances can build informal vote coordination',()=>{
 const cases=[80,81].map(seed=>runNegotiatedVote({size:8,structure:'no-alliance',seed}));
 for(const r of cases){assert.equal(r.groups.length,0);assert.ok(Object.values(r.final).some(s=>s.targetId!==s.preference));assert.ok(r.distinctTargets<r.votes.length);}
 // Independent bargaining can fracture a formerly convergent seed. This is a
 // capability contract, not a guarantee that every fluid tribe finds a majority.
 assert.ok(cases.some(r=>r.leadingShare>=.5));
});
test('round-specific sincere voting bloc coordinates through production negotiation',()=>{
 const r=runNegotiatedVote({size:7,structure:'voting-bloc',seed:80});assert.ok(r.groupAlignment[0]>=4);
});
test('inner core keeps its own plan context while negotiating within a majority',()=>{
 const r=runNegotiatedVote({size:7,structure:'secret-core',seed:80});assert.equal(r.groups.length,2);
 assert.equal(r.groupAlignment[1],3);assert.ok(r.meetings.filter(m=>m.status==='completed').length>=2);
});
test('production JSON restore preserves negotiated votes at semantic decision boundaries',()=>{
 const a=runNegotiatedVote({size:7,seed:80}),b=runNegotiatedVote({size:7,seed:80,reload:true});
 assert.deepEqual(b.projection,a.projection);assert.deepEqual(b.votes,a.votes);
 for(const label of ['phase-start','first-pitch','first-commitment','meeting','final-five','before-Tribal'])assert.ok(b.milestones.includes(label),label);
});
test('larger merge-sized coalition negotiates without a seven-person majority assumption',()=>{
 const r=runNegotiatedVote({size:10,seed:83});assert.ok(r.groupAlignment[0]>=4);assert.ok(r.distinctTargets>=2);
});
