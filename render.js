// ---------- Draw scene ----------
function drawTank(t){
  const active = G.state==='aim' && G.players[G.turn]===t;
  // slope tilt
  const hl=terrain[clamp(t.x-10,0,W-1)], hr=terrain[clamp(t.x+10,0,W-1)];
  const tilt=Math.atan2(hl-hr,20);
  ctx.save(); ctx.translate(t.x,t.y); ctx.rotate(tilt);
  const camo = mixCol(t.color,'#5d6b3a',0.32);        // militarized team color
  const camoD = mixCol(t.color,'#333c20',0.55);
  // shadow
  ctx.fillStyle='rgba(0,0,0,.28)'; ctx.beginPath(); ctx.ellipse(0,2,20,5,0,0,7); ctx.fill();
  // tracks: dark band with road wheels + end sprockets
  ctx.fillStyle='#23261c'; roundRect(-18,-8.5,36,9.5,4.5); ctx.fill();
  ctx.strokeStyle='#151810'; ctx.lineWidth=1; roundRect(-18,-8.5,36,9.5,4.5); ctx.stroke();
  ctx.fillStyle='#454c33';
  for(let i=-13;i<=13;i+=5.2){ ctx.beginPath(); ctx.arc(i,-3.6,2.5,0,7); ctx.fill(); }
  ctx.fillStyle='#2c3120';
  for(let i=-13;i<=13;i+=5.2){ ctx.beginPath(); ctx.arc(i,-3.6,1.1,0,7); ctx.fill(); }
  // barrel first (behind turret): clean tube + muzzle brake block
  const a=t.angle*Math.PI/180, bx=Math.cos(a), by=-Math.sin(a);
  ctx.strokeStyle=shade(camo,-42); ctx.lineWidth=3.6; ctx.lineCap='butt';
  ctx.beginPath(); ctx.moveTo(bx*5,-21+by*5); ctx.lineTo(bx*27, -21+by*27); ctx.stroke();
  ctx.lineWidth=5.6;
  ctx.beginPath(); ctx.moveTo(bx*23,-21+by*23); ctx.lineTo(bx*27, -21+by*27); ctx.stroke();
  // hull: outlined wedge with subtle camo
  const hg=ctx.createLinearGradient(0,-20,0,-6); hg.addColorStop(0,shade(camo,30)); hg.addColorStop(1,shade(camo,-18));
  ctx.fillStyle=hg;
  ctx.beginPath(); ctx.moveTo(-17,-7); ctx.lineTo(-14,-16); ctx.lineTo(14,-16); ctx.lineTo(17,-7); ctx.closePath(); ctx.fill();
  ctx.save(); ctx.beginPath(); ctx.moveTo(-17,-7); ctx.lineTo(-14,-16); ctx.lineTo(14,-16); ctx.lineTo(17,-7); ctx.closePath(); ctx.clip();
  ctx.globalAlpha=0.5; ctx.fillStyle=camoD;
  ctx.beginPath(); ctx.ellipse(-7,-11,5,2.4,0.5,0,7); ctx.fill();
  ctx.beginPath(); ctx.ellipse(9,-13,4.5,2.2,-0.4,0,7); ctx.fill();
  ctx.globalAlpha=1; ctx.restore();
  ctx.strokeStyle='#20260f'; ctx.lineWidth=1;
  ctx.beginPath(); ctx.moveTo(-17,-7); ctx.lineTo(-14,-16); ctx.lineTo(14,-16); ctx.lineTo(17,-7); ctx.closePath(); ctx.stroke();
  // turret: darker dome + hatch, outlined for a crisp silhouette
  ctx.fillStyle=shade(camo,-8); roundRect(-8,-25,16,9,3.5); ctx.fill();
  ctx.strokeStyle='#20260f'; roundRect(-8,-25,16,9,3.5); ctx.stroke();
  ctx.fillStyle=shade(camo,22); ctx.beginPath(); ctx.arc(2.5,-25,2.6,Math.PI,0); ctx.fill();
  // antenna with team pennant (bright team color = identification)
  ctx.strokeStyle='#2c3318'; ctx.lineWidth=1.1;
  ctx.beginPath(); ctx.moveTo(-6.5,-25); ctx.lineTo(-11,-35.5); ctx.stroke();
  ctx.fillStyle=t.color;
  ctx.beginPath(); ctx.moveTo(-11.6,-36); ctx.lineTo(-3.2,-33.4); ctx.lineTo(-11.6,-30.8); ctx.closePath(); ctx.fill();
  // shield bubble
  if(t.shield>0){ ctx.strokeStyle='rgba(125,211,252,.8)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(0,-12,26,0,7); ctx.stroke();
    ctx.fillStyle='rgba(125,211,252,.10)'; ctx.fill(); }
  if(t.chuteOn){ ctx.fillStyle='#eee'; ctx.beginPath(); ctx.arc(0,-52,18,Math.PI,0); ctx.fill();
    ctx.strokeStyle='#bbb'; ctx.beginPath(); ctx.moveTo(-16,-50);ctx.lineTo(-8,-20); ctx.moveTo(16,-50);ctx.lineTo(8,-20); ctx.stroke(); }
  ctx.restore();
  // name + bars
  ctx.textAlign='center'; ctx.font='bold 13px Segoe UI, sans-serif';
  ctx.fillStyle= active? '#fff':'rgba(255,255,255,.75)';
  ctx.fillText(t.name, t.x, t.y-46);
  const bw=44;
  ctx.fillStyle='rgba(0,0,0,.5)'; ctx.fillRect(t.x-bw/2,t.y-42,bw,5);
  ctx.fillStyle= t.hp>t.maxHp*0.35 ? '#4ade80':'#f87171';
  ctx.fillRect(t.x-bw/2,t.y-42,bw*clamp(t.hp/t.maxHp,0,1),5);
  if(t.shield>0){ ctx.fillStyle='#7dd3fc'; ctx.fillRect(t.x-bw/2,t.y-36,bw*clamp(t.shield/110,0,1),3); }
  if(active){ // pulsing marker
    const pu=6+Math.sin(performance.now()/180)*3;
    ctx.fillStyle=t.color; ctx.beginPath();
    ctx.moveTo(t.x,t.y-58-pu); ctx.lineTo(t.x-7,t.y-68-pu); ctx.lineTo(t.x+7,t.y-68-pu); ctx.closePath(); ctx.fill();
  }
}
function shade(hex,amt){
  const n=parseInt(hex.slice(1),16);
  let r=(n>>16)+amt,g=((n>>8)&255)+amt,b=(n&255)+amt;
  return `rgb(${clamp(r,0,255)},${clamp(g,0,255)},${clamp(b,0,255)})`;
}
function roundRect(x,y,w,h,r){ ctx.beginPath(); ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r); ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); }

