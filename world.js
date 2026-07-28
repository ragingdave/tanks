// ---------- Terrain ----------
const THEMES = {
  desert:  {skyTop:'#2e1e4f', skyBot:'#ff9a5a', sun:'#ffd98a', ground:['#e8b96a','#b9843f','#7a5326'], deco:'cactus', rough:0.45, hills:90 },
  forest:  {skyTop:'#1d3d55', skyBot:'#9ecbe0', sun:'#fff3c4', ground:['#79a24e','#4f7434','#324a24'], deco:'tree',   rough:0.65, hills:150},
  mountain:{skyTop:'#0b1633', skyBot:'#7f9fd0', sun:'#e8f0ff', ground:['#e9f2fb','#9db2cc','#5a6d8c'], deco:'rock',   rough:1.0,  hills:260},
};
let terrain = new Float32Array(W);    // ground height from bottom
let theme = THEMES.forest, themeName='forest';
let decos = [];                        // {x, type, seed}

function genTerrain(name, seed){
  // Dedicated RNG seeded per round: terrain is a pure function of (map, seed),
  // immune to any drift in the shared sim RNG — every client builds the same map.
  const r = mulberry32((seed>>>0)||1);
  const rr = (a,b)=>a + r()*(b-a);
  themeName = name==='random' ? ['desert','forest','mountain'][Math.floor(r()*3)] : name;
  theme = THEMES[themeName];
  const layers=[], nL=5;
  for(let i=0;i<nL;i++) layers.push({f:rr(0.5,1.5)*(i+1)*1.4/W*Math.PI*2, ph:rr(0,Math.PI*2), amp:theme.hills/(i*1.15+1)});
  const base = rr(0.24,0.34)*H;
  for(let x=0;x<W;x++){
    let h=base;
    for(const L of layers) h += Math.sin(x*L.f+L.ph)*L.amp*theme.rough;
    terrain[x]=clamp(h,60,H*0.72);
  }
  // gentle smoothing
  for(let k=0;k<2;k++){ for(let x=1;x<W-1;x++) terrain[x]=(terrain[x-1]+terrain[x]*2+terrain[x+1])/4; }
  decos=[];
  const n = 10+Math.floor(r()*8);
  for(let i=0;i<n;i++) decos.push({x:Math.floor(rr(20,W-20)), seed:r()});
}
function groundY(x){
  x=clamp(Math.round(x),0,W-1);
  const h=terrain[x];
  return h<=1 ? H+600 : H-h;   // fully-eroded column = open void: nothing to stand on
}

function carveCrater(cx,cy,r){
  const x0=Math.max(0,Math.floor(cx-r)), x1=Math.min(W-1,Math.ceil(cx+r));
  for(let x=x0;x<=x1;x++){
    const dx=x-cx, span=r*r-dx*dx;
    if(span<=0) continue;
    const half=Math.sqrt(span);
    const top=cy-half, bot=cy+half;         // circle vertical extent at this column (screen coords)
    const g=H-terrain[x];                   // ground top (screen y)
    if(bot<=g) continue;                    // circle fully above ground
    const newTop = Math.max(g, top);        // portion below ground removed => raise ground top to 'bot'
    const removed = bot - newTop;
    terrain[x] = Math.max(0, terrain[x] - removed);   // ground can be worn away completely
  }
}
function digTunnel(cx,cy,r,depth){ // digger: narrow deep gouge
  for(let i=0;i<depth;i++) carveCrater(cx, cy+i*r*0.9, r);
}

