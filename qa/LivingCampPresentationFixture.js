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
const { normalizeCampState } = await import('../src/modules/systems/CampState.js');
const cast = structuredClone(data.getSurvivors());
const player = { ...cast[1], id: 1001, isPlayer: true, firstName: 'You', location: 'beach' };
const members = [cast[3],cast[5],cast[8],cast[10],cast[13],cast[14],player];
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
const activity=gm.systems.campActivitySystem;activity.phaseId=activity.phase;
window.campQa={gm,screen,renderer,tribe,members,activity,
  scene(view='beach',count=6,mode='mixed') {
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
    screen.currentView=view;window.previousCampView=view;screen.loadView(view,{travelPaid:true});
    return renderer.npcLayer?.querySelectorAll('.camp-portrait').length;
  },
  travel() { const people=gm.getPlayerTribe().members.filter(p=>!p.isPlayer);return activity.moveTogether(people[0],people[1],'tribeFlag'); },
  advance(seconds=60) {gm.consumeCampTime(seconds,{source:'clock'});},
  restore() {const payload=JSON.parse(JSON.stringify(gm.createSavePayload()));gm.restoreSavePayload(payload);screen.loadView(screen.currentView,{travelPaid:true});}
};
window.campQa.scene();window.campQaReady=true;
