// ---------- Players ----------
function makePlayer(cfg,i){
  return {
    id:i, name:cfg.name||TEAMNAMES[i], color:COLORS[i%COLORS.length],
    type:cfg.type||'human',            // 'human' | 'bot-easy' | 'bot-medium' | 'bot-hard'
    peerId:cfg.peerId||null,           // owner connection (online)
    x:0, y:0, angle: i%2? 135:45, power:60,
    hp:BASE_HP, maxHp:BASE_HP, shield:0, shieldBuy:0,
    fuel:BASE_FUEL, fuelBonus:0, chutes:1, chuteEnabled:true, armor:0, teleports:0, repairs:0,
    cash:0, score:0, kills:0, dmgDealt:0,
    ammo:{missile:Infinity, bigshot:0, shower:0, volcano:0, digger:0, atom:0, strike:0},
    weapon:'missile', alive:true, falling:false, fallStart:0, chuteOn:false,
    relics:[], rs:{}, lastImpact:null,
  };
}
let G = null;   // match state

function newMatch(cfgPlayers, opts){
  simRng = mulberry32(opts.seed);
  G = {
    mode:opts.mode,                 // 'local' | 'online'
    players:cfgPlayers.map(makePlayer),
    round:1, rounds:opts.rounds||3,
    map:opts.map||'random',
    turn:-1, wind:0, state:'idle',  // idle|aim|shot|falling|roundend|shop|over
    proj:[], pendingBombs:[], turnDeadline:0, shotBy:-1,
    seed:opts.seed, roundActive:false, pendingFirstRound:true, tpAim:null,
    sandbox:!!opts.sandbox, repeatTurn:false,
    set:{ dmgMul:+(opts.dmgMul||1), shieldMul:(opts.shieldMul==null?1:+opts.shieldMul),
          loadout:opts.loadout||'shop', draft:opts.draft||'pick' },
  };
  for(const p of G.players) p.cash = opts.cash||0;
  if(LOADOUTS[G.set.loadout]) for(const p of G.players) LOADOUTS[G.set.loadout].apply(p);
  if(G.sandbox) for(const p of G.players){   // sandbox: the whole arsenal, effectively unlimited
    for(const k of WKEYS) if(k!=='missile') p.ammo[k]=99;
    p.teleports=99; p.repairs=99; p.chutes=99; p.cash=999999;
  }
  $('btnExitSandbox').classList.toggle('hidden', !G.sandbox);
  if(G.set.loadout==='shop') openShopPhase();   // pre-match armory: spend starting cash before round 1
  else { G.pendingFirstRound=false; startRound(); }
}
function startRound(){
  // Everything round-defining comes from a per-round RNG derived only from
  // (match seed, round number) — identical on every client, no drift possible.
  const rr = mulberry32(((G.seed>>>0) + G.round*1000003)>>>0);
  const rrange=(a,b)=>a+rr()*(b-a);
  genTerrain(G.map, Math.floor(rr()*1e9));
  buildSky();
  G.windRng = mulberry32(((G.seed>>>0) ^ (G.round*7919))>>>0);
  G.wind = (G.windRng()*2-1)*WIND_MAX*0.6;
  G.roundActive = true;
  const ps=G.players, n=ps.length;
  // spawn spread across map, deterministic
  const order=[...ps].sort((a,b)=>a.id-b.id);
  const margin=110, span=(W-2*margin)/(n-1||1);
  order.forEach((p,i)=>{
    p.x = Math.round(margin + span*i + rrange(-40,40));
    p.y = groundY(p.x);
    if(p.rs && p.rs.insure){ p.cash+=8000; }          // Life Insurance payout
    p.rs = {};                                        // per-round relic state resets
    p.lastImpact=null;
    p.hp = p.maxHp;
    let sh = Math.round(p.shieldBuy*G.set.shieldMul);
    if(hasRelic(p,'bunker')) sh=Math.round(sh*1.4);
    p.shield = sh; p.shieldBuy=0;
    p.fuel = BASE_FUEL + p.fuelBonus;
    p.alive = true; p.falling=false; p.chuteOn=false;
    p.angle = p.x > W/2 ? 135 : 45; p.power=60;
  });
  G.proj=[]; G.pendingBombs=[];
  G.turn = (G.round-1) % n - 1;   // rotate first player each round
  particles=[]; floaters=[];
  nextTurn();
}
function alivePlayers(){ return G.players.filter(p=>p.alive); }