// ---------- Particles & FX ----------
let particles=[], floaters=[], shake=0, flashA=0;
function addParticles(x,y,n,opts){
  for(let i=0;i<n;i++){
    const a=frange(0,Math.PI*2), sp=frange(opts.sp0||1,opts.sp1||5);
    particles.push({x,y,vx:Math.cos(a)*sp+(opts.vx||0),vy:Math.sin(a)*sp*(opts.up?-Math.abs(Math.sin(a)):1)+(opts.vy||0),
      life:frange(opts.l0||20,opts.l1||50), age:0, size:frange(opts.s0||2,opts.s1||5), col:opts.cols[Math.floor(frand()*opts.cols.length)], grav:opts.grav??0.12, fade:opts.fade??true});
  }
}
function explodeFX(x,y,r){
  shake=Math.min(26, shake + r*0.18);
  flashA=Math.min(0.5, r/220);
  addParticles(x,y,Math.min(70,r*1.1),{cols:['#fff6c0','#ffd28a','#ff9a4a','#ff5d3a'],sp0:1.5,sp1:r*0.14,l0:18,l1:42,s0:2,s1:6,grav:0.05});
  addParticles(x,y,Math.min(40,r*0.7),{cols:['#5a5a66','#3d3d46','#2b2b31'],sp0:0.5,sp1:r*0.08,l0:40,l1:90,s0:3,s1:9,grav:-0.01});
  addParticles(x,y,Math.min(26,r*0.5),{cols:[theme.ground[1],theme.ground[2]],sp0:2,sp1:r*0.16,l0:25,l1:60,s0:2,s1:5,grav:0.3});
}
function floater(x,y,txt,col){ floaters.push({x,y,txt,col,age:0}); }

function stepFX(){
  for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.age++; p.x+=p.vx; p.y+=p.vy; p.vy+=p.grav; p.vx*=0.99;
    if(p.age>p.life || p.y>H+40) particles.splice(i,1); }
  for(let i=floaters.length-1;i>=0;i--){ const f=floaters[i]; f.age++; f.y-=0.7; if(f.age>70) floaters.splice(i,1); }
  shake*=0.88; if(shake<0.3)shake=0;
  flashA*=0.86; if(flashA<0.01)flashA=0;
}

// ---------- Rendering ----------
const canvas=document.getElementById('game'), ctx=canvas.getContext('2d');
let RES=1;   // render scale: canvas backing store = world size × RES (display size × devicePixelRatio, capped)
let skyCache=null;
function buildSky(){
  skyCache=document.createElement('canvas');
  skyCache.width=Math.max(1,Math.round(W*RES)); skyCache.height=Math.max(1,Math.round(H*RES));
  const c=skyCache.getContext('2d');
  c.scale(RES,RES);
  const g=c.createLinearGradient(0,0,0,H); g.addColorStop(0,theme.skyTop); g.addColorStop(1,theme.skyBot);
  c.fillStyle=g; c.fillRect(0,0,W,H);
  // stars for darker skies
  if(themeName!=='forest'){ c.fillStyle='rgba(255,255,255,.7)';
    for(let i=0;i<90;i++){ const x=frand()*W,y=frand()*H*0.5; c.globalAlpha=frand()*0.7+0.1; c.fillRect(x,y,2,2);} c.globalAlpha=1; }
  // sun / moon
  const sx=W*0.78, sy=H*0.18;
  const rg=c.createRadialGradient(sx,sy,10,sx,sy,180); rg.addColorStop(0,theme.sun); rg.addColorStop(0.25,theme.sun+'cc'); rg.addColorStop(1,'transparent');
  c.fillStyle=rg; c.fillRect(sx-190,sy-190,380,380);
  c.fillStyle=theme.sun; c.beginPath(); c.arc(sx,sy,38,0,7); c.fill();
  // far hills silhouette
  c.fillStyle='rgba(10,16,38,0.25)';
  c.beginPath(); c.moveTo(0,H);
  for(let x=0;x<=W;x+=8){ c.lineTo(x, H*0.62 + Math.sin(x*0.004+2)*60 + Math.sin(x*0.011)*30); }
  c.lineTo(W,H); c.fill();
  genClouds();
}

