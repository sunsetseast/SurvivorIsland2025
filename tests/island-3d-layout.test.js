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

function pointInPolygon([x,z],poly){
 let inside=false;
 for(let i=0,j=poly.length-1;i<poly.length;j=i++){
  const [xi,zi]=poly[i],[xj,zj]=poly[j];
  if((zi>z)!==(zj>z)&&x<(xj-xi)*(z-zi)/(zj-zi)+xi)inside=!inside;
 }
 return inside;
}
test('every proposed landmark and path segment stays on the island',()=>{
 for(const [key,n] of Object.entries(ISLAND_NODES))
  assert.ok(pointInPolygon([n.x,n.z],ISLAND_OUTLINE),key+' is offshore');
 for(const [a,b] of ISLAND_EDGES){
  const p=ISLAND_NODES[a],q=ISLAND_NODES[b];
  for(let i=0;i<=100;i++){
   const t=i/100;
   assert.ok(pointInPolygon([p.x+(q.x-p.x)*t,p.z+(q.z-p.z)*t],ISLAND_OUTLINE),a+' to '+b+' crosses ocean');
  }
 }
});
test('each directly navigable view arrow has a matching world route',()=>{
 const expected=[
 ['beach','rockyShore'],['beach','tribeFlag'],['tribeFlag','campfire'],
 ['campfire','shelter'],['shelter','fork1'],['fork1','mountainTrail'],
 ['fork1','jungleTrail'],['fork2','jungleTrail'],['fork2','mountainTrail'],
 ['fork2','shelter'],['fork3','shelter'],['fork3','jungleTrail'],
 ['fork3','mountainTrail'],['mountainTrail','treeMail'],
 ['treeMail','waterfallTrail'],['waterfallTrail','waterWell'],
 ['waterWell','jungleTrail']
 ];
 const edgeSet=new Set(ISLAND_EDGES.map(([a,b])=>[a,b].sort().join(':')));
 for(const [a,b] of expected)assert.ok(edgeSet.has([a,b].sort().join(':')),a+' → '+b+' missing');
});
