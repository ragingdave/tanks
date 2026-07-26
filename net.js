// ---------- Networking (PeerJS, host-relayed) ----------
const NET = {
  peer:null, conns:[], hostConn:null, isHost:false, myId:null, myName:'Player',
  code:null, lobby:[],   // lobby: [{peerId,name,type}]
  makeCode(){ const A='ABCDEFGHJKLMNPQRSTUVWXYZ'; let s=''; for(let i=0;i<4;i++)s+=A[Math.floor(Math.random()*A.length)]; return s; },
  pid(code){ return 'tanks-arty-v1-'+code; },

  ok(){ if(typeof Peer==='undefined'){ toast('Online play unavailable — PeerJS failed to load (check internet/adblock)','#f87171'); return false; } return true; },
  host(name){
    if(!this.ok()) return;
    this.myName=name; this.isHost=true; this.code=this.makeCode();
    this.peer=new Peer(this.pid(this.code));
    this.peer.on('open',id=>{
      this.myId=id;
      this.lobby=[{peerId:id,name,type:'human'}];
      $('roomCodeDisp').textContent=this.code;
      hide('joinBox'); show('hostBox'); show('lobbyHostOpts'); hide('lobbyWaitMsg');
      this.renderLobby();
    });
    this.peer.on('connection',conn=>{
      conn.on('open',()=>{
        this.conns.push(conn);
        conn.on('data',d=>this.onData(d,conn));
        conn.on('close',()=>this.dropPeer(conn));
        conn.on('error',()=>this.dropPeer(conn));
      });
    });
    this.peer.on('error',e=>{
      if(e.type==='unavailable-id'){ this.cleanup(); this.host(name); }
      else toast('Network error: '+e.type,'#f87171');
    });
  },
  join(name,code){
    if(!this.ok()) return;
    this.myName=name; this.isHost=false; this.code=code;
    this.peer=new Peer();
    this.peer.on('open',id=>{
      this.myId=id;
      const conn=this.peer.connect(this.pid(code),{reliable:true});
      this.hostConn=conn;
      let opened=false;
      conn.on('open',()=>{ opened=true; conn.send({t:'hello',name}); });
      conn.on('data',d=>this.onData(d,conn));
      conn.on('close',()=>{ toast('Disconnected from host','#f87171'); if(!G||G.state==='over') showOnly('menuScreen'); });
      setTimeout(()=>{ if(!opened){ toast('Could not find room '+code,'#f87171'); this.cleanup(); showOnly('menuScreen'); } },8000);
    });
    this.peer.on('error',e=>{
      if(e.type==='peer-unavailable'){ toast('Room not found: '+code,'#f87171'); this.cleanup(); showOnly('menuScreen'); }
      else toast('Network error: '+e.type,'#f87171');
    });
    hide('joinBox'); show('hostBox'); hide('lobbyHostOpts'); show('lobbyWaitMsg');
    $('roomCodeDisp').textContent=code;
  },
  dropPeer(conn){
    this.conns=this.conns.filter(c=>c!==conn);
    const gone=this.lobby.find(l=>l.peerId===conn.peer);
    this.lobby=this.lobby.filter(l=>l.peerId!==conn.peer);
    if(gone) toast(gone.name+' left','#f87171');
    if(G && G.state!=='over' && gone){
      const p=G.players.find(pp=>pp.peerId===conn.peer);
      if(p){
        if(p.alive){ p.alive=false; p.hp=0;
          if(G.players[G.turn]===p && G.state==='aim'){ if(!checkRoundEnd()) nextTurn(); } else checkRoundEnd();
        }
        if(G.state==='shop'){ shopReady.add(p.id); renderShopReady(); maybeAllReady(); }
        if(G.state==='draft'){ draftReady.add(p.id); maybeAllDrafted(); }
      }
      this.send({t:'pdrop',peerId:conn.peer});
    }
    this.renderLobby();
    this.broadcastLobby();
  },
  // host → all (optionally excluding one conn); client → host
  send(msg, except){
    if(this.isHost){ for(const c of this.conns) if(c!==except && c.open) c.send(msg); }
    else if(this.hostConn && this.hostConn.open) this.hostConn.send(msg);
  },
  broadcastLobby(){ if(this.isHost) this.send({t:'lobby',list:this.lobby}); },
  renderLobby(){
    const box=$('lobbyPlayers'); if(!box) return;
    box.innerHTML='';
    this.lobby.forEach((l,i)=>{
      const d=document.createElement('div');
      d.innerHTML=`<span style="color:${COLORS[i%COLORS.length]}">●</span> ${l.name} ${l.type!=='human'?'🤖 <span class="small">'+l.type.replace('bot-','')+'</span>':''} ${l.peerId===this.myId?'<span class="small">(you)</span>':''}`;
      box.appendChild(d);
    });
    if(this.isHost) $('btnStartOnline').disabled = this.lobby.length<2;
  },
  addBot(diff){
    if(this.lobby.length>=MAX_PLAYERS){ toast('Lobby full'); return; }
    this.lobby.push({peerId:null,name:'Bot '+TEAMNAMES[this.lobby.length]+'',type:'bot-'+diff});
    this.renderLobby(); this.broadcastLobby();
  },
  startOnline(){
    const seed=(Math.random()*1e9)|0;
    const cfg={ seed, map:$('selMapOnline').value, rounds:+$('selRoundsOnline').value,
      loadout:$('selLoadoutOnline').value, dmgMul:+$('selDmgOnline').value, shieldMul:+$('selShieldOnline').value,
      draft:$('selDraftOnline').value,
      players:this.lobby.map(l=>({name:l.name,type:l.type,peerId:l.peerId})) };
    this.send({t:'start',cfg});
    beginOnlineMatch(cfg);
  },
  pendingSync:null,
  sendBotInv(p){ // Infinity doesn't survive serialization, so ship only finite ammo counts
    const ammo={}; for(const k of WKEYS) if(k!=='missile') ammo[k]=p.ammo[k];
    this.send({t:'botinv', pi:p.id, ammo,
      stats:{cash:p.cash,chutes:p.chutes,fuelBonus:p.fuelBonus,shieldBuy:p.shieldBuy,
             maxHp:p.maxHp,armor:p.armor,teleports:p.teleports,repairs:p.repairs}});
  },
  syncState(){ // host → clients after each shot resolves
    this.send({t:'sync', turn:G.turn, wind:G.wind,
      tanks:G.players.map(p=>({x:Math.round(p.x),y:Math.round(p.y),hp:p.hp,sh:p.shield,al:p.alive,cash:p.cash,kills:p.kills,dmg:p.dmgDealt,rl:p.relics}))});
  },
  onData(d,conn){
    switch(d.t){
      case 'hello':{ // host only
        if(this.lobby.length>=MAX_PLAYERS || (G&&G.state!=='over'&&G.state!=='idle')){ conn.send({t:'full'}); return; }
        this.lobby.push({peerId:conn.peer,name:(d.name||'Player').slice(0,12),type:'human'});
        this.renderLobby(); this.broadcastLobby();
        toast(d.name+' joined','#4ade80');
        break; }
      case 'full': toast('Room is full or match already running','#f87171'); this.cleanup(); showOnly('menuScreen'); break;
      case 'lobby': this.lobby=d.list; this.renderLobby(); break;
      case 'start': beginOnlineMatch(d.cfg); break;
      case 'aim':{ const p=G&&G.players[d.pi]; if(!p) break;
        p.angle=d.a; p.power=d.pw; p.x=d.x; p.y=groundY(p.x); p.fuel=d.fuel;
        if(this.isHost) this.send(d,conn);
        break; }
      case 'fire':{ if(!G) break;
        if(this.isHost) this.send(d,conn);
        const p=G.players[d.pi]; if(p){ p.x=d.x; p.y=groundY(p.x); }
        doFire(d.pi,d.w,d.a,d.pw,true);
        break; }
      case 'sync':{ if(!G) break;
        if(G.state==='shot'){ this.pendingSync=d; } else applySync(d);
        break; }
      case 'skip': if(!this.isHost) applySkip(); break;
      case 'item': if(this.isHost) this.send(d,conn); applyItem(d.pi,d.kind,d.x,d.y); break;
      case 'chute':{ const p=G&&G.players[d.pi]; if(p){ p.chuteEnabled=!!d.on; } if(this.isHost) this.send(d,conn); break; }
      case 'dig': if(this.isHost) this.send(d,conn); applyDig(d.pi); break;
      case 'relic':{ const p=G&&G.players[d.pi]; if(p && !p.relics.includes(d.k)) p.relics.push(d.k);
        draftReady.add(d.pi); renderIntel(); updateHUD();
        if(this.isHost){ this.send(d,conn); maybeAllDrafted(); } break; }
      case 'draftdone': if(!this.isHost && G && G.state==='draft') openShopPhase(); break;
      case 'buy': applyPurchase(d.pi,d.k,d.cat); if(this.isHost) this.send(d,conn); break;
      case 'botinv':{ const p=G&&G.players[d.pi]; if(!p) break;
        Object.assign(p,d.stats);
        for(const k in d.ammo) p.ammo[k]=d.ammo[k];
        break; }
      case 'shopdone': shopReady.add(d.pi); renderShopReady(); if(this.isHost){ this.send(d,conn); maybeAllReady(); } break;
      case 'nextround': nextRoundStart(); break;
      case 'roundend': if(!this.isHost){ d.cash.forEach((c,i)=>G.players[i].cash=c); d.score.forEach((s,i)=>G.players[i].score=s); showRoundEnd(d.wi>=0?G.players[d.wi]:null); } break;
      case 'pdrop':{ if(!G) break; const p=G.players.find(pp=>pp.peerId===d.peerId);
        if(p&&p.alive){ p.alive=false; p.hp=0; toast(p.name+' disconnected','#f87171'); } break; }
    }
  },
  cleanup(){ try{ if(this.peer) this.peer.destroy(); }catch(e){}
    this.peer=null; this.conns=[]; this.hostConn=null; this.isHost=false; this.lobby=[]; }
};
function applySync(d){
  if(!G) return;
  d.tanks.forEach((s,i)=>{ const p=G.players[i]; if(!p) return;
    const wasAlive=p.alive;
    p.x=s.x; p.y=s.y; p.hp=s.hp; p.shield=s.sh; p.cash=s.cash; p.kills=s.kills; p.dmgDealt=s.dmg;
    if(s.rl) p.relics=s.rl.slice();
    if(wasAlive && !s.al) killTank(p,null);
    p.alive=s.al;
  });
  if(G.state==='aim' && typeof d.turn==='number' && d.turn!==G.turn && G.players[d.turn] && G.players[d.turn].alive){
    G.turn=d.turn; G.wind=d.wind; updateHUD();
  } else if(typeof d.wind==='number' && G.state==='aim'){ G.wind=d.wind; }
  if(!checkRoundEnd()) updateHUD();
}
function beginOnlineMatch(cfg){
  showOnly(null); show('hud');
  newMatch(cfg.players, {mode:'online', seed:cfg.seed, map:cfg.map, rounds:cfg.rounds, cash:10000,
    loadout:cfg.loadout||'shop', dmgMul:cfg.dmgMul||1, shieldMul:(cfg.shieldMul==null?1:cfg.shieldMul),
    draft:cfg.draft||'pick'});
}

