'use strict';
/* ============================================================
   TANKS! — Modern Artillery
   Single-file remake of the 2004 Flash classic.
   Modes: vs Bots, Local Hotseat, Online P2P (PeerJS).
   ============================================================ */

// ---------- Constants ----------
const W = 1600, H = 900;              // world size (canvas logical px)
const GRAV = 0.22;                    // gravity px/step^2
const WIND_MAX = 0.055;               // max wind accel px/step^2
const SHOT_DT = 0.55;                 // projectile time-dilation: same arc, slower & more dramatic
const MAX_PLAYERS = 6;
const COLORS = ['#d95c4a','#5fa8d3','#7fb069','#d9a441','#a084c9','#c97fa4'];
const TEAMNAMES = ['Red','Blue','Green','Amber','Violet','Pink'];
const BASE_HP = 100, BASE_FUEL = 100, MOVE_COST = 1.1, MOVE_SPEED = 1.15;
const FALL_SAFE = 110, FALL_DMG = 0.35;   // fall px before damage, dmg per px
const TURN_TIME_ONLINE = 60;              // seconds

// ---------- Seeded RNG (deterministic sim) ----------
function mulberry32(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;}}
let simRng = mulberry32(1);           // game-affecting randomness (seeded per match)
const fxRng = mulberry32((Math.random()*1e9)|0); // visual-only randomness
function srand(){return simRng();}
function srange(a,b){return a + srand()*(b-a);}
function frand(){return fxRng();}
function frange(a,b){return a + frand()*(b-a);}
const clamp=(v,a,b)=>v<a?a:(v>b?b:v);
const lerp=(a,b,t)=>a+(b-a)*t;
function mixCol(h1,h2,t){ // blend two #rrggbb colors, returns #rrggbb
  const a=parseInt(h1.slice(1),16), b=parseInt(h2.slice(1),16);
  const r=Math.round(lerp(a>>16,b>>16,t)), g=Math.round(lerp((a>>8)&255,(b>>8)&255,t)), bl=Math.round(lerp(a&255,b&255,t));
  return '#'+((1<<24)|(r<<16)|(g<<8)|bl).toString(16).slice(1);
}
const fmt$=n=>'$'+Math.round(n).toLocaleString('en-US');

// ---------- Audio (WebAudio synth, no assets) ----------
const AudioFX = (()=> {
  let ctx=null;
  function ac(){ if(!ctx){ try{ctx=new (window.AudioContext||window.webkitAudioContext)();}catch(e){} } if(ctx&&ctx.state==='suspended')ctx.resume(); return ctx; }
  function env(g,t0,a,d,v){ g.gain.setValueAtTime(0.0001,t0); g.gain.linearRampToValueAtTime(v,t0+a); g.gain.exponentialRampToValueAtTime(0.0001,t0+a+d); }
  function noiseBuf(c){ const b=c.createBuffer(1,c.sampleRate*1.2,c.sampleRate), d=b.getChannelData(0); for(let i=0;i<d.length;i++)d[i]=Math.random()*2-1; return b; }
  let nb=null;
  return {
    click(){ const c=ac(); if(!c)return; const o=c.createOscillator(),g=c.createGain(); o.type='square'; o.frequency.value=660; env(g,c.currentTime,0.001,0.05,0.06); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime+0.08); },
    fire(){ const c=ac(); if(!c)return; const t=c.currentTime; const o=c.createOscillator(),g=c.createGain(); o.type='sawtooth'; o.frequency.setValueAtTime(210,t); o.frequency.exponentialRampToValueAtTime(60,t+0.25); env(g,t,0.004,0.25,0.24); o.connect(g).connect(c.destination); o.start(t); o.stop(t+0.3);
      nb=nb||noiseBuf(c); const s=c.createBufferSource(); s.buffer=nb; const f=c.createBiquadFilter(); f.type='highpass'; f.frequency.value=900; const g2=c.createGain(); env(g2,t,0.002,0.12,0.15); s.connect(f).connect(g2).connect(c.destination); s.start(t); s.stop(t+0.15); },
    boom(size=1){ const c=ac(); if(!c)return; const t=c.currentTime; nb=nb||noiseBuf(c);
      const s=c.createBufferSource(); s.buffer=nb; const f=c.createBiquadFilter(); f.type='lowpass'; f.frequency.setValueAtTime(900*size,t); f.frequency.exponentialRampToValueAtTime(60,t+0.7);
      const g=c.createGain(); env(g,t,0.005,0.55+0.25*size,0.5*Math.min(1.4,size)); s.connect(f).connect(g).connect(c.destination); s.start(t); s.stop(t+1);
      const o=c.createOscillator(),g2=c.createGain(); o.type='sine'; o.frequency.setValueAtTime(120*size,t); o.frequency.exponentialRampToValueAtTime(30,t+0.5); env(g2,t,0.005,0.5,0.4*Math.min(1.3,size)); o.connect(g2).connect(c.destination); o.start(t); o.stop(t+0.6); },
    beep(){ const c=ac(); if(!c)return; const o=c.createOscillator(),g=c.createGain(); o.type='sine'; o.frequency.value=880; env(g,c.currentTime,0.001,0.18,0.12); o.connect(g).connect(c.destination); o.start(); o.stop(c.currentTime+0.2); },
    unlock(){ ac(); }
  };
})();

