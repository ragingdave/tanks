// ---------- AI ----------
// Simulate a shot cheaply; returns closest approach distance to target & impact x
function simShot(sx,sy,angle,power,wind,target){
  const a=angle*Math.PI/180, v=powerToV(power);
  let x=sx+Math.cos(a)*26, y=sy-14-Math.sin(a)*26, vx=Math.cos(a)*v, vy=-Math.sin(a)*v;
  let best=1e9, ix=x;
  for(let i=0;i<900;i++){
    vx+=wind; vy+=GRAV; x+=vx; y+=vy;
    const dx=x-target.x, dy=y-(target.y-12), d=Math.sqrt(dx*dx+dy*dy);
    if(d<best) best=d;
    if(x<-100||x>W+100||y>H+50) { ix=x; break; }
    if(y>=groundY(x)){ ix=x;
      const gdx=x-target.x, gdy=groundY(x)-(target.y-12), gd=Math.sqrt(gdx*gdx+gdy*gdy);
      if(gd<best) best=gd;
      break;
    }
  }
  return {best, ix};
}
function botPickTarget(p){
  const foes=alivePlayers().filter(t=>t!==p);
  if(!foes.length) return null;
  if(p.type==='bot-easy') return foes[Math.floor(frand()*foes.length)];
  // prefer weakest, then nearest
  return foes.sort((a,b)=>(a.hp+a.shield)-(b.hp+b.shield) || Math.abs(a.x-p.x)-Math.abs(b.x-p.x))[0];
}
function botSearchAim(p,target,samples,refine){
  let best={score:1e9,angle:45,power:60};
  const tryOne=(ang,pow)=>{
    ang=clamp(ang,5,175); pow=clamp(pow,15,100);
    const r=simShot(p.x,p.y,ang,pow,G.wind,target);
    if(r.best<best.score) best={score:r.best,angle:ang,power:pow};
  };
  // coarse grid biased toward the target side
  const towards = target.x>p.x;
  for(let i=0;i<samples;i++){
    const ang = towards? frange(15,85) : frange(95,165);
    const pow = frange(25,100);
    tryOne(ang,pow);
  }
  // also try lobbing over hills (high angles)
  for(let i=0;i<samples/3;i++){
    const ang = towards? frange(55,88):frange(92,125);
    tryOne(ang,frange(50,100));
  }
  if(refine){
    for(let k=0;k<refine;k++){
      const spread = 8/(k+1);
      for(let i=0;i<24;i++) tryOne(best.angle+frange(-spread,spread), best.power+frange(-spread,spread));
    }
  }
  return best;
}
function botChooseWeapon(p,target,aimScore){
  const have=k=>p.ammo[k]===Infinity||p.ammo[k]>0;
  if(p.type==='bot-easy') return 'missile';
  const foesAlive=alivePlayers().length-1;
  if(p.type==='bot-hard'){
    if(have('strike') && aimScore>60) return 'strike';        // bad angle? use airstrike
    if(have('atom') && (target.hp+target.shield>70 || foesAlive>2) && aimScore<40) return 'atom';
    if(have('bigshot') && aimScore<50) return 'bigshot';
    if(have('volcano') && aimScore<45) return 'volcano';
    if(have('shower')) return 'shower';
    return 'missile';
  }
  // medium
  if(have('atom') && target.hp+target.shield>80 && aimScore<45) return 'atom';
  if(have('bigshot') && aimScore<60) return 'bigshot';
  if(have('shower') && aimScore<70) return 'shower';
  return 'missile';
}
function botTakeTurn(p){
  if(!G || G.state!=='aim' || G.players[G.turn]!==p || !p.alive) return;
  // field repair when hurt
  if(p.repairs>0 && p.hp < p.maxHp*0.5){
    if(G.mode==='online') NET.send({t:'item',pi:p.id,kind:'rp'});
    applyItem(p.id,'rp');
  }
  const target=botPickTarget(p);
  if(!target){ return; }
  let aim, noiseA, noiseP;
  if(p.type==='bot-easy'){ aim=botSearchAim(p,target,50,0);  noiseA=7; noiseP=9; }
  else if(p.type==='bot-medium'){ aim=botSearchAim(p,target,180,2); noiseA=1.8; noiseP=2.2; }
  else { aim=botSearchAim(p,target,340,3); noiseA=0.5; noiseP=0.6; }
  let angle=clamp(aim.angle+frange(-noiseA,noiseA),1,179);
  let power=clamp(aim.power+frange(-noiseP,noiseP),10,100);
  let weapon=botChooseWeapon(p,target,aim.score);
  if(weapon==='strike'){ angle = clamp(target.x/W*180 + frange(-2,2), 2, 178); }
  // animate the aim so it feels alive
  const startA=p.angle, startP=p.power, steps=36; let s=0;
  const anim=setInterval(()=>{
    s++;
    p.angle=lerp(startA,angle,s/steps); p.power=lerp(startP,power,s/steps);
    if(G.mode==='online') { if(s%6===0) NET.send({t:'aim',pi:p.id,a:p.angle,pw:p.power,x:Math.round(p.x),fuel:Math.round(p.fuel)}); }
    updateHUD();
    if(s>=steps){
      clearInterval(anim);
      setTimeout(()=>{
        if(!G || G.state!=='aim' || G.players[G.turn]!==p) return;
        if(G.mode==='online') NET.send({t:'fire',pi:p.id,w:weapon,a:angle,pw:power,x:Math.round(p.x)});
        doFire(p.id,weapon,angle,power);
      }, 350+frand()*400);
    }
  }, 26);
}