// online round-end → shop transition (clients follow host via btnNext? host drives)
// Keep it simple: everyone sees round-end screen; "Continue" goes to shop locally.
// nextround (all ready) is host-driven above.

// ---------- Menus & setup ----------
let setupMode='bots';
function openSetup(mode){
  setupMode=mode;
  $('setupTitle').textContent = mode==='bots' ? 'Play vs Bots' : 'Local Hotseat';
  const box=$('playerList'); box.innerHTML='';
  if(mode==='bots'){ addPlayerRow('You','human'); addPlayerRow('Bot Blue','bot-medium'); addPlayerRow('Bot Green','bot-easy'); }
  else { addPlayerRow('Player 1','human'); addPlayerRow('Player 2','human'); }
  showOnly('setupScreen');
}
function addPlayerRow(name,type){
  const box=$('playerList');
  if(box.children.length>=MAX_PLAYERS) return;
  const i=box.children.length;
  const d=document.createElement('div'); d.className='playerRow';
  d.innerHTML=`<div class="dot" style="background:${COLORS[i%COLORS.length]}"></div>
    <input type="text" value="${name}" maxlength="12">
    <select>
      <option value="human"${type==='human'?' selected':''}>Human</option>
      <option value="bot-easy"${type==='bot-easy'?' selected':''}>Bot — Easy</option>
      <option value="bot-medium"${type==='bot-medium'?' selected':''}>Bot — Medium</option>
      <option value="bot-hard"${type==='bot-hard'?' selected':''}>Bot — Hard</option>
    </select>
    <button title="remove">✕</button>`;
  d.querySelector('button').onclick=()=>{ if(box.children.length>2){ d.remove(); recolorRows(); } };
  box.appendChild(d);
}
function recolorRows(){ [...$('playerList').children].forEach((d,i)=>d.querySelector('.dot').style.background=COLORS[i%COLORS.length]); }
$('btnAddPlayer').onclick=()=>addPlayerRow(setupMode==='bots'?'Bot '+TEAMNAMES[$('playerList').children.length]:'Player '+($('playerList').children.length+1), setupMode==='bots'?'bot-medium':'human');
$('btnSetupBack').onclick=()=>showOnly('menuScreen');
$('btnStartMatch').onclick=()=>{
  AudioFX.unlock(); AudioFX.click();
  const rows=[...$('playerList').children];
  const players=rows.map(r=>({name:r.querySelector('input').value.trim()||'Player',type:r.querySelector('select').value,peerId:null}));
  if(players.length<2){ toast('Need at least 2 players'); return; }
  showOnly(null); show('hud');
  newMatch(players,{mode:'local', seed:(Math.random()*1e9)|0, map:$('selMap').value, rounds:+$('selRounds').value,
    cash:+$('selCash').value, loadout:$('selLoadout').value, dmgMul:+$('selDmg').value, shieldMul:+$('selShield').value,
    draft:$('selDraft').value});
};