function nextTurn(){
  if(checkRoundEnd()) return;
  if(!alivePlayers().length){ setTimeout(()=>{ if(G&&G.state!=='over') nextTurn(); },900); return; }  // sandbox: everyone respawning
  let n=G.players.length, t=G.turn;
  do{ t=(t+1)%n; }while(!G.players[t].alive);
  G.turn=t;
  const p=G.players[t];
  // wind is a random walk: intensity drifts gradually and can swing through
  // zero to flip direction, but never jumps from strong-left to strong-right
  G.wind = clamp(G.wind + (G.windRng()*2-1)*WIND_MAX*0.38, -WIND_MAX, WIND_MAX);
  G.state='aim';
  G.tpAim=null; G.repeatTurn=false;
  G.turnDeadline = performance.now() + TURN_TIME_ONLINE*1000;
  // Ablative Coating: shields knit themselves back together each turn
  for(const q of G.players) if(q.alive && hasRelic(q,'ablative'))
    q.shield = Math.min(150, q.shield + (hasRelic(q,'bunker')?14:10));
  p.moveDir=0;
  updateHUD();
  toast(p.name.toLowerCase()==='you' ? 'Your turn' : `${p.name}'s turn`, p.color);
  if(isBot(p) && amAuthority()) setTimeout(()=>botTakeTurn(p), 900);
}
function isBot(p){ return p.type.startsWith('bot'); }
function isMyTurn(){
  if(!G || G.state!=='aim') return false;
  const p=G.players[G.turn];
  if(isBot(p)) return false;
  if(G.mode==='online') return p.peerId===NET.myId;
  return true; // local/hotseat: whoever holds the keyboard
}
function amAuthority(){ return G.mode!=='online' || NET.isHost; }

// ---------- Firing & projectiles ----------
function doFire(pi, weaponKey, angle, power, fromNet){
  const p=G.players[pi]; if(!p.alive) return;
  if(hasRelic(p,'heavybarrel')) power=Math.min(power,90);
  p.angle=angle; p.power=power; p.weapon=weaponKey;
  if(p.ammo[weaponKey]!==Infinity){
    if(p.ammo[weaponKey]>0) p.ammo[weaponKey]--;
    else if(!fromNet) return;   // net fire is authoritative: never drop a remote shot over local ammo drift
  }
  // Gambler's Fuse: the shell that leaves the barrel might not be the one you loaded
  let launchKey=weaponKey;
  if(hasRelic(p,'gamblersfuse') && srand()<0.10){
    launchKey=WKEYS[Math.floor(srand()*WKEYS.length)];
    floater(p.x,p.y-56,'🎲 '+WEAPONS[launchKey].icon+' '+WEAPONS[launchKey].name+'!','#e3b64f');
  }
  const w=WEAPONS[launchKey];
  G.state='shot'; G.shotBy=pi;
  // Double Tap: a basic missile shot keeps the turn (once per round)
  if(weaponKey==='missile' && launchKey==='missile' && hasRelic(p,'doubletap') && p.rs && !p.rs.doubletap){
    p.rs.doubletap=true; G.repeatTurn=true;
  }
  const charged = !!(p.rs && p.rs.staticReady);
  if(p.rs) p.rs.staticReady=false;
  AudioFX.fire();
  if(w.kind==='airstrike'){
    // target x derived from angle sweep: angle 0..180 maps to x across map
    const tx = clamp(Math.round(W * (angle/180)), 30, W-30);
    launchAirstrike(tx, w);
    return;
  }
  const a=angle*Math.PI/180, v=powerToV(power);
  const bx=p.x+Math.cos(a)*26, by=p.y-14-Math.sin(a)*26;
  G.proj.push({x:bx,y:by,vx:Math.cos(a)*v,vy:-Math.sin(a)*v,w:launchKey,trail:[],owner:pi,age:0,charged});
  addParticles(bx,by,10,{cols:['#fff','#ffd28a'],sp0:0.5,sp1:2.5,l0:8,l1:20,s0:1,s1:3,grav:0});
  shake=Math.max(shake,3);
}
function powerToV(pow){ return 4.5 + pow*0.21; }
function launchAirstrike(tx,w){
  G.plane={x:-80, y:110, tx, dropped:0, bombs:w.bombs, w};
}
function spawnFrags(x,y,w,n,owner,spread,upv){
  for(let i=0;i<n;i++){
    const a=Math.PI/2 + srange(-spread,spread);
    const v=srange(upv*0.55,upv);
    G.proj.push({x,y:y-4,vx:Math.cos(a)*v*srange(-1,1)*0.9,vy:-Math.abs(Math.sin(a))*v,w:w,trail:[],owner,frag:true,age:0});
  }
}

