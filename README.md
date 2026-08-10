# Rabbits & Wolves

Reference implementation of the protocol described in `PROTOCOL.md`.

## Run the server

```bash
cd server
npm install
npm start
# -> Rabbits & Wolves server listening on ws://localhost:8080
```

## Run a client

The client is a static page — no build step. Just open it in a browser:

```bash
cd client
python3 -m http.server 8000   # or any static file server
```

Then visit `http://localhost:8000`, type a display name, leave the URL as
`ws://localhost:8080` (or edit it), and click **Join**. Open the page in
several browser tabs/windows to simulate multiple players — the server
auto-assigns each connection as a rabbit or wolf to keep roughly a
1-wolf-to-3-rabbits ratio.

Controls: arrow keys or WASD. Movement is queued and sent automatically
each tick — you don't need to click anything once connected.

## What's implemented

- `hello` / `welcome` handshake with server-assigned role + display name (`server.js`)
- Fixed tile-coded map (`map.js`): `0` grass, `1` bush, `2` water, `3` rock, `4` clover
- Tick loop (`TICK_INTERVAL_MS`, currently 1000ms — see the constant at the
  top of `server.js` to bump to 100ms/10-per-second later)
- Wolves get 2 moves every 3rd tick (`WOLF_DOUBLE_MOVE_EVERY`)
- Vital energy: starts at 400, -1/tick upkeep, +200 (capped at 400) on
  eating clover or catching a rabbit, death at 0 energy
- Death/respawn flow for both kinds (eaten or starved → respawn after a
  delay at a random spawn tile with full energy)
- Clover eaten → unavailable → respawns after a cooldown
- Grass/bush visibility: rabbits hidden in a bush are omitted from a
  wolf's state broadcast unless that wolf is also standing in a bush
- Per-client personalized `state` broadcasts (not a single global broadcast)
- Canvas-based browser client with keyboard input, HUD (tick, energy bar,
  alive/dead), and an event log

## Notes / next steps

- I wasn't able to `npm install` or run this end-to-end in the sandbox
  (no network egress there), but every file passed `node -c` syntax
  checks. Worth a smoke test on your machine before relying on it.
- All the "assumption" items flagged in `PROTOCOL.md` §4 are implemented
  as named constants at the top of `server.js` — easy to retune.
- Not implemented yet (say the word if you want any of these): reconnect
  handling with a grace period, spectator mode, a bot/AI client for
  testing without a human, persistence across server restarts.


# Nek-random-project
## Ubistvu dost kul projekt
- Runna na Pi-ju
- Je multiplayer

