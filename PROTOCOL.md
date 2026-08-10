# Rabbits & Wolves — Protocol Specification (v1)

## 1. Overview

- **World**: fixed, hand-authored grid map (e.g. 24×18 tiles), loaded once at server start.
- **Tile types**: `empty`, `wall` (blocks movement), `grass` (hides rabbits), `clover` (rabbit food, respawns).
- **Players**: each WebSocket connection controls exactly one entity — a `rabbit` or a `wolf`.
- **Tick loop**: server runs on a fixed interval (e.g. 500ms). Each tick:
  1. Server sends every client a personalized `state` message with a decision deadline.
  2. Clients reply with a `decision` message (one move, or two on a wolf's "double move" tick).
  3. Server resolves all decisions simultaneously, applies eating/hiding rules, and starts the next tick.
- Missing/late decisions default to `stay`.

## 2. Tile legend (map is a 2D array of integers)

| Code | Name | Walkable | Notes |
|---|---|---|---|
| 0 | grass | yes | normal open ground |
| 1 | bush | yes | rabbits standing here are hidden from wolves (see visibility rule) |
| 2 | water | no | impassable |
| 3 | rock | no | impassable |
| 4 | clover | yes | food spot; dynamic availability tracked separately from the static terrain grid (see `cloverState`) |

## 3. Vital energy (replaces the old "life = score" model)

- Every entity (rabbit **and** wolf) has `energy`, range `0–400`, starting at `400`.
- **Every tick**, every living entity loses `-1` energy automatically (upkeep/hunger), applied once per tick after movement resolves.
- Rabbit eats clover → `energy = min(400, energy + 200)`.
- Wolf catches rabbit → `energy = min(400, energy + 200)`; the rabbit dies immediately (regardless of its own energy).
- If any entity's energy hits `0`, it **dies** — same respawn flow as a rabbit being eaten (see below). This means wolves can also starve if they don't catch rabbits.

## 4. Assumptions (flag these — tell me if any should change)

| Topic | Assumption |
|---|---|
| Wolf extra move | Every 3rd tick (`tick % 3 == 0`), wolves are allowed to submit **2** moves instead of 1, applied in sequence within that same tick. Rabbits always get 1. |
| Grass visibility | A rabbit standing on a `bush` tile is omitted from the state broadcast to wolves — **unless** that specific wolf is *also* currently standing on a `bush` tile, in which case bush-hidden rabbits become visible to that wolf for that tick. |
| Rabbit vision | Rabbits always see all wolves (no fog of war for rabbits) — only rabbit-hiding is modeled, per your spec. |
| Catching | A wolf catches a rabbit if they occupy the same tile after moves resolve (including a wolf moving onto a rabbit, or a rabbit moving onto a wolf). |
| Simultaneous move collisions | Moves are resolved simultaneously against the *pre-tick* board; a move into water/rock/off-grid is rejected (treated as `stay`) but doesn't consume the wolf's 2nd move slot. Multiple entities are allowed to occupy the same walkable tile (no entity-vs-entity blocking, only terrain blocks) — this only matters for stacking rabbits or wolves, since wolf+rabbit same-tile always triggers a catch. |
| Clover respawn | Eaten clover respawns at the same tile after a fixed cooldown (e.g. 20 ticks). |
| Death & respawn | Any entity that dies (eaten, or energy hits 0) respawns after a fixed delay (e.g. 6 ticks) at a random spawn tile for its kind, with energy reset to **400**. |
| Game lifecycle | Persistent/continuous — players can join and leave anytime; no "match end". |
| Tick rate | **1000ms during development**, intended to drop to **100ms (10/sec)** later — implemented as a single server-side constant so it's a one-line change. |
| Role assignment | No lobby, no role choice: server auto-assigns `rabbit` or `wolf` on connect to keep a roughly 1-wolf-to-3-rabbits ratio, and immediately tells the client its assigned kind. |

If any of these don't match your intent, tell me and I'll adjust.

## 5. Connection handshake (no lobby)

```
client                              server
  |--- WS connect ------------------->|
  |--- hello {displayName} ---------->|
  |<-- welcome {kind, displayName,     |   <- server decides kind, not the client
  |             playerId, map, ...} ---|
  |<-- state (tick N) -----------------|
  |--- decision -----------------------|
  ...
```
The **first thing** a client receives after `hello` is the `welcome` message, which states whether it is a `rabbit` or a `wolf`, and its (possibly server-adjusted, e.g. de-duplicated) `displayName`. The client does not choose its role.

## 6. Message formats (JSON over WebSocket)

### 6.1 Client → Server

**`hello`** — sent once, right after connecting. This is a request, not a role choice.
```json
{
  "type": "hello",
  "displayName": "Bugs"
}
```

**`decision`** — sent every tick in response to `state`.
```json
{
  "type": "decision",
  "tick": 42,
  "moves": ["moveUp"]
}
```
- `moves` is normally a 1-element array: one of `"stay" | "moveLeft" | "moveUp" | "moveDown" | "moveRight"`.
- On a wolf's double-move tick, `moves` may contain 2 elements, applied in order. Sending fewer than allowed is fine (unused moves default to `stay`); sending more is truncated.
- `tick` must match the tick the server is currently waiting on; stale/mismatched decisions are ignored (treated as `stay`).

### 6.2 Server → Client

**`welcome`** — reply to `hello`. Tells the client what it *is* — the client never requests a role.
```json
{
  "type": "welcome",
  "playerId": "p_9f3a",
  "kind": "rabbit",
  "displayName": "Bugs",
  "map": {
    "width": 24,
    "height": 18,
    "tileLegend": { "0": "grass", "1": "bush", "2": "water", "3": "rock", "4": "clover" },
    "tiles": [[0,0,1,1,2, "..."], "... 2D array of tile codes ..."]
  },
  "maxEnergy": 400,
  "tickIntervalMs": 1000,
  "you": { "id": "p_9f3a", "x": 3, "y": 5, "energy": 400 }
}
```
- The map is static and sent once; only clover *state* (eaten/available) changes afterward, delivered via `state`.

**`state`** — broadcast every tick, **personalized per client** (visibility differs for wolves vs rabbits).
```json
{
  "type": "state",
  "tick": 42,
  "movesAllowed": 1,
  "decisionDeadlineMs": 700,
  "cloverState": [ { "x": 4, "y": 2, "available": true } ],
  "entities": [
    { "id": "p_9f3a", "kind": "rabbit", "x": 3, "y": 5, "energy": 220, "self": true },
    { "id": "p_11b2", "kind": "wolf",   "x": 6, "y": 5, "energy": 180 }
  ],
  "you": { "alive": true },
  "events": [
    { "type": "cloverEaten", "by": "p_9f3a", "x": 4, "y": 2 },
    { "type": "rabbitEaten", "rabbit": "p_c001", "wolf": "p_11b2", "x": 7, "y": 5 },
    { "type": "entityStarved", "id": "p_c001", "kind": "rabbit" },
    { "type": "entityRespawned", "id": "p_c001", "kind": "rabbit", "x": 1, "y": 1 }
  ]
}
```
- `entities` is filtered server-side: a wolf's payload omits rabbits currently hidden in a bush from that wolf's point of view; a rabbit's payload always includes every wolf.
- `movesAllowed` tells the client how many moves it may submit this tick (1, or 2 for wolves on a double-move tick).
- `decisionDeadlineMs` is how long the client has to respond before the server defaults it to `stay`.
- `you.alive` lets a dead/respawning client show a "you died, respawning" state; a dead entity is omitted from other clients' `entities` lists entirely.
- `events` is a diff-style log of things that happened resolving the *previous* tick — useful for client-side animation/sound without recomputing state.

**`error`** — malformed/rejected message.
```json
{ "type": "error", "message": "unknown message type" }
```

## 7. Server tick algorithm (pseudocode)

```
every tickIntervalMs:
  tick += 1
  wolvesGetDoubleMove = (tick % 3 == 0)
  broadcast personalized `state` (movesAllowed = 2 if wolf & wolvesGetDoubleMove else 1)
  wait up to decisionDeadlineMs for `decision` messages (or all received)
  for each living entity: take received moves, pad missing with "stay"

  # resolve movement (both moves in sequence; rabbits' 2nd slot is always "stay")
  for step in [0, 1]:
      for each living entity with a move at this step:
          compute target tile from current position + direction
          if target is in-bounds and walkable (not water/rock): move entity there
          else: no-op (does not consume the other move slot)

      # resolve interactions after each step
      for each wolf position:
          if a living rabbit occupies same tile: rabbit dies, wolf.energy = min(400, energy+200),
              schedule rabbit respawn in respawnDelayTicks
      for each living rabbit position:
          if tile has available clover: clover eaten, rabbit.energy = min(400, energy+200),
              schedule clover respawn in cloverRespawnTicks

  # upkeep — once per full tick, after both movement steps
  for each living entity:
      entity.energy -= 1
      if entity.energy <= 0: entity dies (starved), schedule respawn in respawnDelayTicks

  advance respawn timers; respawn any entities/clover whose timers hit 0
  (respawned entity: energy = 400, placed at a random spawn tile for its kind)
  build events[] from everything that happened this tick
  (loop)
```

## 8. Defaults / constants (all single named constants server-side)

| Constant | Default |
|---|---|
| `TICK_INTERVAL_MS` | `1000` (drop to `100` later for 10/sec) |
| `MAX_ENERGY` | `400` |
| `EAT_GAIN` | `200` |
| `ENERGY_DECAY_PER_TICK` | `1` |
| `RESPAWN_DELAY_TICKS` | `6` |
| `CLOVER_RESPAWN_TICKS` | `20` |
| `WOLF_DOUBLE_MOVE_EVERY` | `3` |
| `DECISION_WINDOW_MS` | `~60%` of `TICK_INTERVAL_MS` |

Next: I'll build the Node.js `ws` server and a browser-based HTML5 canvas client implementing this exact protocol.
