// ---------- DOM helpers ----------
const $=id=>document.getElementById(id);
function show(id){ $(id).classList.remove('hidden'); }
function hide(id){ $(id).classList.add('hidden'); }
function showOnly(screen){
  for(const s of ['menuScreen','setupScreen','lobbyScreen','shopScreen','overScreen','draftScreen'])
    s===screen? show(s):hide(s);
}
let toastTO=null;
function toast(msg,col){
  const t=$('toast'); t.textContent=msg; t.style.borderColor=col||'var(--edge)';
  t.style.opacity=1; clearTimeout(toastTO); toastTO=setTimeout(()=>t.style.opacity=0,1800);
}

// ---------- HUD ----------
function updateHUD(){
  if(!G){ hide('hud'); return; }
  show('hud');
  const p=G.players[G.turn]; if(!p) return;
  $('angVal').textContent=Math.round(p.angle)+'°';
  $('powVal').textContent=Math.round(p.power);
  $('fuelVal').textContent=Math.round(p.fuel);
  const sel=$('weaponSel'); sel.innerHTML='';
  for(const k of WKEYS){
    const w=WEAPONS[k], n=p.ammo[k];
    if(n===0) continue;
    const o=document.createElement('option');
    o.value=k; o.textContent=`${w.icon} ${w.name}${n===Infinity?'':' ×'+n}`;
    if(k===p.weapon)o.selected=true;
    sel.appendChild(o);
  }
  const mine = isMyTurn() || (G.mode==='local' && !isBot(p) && G.state==='aim');
  for(const id of ['angDown','angUp','powDown','powUp','movLeft','movRight','fireBtn','weaponSel'])
    $(id).disabled=!mine;
  // items: show the controllable player's stock
  const me = G.mode==='online' ? G.players.find(pp=>pp.peerId===NET.myId) : p;
  if(me){
    $('tpCount').textContent=me.teleports;
    $('rpCount').textContent=me.repairs;
    $('chuteCount').textContent=me.chutes;
    $('btnTeleport').disabled = !mine || (me.teleports<=0 && !G.tpAim);
    $('btnTeleport').classList.toggle('aiming', !!G.tpAim);
    $('btnRepair').disabled = !mine || me.repairs<=0 || me.hp>=me.maxHp;
    $('btnChute').disabled = !mine || me.chutes<=0;
    $('btnChute').classList.toggle('chuteOff', !me.chuteEnabled);
    $('btnDigIn').classList.toggle('hidden', !hasRelic(me,'entrencher'));
    $('btnDigIn').disabled = !mine;
    const ri=$('relicIcons');
    ri.textContent = me.relics.length? me.relics.map(k=>RELICS[k].icon).join(' ') : '—';
    ri.title = me.relics.map(k=>RELICS[k].name+': '+RELICS[k].desc).join('\n');
  }
}
function localControl(){ // player object the local user may steer right now
  if(!G||G.state!=='aim')return null;
  const p=G.players[G.turn];
  if(isBot(p))return null;
  if(G.mode==='online' && p.peerId!==NET.myId)return null;
  return p;
}
function adjAngle(d){ const p=localControl(); if(!p)return; p.angle=clamp(p.angle+d,0,180); updateHUD(); netAim(p); }
function adjPower(d){ const p=localControl(); if(!p)return; p.power=clamp(p.power+d,10,100); updateHUD(); netAim(p); }
function netAim(p){ if(G.mode==='online') NET.send({t:'aim',pi:p.id,a:p.angle,pw:p.power,x:Math.round(p.x),fuel:Math.round(p.fuel)}); }
function fireLocal(){
  if(G && G.tpAim) return;          // aiming a teleport, not the gun
  const p=localControl(); if(!p)return;
  const w=$('weaponSel').value||p.weapon;
  if(G.mode==='online'){ NET.send({t:'fire',pi:p.id,w,a:p.angle,pw:p.power,x:Math.round(p.x)}); }
  doFire(p.id,w,p.angle,p.power);
  updateHUD();
}
// buttons (with hold-repeat)
function holdable(id,fn){
  const el=$(id); let iv=null;
  const start=e=>{e.preventDefault(); if(el.disabled)return; AudioFX.unlock(); fn(); iv=setInterval(fn,70);};
  const stop=()=>{clearInterval(iv);iv=null; const p=localControl(); if(p)p.moveDir=0;};
  el.addEventListener('mousedown',start); el.addEventListener('touchstart',start,{passive:false});
  for(const ev of ['mouseup','mouseleave','touchend','touchcancel']) el.addEventListener(ev,stop);
}
holdable('angUp',()=>adjAngle(1)); holdable('angDown',()=>adjAngle(-1));
holdable('powUp',()=>adjPower(1)); holdable('powDown',()=>adjPower(-1));
holdable('movLeft',()=>{const p=localControl(); if(p){tryMove(p,-1); netAim(p);} });
holdable('movRight',()=>{const p=localControl(); if(p){tryMove(p,1); netAim(p);} });
$('fireBtn').addEventListener('click',()=>{AudioFX.unlock(); fireLocal();});
$('btnTeleport').addEventListener('click',()=>{AudioFX.unlock(); useItem('tp'); updateHUD();});
$('btnRepair').addEventListener('click',()=>{AudioFX.unlock(); useItem('rp');});
$('btnChute').addEventListener('click',()=>{AudioFX.unlock(); toggleChute();});
$('btnDigIn').addEventListener('click',()=>{AudioFX.unlock(); useDig();});
// battlefield mouse targeting: teleports (anywhere) and air strikes (ground reticle)
let lastAimNet=0;
canvas.addEventListener('mousemove',e=>{
  if(!G) return;
  const r=canvas.getBoundingClientRect();
  const wx=(e.clientX-r.left)/r.width*W, wy=(e.clientY-r.top)/r.height*H;
  if(G.tpAim){
    G.tpAim.x=clamp(wx,50,W-50); G.tpAim.y=clamp(wy,40,H-4);
    return;
  }
  const p=localControl();
  if(p && p.weapon==='strike'){                 // strike reticle rides the mouse (x only, stays on the ground)
    p.angle=clamp(wx/W*180, 2, 178);
    $('angVal').textContent=Math.round(p.angle)+'°';
    const now=performance.now();
    if(G.mode==='online' && now-lastAimNet>120){ lastAimNet=now; netAim(p); }
  }
});
canvas.addEventListener('click',()=>{
  if(G&&G.tpAim){ AudioFX.unlock(); confirmTp(); updateHUD(); return; }
  const p=localControl();
  if(p && p.weapon==='strike'){ AudioFX.unlock(); fireLocal(); }   // click the ground = call the strike
});
canvas.addEventListener('contextmenu',e=>{ if(G&&G.tpAim){ e.preventDefault(); cancelTp(); updateHUD(); } });
$('weaponSel').addEventListener('change',e=>{const p=localControl(); if(p){p.weapon=e.target.value; updateHUD(); }});