// ---------- Animated clouds ----------
let clouds=[];
function genClouds(){
  clouds=[];
  const n=5+Math.floor(frand()*3);
  for(let i=0;i<n;i++){
    const scale=frange(0.6,1.45), np=4+Math.floor(frand()*3);
    const puffs=[]; let px=0;
    for(let p=0;p<np;p++){
      const mid=1-Math.abs(p-(np-1)/2)/((np-1)/2||1);       // bigger puffs in the middle
      puffs.push({dx:px, dy:(-frange(2,8)-20*mid)*scale, r:frange(34,46)*scale*(0.72+0.55*mid)});
      px+=frange(20,28)*scale;
    }
    // one wide soft belly filling the base
    puffs.push({dx:px/2, dy:-6*scale, r:(px/2+30)*scale*0.85, belly:true});
    clouds.push({x:frand()*(W+500)-250, y:frange(36,H*0.36), w:px,
      par:scale*frange(0.75,1.15),                 // parallax: big/near clouds ride the wind faster
      phase:frange(0,6.28), alpha:frange(0.55,0.8), puffs});
  }
}
let lastCloudMs=0;
function drawClouds(){
  const now=performance.now(), night=themeName!=='forest';
  // Smokescreen: the viewer's sky goes dead still — no wind tell from the clouds
  const frozen = (typeof fogged==='function') && fogged();
  const dt = frozen? 0 : (lastCloudMs? Math.min(3,(now-lastCloudMs)/16.67) : 1);
  lastCloudMs=now;
  // clouds ride the wind: direction and speed track the current turn's wind
  const wind = G && G.state!=='idle' ? G.wind : WIND_MAX*0.33;
  for(const c of clouds){
    c.x += (wind*30 + 0.015*Math.sign(wind||1)) * c.par * dt;
    const span=W+500+c.w;
    if(c.x > W+250) c.x -= span;
    if(c.x < -250-c.w) c.x += span;
    const x=c.x;
    const y=c.y + (frozen? Math.sin(c.phase)*5 : Math.sin(now/1000*0.22+c.phase)*5);
    ctx.globalAlpha=c.alpha;
    for(const p of c.puffs){
      const cy2=y+p.dy, sq=p.belly?0.55:0.9;   // belly puff is squashed wide
      ctx.save(); ctx.translate(x+p.dx,cy2); ctx.scale(1,sq);
      const g=ctx.createRadialGradient(0,-p.r*0.2,p.r*0.1, 0,0,p.r);  // local coords: survives the transform
      if(night){ g.addColorStop(0,'rgba(230,236,246,0.8)'); g.addColorStop(0.6,'rgba(198,208,226,0.35)'); g.addColorStop(1,'rgba(198,208,226,0)'); }
      else     { g.addColorStop(0,'rgba(255,255,255,0.92)'); g.addColorStop(0.6,'rgba(248,250,255,0.4)'); g.addColorStop(1,'rgba(248,250,255,0)'); }
      ctx.fillStyle=g;
      ctx.beginPath(); ctx.arc(0,0,p.r,0,7); ctx.fill(); ctx.restore();
    }
    ctx.globalAlpha=1;
  }
}
function drawDeco(x){
  const gy=groundY(x);
  ctx.save(); ctx.translate(x,gy);
  if(theme.deco==='cactus'){ ctx.fillStyle='#2f7a3d'; ctx.fillRect(-4,-34,8,34); ctx.fillRect(-14,-26,10,6); ctx.fillRect(-14,-26,5,12); ctx.fillRect(6,-20,9,6); ctx.fillRect(10,-20,5,10); }
  else if(theme.deco==='tree'){ ctx.fillStyle='#5b3d22'; ctx.fillRect(-3,-22,6,22); ctx.fillStyle='#2e6b34'; ctx.beginPath(); ctx.arc(0,-30,16,0,7); ctx.arc(-10,-22,11,0,7); ctx.arc(10,-22,11,0,7); ctx.fill(); }
  else { ctx.fillStyle='#8fa3bd'; ctx.beginPath(); ctx.moveTo(-16,0); ctx.lineTo(-4,-18); ctx.lineTo(6,-8); ctx.lineTo(16,0); ctx.closePath(); ctx.fill(); }
  ctx.restore();
}
function drawTerrain(){
  ctx.drawImage(skyCache,0,0,W,H);
  drawClouds();
  const [top,mid,deep]=theme.ground;
  ctx.beginPath(); ctx.moveTo(0,H);
  for(let x=0;x<W;x++) ctx.lineTo(x,H-terrain[x]);
  ctx.lineTo(W,H); ctx.closePath();
  const g=ctx.createLinearGradient(0,H*0.3,0,H); g.addColorStop(0,top); g.addColorStop(0.45,mid); g.addColorStop(1,deep);
  ctx.fillStyle=g; ctx.fill();
  // grass/snow lip
  ctx.strokeStyle=top; ctx.lineWidth=5; ctx.beginPath();
  for(let x=0;x<W;x+=2){ const y=H-terrain[x]; if(x===0)ctx.moveTo(x,y); else ctx.lineTo(x,y); }
  ctx.stroke();
  for(const d of decos) drawDeco(d.x);
}