function drawAimPreview(p){
  const w=WEAPONS[p.weapon];
  if(w.kind==='airstrike'){
    const tx = clamp(Math.round(W*(p.angle/180)),30,W-30);
    const gy=groundY(tx);
    ctx.strokeStyle='rgba(255,255,255,.85)'; ctx.lineWidth=2; ctx.setLineDash([6,6]);
    ctx.beginPath(); ctx.moveTo(tx,60); ctx.lineTo(tx,gy); ctx.stroke(); ctx.setLineDash([]);
    const pu=2+Math.sin(performance.now()/200)*2;
    ctx.strokeStyle='#ff5d5d'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.arc(tx,gy,14+pu,0,7); ctx.moveTo(tx-22,gy); ctx.lineTo(tx+22,gy); ctx.moveTo(tx,gy-22); ctx.lineTo(tx,gy+22); ctx.stroke();
    ctx.font='11px Segoe UI'; ctx.textAlign='center'; ctx.fillStyle='rgba(255,255,255,.65)';
    ctx.fillText('✈️ move mouse to aim • click (or FIRE) to call the strike', tx, Math.max(20,gy-34));
    return;
  }
  // Gyroscopic Fins: last impact stays marked
  if(hasRelic(p,'gyrofins') && p.lastImpact){
    const li=p.lastImpact;
    ctx.strokeStyle='rgba(227,182,79,.9)'; ctx.lineWidth=2;
    ctx.beginPath(); ctx.moveTo(li.x-8,li.y-8); ctx.lineTo(li.x+8,li.y+8);
    ctx.moveTo(li.x+8,li.y-8); ctx.lineTo(li.x-8,li.y+8); ctx.stroke();
  }
  // dotted trajectory preview (wind included; Windcutter/Second Opinion respected)
  const wf = hasRelic(p,'windcutter')?0.5:1;
  const steps = hasRelic(p,'secondopinion')? 400 : 38;
  const a=p.angle*Math.PI/180, v=powerToV(p.power);
  let x=p.x+Math.cos(a)*26, y=p.y-14-Math.sin(a)*26, vx=Math.cos(a)*v, vy=-Math.sin(a)*v;
  ctx.fillStyle='rgba(255,255,255,.6)';
  for(let i=0;i<steps;i++){
    vx+=G.wind*wf; vy+=GRAV; x+=vx; y+=vy;   // same physics as the live shot — dt only changes speed, not the arc
    if(i%2===0){ ctx.globalAlpha= steps>38? 0.7 : (1-i/46)*0.85; ctx.beginPath(); ctx.arc(x,y,2.6,0,7); ctx.fill(); }
    if(y>=groundY(x) || x<-100 || x>W+100) break;
  }
  ctx.globalAlpha=1;
}
function drawTpAim(){
  const t=G.tpAim, p=G.players[t.pi]; if(!p) return;
  const gy=groundY(t.x), voidCol=gy>H;
  // drop line to projected landing
  ctx.setLineDash([5,6]); ctx.lineWidth=1.6;
  ctx.strokeStyle = voidCol? 'rgba(255,107,107,.9)' : 'rgba(159,232,255,.85)';
  ctx.beginPath(); ctx.moveTo(t.x,t.y); ctx.lineTo(t.x,Math.min(gy,H)); ctx.stroke();
  ctx.setLineDash([]);
  if(!voidCol){ ctx.strokeStyle='rgba(159,232,255,.7)'; ctx.beginPath(); ctx.moveTo(t.x-16,gy); ctx.lineTo(t.x+16,gy); ctx.stroke(); }
  // ghost tank at the warp-in point
  ctx.globalAlpha=0.55;
  ctx.fillStyle= voidCol? '#ff6b6b':'#9fe8ff';
  roundRect(t.x-15,t.y-13,30,11,4); ctx.fill();
  ctx.globalAlpha=1;
  ctx.strokeStyle= voidCol? '#ff9a9a':'#dff6ff'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.arc(t.x,t.y-7,21,0,7); ctx.stroke();
  // impact forecast
  const useChute = p.chutes>0 && p.chuteEnabled;
  const fell = Math.max(0, Math.min(gy,H+600)-t.y);
  const est = (!useChute && fell>FALL_SAFE)? Math.round((fell-FALL_SAFE)*FALL_DMG) : 0;
  const victim = G.players.find(v=>v!==p && v.alive && Math.abs(v.x-t.x)<26);
  const crush = Math.min(est, p.maxHp);   // crush capped at your tank's max HP (its mass)
  let txt;
  if(voidCol) txt='☠ THE ABYSS';
  else if(est>0) txt='~'+est+' impact dmg'+(victim? ' → 💥 ~'+crush+' TO '+victim.name.toUpperCase()+(est>=p.hp?' (KAMIKAZE!)':'!'):'');
  else if(useChute && fell>40) txt='🪂 soft landing';
  else txt='safe landing';
  ctx.font='bold 14px Segoe UI'; ctx.textAlign='center';
  ctx.fillStyle = voidCol? '#ff8f8f' : (est>0&&victim? '#e3b64f':'#dff6ff');
  ctx.fillText('🌀 '+txt, t.x, Math.max(24,t.y-30));
  ctx.font='11px Segoe UI'; ctx.fillStyle='rgba(255,255,255,.6)';
  ctx.fillText('click / Space to warp • Esc cancels', t.x, Math.max(38,t.y-14));
}
function drawOverlay(){
  // wind gauge
  const cx=W/2, cy=44;
  ctx.fillStyle='rgba(13,17,8,.6)'; roundRect(cx-130,cy-24,260,48,8); ctx.fill();
  ctx.strokeStyle='rgba(122,140,72,.5)'; ctx.lineWidth=1; roundRect(cx-130,cy-24,260,48,8); ctx.stroke();
  ctx.fillStyle='#98a37f'; ctx.font='11px Segoe UI'; ctx.textAlign='center';
  ctx.fillText('WIND', cx, cy-9);
  const wp=G.wind/WIND_MAX; // -1..1
  ctx.fillStyle='rgba(255,255,255,.14)'; ctx.fillRect(cx-110,cy+2,220,8);
  ctx.fillStyle= Math.abs(wp)>0.55? '#e06c5a' : '#a9c25d';
  if(wp>=0) ctx.fillRect(cx,cy+2,110*wp,8); else ctx.fillRect(cx+110*wp,cy+2,-110*wp,8);
  ctx.fillStyle='#fff'; ctx.font='bold 13px Segoe UI';
  const mph=Math.round(Math.abs(wp)*100);
  ctx.fillText((wp<0?'◀ ':'')+mph+(wp>0?' ▶':''), cx, cy+24- (wp===0?0:0));
  // round / turn banner
  ctx.textAlign='left'; ctx.font='bold 14px Segoe UI'; ctx.fillStyle='rgba(255,255,255,.85)';
  ctx.fillText(G.sandbox? '🧪 SANDBOX' : `Round ${G.round}/${G.rounds}`, 16, 26);
  const cur=G.players[G.turn];
  if(cur && (G.state==='aim'||G.state==='shot')){
    ctx.fillStyle=cur.color; ctx.fillText(`● ${cur.name}${isBot(cur)?' 🤖':''}`, 16, 48);
  }
  if(G.mode==='online' && G.state==='aim'){
    const s=Math.max(0, Math.ceil((G.turnDeadline-performance.now())/1000));  // wall-clock, never negative
    ctx.textAlign='right'; ctx.fillStyle= s<=10? '#e06c5a':'rgba(255,255,255,.8)';
    ctx.font='bold 16px Segoe UI'; ctx.fillText('⏱ '+s+'s', W-16, 30);
  }
  // scores strip
  ctx.textAlign='right'; ctx.font='12px Segoe UI';
  let yy=54;
  for(const p of G.players){ ctx.fillStyle=p.alive?'rgba(255,255,255,.75)':'rgba(255,255,255,.3)';
    const ric=p.relics.length? p.relics.map(k=>RELICS[k].icon).join('')+' ' : '';
    ctx.fillText(`${ric}${p.name} ${p.alive?p.hp+'❤':'✖'}  ${fmt$(p.cash)}`, W-16, yy+=17); }
}
function drawProjectiles(){
  for(const pr of G.proj){
    const w=WEAPONS[pr.w];
    // trail
    ctx.lineWidth=2; ctx.lineCap='round';
    for(let i=1;i<pr.trail.length;i++){
      ctx.strokeStyle=w.trail; ctx.globalAlpha=i/pr.trail.length*0.6;
      ctx.beginPath(); ctx.moveTo(pr.trail[i-1].x,pr.trail[i-1].y); ctx.lineTo(pr.trail[i].x,pr.trail[i].y); ctx.stroke();
    }
    ctx.globalAlpha=1;
    ctx.save(); ctx.translate(pr.x,pr.y); ctx.rotate(Math.atan2(pr.vy,pr.vx)+Math.PI/2);
    ctx.fillStyle= pr.w==='atom' ? '#c9ff6b' : '#e8e8f0';
    roundRect(-3.4,-8,6.8,14,3); ctx.fill();
    ctx.fillStyle='#ff5d3a'; ctx.beginPath(); ctx.moveTo(-3.4,6); ctx.lineTo(0,12+frand()*4); ctx.lineTo(3.4,6); ctx.fill();
    ctx.restore();
  }
  if(G.plane){ const pl=G.plane;
    ctx.save(); ctx.translate(pl.x,pl.y);
    ctx.fillStyle='#d7dde8'; roundRect(-26,-5,52,10,5); ctx.fill();
    ctx.fillStyle='#aab6c8'; ctx.beginPath(); ctx.moveTo(-4,-2); ctx.lineTo(-16,-14); ctx.lineTo(-8,-2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-2,2); ctx.lineTo(12,10); ctx.lineTo(14,2); ctx.fill();
    ctx.restore();
  }
}
function drawFX(){
  for(const p of particles){ ctx.globalAlpha = p.fade? clamp(1-p.age/p.life,0,1):1;
    ctx.fillStyle=p.col; ctx.beginPath(); ctx.arc(p.x,p.y,p.size,0,7); ctx.fill(); }
  ctx.globalAlpha=1;
  ctx.textAlign='center'; ctx.font='bold 15px Segoe UI';
  for(const f of floaters){ ctx.globalAlpha=clamp(1-f.age/70,0,1); ctx.fillStyle=f.col; ctx.fillText(f.txt,f.x,f.y); }
  ctx.globalAlpha=1;
  if(flashA>0){ ctx.fillStyle=`rgba(255,240,210,${flashA})`; ctx.fillRect(0,0,W,H); }
}