// keyboard
const keys={};
window.addEventListener('keydown',e=>{
  if(e.target.tagName==='INPUT'||e.target.tagName==='SELECT')return;
  AudioFX.unlock();
  keys[e.code]=true;
  // teleport targeting intercepts movement/confirm keys
  if(G && G.tpAim){
    const step=e.shiftKey?24:8;
    if(e.code==='ArrowLeft'){ e.preventDefault(); G.tpAim.x=clamp(G.tpAim.x-step,50,W-50); return; }
    if(e.code==='ArrowRight'){ e.preventDefault(); G.tpAim.x=clamp(G.tpAim.x+step,50,W-50); return; }
    if(e.code==='ArrowUp'){ e.preventDefault(); G.tpAim.y=clamp(G.tpAim.y-step,40,H-4); return; }
    if(e.code==='ArrowDown'){ e.preventDefault(); G.tpAim.y=clamp(G.tpAim.y+step,40,H-4); return; }
    if(e.code==='Space'||e.code==='Enter'){ e.preventDefault(); confirmTp(); updateHUD(); return; }
    if(e.code==='Escape'){ e.preventDefault(); cancelTp(); updateHUD(); return; }
  }
  const p=localControl();
  if(e.code==='Space'){ e.preventDefault(); fireLocal(); }
  if(p){
    if(e.code==='ArrowLeft'){e.preventDefault(); adjAngle(e.shiftKey?5:1);}
    if(e.code==='ArrowRight'){e.preventDefault(); adjAngle(e.shiftKey?-5:-1);}
    if(e.code==='ArrowUp'){e.preventDefault(); adjPower(e.shiftKey?5:1);}
    if(e.code==='ArrowDown'){e.preventDefault(); adjPower(e.shiftKey?-5:-1);}
    if(e.code==='KeyA'){p.moveDir=-1;}
    if(e.code==='KeyD'){p.moveDir=1;}
    if(e.code==='Tab'){e.preventDefault(); cycleWeapon(p);}
  }
});
window.addEventListener('keyup',e=>{
  keys[e.code]=false;
  const p=localControl();
  if(p){ if(e.code==='KeyA'&&p.moveDir===-1)p.moveDir=0; if(e.code==='KeyD'&&p.moveDir===1)p.moveDir=0;
    if((e.code==='KeyA'||e.code==='KeyD')) netAim(p); }
});
function cycleWeapon(p){
  const avail=WKEYS.filter(k=>p.ammo[k]===Infinity||p.ammo[k]>0);
  const i=avail.indexOf(p.weapon);
  p.weapon=avail[(i+1)%avail.length]; updateHUD();
}