// ---------- Weapons & shop catalog ----------
// kind: 'shot' normal ballistic, 'cluster' splits at apex, 'volcano' erupts on impact,
//        'digger' tunnels, 'airstrike' plane drops bombs at target x
const WEAPONS = {
  missile : {name:'Missile',        icon:'🚀', kind:'shot',    r:30,  dmg:25, price:0,     ammo:Infinity, trail:'#ffd28a'},
  bigshot : {name:'Big Missile',    icon:'💥', kind:'shot',    r:48,  dmg:42, price:2000,  ammo:6,  trail:'#ffab6b'},
  shower  : {name:'Shower',         icon:'🎇', kind:'cluster', r:20,  dmg:12, price:3500,  ammo:4,  frags:6,  trail:'#9be7ff'},
  volcano : {name:'Volcano Bomb',   icon:'🌋', kind:'volcano', r:24,  dmg:15, price:6000,  ammo:3,  frags:9,  trail:'#ff8f6b'},
  digger  : {name:'Digger',         icon:'⛏️', kind:'digger',  r:20,  dmg:32, price:2500,  ammo:4,  depth:9,  trail:'#d3c9a5'},
  atom    : {name:'Atom Bomb',      icon:'☢️', kind:'shot',    r:115, dmg:78, price:11000, ammo:1,  trail:'#c9ff6b'},
  strike  : {name:'Air Strike',     icon:'✈️', kind:'airstrike',r:34, dmg:22, price:20000, ammo:1,  bombs:5,  trail:'#ffffff'},
};
const GEAR = {
  parachute:{name:'Parachutes ×3', icon:'🪂', price:5000,  desc:'Auto-deploys, prevents fall damage (toggle in HUD)', give:p=>p.chutes+=3},
  teleport :{name:'Teleporters ×2',icon:'🌀', price:6000,  desc:'Warp anywhere you aim — even mid-air for a drop attack', give:p=>p.teleports+=2},
  repair   :{name:'Repair Kits ×2',icon:'🔧', price:3500,  desc:'+35 HP field repair — use on your turn',   give:p=>p.repairs+=2},
  fuel     :{name:'Fuel Tank +100',icon:'⛽', price:1800,  desc:'More moves this & future rounds',    give:p=>p.fuelBonus+=100},
  shield1  :{name:'Shield',        icon:'🛡️', price:5000,  desc:'+50 shield at round start',          give:p=>p.shieldBuy=Math.max(p.shieldBuy,50)},
  shield2  :{name:'Heavy Shield',  icon:'🔰', price:12000, desc:'+110 shield at round start',         give:p=>p.shieldBuy=Math.max(p.shieldBuy,110)},
  energy   :{name:'Energy Cells',  icon:'🔋', price:8000,  desc:'+25 max health (permanent)',         give:p=>p.maxHp+=25},
  armor    :{name:'Composite Armor',icon:'🧱',price:9000,  desc:'−12% damage taken (stacks ×3)',      give:p=>p.armor=Math.min(3,p.armor+1)},
};
const WKEYS = Object.keys(WEAPONS), GKEYS = Object.keys(GEAR);

