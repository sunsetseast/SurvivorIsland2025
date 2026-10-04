// Rendered QA only. Real locations/CampScreen, renderer, activities, clock and
// social systems; fixture activity choices replace the nondeterministic setup.
const { gameManager: gm } = await import('../src/modules/core/GameManager.js');
const { default: data } = await import('../src/modules/data/GameData.js');
const { default: CampScreen } = await import('../src/modules/screens/CampScreen.js');
const { default: renderer } = await import('../src/modules/ui/NpcAutoRenderer.js');
const { default: memoryTemplate } = await import('../src/modules/systems/SocialMemorySystem.js');
const { default: positions } = await import('../src/modules/systems/NpcLocationSystem.js');
const { default: RelationshipSystem } = await import('../src/modules/systems/RelationshipSystem.js');
const { default: TrustSystem } = await import('../src/modules/systems/TrustSystem.js');
const { default: ConversationSystem } = await import('../src/modules/systems/ConversationSystem.js');
const { default: CampActivitySystem } = await import('../src/modules/systems/CampActivitySystem.js');
const { updateCampClockUI } = await import('../src/modules/utils/ClockUtils.js');
const { isCampPhysicallyPresent } = await import('../src/modules/locations/CampPresence.js');
const { normalizeCampState } = await import('../src/modules/systems/CampState.js');
const cast = structuredClone(data.getSurvivors());
const player = { ...cast[1], id: 1001, isPlayer: true, firstName: 'You', location: 'beach' };
const members = [...['Parvati','Jeremy','Tony','Sandra','Wendell','Kelley'].map(name=>cast.find(s=>s.firstName===name)),player];
for (const person of members) Object.assign(person,{isOut:false,isPlayer:person===player,tribeId:1,tribeName:'QA',tribeColor:'red',campActivity:null,location:'beach'});
const tribe = normalizeCampState({id:1,tribeId:1,name:'QA',tribeColor:'red',color:'red',members,fire:1,shelter:2,
  stockpile:{firewood:25,bamboo:20,palms:5,water:30,coconuts:10},day1Plan:{assignments:{fire:[],shelter:[],wood:[],resources:[],float:[]}}});
Object.assign(gm,{day:2,dayTimer:7200,gameState:'camp',gamePhase:'preChallenge',flags:{day1FirstImpressionsCompleted:true},player,
  survivors:members,tribes:[tribe],campLog:[],campSocialChanges:{},campNeedElapsed:{water:0,hunger:0,rest:0},seasonEngine:null});