$('btnVsBots').onclick=()=>{AudioFX.unlock();AudioFX.click(); openSetup('bots');};
$('btnSandbox').onclick=()=>{
  AudioFX.unlock(); AudioFX.click();
  showOnly(null); show('hud');
  newMatch([{name:'You',type:'human'},{name:'Bot Blue',type:'bot-medium'},{name:'Bot Green',type:'bot-medium'}],
    {mode:'local', seed:(Math.random()*1e9)|0, map:'random', rounds:1, cash:0,
     loadout:'none', dmgMul:1.5, shieldMul:0.75, sandbox:true});
  toast('🧪 Sandbox: all weapons, everyone respawns — hit ✕ Exit to leave','#a9c25d');
};
$('btnExitSandbox').onclick=()=>location.reload();
$('btnHotseat').onclick=()=>{AudioFX.unlock();AudioFX.click(); openSetup('hotseat');};
$('btnHost').onclick=()=>{AudioFX.unlock();AudioFX.click();
  $('lobbyTitle').textContent='Host Online Game'; hide('rowCode'); show('joinBox'); hide('hostBox');
  showOnly('lobbyScreen'); $('btnLobbyGo').onclick=()=>{ const n=$('inpName').value.trim()||'Host'; NET.host(n); };
};
$('btnJoin').onclick=()=>{AudioFX.unlock();AudioFX.click();
  $('lobbyTitle').textContent='Join Online Game'; show('rowCode'); show('joinBox'); hide('hostBox');
  showOnly('lobbyScreen'); $('btnLobbyGo').onclick=()=>{
    const n=$('inpName').value.trim()||'Player', c=$('inpCode').value.trim().toUpperCase();
    if(c.length!==4){ toast('Enter the 4-letter room code'); return; }
    NET.join(n,c);
  };
};
$('btnLobbyLeave').onclick=()=>{ NET.cleanup(); showOnly('menuScreen'); };
$('roomCodeDisp').onclick=()=>{ try{ navigator.clipboard.writeText(NET.code); toast('Code copied!','#4ade80'); }catch(e){} };
$('btnBotEasy').onclick=()=>NET.addBot('easy');
$('btnBotMed').onclick=()=>NET.addBot('medium');
$('btnBotHard').onclick=()=>NET.addBot('hard');
$('btnStartOnline').onclick=()=>{ AudioFX.click(); NET.startOnline(); };

// ---------- Canvas scaling ----------
function fitCanvas(){
  const box=document.getElementById('canvasbox');
  const bw=box.clientWidth, bh=box.clientHeight;
  const s=Math.min(bw/W, bh/H);
  canvas.style.width=(W*s)+'px'; canvas.style.height=(H*s)+'px';
  // hi-dpi: back the canvas with real device pixels (crisp text/graphics on 4K)
  const newRes=clamp(s*(window.devicePixelRatio||1), 0.5, 2.5);
  if(Math.abs(newRes-RES)>0.01){
    RES=newRes;
    canvas.width=Math.round(W*RES); canvas.height=Math.round(H*RES);
    if(skyCache) buildSky();
  }
}
window.addEventListener('resize',fitCanvas);

// ---------- Boot ----------
fitCanvas();
showOnly('menuScreen');
hide('hud');
// idle backdrop: pre-generate a scene so the menu has something pretty behind it
genTerrain('random', 42); buildSky();
(function idleDraw(){ if(G) return; ctx.setTransform(RES,0,0,RES,0,0); drawTerrain(); requestAnimationFrame(idleDraw); })();
requestAnimationFrame(frame);