function stepProjectiles(){
  const sub=3; // substeps for tunneling accuracy; SHOT_DT slows flight without changing the arc
  for(let s=0;s<sub;s++){
    for(let i=G.proj.length-1;i>=0;i--){
      const pr=G.proj[i], w=WEAPONS[pr.w];
      const wf = hasRelic(G.players[pr.owner],'windcutter') ? 0.5 : 1;   // Windcutter: half wind
      pr.vx += (G.wind)*wf*SHOT_DT/sub; pr.vy += GRAV*SHOT_DT/sub;
      pr.x += pr.vx*SHOT_DT/sub; pr.y += pr.vy*SHOT_DT/sub;
      if(s===0){ pr.age++; pr.trail.push({x:pr.x,y:pr.y}); if(pr.trail.length>26)pr.trail.shift();
        if(frand()<0.5) particles.push({x:pr.x,y:pr.y,vx:frange(-0.3,0.3),vy:frange(-0.2,0.4),life:frange(10,22),age:0,size:frange(1,2.6),col:w.trail,grav:-0.005,fade:true}); }
      // cluster splits at apex
      if(w.kind==='cluster' && !pr.frag && pr.vy>0 && !pr.split){
        pr.split=true; G.proj.splice(i,1);
        spawnFrags(pr.x,pr.y,pr.w,w.frags,pr.owner,0.9,7);
        addParticles(pr.x,pr.y,14,{cols:['#9be7ff','#fff'],sp0:1,sp1:3,l0:10,l1:24,s0:1,s1:3,grav:0.02});
        continue;
      }
      if(pr.x<-160||pr.x>W+160||pr.y>H+60){ G.proj.splice(i,1); continue; }
      // hit tank?
      let hitTank=null;
      for(const t of G.players){ if(!t.alive || pr.noHit===t.id) continue;
        const dx=pr.x-t.x, dy=pr.y-(t.y-12);
        if(dx*dx+dy*dy < 20*20){ hitTank=t; break; } }
      // Deflector Spike: shells can skip off and keep flying (sim RNG — same result on all clients)
      if(hitTank && hasRelic(hitTank,'deflector') && srand()<0.15){
        pr.noHit=hitTank.id;
        pr.vy=-Math.abs(pr.vy)*0.6; pr.vx*=1.1;
        floater(hitTank.x,hitTank.y-48,'✨ deflected!','#9fe8ff');
        AudioFX.click();
        hitTank=null;
      }
      if(hitTank || pr.y >= groundY(pr.x)){
        G.proj.splice(i,1);
        impact(pr, w, hitTank);
      }
    }
  }
  // airstrike plane
  if(G.plane){
    const pl=G.plane; pl.x += 9*SHOT_DT;
    if(frand()<0.6) particles.push({x:pl.x-30,y:pl.y+2,vx:-1,vy:frange(-0.1,0.1),life:20,age:0,size:2,col:'#ffffff',grav:0,fade:true});
    if(pl.dropped<pl.bombs && pl.x > pl.tx - (pl.bombs-1)*32/2 + pl.dropped*32 - 40){
      pl.dropped++;
      G.proj.push({x:pl.x,y:pl.y+10,vx:2.2,vy:1,w:'strike',trail:[],owner:G.shotBy,frag:true,age:0});
    }
    if(pl.x>W+120) G.plane=null;
  }
}
function impact(pr,w,hitTank){
  const gx=pr.x, gy=hitTank? hitTank.y-10 : groundY(pr.x);
  const ow=G.players[pr.owner];
  if(ow) ow.lastImpact={x:Math.round(gx),y:Math.round(Math.min(gy,H))};   // Gyroscopic Fins marker
  let dmg=w.dmg;
  if(hitTank && hasRelic(ow,'sabot')) dmg=Math.round(dmg*1.5);            // Sabot: direct hits hurt
  if(w.kind==='volcano' && !pr.frag){
    explodeAt(gx,gy,w.r*0.9,dmg*0.6,pr.owner,false,pr.charged);
    spawnFrags(gx,gy-6,pr.w,w.frags,pr.owner,0.75,8.5);
    return;
  }
  if(w.kind==='digger'){
    digTunnel(gx,gy,w.r,w.depth);
    explodeAt(gx,gy+w.r*w.depth*0.45,w.r*1.6,dmg,pr.owner,true,pr.charged);
    explodeFX(gx,gy,w.r*1.5); AudioFX.boom(0.8);
    return;
  }
  explodeAt(gx,gy,w.r,dmg,pr.owner,false,pr.charged);
}
function explodeAt(x,y,r,dmg,owner,skipCarve,charged){
  const sh = (owner!=null && G.players[owner]) ? G.players[owner] : null;
  let R=r, D=dmg;
  if(sh){
    if(hasRelic(sh,'heavybarrel'))    R=Math.round(R*1.15);
    if(hasRelic(sh,'cursedordnance')) D*=1.4;
    if(hasRelic(sh,'glasscannon'))    D*=1.6;
    if(charged){ D+=20; }                              // Static Charge
  }
  if(!skipCarve){
    let cr=R;
    if(sh && hasRelic(sh,'sapper')) cr=Math.round(cr*1.3);
    carveCrater(x,y,cr);
    if(sh && hasRelic(sh,'cursedordnance')) carveCrater(x,y+cr*0.7,Math.round(cr*0.75));
    // Scrap Magnet: salvage payouts for nearby holders
    for(const t of G.players) if(t.alive && hasRelic(t,'scrapmagnet')){
      const dd=Math.hypot(t.x-x,(t.y-12)-y);
      if(dd<230){ const gain=Math.round(cr*6); t.cash+=gain; floater(t.x,t.y-30,'+$'+gain,'#e3b64f'); }
    }
  }
  explodeFX(x,y,R);
  AudioFX.boom(clamp(R/60,0.5,1.6));
  for(const t of G.players){
    if(!t.alive) continue;
    const dx=t.x-x, dy=(t.y-12)-y, d=Math.sqrt(dx*dx+dy*dy);
    if(d < R+16){
      let amt = D * G.set.dmgMul * clamp(1 - d/(R+16), 0.35, 1);
      amt *= (1 - 0.12*t.armor);
      amt = Math.round(amt);
      applyDamage(t, amt, sh);
    }
  }
}
function applyDamage(t,amt,shooter){
  if(amt<=0||!t.alive) return;
  if(hasRelic(t,'glasscannon')) amt=Math.round(amt*1.3);   // fragile side of the trade
  let rem=amt;
  if(t.shield>0){ const absorbed=Math.min(t.shield,rem); t.shield-=absorbed; rem-=absorbed;
    if(absorbed>0) floater(t.x,t.y-46,'-'+absorbed+'🛡','#7dd3fc'); }
  if(rem>0){ t.hp-=rem; floater(t.x,t.y-30,'-'+rem, '#ff7b7b'); }
  if(shooter && shooter!==t){ shooter.dmgDealt+=amt; shooter.cash+=amt*(hasRelic(shooter,'profiteer')?25:15); }
  if(t.hp<=0){
    if(hasRelic(t,'laststand') && t.rs && !t.rs.laststand){   // cling to life, once per round
      t.rs.laststand=true; t.hp=1;
      floater(t.x,t.y-56,'🩸 LAST STAND!','#e06c5a'); shake=Math.max(shake,8);
    } else { t.hp=0; killTank(t,shooter); return; }
  }
  // Emergency Beacon: first drop below 25% each round warps you out (deterministic spot)
  if(t.alive && t.hp>0 && t.hp<t.maxHp*0.25 && hasRelic(t,'beacon') && t.rs && !t.rs.beacon){
    t.rs.beacon=true;
    addParticles(t.x,t.y-12,20,{cols:['#9fe8ff','#fff'],sp0:1,sp1:4,l0:14,l1:30,s0:1.5,s1:3.5,grav:-0.03});
    const nx=deterministicSpot(t);
    t.x=nx; t.y=groundY(nx); t.falling=false; t.vy=0;
    floater(t.x,t.y-44,'🚨 emergency warp!','#9fe8ff');
  }
}
function deterministicSpot(t){   // identical result on every client — no RNG-stream involvement
  const rng=mulberry32(((G.seed>>>0) ^ (G.round*2654435761) ^ ((t.id+1)*40503) ^ (Math.round(t.hp)*7))>>>0);
  for(let i=0;i<40;i++){
    const cand=Math.round(60+rng()*(W-120));
    if(groundY(cand)<H-20 && G.players.every(o=>!o.alive||o===t||Math.abs(o.x-cand)>70)) return cand;
  }
  return t.x;
}
function killTank(t,shooter){
  t.alive=false;
  explodeFX(t.x,t.y-10,60); AudioFX.boom(1.3);
  addParticles(t.x,t.y-10,30,{cols:[t.color,'#333','#666'],sp0:2,sp1:8,l0:30,l1:80,s0:2,s1:6,grav:0.2});
  floater(t.x,t.y-60,'💀 '+t.name+' destroyed!','#fff');
  if(shooter&&shooter!==t){ shooter.kills++; shooter.cash+=2000; }
  if(hasRelic(t,'lifeinsurance') && t.rs) t.rs.insure=true;
  if(hasRelic(t,'deadmans') && t.rs && !t.rs.dms){          // go out with a bang
    t.rs.dms=true;
    floater(t.x,t.y-74,'💣 DEAD MAN\'S SWITCH','#e3b64f');
    explodeAt(t.x,t.y-10,100,70,t.id,false);
  }
  if(G.sandbox) scheduleRespawn(t);
}
function scheduleRespawn(t){
  setTimeout(()=>{
    if(!G || !G.sandbox || t.alive) return;
    let x=t.x;
    for(let i=0;i<30;i++){ const cand=Math.round(60+frand()*(W-120));
      if(groundY(cand)<H-20 && G.players.every(o=>!o.alive||o===t||Math.abs(o.x-cand)>80)){ x=cand; break; } }
    t.x=x; t.y=groundY(x); t.hp=t.maxHp; t.shield=Math.round(50*G.set.shieldMul);
    t.alive=true; t.falling=false; t.vy=0; t.chuteOn=false;
    t.fuel=BASE_FUEL+t.fuelBonus;
    addParticles(t.x,t.y-12,30,{cols:['#9fe8ff','#fff','#7fb069'],sp0:1,sp1:5,l0:20,l1:40,s0:2,s1:4,grav:-0.04});
    floater(t.x,t.y-46,'♻️ respawned','#7fb069');
  }, 2500);
}