// ---------- Main loop ----------
// Fixed 60Hz timestep with an accumulator: the sim advances at the same rate
// on every monitor (a 144Hz display no longer runs the game 2.4× fast).
let acc=0, lastTs=0;
function frame(ts){
  requestAnimationFrame(frame);
  if(!G || G.state==='idle'){ lastTs=ts; return; }
  if(!lastTs) lastTs=ts;
  acc += Math.min(100, ts-lastTs); lastTs=ts;
  let n=0;
  while(acc>=16.667 && n<4){ stepGame(); acc-=16.667; n++; }
  if(n===4) acc=0;   // slow device: drop backlog rather than spiral
  // render (all drawing in world coords; RES maps them onto the hi-dpi backing store)
  ctx.save();
  ctx.setTransform(RES,0,0,RES,0,0);
  if(shake>0) ctx.translate(frange(-shake,shake),frange(-shake,shake));
  drawTerrain();
  if(G.roundActive) for(const t of G.players) if(t.alive) drawTank(t);
  if(G.roundActive){
    if(G.state==='aim'){ const cur=G.players[G.turn]; if(cur.alive && (isMyTurn()||G.mode==='local')) drawAimPreview(cur); }
    if(G.state==='aim' && G.tpAim) drawTpAim();
    drawProjectiles();
    drawFX();
    drawOverlay();
  }
  ctx.restore();
}
function stepGame(){
  stepFX();
  if(G.state==='shot'){
    stepProjectiles(); stepTanks();
    if(!anyMotion()){
      G.state='aim'; // transient; nextTurn decides
      if(!checkRoundEnd()){
        if(G.repeatTurn){                              // Double Tap: same player goes again
          G.repeatTurn=false;
          G.turnDeadline=performance.now()+TURN_TIME_ONLINE*1000;
          const cur=G.players[G.turn];
          if(cur.alive){
            toast('🔫 Double Tap — '+(cur.name.toLowerCase()==='you'?'fire again!':cur.name+' fires again!'),'#e3b64f');
            updateHUD();
            if(isBot(cur)&&amAuthority()) setTimeout(()=>botTakeTurn(cur),900);
            if(G.mode==='online'&&amAuthority()) NET.syncState();
          } else if(!checkRoundEnd()) nextTurn();
        } else {
          nextTurn();
          if(G.mode==='online'){
            if(amAuthority()) NET.syncState();
            else if(NET.pendingSync){ applySync(NET.pendingSync); NET.pendingSync=null; }
          }
        }
      }
    }
  } else if(G.state==='aim'){
    stepTanks();
    // the current player can die mid-turn (drove off a cliff, ground gave way)
    if(G.state==='aim' && !G.players[G.turn].alive){
      if(!checkRoundEnd()) nextTurn();
      return;
    }
    const cur=G.players[G.turn];
    // held movement
    if(cur && cur.alive && cur.moveDir && (isMyTurn()||(G.mode==='local'&&!isBot(cur)))) tryMove(cur, cur.moveDir);
    if(G.mode==='online' && amAuthority() && performance.now()>G.turnDeadline){
      NET.send({t:'skip'}); applySkip();   // host is the only clock that matters
    }
  }
}
function applySkip(){ toast('Turn skipped (time up)','#f87171'); nextTurn(); }

function tryMove(p,dir){
  if(p.falling) return;
  const goat=hasRelic(p,'mountaingoat');
  const nx=clamp(p.x+dir*MOVE_SPEED, 20, W-20);
  const dh=groundY(nx)-p.y;          // negative = uphill (screen y smaller)
  if(dh<-3.4 && !goat){ return; }    // too steep to climb (unless you're a goat)
  let cost=MOVE_COST*(dh<-1.2?1.6:1);
  if(goat) cost*=0.5;
  if(hasRelic(p,'bunker')) cost*=2;
  if(p.fuel<cost) return;
  p.x=nx; p.fuel-=cost;
  if(dh<=3.5) p.y=groundY(nx);       // follow gentle slopes
  // bigger drop: don't snap — stepTanks takes over with real fall physics
  // (fall damage, parachutes, and the abyss all apply when driving off an edge)
  if(frand()<0.3) particles.push({x:p.x-dir*14,y:p.y,vx:-dir*frange(0.5,1),vy:frange(-1,-0.2),life:frange(12,25),age:0,size:frange(1.5,3),col:'#999',grav:-0.01,fade:true});
  updateHUD();
}
