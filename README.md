# TANKS! — Modern Artillery

A single-file remake of the classic *Tanks* Flash game (the mathsisfun.com one), rebuilt with modern web tech. Turn-based artillery: aim with angle and power, fight the wind, blow craters in destructible terrain, earn cash, and buy bigger guns between rounds.

Everything lives in one file: **index.html**. No build step, no server, no dependencies to install.

## Game modes

**Play vs Bots** — you against 1–5 AI tanks. Three difficulties: Easy (wild aim), Medium (decent gunner), Hard (near-perfect trajectory search, smart weapon picks, smart shopping).

**Local Hotseat** — up to 6 players sharing one keyboard, just like the original.

**Online multiplayer** — one player clicks *Host Online Game* and gets a 4-letter room code; friends click *Join Online Game* and enter it. Up to 6 players, and the host can add bots to fill seats. It's peer-to-peer (WebRTC via the free PeerJS cloud for the handshake), so there's no game server and nothing to pay for. The host's browser tab must stay open — they're the referee.

## Deploying to GitHub Pages (free, ~3 minutes)

1. Sign in at github.com (create a free account if needed).
2. Click **+** (top right) → **New repository**. Name it `tanks`, keep it **Public**, click **Create repository**.
3. On the new repo page, click **uploading an existing file**, drag in `index.html`, and click **Commit changes**.
4. Go to **Settings → Pages**. Under *Build and deployment*, set Source to **Deploy from a branch**, pick branch `main` and folder `/ (root)`, click **Save**.
5. Wait a minute, refresh, and your game is live at:
   `https://<your-username>.github.io/tanks/`

Send that link to your friends — one person hosts a room, everyone else joins with the code.

To update the game later, just upload a new `index.html` over the old one.

## Controls

| Input | Action |
|---|---|
| ← / → | Aim barrel (hold Shift for ×5) |
| ↑ / ↓ | Power (hold Shift for ×5) |
| A / D | Drive left / right (uses fuel) |
| Tab | Cycle weapons |
| Space | FIRE! |

Everything also works with the on-screen buttons (touch-friendly).

## The arsenal

Missile (free, unlimited) · Big Missile · Shower (splits into 6 at the apex) · Volcano Bomb (erupts into 9 fragments) · Digger (tunnels deep before exploding) · Atom Bomb · Air Strike (plane drops 5 bombs on your marker).

Gear: shields, parachutes, teleporters, repair kits, extra fuel, energy cells (+max HP), composite armor (damage reduction).

Every tank starts the match with one free parachute — it auto-deploys on long falls (like getting the ground blown out from under you) and prevents fall damage. Buy more in the Armory. Teleporters warp you to a random spot and repair kits patch +35 HP; both are used on your turn from the Items buttons in the HUD, and neither ends your turn.

You earn cash for every point of damage ($15/hp), kills ($2,000), surviving a round ($1,500), and winning it ($5,000).

## Notes

- Aiming an **Air Strike** works differently: the angle control sweeps a target marker across the map.
- Wind changes every turn and genuinely matters — watch the gauge.
- Online turns have a 60-second timer so nobody can stall the game.
- If a player disconnects mid-match, their tank is forfeited and the game continues.