// ---------- Relics (drafted between rounds, last the whole match) ----------
const RELICS = {
  // ballistics & aim
  windcutter:   {icon:'🌬️', name:'Windcutter',        desc:'Your shells ignore half the wind'},
  gyrofins:     {icon:'🎯', name:'Gyroscopic Fins',    desc:'Your last impact point stays marked while you aim'},
  doubletap:    {icon:'🔫', name:'Double Tap',         desc:'Once per round, a basic Missile shot doesn\'t end your turn'},
  heavybarrel:  {icon:'🛢️', name:'Heavy Barrel',       desc:'+15% blast radius, but max power capped at 90'},
  sabot:        {icon:'🗡️', name:'Sabot Rounds',       desc:'Direct hits (touching the tank) deal +50% damage'},
  // terrain & movement
  sapper:       {icon:'🪓', name:"Sapper's Charm",     desc:'Your craters are 30% wider; your own blasts never give you fall damage'},
  mountaingoat: {icon:'🐐', name:'Mountain Goat',      desc:'Climb any slope; moving costs half fuel'},
  entrencher:   {icon:'⛏️', name:'Entrencher',         desc:'New DIG IN action: skip your shot for +25 shield and a defensive berm'},
  grapple:      {icon:'🪝', name:'Grappling Hook',     desc:'The first damaging fall each round is arrested harmlessly'},
  landslide:    {icon:'🧗', name:'Landslide Insurance',desc:'First abyss fall each round: cling to the edge instead (15 dmg)'},
  // falls & drops
  anvil:        {icon:'🧲', name:'Anvil Plating',      desc:'Your drop-attack crush cap rises to 1.5× max HP'},
  featherweight:{icon:'🪶', name:'Featherweight',      desc:'You always take half fall damage'},
  seismic:      {icon:'💢', name:'Seismic Landing',    desc:'Hard landings crack a crater under you'},
  reinforced:   {icon:'🦔', name:'Reinforced Chassis', desc:'Tanks that crush you take the same damage back'},
  // economy
  profiteer:    {icon:'🤑', name:'War Profiteer',      desc:'Earn $25 per point of damage instead of $15'},
  scrapmagnet:  {icon:'🧹', name:'Scrap Magnet',       desc:'Salvage cash whenever terrain is destroyed near you'},
  quartermaster:{icon:'📦', name:'Quartermaster',      desc:'Armory packs contain +50% ammo for you'},
  lifeinsurance:{icon:'📜', name:'Life Insurance',     desc:'If you die, start the next round with +$8,000'},
  // items & gadgets
  twinwarp:     {icon:'🌀', name:'Twin Warp Core',     desc:'The first teleport each round is free'},
  fieldhospital:{icon:'🏥', name:'Field Hospital',     desc:'Repair kits heal to FULL — but using one ends your turn'},
  beacon:       {icon:'🚨', name:'Emergency Beacon',   desc:'First time below 25% HP each round: free warp to safety'},
  staticcharge: {icon:'⚡', name:'Static Charge',      desc:'After teleporting, your next shot deals +20 damage'},
  // defense
  ablative:     {icon:'🔄', name:'Ablative Coating',   desc:'Your shield regenerates 10 every turn'},
  bunker:       {icon:'🏰', name:'Bunker Mentality',   desc:'+40% shields, but moving costs double fuel'},
  laststand:    {icon:'🩸', name:'Last Stand',         desc:'Once per round, a killing blow leaves you at 1 HP'},
  deflector:    {icon:'✨', name:'Deflector Spike',    desc:'15% chance incoming shells skip off you and keep flying'},
  // cursed
  fogofwar:     {icon:'🌫️', name:'Smokescreen',        desc:'+25% damage, but you fly blind: no wind gauge, and the clouds go still for you'},
  cursedordnance:{icon:'☠️',name:'Cursed Ordnance',    desc:'+40% damage, but your craters are twice as deep'},
  glasscannon:  {icon:'🍷', name:'Glass Cannon',       desc:'+60% damage dealt, +30% damage taken'},
  gamblersfuse: {icon:'🎲', name:"Gambler's Fuse",     desc:'10% of your shots become a random weapon from the whole arsenal'},
  deadmans:     {icon:'💣', name:"Dead Man's Switch",  desc:'On death, you detonate like an atom bomb'},
};
const RELIC_KEYS = Object.keys(RELICS);
const hasRelic = (p,k)=> !!(p && p.relics && p.relics.includes(k));

// ---------- Starting loadouts (chosen at match setup) ----------
const LOADOUTS = {
  standard:{apply:p=>{ p.ammo.bigshot+=3; p.ammo.shower+=4; p.ammo.digger+=3; p.shieldBuy=Math.max(p.shieldBuy,50); }},
  heavy:   {apply:p=>{ p.ammo.bigshot+=5; p.ammo.volcano+=3; p.ammo.digger+=4; p.ammo.atom+=1;
                       p.teleports+=1; p.repairs+=1; p.chutes+=1; p.shieldBuy=Math.max(p.shieldBuy,110); }},
};
