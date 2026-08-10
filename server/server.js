'use strict';

const WebSocket = require('ws');
const map = require('./map');

// ---------------------------------------------------------------------------
// Config (single named constants -- see PROTOCOL.md section 8)
// ---------------------------------------------------------------------------
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const TICK_INTERVAL_MS = 100;       // bump to 100 later for 10 ticks/sec
const DECISION_WINDOW_MS = Math.floor(TICK_INTERVAL_MS * 0.6);
const MAX_ENERGY = 400;
const EAT_GAIN = 200;
const ENERGY_DECAY_PER_TICK = 1;
const RESPAWN_DELAY_TICKS = 6;
const CLOVER_RESPAWN_TICKS = 20;
const WOLF_DOUBLE_MOVE_EVERY = 3;
const WOLF_TO_RABBIT_TARGET_RATIO = 1 / 3; // ~1 wolf per 3 rabbits

const DIRS = {
  moveLeft: { dx: -1, dy: 0 },
  moveRight: { dx: 1, dy: 0 },
  moveUp: { dx: 0, dy: -1 },
  moveDown: { dx: 0, dy: 1 },
  stay: { dx: 0, dy: 0 },
};

// ---------------------------------------------------------------------------
// World state
// ---------------------------------------------------------------------------
let tick = 0;
let nextPlayerNum = 1;

/** @type {Map<string, Player>} */
const players = new Map();

const cloverSpots = map.findTilesOfType(map.TILE.CLOVER).map((pos) => ({
  ...pos,
  available: true,
  respawnAtTick: null,
}));

const spawnableTiles = map.findSpawnableTiles();

function randomSpawnTile() {
  return spawnableTiles[Math.floor(Math.random() * spawnableTiles.length)];
}

function makePlayerId() {
  return `p_${(nextPlayerNum++).toString(36)}`;
}

function countByKind(kind) {
  let n = 0;
  for (const p of players.values()) if (p.kind === kind) n++;
  return n;
}

function assignKind() {
  const wolves = countByKind('wolf');
  const rabbits = countByKind('rabbit');
  const total = wolves + rabbits;
  if (total === 0) return 'rabbit'; // first player in is a rabbit; wolves need prey
  const currentWolfRatio = wolves / total;
  return currentWolfRatio < WOLF_TO_RABBIT_TARGET_RATIO ? 'wolf' : 'rabbit';
}

class Player {
  constructor(ws, id, kind, displayName) {
    this.ws = ws;
    this.id = id;
    this.kind = kind; // 'rabbit' | 'wolf'
    this.displayName = displayName;
    this.energy = MAX_ENERGY;
    const spawn = randomSpawnTile();
    this.x = spawn.x;
    this.y = spawn.y;
    this.alive = true;
    this.respawnAtTick = null;
    this.pendingMoves = null; // moves array received for the current tick
    this.pendingMovesTick = -1;
    this.connected = true;
  }
}

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ---------------------------------------------------------------------------
// WebSocket wiring
// ---------------------------------------------------------------------------
const wss = new WebSocket.Server({ port: PORT });

wss.on('connection', (ws) => {
  let player = null;

  ws.on('message', (raw) => {
    let msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch {
      send(ws, { type: 'error', message: 'invalid JSON' });
      return;
    }

    if (msg.type === 'hello') {
      if (player) return; // already said hello
      const id = makePlayerId();
      const kind = assignKind();
      const displayName = sanitizeName(msg.displayName, id);
      player = new Player(ws, id, kind, displayName);
      players.set(id, player);

      send(ws, {
        type: 'welcome',
        playerId: id,
        kind,
        displayName,
        map: {
          width: map.WIDTH,
          height: map.HEIGHT,
          tileLegend: { 0: 'grass', 1: 'bush', 2: 'water', 3: 'rock', 4: 'clover' },
          tiles: map.MAP,
        },
        maxEnergy: MAX_ENERGY,
        tickIntervalMs: TICK_INTERVAL_MS,
        you: { id, x: player.x, y: player.y, energy: player.energy },
      });
      return;
    }

    if (!player) {
      send(ws, { type: 'error', message: 'send hello first' });
      return;
    }

    if (msg.type === 'decision') {
      if (typeof msg.tick !== 'number' || !Array.isArray(msg.moves)) {
        send(ws, { type: 'error', message: 'malformed decision' });
        return;
      }
      const cleaned = msg.moves
        .filter((m) => Object.prototype.hasOwnProperty.call(DIRS, m))
        .slice(0, 2);
      player.pendingMoves = cleaned;
      player.pendingMovesTick = msg.tick;
      return;
    }

    send(ws, { type: 'error', message: 'unknown message type' });
  });

  ws.on('close', () => {
    if (player) {
      players.delete(player.id);
    }
  });
});

function sanitizeName(raw, fallbackId) {
  const name = (typeof raw === 'string' ? raw : '').trim().slice(0, 24);
  if (!name) return `Player-${fallbackId}`;
  // de-duplicate against currently connected names
  const taken = new Set(Array.from(players.values()).map((p) => p.displayName));
  if (!taken.has(name)) return name;
  let n = 2;
  while (taken.has(`${name} (${n})`)) n++;
  return `${name} (${n})`;
}

// ---------------------------------------------------------------------------
// Tick loop
// ---------------------------------------------------------------------------
function movesAllowedFor(player) {
  if (player.kind === 'wolf' && tick % WOLF_DOUBLE_MOVE_EVERY === 0) return 2;
  return 1;
}

