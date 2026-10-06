import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn,execFileSync} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';

const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function sourceFingerprint() {
 const files=[];
 const walk=p=>{for(const item of fs.readdirSync(p,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){const f=path.join(p,item.name);if(item.isDirectory())walk(f);else files.push(f);}};
 for(const p of ['src','qa','test'])walk(p);
 files.push('package.json','package-lock.json','index.html','styles.css','docs/strategy-refinement/qa/natural-results.json');
 const digest=createHash('sha256');for(const f of files.sort()){digest.update(f+'\0');digest.update(fs.readFileSync(f));digest.update('\0');}
 return {implementationCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runnableSha256:digest.digest('hex'),files:files.length};
}

async function runCase(job) {
 const {runNaturalStrategy,runSplitOpportunity}=await import('./StrategicBehaviorHarness.mjs');
 const {runNegotiatedVote}=await import('./VoteConvergenceHarness.mjs');
 const {runViableCounterplay}=await import('./CounterplayHarness.mjs');
 const run=reload=>job.kind==='natural'?runNaturalStrategy(job.family,{seed:job.seed,reload}):
   job.kind==='active'?runNaturalStrategy('player-bottom',{seed:job.seed,castSize:6,activePlayer:true,reload}):
   job.kind==='controlled'?runNegotiatedVote({...job,reload}):
   job.kind==='split'?runSplitOpportunity({seed:job.seed,reload}):runViableCounterplay({...job,reload});
 const a=run(false),b=run(true);
 assert.deepEqual(b.projection,a.projection,JSON.stringify(job)+' semantic restore');
 assert.equal(b.rngState,a.rngState,JSON.stringify(job)+' RNG restore');
 const {projection,...detail}=a;
 return {...detail,saveLoadEquivalent:true,stateHash:hash(projection),restore:{case:job,matched:true,
   uninterruptedHash:hash(projection),restoredHash:hash(b.projection),rngState:a.rngState,restoredRngState:b.rngState,milestones:b.milestones||[]}};
}

export async function certify({seedsPerFamily=4,workers=4,outputDir=process.env.CONVERGENCE_OUTPUT_DIR||'/tmp/convergence-certification'}={}) {
 const {NATURAL_FAMILIES}=await import('./StrategicBehaviorHarness.mjs');
 const {concentration,baselineConcentration}=await import('./VoteConvergenceHarness.mjs');
 const metadata={baseline:'3c8cafad03bc3af89eaa25d54856c1b34dc9c8ad',...sourceFingerprint(),
   generatedAt:new Date().toISOString(),method:'Production Node/local verification; no GitHub Actions claim. Paired uninterrupted/production JSON restore. NPC-only ballots.'};
 const jobs=[];let sequence=0;
 for(const family of NATURAL_FAMILIES)for(let i=0;i<seedsPerFamily;i++)jobs.push({kind:'natural',family,seed:401+sequence++});
 for(const size of [5,6,7,8,10])for(const structure of ['majority','divided','no-alliance','secret-core'])jobs.push({kind:'controlled',size,structure,seed:73+size});
 for(let i=0;i<32;i++)jobs.push({kind:'active',seed:401+i});
 for(const npcBottom of [false,true])for(let i=0;i<16;i++)jobs.push({kind:'counterplay',seed:73+i,npcBottom});
 jobs.push({kind:'split',seed:73});
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'convergence-cases-')),results=new Array(jobs.length);
 let next=0,complete=0;
 const worker=async()=>{while(next<jobs.length){const index=next++,job=jobs[index],file=path.join(temp,index+'.json');
   await new Promise((resolve,reject)=>{const child=spawn(process.execPath,[fileURLToPath(import.meta.url),'--case',JSON.stringify(job),file],{stdio:['ignore','pipe','pipe']});let error='';
     child.stdout.on('data',d=>{error+=d;});child.stderr.on('data',d=>{error+=d;});
     child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(JSON.stringify(job)+'\n'+error.slice(-12000))));});
   results[index]=JSON.parse(fs.readFileSync(file,'utf8'));console.log(JSON.stringify({completed:++complete,total:jobs.length,...job,restore:true}));
 }};
 try{await Promise.all(Array.from({length:Math.max(1,Math.min(4,workers))},worker));}finally{fs.rmSync(temp,{recursive:true,force:true});}
 assert.equal(sourceFingerprint().runnableSha256,metadata.runnableSha256,'No code/test/harness changes during certification');
 const byKind=kind=>results.filter((r,i)=>jobs[i].kind===kind),natural=byKind('natural'),controlled=byKind('controlled'),active=byKind('active'),counterplay=byKind('counterplay'),split=byKind('split');
 const baseline=JSON.parse(fs.readFileSync('docs/strategy-refinement/qa/natural-results.json','utf8')),before=baselineConcentration(baseline),after=concentration(natural);
 const smells=[];
 for(const r of natural)for(const round of r.rounds){const c=round.convergence,entry={family:r.family,seed:r.seed,round:round.round};
   if(r.family==='strong-majority'&&c.distinctTargets>=4&&!c.splitAssigned)smells.push({...entry,type:'strong-majority-fragmentation',lateFlips:round.metrics.lateFlips||0});
   if(c.leadingShare>.95)smells.push({...entry,type:'near-unanimity-review'});
   if(c.distinctTargets>=4&&c.distinctTargets>=Math.ceil(c.ballots*.7))smells.push({...entry,type:'excessive-fragmentation'});
   if((round.metrics.intentionChanges||0)>c.ballots*3)smells.push({...entry,type:'flip-chaos-review'});
 }
 for(const r of controlled)if(r.structure==='no-alliance'&&r.distinctTargets>=r.votes.length-1)smells.push({size:r.size,seed:r.seed,structure:r.structure,type:'excessive-fragmentation'});
 const majority=controlled.find(r=>r.size===7&&r.structure==='majority'),divided=controlled.find(r=>r.size===8&&r.structure==='divided'),none=controlled.find(r=>r.size===8&&r.structure==='no-alliance');
 assert.ok(majority.groupAlignment[0]>=4,'sincere majority structurally coordinates');
 assert.ok(divided.groupAlignment.every(n=>n>=2)&&divided.distinctTargets<=3,'credible opposing blocs form clusters');
 assert.ok(none.distinctTargets<none.votes.length&&Object.values(none.final).some(s=>s.targetId!==s.preference),'informal social compromise exists');
 assert.ok(counterplay.some(r=>!r.npcBottom&&r.swingMoved),'viable player counterplan moves a real NPC');
 assert.ok(counterplay.some(r=>r.npcBottom&&r.swingMoved),'NPC counterplan can move a real swing');
 const activeAnalysis={runs:active.length,actions:active.reduce((n,r)=>n+r.playerActions.length,0),survivals:active.filter(r=>!r.metrics.playerEliminated).length,
   immediateShifts:active.flatMap(r=>r.playerActions).filter(a=>a.realIntentChanged).length,
   counterAttempts:active.flatMap(r=>r.playerActions.filter(a=>a.action.startsWith('counter:')).map(a=>({seed:r.seed,listenerId:a.listenerId,targetId:a.targetId,playerSupport:a.before.speakerOwnedSupport?.support||0,listenerIntent:a.before.intendedVoteId,listenerCommitment:a.before.commitment,trust:a.before.trust,flexibility:a.before.flexibility,affinity:a.before.allianceAffinity,viability:a.before.viability,adoption:a.adoption.map(x=>({score:x.score,outcome:x.outcome,reason:x.reason})),gainedCredibleVote:a.gainedCredibleVote,realIntentChanged:a.realIntentChanged}))),
   outcomes:active.flatMap(r=>r.playerActions).flatMap(a=>a.adoption).reduce((a,r)=>{const k=r.reason+':'+r.outcome;a[k]=(a[k]||0)+1;return a;},{})};
 const counterSummary=Object.fromEntries([false,true].map(npc=>{const cases=counterplay.filter(r=>r.npcBottom===npc);return[npc?'npc':'player',{runs:cases.length,swingMoved:cases.filter(r=>r.swingMoved).length}];}));
 const summary={metadata,setup:{natural:'Same #352 cast rotation/seeds, configured starting alliances and initial majority circumstances, four-round policy; player immunity in four families; merge in round three when surviving.',
   controlled:'Configured social structure and mixed weak personal wishes; no injected final plan, commitment, split or ballot. Real movement/meetings/conversations and actual Tribal.',
   active:'Seven players; player secretly excluded from a five-person majority, insiders start weak preferences, not injected final promises. Four-action physical policy chooses a nearby listener and a heard/fallback alternate.',
   counterplay:'Seven players; configured danger, trusted ally and uncertain swing. Player verification/share/pitch/pledge use actual checkpoint RNG/time. NPC variant begins with owned ally openness and an actual player pledge, then autonomous physical camp planning. Capability, not escape-rate balance.',
   split:'Favorable configured high trust, idol evidence, existing primary support and enough numbers. No actual split/backup/motive injected.'},
   runs:natural.length,tribals:natural.reduce((n,r)=>n+r.rounds.length,0),controlled:controlled.length,before,after,smells,
   smellCounts:smells.reduce((a,r)=>{a[r.type]=(a[r.type]||0)+1;return a;},{}),activeAnalysis,counterSummary,
   restore:{cases:results.length,matched:results.length},split:split.map(r=>({metrics:r.metrics,assignments:r.splits.map(p=>p.assignments),opposition:r.opposition}))};
 fs.mkdirSync(outputDir,{recursive:true});
 const write=(file,data)=>fs.writeFileSync(path.join(outputDir,file),JSON.stringify({metadata,...data})+'\n');
 write('natural-results.json',{setup:summary.setup.natural,results:natural});write('controlled-results.json',{setup:summary.setup.controlled,results:controlled});
 write('active-player-results.json',{setup:summary.setup.active,analysis:activeAnalysis,results:active});write('counterplay-results.json',{setup:summary.setup.counterplay,summary:counterSummary,results:counterplay});
 write('split-backup-results.json',{setup:summary.setup.split,results:split});write('restore-results.json',{results:results.map(r=>r.restore)});
 fs.writeFileSync(path.join(outputDir,'summary.json'),JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({complete:true,outputDir,metadata,runs:summary.runs,tribals:summary.tribals,restore:summary.restore,counterSummary,smells:summary.smellCounts}));
 return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.argv[2]==='--case')fs.writeFileSync(process.argv[4],JSON.stringify(await runCase(JSON.parse(process.argv[3]))));
 else await certify({seedsPerFamily:Number(process.env.CONVERGENCE_SEEDS||4)});
}