// ---------- Round end / shop / game over ----------
function roundEnd(winner){
  for(const p of G.players){ p.cash += 1500; if(p===winner){ p.cash+=5000; p.score++; } }
  if(amAuthority() && G.mode==='online') NET.send({t:'roundend', wi: winner? winner.id:-1, cash:G.players.map(p=>p.cash), score:G.players.map(p=>p.score)});
  showRoundEnd(winner);
}
function showRoundEnd(winner){
  G.state='roundend';
  hide('hud');
  const last = G.rounds>0 && G.round>=G.rounds;
  const winTxt=n=>n.toLowerCase()==='you'?'You win':`${n} wins`;
  $('overTitle').textContent = winner? `🏆 ${winTxt(winner.name)} round ${G.round}!` : `Round ${G.round}: draw!`;
  let html='<table><tr><th>Player</th><th>Rounds won</th><th>Kills</th><th>Damage</th><th>Cash</th></tr>';
  const sorted=[...G.players].sort((a,b)=>b.score-a.score||b.dmgDealt-a.dmgDealt);
  for(const p of sorted) html+=`<tr><td><span style="color:${p.color}">●</span> ${p.name}${isBot(p)?' 🤖':''}</td><td>${p.score}</td><td>${p.kills}</td><td>${p.dmgDealt}</td><td class="price">${fmt$(p.cash)}</td></tr>`;
  html+='</table>';
  if(last){
    const champ=sorted[0];
    $('overTitle').textContent=`🏆 ${winTxt(champ.name)} the match!`;
    html+=`<div style="text-align:center;font-size:38px;margin:8px">🎉</div>`;
    $('overBody').innerHTML=html;
    hide('btnNext'); show('btnMenu'); showOnly('overScreen');
    G.state='over';
    return;
  }
  $('overBody').innerHTML=html;
  show('btnNext');
  $('btnNext').textContent='Continue to Armory ➜'; hide('btnMenu');
  showOnly('overScreen');
}
$('btnNext').addEventListener('click',()=>{ startPostRound(); });

