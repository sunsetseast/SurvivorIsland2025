import test from 'node:test';
import assert from 'node:assert/strict';
import {ISLAND_NODES,ISLAND_EDGES,ISLAND_OUTLINE} from '../experiments/island-3d/layout.js';
test('all routes refer to known locations and are not self-links',()=>{
 for(const [a,b] of ISLAND_EDGES){assert.ok(ISLAND_NODES[a],a);assert.ok(ISLAND_NODES[b],b);assert.notEqual(a,b)}
});
test('all landmark coordinates are finite and lie in the island bounding box',()=>{
 for(const [key,n] of Object.entries(ISLAND_NODES)){
  assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.z),key);
  assert.ok(n.x>=-61&&n.x<=56&&n.z>=-69&&n.z<=70,key);
 }
 assert.ok(ISLAND_OUTLINE.length>=12);
});
test('all core camp destinations connect to one graph',()=>{
 const adj=new Map(Object.keys(ISLAND_NODES).map(k=>[k,[]]));
 for(const [a,b] of ISLAND_EDGES){adj.get(a).push(b);adj.get(b).push(a)}
 const seen=new Set(['beach']),queue=['beach'];
 while(queue.length){for(const n of adj.get(queue.shift()))if(!seen.has(n)){seen.add(n);queue.push(n)}}
 assert.deepEqual([...seen].sort(),Object.keys(ISLAND_NODES).sort());
});
test('map anchor geography is preserved in proposed coordinates',()=>{
 const n=ISLAND_NODES;
 assert.ok(n.rockyShore.z<n.beach.z);
 assert.ok(n.waterWell.x<n.jungleTrail.x);
 assert.ok(n.treeMail.x>n.shelter.x&&n.treeMail.z>n.shelter.z);
 assert.ok(n.beach.x<n.shelter.x);
});