function broadcastState(movesAllowedMap, events) {
  for (const viewer of players.values()) {
    if (!viewer.connected) continue;
    const entities = [];
    for (const p of players.values()) {
      if (!p.alive) continue;
      if (viewer.kind === 'wolf' && p.kind === 'rabbit') {
        const rabbitHidden = map.isBush(p.x, p.y);
        const viewerInBush = map.isBush(viewer.x, viewer.y);
        if (rabbitHidden && !viewerInBush) continue; // stays hidden from this wolf
      }
      entities.push({
        id: p.id,
        kind: p.kind,
        x: p.x,
        y: p.y,
        energy: p.energy,
        displayName: p.displayName,
        self: p.id === viewer.id,
      });
    }

    send(viewer.ws, {
      type: 'state',
      tick,
      movesAllowed: movesAllowedMap.get(viewer.id) || 1,
      decisionDeadlineMs: DECISION_WINDOW_MS,
      cloverState: cloverSpots.map(({ x, y, available }) => ({ x, y, available })),
      entities,
      you: { alive: viewer.alive, respawnAtTick: viewer.respawnAtTick },
      events,
    });
  }
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tryMove(entity, dir) {
  const d = DIRS[dir] || DIRS.stay;
  const nx = entity.x + d.dx;
  const ny = entity.y + d.dy;
  if (map.isWalkable(nx, ny)) {
    entity.x = nx;
    entity.y = ny;
  }
  // else: no-op, doesn't consume anything extra
}

function scheduleRespawn(entity) {
  entity.alive = false;
  entity.respawnAtTick = tick + RESPAWN_DELAY_TICKS;
}

function resolveTick(movesAllowedMap) {
  const events = [];
  const living = () => Array.from(players.values()).filter((p) => p.alive);

  // -- movement, up to 2 steps --
  for (let step = 0; step < 2; step++) {
    for (const p of living()) {
      const allowed = movesAllowedMap.get(p.id) || 1;
      if (step >= allowed) continue;
      const moves = p.pendingMovesTick === tick ? p.pendingMoves : [];
      const dir = moves && moves[step] ? moves[step] : 'stay';
      tryMove(p, dir);
    }

    // catches
    for (const wolf of living().filter((p) => p.kind === 'wolf')) {
      for (const rabbit of living().filter((p) => p.kind === 'rabbit')) {
        if (rabbit.x === wolf.x && rabbit.y === wolf.y) {
          wolf.energy = Math.min(MAX_ENERGY, wolf.energy + EAT_GAIN);
          events.push({ type: 'rabbitEaten', rabbit: rabbit.id, wolf: wolf.id, x: rabbit.x, y: rabbit.y });
          scheduleRespawn(rabbit);
          events.push({ type: 'entityRespawnScheduled', id: rabbit.id, atTick: rabbit.respawnAtTick });
        }
      }
    }

    // clover
    for (const rabbit of living().filter((p) => p.kind === 'rabbit')) {
      const spot = cloverSpots.find((c) => c.x === rabbit.x && c.y === rabbit.y && c.available);
      if (spot) {
        spot.available = false;
        spot.respawnAtTick = tick + CLOVER_RESPAWN_TICKS;
        rabbit.energy = Math.min(MAX_ENERGY, rabbit.energy + EAT_GAIN);
        events.push({ type: 'cloverEaten', by: rabbit.id, x: spot.x, y: spot.y });
      }
    }
  }

  // -- upkeep: energy decay + starvation, once per full tick --
  for (const p of living()) {
    p.energy -= ENERGY_DECAY_PER_TICK;
    if (p.energy <= 0) {
      p.energy = 0;
      events.push({ type: 'entityStarved', id: p.id, kind: p.kind });
      scheduleRespawn(p);
      events.push({ type: 'entityRespawnScheduled', id: p.id, atTick: p.respawnAtTick });
    }
  }

  // -- respawns --
  for (const p of players.values()) {
    if (!p.alive && p.respawnAtTick !== null && tick >= p.respawnAtTick) {
      const spawn = randomSpawnTile();
      p.x = spawn.x;
      p.y = spawn.y;
      p.energy = MAX_ENERGY;
      p.alive = true;
      p.respawnAtTick = null;
      events.push({ type: 'entityRespawned', id: p.id, kind: p.kind, x: p.x, y: p.y });
    }
  }
  for (const c of cloverSpots) {
    if (!c.available && c.respawnAtTick !== null && tick >= c.respawnAtTick) {
      c.available = true;
      c.respawnAtTick = null;
      events.push({ type: 'cloverRespawned', x: c.x, y: c.y });
    }
  }

  // clear this tick's decisions
  for (const p of players.values()) {
    p.pendingMoves = null;
  }

  return events;
}

async function tickLoop() {
  let pendingEvents = [];
  for (;;) {
    tick += 1;

    const movesAllowedMap = new Map();
    for (const p of players.values()) movesAllowedMap.set(p.id, movesAllowedFor(p));

    broadcastState(movesAllowedMap, pendingEvents);
    await waitMs(DECISION_WINDOW_MS);

    pendingEvents = resolveTick(movesAllowedMap);

    const remaining = TICK_INTERVAL_MS - DECISION_WINDOW_MS;
    if (remaining > 0) await waitMs(remaining);
  }
}

tickLoop();

console.log(`Rabbits & Wolves server listening on ws://localhost:${PORT}`);
console.log(`Map: ${map.WIDTH}x${map.HEIGHT}, ${cloverSpots.length} clover spots, tick=${TICK_INTERVAL_MS}ms`);