// ---------- Relic draft (between rounds) ----------
let draftQueue=[], draftIdx=0, draftReady=new Set();
function startPostRound(){
  if(!G.set.draft || G.set.draft==='off'){ openShopPhase(); return; }
  openDraftPhase();
}
function draftOptionsFor(p){
  // deterministic per (seed, round, player): every client computes identical options
  const rng=mulberry32(((G.seed>>>0) ^ (G.round*31337) ^ ((p.id+1)*9973))>>>0);
  const pool=RELIC_KEYS.filter(k=>!p.relics.includes(k));
  const opts=[];
  while(opts.length<3 && pool.length) opts.push(pool.splice(Math.floor(rng()*pool.length),1)[0]);
  return {opts,rng};
}
function openDraftPhase(){
  G.state='draft';
  draftReady=new Set();
  // bots always auto-pick; in random mode humans do too — deterministic on every client
  for(const p of G.players){
    if(isBot(p) || G.set.draft==='random'){
      const {opts,rng}=draftOptionsFor(p);
      if(opts.length) p.relics.push(opts[Math.floor(rng()*opts.length)]);
      draftReady.add(p.id);
    }
  }
  if(G.set.draft==='random'){
    toast('🎁 Relics assigned — check the 🎖️ intel panel','#a9c25d');
    updateHUD(); renderIntel();
    openShopPhase(); return;
  }
  if(G.mode==='online'){
    for(const p of G.players) if(p.peerId && !NET.lobby.some(l=>l.peerId===p.peerId)) draftReady.add(p.id);
    const me=G.players.find(p=>p.peerId===NET.myId);
    // unlimited matches can exhaust the relic pool — auto-skip an empty draft
    if(me && !draftOptionsFor(me).opts.length){
      NET.send({t:'relic',pi:me.id,k:null});
      draftReady.add(me.id);
      showOnly('draftScreen');
      $('draftCards').innerHTML='<div class="small" style="grid-column:1/-1;text-align:center;padding:20px">You own every relic. Legend.</div>';
      show('draftWait');
      if(NET.isHost) maybeAllDrafted();
      return;
    }
    showOnly('draftScreen'); hide('draftWait');
    renderDraft(me);
    if(NET.isHost) maybeAllDrafted();   // covers the everyone-else-is-bots case
  } else {
    draftQueue=G.players.filter(p=>!isBot(p) && draftOptionsFor(p).opts.length>0); draftIdx=0;
    if(!draftQueue.length){ openShopPhase(); return; }
    showOnly('draftScreen'); renderDraft(draftQueue[0]);
  }
}
function renderDraft(p){
  if(!p){ openShopPhase(); return; }
  $('draftTitle').innerHTML=`Choose a Relic — <span style="color:${p.color}">${p.name}</span>`;
  $('draftSub').textContent=`Round ${G.round} spoils. Pick one — relics last the whole match, and everyone can see yours.`;
  const {opts}=draftOptionsFor(p);
  const box=$('draftCards'); box.innerHTML='';
  opts.forEach(k=>{
    const r=RELICS[k];
    const b=document.createElement('button'); b.className='relicCard';
    b.innerHTML=`<div style="font-size:36px">${r.icon}</div><b>${r.name}</b><div class="small">${r.desc}</div>`;
    b.onclick=()=>{ AudioFX.click(); pickRelic(p,k); };
    box.appendChild(b);
  });
  $('draftOwned').innerHTML = p.relics.length? 'Owned: '+p.relics.map(k=>RELICS[k].icon+' '+RELICS[k].name).join(' · ') : '';
}
function pickRelic(p,k){
  p.relics.push(k);
  updateHUD(); renderIntel();
  if(G.mode==='online'){
    NET.send({t:'relic',pi:p.id,k});
    draftReady.add(p.id);
    $('draftCards').innerHTML=`<div class="small" style="grid-column:1/-1;text-align:center;padding:20px">You picked ${RELICS[k].icon} <b>${RELICS[k].name}</b></div>`;
    show('draftWait');
    if(NET.isHost) maybeAllDrafted();
  } else {
    draftIdx++;
    if(draftIdx<draftQueue.length) renderDraft(draftQueue[draftIdx]);
    else openShopPhase();
  }
}
function maybeAllDrafted(){
  if(!NET.isHost || G.state!=='draft') return;
  if(G.players.every(p=>draftReady.has(p.id))){ NET.send({t:'draftdone'}); openShopPhase(); }
}

// ---------- Intel panel: everyone's relics, visible to everyone, any time ----------
function renderIntel(){
  const box=$('intelPanel'); if(!G){ box.innerHTML=''; return; }
  let html='<h4>🎖️ Relics in play</h4>';
  for(const p of G.players){
    html+=`<div class="ip-p"><span style="color:${p.color}">●</span> ${p.name}${isBot(p)?' 🤖':''}${p.alive?'':' ✖'}</div>`;
    if(p.relics.length) for(const k of p.relics)
      html+=`<div class="ip-r">${RELICS[k].icon} <b>${RELICS[k].name}</b> — ${RELICS[k].desc}</div>`;
    else html+='<div class="ip-r">no relics yet</div>';
  }
  box.innerHTML=html;
}
$('btnIntel').addEventListener('click',()=>{
  AudioFX.click();
  const box=$('intelPanel');
  if(box.classList.contains('hidden')){ renderIntel(); show('intelPanel'); }
  else hide('intelPanel');
});
$('btnMenu').addEventListener('click',()=>{ location.reload(); });

