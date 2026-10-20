// Experimental coordinate proposal, NOT surveyed geography. +X east, +Z south.
// The visual map has no compass; "north" is the top of the supplied illustration.
export const ISLAND_NODES = Object.freeze({
  rockyShore:{x:-43,z:-49,label:'Rocky Shore',source:'illustration'},
  beach:{x:-47,z:-27,label:'Beach',source:'illustration'},
  tribeFlag:{x:-24,z:-25,label:'Tribe Flag',source:'navigation inference'},
  campfire:{x:-9,z:-31,label:'Campfire',source:'illustration'},
  shelter:{x:12,z:-44,label:'Shelter',source:'illustration'},
  fork1:{x:12,z:-12,label:'Fork 1',source:'navigation inference'},
  fork2:{x:25,z:2,label:'Fork 2',source:'navigation inference'},
  fork3:{x:9,z:15,label:'Fork 3',source:'navigation inference'},
  mountainTrail:{x:35,z:28,label:'Mountain Trail',source:'unmapped route proposal'},
  treeMail:{x:40,z:52,label:'Tree Mail',source:'illustration'},
  waterfallTrail:{x:17,z:42,label:'Waterfall Trail',source:'unmapped route proposal'},
  waterWell:{x:-34,z:8,label:'Water Well',source:'illustration'},
  jungleTrail:{x:-6,z:26,label:'Jungle Trail',source:'illustration zone'}
});
export const ISLAND_EDGES=Object.freeze([
 ['rockyShore','beach'],['beach','tribeFlag'],['tribeFlag','campfire'],['campfire','shelter'],
 ['shelter','fork1'],['shelter','fork2'],['shelter','fork3'],
 ['fork1','mountainTrail'],['fork2','mountainTrail'],['fork3','mountainTrail'],
 ['fork1','jungleTrail'],['fork2','jungleTrail'],['fork3','jungleTrail'],
 ['mountainTrail','treeMail'],['treeMail','waterfallTrail'],['waterfallTrail','waterWell'],['waterWell','jungleTrail']
]);
export const ISLAND_OUTLINE=Object.freeze([
 [-55,-60],[-36,-69],[-10,-64],[18,-63],[37,-47],[49,-21],[54,7],[56,37],[52,58],[33,67],[0,70],[-27,60],[-47,38],[-56,13],[-61,-14],[-60,-42]
]);