gm.saveGame=()=>true;gm.requestAutoSave=()=>{};gm._updateScreenForState=()=>{};
gm.systems.socialMemorySystem=new memoryTemplate.constructor();
gm.systems.npcLocationSystem=positions;
gm.systems.relationshipSystem=new RelationshipSystem(gm);gm.systems.trustSystem=new TrustSystem(gm);
gm.systems.conversationSystem=new ConversationSystem(gm);
gm.systems.campActivitySystem=new CampActivitySystem(gm,()=>.5);
gm.initializeWaterPlanForTribe(tribe);
const screen=new CampScreen();screen.isActive=true;
window.gameManager=gm;window.campScreen=screen;
renderer.initialize();
screen.ensureClockUI(); // Render the production HUD without starting wall-clock pacing.
const activity=gm.systems.campActivitySystem;activity.phaseId=activity.phase;
window.campQa={gm,screen,renderer,tribe,members,activity,
  present(person,place) {return isCampPhysicallyPresent(person,positions,place,gm);},
  movement(view='waterWell',paired=false) {
    gm.dayTimer=7200;gm.campNeedElapsed={water:0,hunger:0,rest:0};gm.campLog=[];
    gm.systems.socialMemorySystem=new memoryTemplate.constructor();
    this.scene(view,3,'mixed');
    const npcs=gm.getPlayerTribe().members.filter(p=>!p.isPlayer),actor=npcs.find(p=>p.firstName==='Tony'),companion=npcs[5];
    const from={beach:'tribeFlag',waterWell:'jungleTrail',jungleTrail:'fork1',campfire:'tribeFlag',shelter:'campfire',rockyShore:'beach'}[view];
    activity.start(actor,{type:'rest',location:from,duration:3000});
    if(paired) activity.start(companion,{type:'rest',location:from,duration:3000});
    renderer.resetNarration();
    const step=activity.start(actor,{type:'travel',location:view,travelWithId:paired?companion.id:null,
      goal:{type:paired?'strategy_conversation':'rest',targetId:paired?companion.id:null,location:view,duration:1000}});
    return {actorId:actor.id,companionId:paired?companion.id:null,activityId:step.id};
  },
  scene(view='beach',count=6,mode='mixed') {
    updateCampClockUI(gm.dayTimer,gm.day);
    renderer.closeSheet(false); gm.flags.campEventActive=false;
    for (const p of gm.getPlayerTribe().members) p.campActivity=null;
    activity.phaseId=activity.phase;activity.conversation=null;
    const types={beach:'gather_food',campfire:'tend_fire',shelter:'build_shelter',jungleTrail:'gather_firewood',rockyShore:'fish',waterWell:'collect_water'};
    const npcs=gm.getPlayerTribe().members.filter(p=>!p.isPlayer);
    npcs.forEach((p,i)=>activity.start(p,{type:i===0?types[view]||'rest':'rest',location:i<count?view:'mountainTrail',duration:3000}));
    if(count>=2 && mode!=='workers') {
      activity.start(npcs[1],{type:'rest',location:view,duration:3000});
      activity.start(npcs[0],{type:mode==='casual'?'socialize':'strategy_conversation',location:view,targetId:npcs[1].id,duration:3000});
    }
    if(count>=3) activity.start(npcs[2],{type:types[view]||'observe',location:view,duration:3000});
    if(view==='campfire' && mode==='casual' && count>=4) activity.start(npcs[3],{type:types[view],location:view,duration:3000});
    if(mode==='search') activity.start(npcs[0],{type:'idol_hunt',location:view,duration:3000});
    if(mode==='follower') activity.start(npcs[2],{type:'investigate',location:view,targetId:npcs[0].id,duration:3000});
    screen.currentView=view;window.previousCampView=view;screen.loadView(view,{travelPaid:true});
    renderer.resetNarration();
    return renderer.npcLayer?.querySelectorAll('.camp-portrait').length;
  },
  travel() { const people=gm.getPlayerTribe().members.filter(p=>!p.isPlayer);return activity.moveTogether(people[0],people[1],'tribeFlag'); },
  advance(seconds=60) {gm.consumeCampTime(seconds,{source:'clock'});},
  natural(seed=47) {
    renderer.closeSheet(false);gm.systems.conversationSystem.closeConversation('qa_reset');
    gm.dayTimer=7200;gm.campNeedElapsed={water:0,hunger:0,rest:0};gm.campLog=[];
    gm.systems.socialMemorySystem=new memoryTemplate.constructor();
    const currentTribe=gm.getPlayerTribe();currentTribe.fire=1;currentTribe.shelter=1;currentTribe.stockpile={firewood:25,bamboo:20,palms:5,water:30,coconuts:10};
    gm.systems.relationshipSystem=new RelationshipSystem(gm);gm.systems.trustSystem=new TrustSystem(gm);
    for(const p of gm.getPlayerTribe().members) {
      p.campActivity=null;p.water=75;p.hunger=75;p.rest=75;
      p.location='beach';if(!p.isPlayer) positions.updateNpcLocation(p.id,'beach');
    }
    let state=seed;activity.random=()=>((state=(Math.imul(state,1664525)+1013904223)>>>0)/4294967296);
    renderer.interactions.random=activity.random;
    activity.phaseId=null;screen.loadView('beach',{travelPaid:true});activity.ensureStarted();renderer.refresh();renderer.resetNarration();
  },
  restore() {const payload=JSON.parse(JSON.stringify(gm.createSavePayload()));gm.restoreSavePayload(payload);screen.loadView(screen.currentView,{travelPaid:true});}
};
window.campQa.scene();window.campQaReady=true;