// gravity on tanks (terrain collapsed under them)
function stepTanks(){
  for(const t of G.players){
    if(!t.alive) continue;
    // fell out of the world → eliminated (no shooter credit; the terrain did it)
    if(t.y > H+40){
      // Landslide Insurance: once per round, claw your way to the nearest edge
      if(hasRelic(t,'landslide') && t.rs && !t.rs.landslide){
        t.rs.landslide=true;
        let placed=false;
        for(let d=30; d<600 && !placed; d+=24){
          for(const s of [1,-1]){
            const cand=clamp(Math.round(t.x+d*s),30,W-30);
            if(groundY(cand)<H-20){
              t.x=cand; t.y=groundY(cand); t.falling=false; t.vy=0; t.chuteOn=false;
              applyDamage(t,15,null);
              floater(t.x,t.y-44,'🧗 clung to the edge!','#e3b64f');
              placed=true; break;
            }
          }
        }
        if(placed) continue;
      }
      t.hp=0; t.alive=false; t.falling=false; t.chuteOn=false;
      floater(t.x, H-60, '🕳️ '+t.name+' fell into the abyss!', '#fff');
      AudioFX.boom(0.9); shake=Math.max(shake,10);
      if(hasRelic(t,'lifeinsurance') && t.rs) t.rs.insure=true;
      if(G.sandbox) scheduleRespawn(t);
      continue;
    }
    const gy=groundY(t.x);
    if(t.y < gy-1){
      if(!t.falling){ t.falling=true; t.fallStart=t.y; t.vy=0; t.chuteOn=false; }
      const dist=t.y-t.fallStart;
      if(t.chutes>0 && t.chuteEnabled && dist>40 && !t.chuteOn){ t.chuteOn=true; t.chutes--; floater(t.x,t.y-40,'🪂','#fff'); }
      t.vy=(t.vy||0)+ (t.chuteOn? 0.02:GRAV);
      if(t.chuteOn) t.vy=Math.min(t.vy,1.1);
      t.y+=t.vy;
    }
    if(t.falling && t.y >= gy-1){          // landed (or clipped into the grounded band)
      t.y=gy; t.falling=false; const fell=t.y-t.fallStart; t.vy=0;
      let impact=0;
      if(!t.chuteOn && fell>FALL_SAFE) impact=Math.round((fell-FALL_SAFE)*FALL_DMG);
      if(impact>0 && hasRelic(t,'featherweight')) impact=Math.round(impact*0.5);
      if(impact>0 && hasRelic(t,'grapple') && t.rs && !t.rs.grapple){   // first hard fall arrested
        t.rs.grapple=true; impact=0;
        floater(t.x,t.y-44,'🪝 grapple save!','#9fe8ff');
      }
      if(impact>0 && hasRelic(t,'sapper') && G.state==='shot' && G.shotBy===t.id) impact=0;  // own blast, no self fall damage
      if(impact>0){
        // drop attack: crush is capped at the dropper's MAX health — the tank's
        // mass, not its condition. Anvil Plating raises the ceiling to 1.5×.
        const crush=Math.min(impact, Math.round(t.maxHp*(hasRelic(t,'anvil')?1.5:1)));
        applyDamage(t,impact,null);
        if(hasRelic(t,'seismic')){ carveCrater(t.x,t.y,26); explodeFX(t.x,t.y,24); }
        if(crush>0) for(const v of G.players){
          if(v!==t && v.alive && Math.abs(v.x-t.x)<26 && Math.abs(v.y-t.y)<32){
            applyDamage(v,crush,t);
            floater(v.x,v.y-56,'💥 crushed!','#e3b64f');
            if(hasRelic(v,'reinforced') && t.alive) applyDamage(t,crush,v);   // spikes hurt back
            shake=Math.max(shake,12);
          }
        }
      }
      t.chuteOn=false;
    } else if(!t.falling && t.y>gy){ t.y=gy; }
  }
}
// ---------- Turn items (teleport / repair) ----------
function pickTeleportSpot(p){
  for(let i=0;i<24;i++){
    const cand=Math.round(50+frand()*(W-100));
    if(groundY(cand) < H-20 &&                              // solid ground only — no warping over the abyss
       G.players.every(o=>!o.alive||o===p||Math.abs(o.x-cand)>70)) return cand;
  }
  return p.x;
}
function applyItem(pi,kind,x,y){
  const p=G.players[pi]; if(!p||!p.alive) return;
  if(kind==='tp' && p.teleports>0){
    if(hasRelic(p,'twinwarp') && p.rs && !p.rs.twinwarp) p.rs.twinwarp=true;   // first warp each round is free
    else p.teleports--;
    if(hasRelic(p,'staticcharge') && p.rs) p.rs.staticReady=true;              // arrival energy → next shot +20
    addParticles(p.x,p.y-12,26,{cols:['#9fe8ff','#e8fbff','#5fc8e8'],sp0:1,sp1:4,l0:16,l1:36,s0:1.5,s1:4,grav:-0.03});
    // destination is chosen by the acting player (aimed, incl. mid-air) and carried
    // in the net message, so every client lands the tank in exactly the same spot
    const nx = typeof x==='number' ? clamp(Math.round(x),50,W-50) : pickTeleportSpot(p);
    const gy = groundY(nx);
    const ny = typeof y==='number' ? Math.min(Math.round(y), gy) : gy;
    p.x=nx; p.y=ny; p.falling=false; p.vy=0;   // if ny is mid-air, stepTanks starts the fall
    addParticles(p.x,p.y-12,26,{cols:['#9fe8ff','#e8fbff','#5fc8e8'],sp0:1,sp1:4,l0:16,l1:36,s0:1.5,s1:4,grav:-0.03});
    floater(p.x,p.y-44,'🌀 teleported','#9fe8ff');
    AudioFX.beep();
  } else if(kind==='rp' && p.repairs>0 && p.hp<p.maxHp){
    p.repairs--;
    const full=hasRelic(p,'fieldhospital');
    const heal=full? p.maxHp-p.hp : Math.min(35,p.maxHp-p.hp);
    p.hp+=heal;
    addParticles(p.x,p.y-14,14,{cols:['#8fd18a','#c9eec4'],sp0:0.5,sp1:2,l0:20,l1:40,s0:1.5,s1:3,grav:-0.05});
    floater(p.x,p.y-40,'🔧 +'+heal,'#7fb069');
    AudioFX.beep();
    if(full && G.players[G.turn]===p && G.state==='aim') nextTurn();   // Field Hospital costs the turn
  }
  updateHUD();
}
// Entrencher's DIG IN action: +shield, raise a berm, end the turn
function applyDig(pi){
  const p=G.players[pi]; if(!p||!p.alive||!hasRelic(p,'entrencher')) return;
  const gain=Math.round(25*(hasRelic(p,'bunker')?1.4:1));
  p.shield+=gain;
  const x0=Math.round(p.x);
  for(let dx=-20;dx<=20;dx++){
    const xx=clamp(x0+dx,0,W-1);
    if(terrain[xx]>1) terrain[xx]+=Math.max(0, 12-Math.abs(dx)*0.5);
  }
  p.y=groundY(p.x);
  addParticles(p.x,p.y,18,{cols:[theme.ground[1],theme.ground[2]],sp0:1,sp1:3,l0:15,l1:30,s0:2,s1:4,grav:0.2});
  floater(p.x,p.y-44,'⛏️ dug in +'+gain+'🛡','#a9c25d');
  AudioFX.click();
  if(G.players[G.turn]===p && G.state==='aim') nextTurn();
}
function useDig(){
  const p=localControl(); if(!p||!hasRelic(p,'entrencher')) return;
  if(G.mode==='online') NET.send({t:'dig',pi:p.id});
  applyDig(p.id);
}
function useItem(kind){
  const p=localControl(); if(!p) return;
  if(kind==='tp'){
    if(G.tpAim){ cancelTp(); return; }          // second press cancels targeting
    if(p.teleports<=0) return;
    G.tpAim={pi:p.id, x:p.x, y:Math.max(60,p.y-220)};
    toast('Aim the teleport: mouse or arrow keys, click / Space to warp, Esc to cancel','#9fe8ff');
    return;
  }
  if(kind==='rp' && (p.repairs<=0 || p.hp>=p.maxHp)) return;
  if(G.mode==='online') NET.send({t:'item',pi:p.id,kind});
  applyItem(p.id,kind);
}
function confirmTp(){
  const t=G.tpAim; if(!t) return;
  const p=G.players[t.pi]; if(!p||!p.alive){ G.tpAim=null; return; }
  const x=Math.round(clamp(t.x,50,W-50));
  const y=Math.round(clamp(t.y,40,groundY(x)));
  G.tpAim=null;
  if(G.mode==='online') NET.send({t:'item',pi:p.id,kind:'tp',x,y});
  applyItem(p.id,'tp',x,y);
}
function cancelTp(){ G.tpAim=null; toast('Teleport cancelled'); }
function toggleChute(){
  const p=localControl(); if(!p) return;
  p.chuteEnabled=!p.chuteEnabled;
  toast(p.chuteEnabled?'🪂 Parachute armed':'🪂 Parachute OFF — falls hurt (and crush!)', p.chuteEnabled?'#7fb069':'#e3b64f');
  if(G.mode==='online') NET.send({t:'chute',pi:p.id,on:p.chuteEnabled});
  updateHUD();
}
function anyMotion(){
  return G.proj.length>0 || G.plane || G.players.some(t=>t.alive&&t.falling);
}
function checkRoundEnd(){
  if(G.sandbox) return false;              // sandbox never ends — everyone respawns
  const al=alivePlayers();
  if(al.length<=1){
    G.state='roundend';
    // only the authority declares the round over; clients wait for its
    // 'roundend' message with the authoritative cash/scores
    if(amAuthority()) setTimeout(()=>roundEnd(al[0]||null), 900);
    return true;
  }
  // every human is out and only bots remain: don't make anyone spectate a
  // bot slugfest — fast-forward, healthiest bot takes the round.
  // (deliberate all-bot matches still play out; watching is the point there)
  if(al.every(isBot) && G.players.some(p=>!isBot(p))){
    G.state='roundend';
    const winner=[...al].sort((a,b)=>
      (b.hp+b.shield)-(a.hp+a.shield) || b.hp-a.hp || b.dmgDealt-a.dmgDealt || a.id-b.id)[0];
    toast('Only bots left — fast-forwarding: '+winner.name+' takes the round','#e3b64f');
    if(amAuthority()) setTimeout(()=>roundEnd(winner), 1400);
    return true;
  }
  return false;
}