// SHOP phase: humans shop (hotseat sequential / online simultaneous), bots auto-shop
let shopQueue=[], shopIdx=0, shopReady=new Set();
function openShopPhase(){
  G.state='shop';
  if(amAuthority()) for(const p of G.players) if(isBot(p)){
    botShop(p);
    if(G.mode==='online') NET.sendBotInv(p);   // clients must mirror bot inventories or they'd drop bot shots
  }
  if(G.mode==='online'){
    for(const p of G.players) if(isBot(p) || !p.alive && !p.peerId) shopReady.add(p.id);
    for(const p of G.players) if(p.peerId && !NET.lobby.some(l=>l.peerId===p.peerId)) shopReady.add(p.id); // disconnected
    const me=G.players.find(p=>p.peerId===NET.myId);
    showOnly('shopScreen'); hide('shopWait');
    renderShop(me);
    renderShopReady();
  } else {
    shopQueue=G.players.filter(p=>!isBot(p));
    shopIdx=0;
    if(shopQueue.length===0){ nextRoundStart(); return; }
    showOnly('shopScreen');
    renderShop(shopQueue[0]);
  }
}
function renderShopReady(){
  const box=$('shopReadyList');
  if(!G || G.mode!=='online'){ box.innerHTML=''; return; }
  box.innerHTML='';
  for(const p of G.players){
    const d=document.createElement('div');
    d.innerHTML=`<span style="color:${p.color}">●</span> ${p.name}${isBot(p)?' 🤖':''}`+
      `<span style="float:right">${shopReady.has(p.id)?'<span style="color:var(--good)">✔ ready</span>':'<span class="small">⏳ shopping…</span>'}</span>`;
    box.appendChild(d);
  }
}
// ---------- Black Market: every player gets one discounted item each round ----------
function bmKeyFor(p){
  const rng=mulberry32(((G.seed>>>0) ^ (G.round*7331) ^ ((p.id+1)*613))>>>0);
  const cat=[...WKEYS.filter(k=>WEAPONS[k].price>0), ...GKEYS];
  return cat[Math.floor(rng()*cat.length)];
}
function priceOf(p,k,catg){
  const base = catg==='w' ? WEAPONS[k].price : GEAR[k].price;
  return k===bmKeyFor(p) ? Math.round(base*0.6) : base;
}
function grantPurchase(p,k,catg){   // single source of truth for buys, local and remote
  if(catg==='w'){
    p.cash-=priceOf(p,k,'w');
    p.ammo[k]+=Math.ceil(WEAPONS[k].ammo*(hasRelic(p,'quartermaster')?1.5:1));
  } else {
    p.cash-=priceOf(p,k,'g');
    GEAR[k].give(p);
  }
}
function renderShop(p){
  $('shopTitle').innerHTML=`Armory — <span style="color:${p.color}">${p.name}</span>`;
  const next = G.pendingFirstRound ? G.round : G.round+1;
  $('shopSub').textContent = (G.pendingFirstRound?'Pre-battle loadout — ':'') + `Round ${next}${G.rounds>0?' of '+G.rounds:''} up next`;
  $('shopCash').textContent=fmt$(p.cash);
  const bm=bmKeyFor(p), qm=hasRelic(p,'quartermaster');
  const box=$('shopItems'); box.innerHTML='';
  const addRow=(k,catg,icon,name,desc,ownTxt,canBuy)=>{
    const isBm=k===bm, price=priceOf(p,k,catg);
    const d=document.createElement('div'); d.className='shopItem'+(isBm?' bmRow':'');
    d.innerHTML=`<div><b>${icon} ${name}</b>${isBm?' <span style="color:var(--acc); font-size:11px">🏴 BLACK MARKET −40%</span>':''}`+
      `<div class="small">${desc}</div><div class="own">${ownTxt}</div></div>`+
      `<div class="price">${price?fmt$(price):'FREE'}</div>`;
    const b=document.createElement('button'); b.textContent='Buy'; b.disabled=!canBuy||p.cash<price;
    b.onclick=()=>{ AudioFX.click(); grantPurchase(p,k,catg); sendPurchase(p,k,catg); renderShop(p); };
    d.appendChild(b); box.appendChild(d);
  };
  for(const k of WKEYS){
    const w=WEAPONS[k]; if(w.price===0) continue;
    const per=Math.ceil(w.ammo*(qm?1.5:1));
    addRow(k,'w',w.icon,w.name,
      `Radius ${w.r} • Damage ${w.dmg}${w.frags?' ×'+w.frags+' frags':''}${w.bombs?' ×'+w.bombs+' bombs':''}`,
      `Owned: ${p.ammo[k]}  (+${per} per buy${qm?' 📦':''})`, true);
  }
  for(const k of GKEYS){
    const g=GEAR[k];
    let ownTxt='';
    if(k==='parachute')ownTxt=`Owned: ${p.chutes}`;
    if(k==='teleport')ownTxt=`Owned: ${p.teleports}`;
    if(k==='repair')ownTxt=`Owned: ${p.repairs}`;
    if(k==='fuel')ownTxt=`Bonus: +${p.fuelBonus}`;
    if(k==='shield1'||k==='shield2')ownTxt=p.shieldBuy?`Equipped: ${p.shieldBuy} shield`:'None equipped';
    if(k==='energy')ownTxt=`Max HP: ${p.maxHp}`;
    if(k==='armor')ownTxt=`Level ${p.armor}/3`;
    const blocked=(k==='armor'&&p.armor>=3);
    addRow(k,'g',g.icon,g.name,g.desc,ownTxt,!blocked);
  }
}
function sendPurchase(p,k,cat){ if(G.mode==='online') NET.send({t:'buy',pi:p.id,k,cat}); }
function applyPurchase(pi,k,cat){ grantPurchase(G.players[pi],k,cat); }
$('btnShopDone').addEventListener('click',()=>{
  AudioFX.click();
  if(G.mode==='online'){
    const me=G.players.find(p=>p.peerId===NET.myId);
    NET.send({t:'shopdone',pi:me.id});
    shopReady.add(me.id);
    $('btnShopDone').disabled=true; show('shopWait');
    renderShopReady();
    if(NET.isHost) maybeAllReady();
  } else {
    shopIdx++;
    if(shopIdx<shopQueue.length){ renderShop(shopQueue[shopIdx]); }
    else nextRoundStart();
  }
});
function maybeAllReady(){
  if(!NET.isHost) return;
  if(G.players.every(p=>shopReady.has(p.id))){
    NET.send({t:'nextround'});
    nextRoundStart();
  }
}
function nextRoundStart(){
  shopReady=new Set();
  $('btnShopDone').disabled=false; hide('shopWait');
  if(G.pendingFirstRound) G.pendingFirstRound=false;   // pre-match armory → round 1
  else G.round++;
  showOnly(null); show('hud');
  startRound();
}

// bot shopping AI
function botShop(p){
  const hard=p.type==='bot-hard', med=p.type==='bot-medium';
  const buy=(k,cat)=>{ const price=priceOf(p,k,cat);
    if(p.cash>=price){ grantPurchase(p,k,cat); return true; } return false; };
  if(hard){
    if(p.cash>=38000) buy('strike','w');
    if(p.cash>=15000) buy('atom','w');
    buy('shield2','g'); buy('energy','g');
    if(p.repairs<1) buy('repair','g');
    while(p.cash>=8000 && p.ammo.bigshot<8) buy('bigshot','w');
    if(p.cash>=6000) buy('volcano','w');
    if(p.chutes<1) buy('parachute','g');
  } else if(med){
    if(p.cash>=20000) buy('atom','w');
    buy('shield1','g');
    if(p.cash>=9000 && p.repairs<1) buy('repair','g');
    while(p.cash>=6000 && p.ammo.bigshot<5) buy('bigshot','w');
    if(p.cash>=4000) buy('shower','w');
  } else {
    if(p.cash>=3000&&frand()<0.6) buy('bigshot','w');
    if(p.cash>=6000&&frand()<0.4) buy('shield1','g');
  }
}
