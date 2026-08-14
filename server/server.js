'use strict';

const WebSocket = require('ws');
const mapModule = require('./map');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080;
const TICK_INTERVAL_MS = 100;
const DECISION_WINDOW_MS = Math.floor(TICK_INTERVAL_MS * 0.6);
const MAX_ENERGY = 400;
const EAT_GAIN = 200;
const ENERGY_DECAY_PER_TICK = 1;
const RESPAWN_DELAY_TICKS = 50;
const CLOVER_RESPAWN_TICKS = 200;
const WOLF_DOUBLE_MOVE_EVERY = 3;
const WOLF_TO_RABBIT_TARGET_RATIO = 1 / 3; // ~1 wolf per 3 rabbits

const DIRS = {
  moveLeft: { dx: -1, dy: 0 },
  moveRight: { dx: 1, dy: 0 },
  moveUp: { dx: 0, dy: -1 },
  moveDown: { dx: 0, dy: 1 },
  stay: { dx: 0, dy: 0 },
};

let nextPlayerNum = 1;

function makePlayerId() {
  return `p_${(nextPlayerNum++).toString(36)}`;
}

class Player {
  constructor(ws, id, kind, displayName, room) {
    this.ws = ws;
    this.id = id;
    this.kind = kind; // 'rabbit' | 'wolf'
    this.displayName = displayName;
    this.energy = MAX_ENERGY;
    this.room = room;
    const spawn = room.randomSpawnTile();
    this.x = spawn.x;
    this.y = spawn.y;
    this.alive = true;
    this.respawnAtTick = null;
    this.pendingMoves = null; // moves array received for the current tick
    this.pendingMovesTick = -1;
    this.connected = true;
    this.stuckUntilTick = null;
    this.trapCooldownUntilTick = null;
    this.holeCooldownUntilTick = null;
  }
}

function send(ws, msg) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

// ---------------------------------------------------------------------------
// Room class - Vsaka mapa ima svojo izolirano sobo
// ---------------------------------------------------------------------------
class Room {
  constructor(mapName) {
    this.mapName = mapName;
    this.mapData = mapModule.getMapData(mapName);
    this.cloverSpots = this.mapData.findTilesOfType(mapModule.TILE.CLOVER).map((pos) => ({
      ...pos,
      available: true,
      respawnAtTick: null,
    }));
    this.rabbitHoles = this.mapData.findTilesOfType(mapModule.TILE.rabbithole);
    this.spawnableTiles = this.mapData.findSpawnableTiles();
    this.players = new Map();
    this.tick = 0;
    this.lastEvents = [];
  }

  randomSpawnTile() {
    if (this.spawnableTiles.length === 0) return { x: 1, y: 1 };
    return this.spawnableTiles[Math.floor(Math.random() * this.spawnableTiles.length)];
  }

  countByKind(kind) {
    let n = 0;
    for (const p of this.players.values()) if (p.kind === kind) n++;
    return n;
  }

  assignKind() {
    const wolves = this.countByKind('wolf');
    const rabbits = this.countByKind('rabbit');
    const total = wolves + rabbits;
    if (total === 0) return 'rabbit'; // Prvi igralec je zajec
    const currentWolfRatio = wolves / total;
    return currentWolfRatio < WOLF_TO_RABBIT_TARGET_RATIO ? 'wolf' : 'rabbit';
  }

  sanitizeName(raw, fallbackId) {
    const name = (typeof raw === 'string' ? raw : '').trim().slice(0, 24);
    if (!name) return `Player-${fallbackId}`;
    const taken = new Set(Array.from(this.players.values()).map((p) => p.displayName));
    if (!taken.has(name)) return name;
    let n = 2;
    while (taken.has(`${name} (${n})`)) n++;
    return `${name} (${n})`;
  }

  movesAllowedFor(player) {
    if (player.kind === 'wolf' && this.tick % WOLF_DOUBLE_MOVE_EVERY === 0) return 2;
    return 1;
  }

  tryMove(entity, dir) {
    const d = DIRS[dir] || DIRS.stay;
    const nx = entity.x + d.dx;
    const ny = entity.y + d.dy;
    if (this.mapData.isWalkable(nx, ny)) {
      entity.x = nx;
      entity.y = ny;
    }
  }

  scheduleRespawn(entity) {
    entity.alive = false;
    entity.respawnAtTick = this.tick + RESPAWN_DELAY_TICKS;
  }

  broadcastState(movesAllowedMap, events) {
    for (const viewer of this.players.values()) {
      if (!viewer.connected) continue;
      const entities = [];
      for (const p of this.players.values()) {
        if (!p.alive) continue;
        if (viewer.kind === 'wolf' && p.kind === 'rabbit') {
          const rabbitHidden = this.mapData.isBush(p.x, p.y);
          const viewerInBush = this.mapData.isBush(viewer.x, viewer.y);
          if (rabbitHidden && !viewerInBush) continue;
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
        tick: this.tick,
        movesAllowed: movesAllowedMap.get(viewer.id) || 1,
        decisionDeadlineMs: DECISION_WINDOW_MS,
        cloverState: this.cloverSpots.map(({ x, y, available }) => ({ x, y, available })),
        entities,
        you: { alive: viewer.alive, respawnAtTick: viewer.respawnAtTick },
        events,
      });
    }
  }

  resolveTick(movesAllowedMap) {
    const events = [];
    const living = () => Array.from(this.players.values()).filter((p) => p.alive);

    // -- movement --
    for (let step = 0; step < 2; step++) {
      for (const p of living()) {
        const allowed = movesAllowedMap.get(p.id) || 1;
        if (step >= allowed) continue;

        if (p.stuckUntilTick && p.stuckUntilTick > this.tick) {
          continue;
        }

        const moves = p.pendingMovesTick === this.tick ? p.pendingMoves : [];
        const dir = moves && moves[step] ? moves[step] : 'stay';
        this.tryMove(p, dir);
      }

      // catches
      for (const wolf of living().filter((p) => p.kind === 'wolf')) {
        for (const rabbit of living().filter((p) => p.kind === 'rabbit')) {
          if (rabbit.x === wolf.x && rabbit.y === wolf.y) {
            wolf.energy = Math.min(MAX_ENERGY, wolf.energy + EAT_GAIN);
            events.push({ type: 'rabbitEaten', rabbit: rabbit.id, wolf: wolf.id, x: rabbit.x, y: rabbit.y });
            this.scheduleRespawn(rabbit);
            events.push({ type: 'entityRespawnScheduled', id: rabbit.id, atTick: rabbit.respawnAtTick });
          }
        }
      }

// rabbit hole teleport (samo za zajce)
      for (const p of living().filter((p) => p.kind === 'rabbit')) {
        const onHole = this.rabbitHoles.some((h) => h.x === p.x && h.y === p.y);
        const cooldownActive = p.holeCooldownUntilTick && p.holeCooldownUntilTick > this.tick;
        if (onHole && !cooldownActive) {
          const others = this.rabbitHoles.filter((h) => !(h.x === p.x && h.y === p.y));
          if (others.length > 0) {
            const dest = others[Math.floor(Math.random() * others.length)];
            p.x = dest.x;
            p.y = dest.y;
            p.holeCooldownUntilTick = this.tick + 100;
            events.push({ type: 'teleported', id: p.id, x: p.x, y: p.y });
          }
        }
      }

      // clover
      for (const rabbit of living().filter((p) => p.kind === 'rabbit')) {
        const spot = this.cloverSpots.find((c) => c.x === rabbit.x && c.y === rabbit.y && c.available);
        if (spot) {
          spot.available = false;
          spot.respawnAtTick = this.tick + CLOVER_RESPAWN_TICKS;
          rabbit.energy = Math.min(MAX_ENERGY, rabbit.energy + EAT_GAIN);
          events.push({ type: 'cloverEaten', by: rabbit.id, x: spot.x, y: spot.y });
        }
      }

      // bear trap
      for (const p of living()) {
        const onTrap = this.mapData.tileAt(p.x, p.y) === mapModule.TILE.beartrap;
        const cooldownActive = p.trapCooldownUntilTick && p.trapCooldownUntilTick > this.tick;
        if (onTrap && !cooldownActive) {
          p.stuckUntilTick = this.tick + 15;
          p.trapCooldownUntilTick = this.tick + 15;
          events.push({ type: 'trapped', id: p.id, until: p.stuckUntilTick });
        }
      }
    }

    // -- upkeep: energy decay + starvation --
    for (const p of living()) {
      p.energy -= ENERGY_DECAY_PER_TICK;
      if (p.energy <= 0) {
        p.energy = 0;
        events.push({ type: 'entityStarved', id: p.id, kind: p.kind });
        this.scheduleRespawn(p);
        events.push({ type: 'entityRespawnScheduled', id: p.id, atTick: p.respawnAtTick });
      }
    }

    // -- respawns --
    for (const p of this.players.values()) {
      if (!p.alive && p.respawnAtTick !== null && this.tick >= p.respawnAtTick) {
        const spawn = this.randomSpawnTile();
        p.x = spawn.x;
        p.y = spawn.y;
        p.energy = MAX_ENERGY;
        p.alive = true;
        p.respawnAtTick = null;
        events.push({ type: 'entityRespawned', id: p.id, kind: p.kind, x: p.x, y: p.y });
      }
    }

    for (const c of this.cloverSpots) {
      if (!c.available && c.respawnAtTick !== null && this.tick >= c.respawnAtTick) {
        c.available = true;
        c.respawnAtTick = null;
        events.push({ type: 'cloverRespawned', x: c.x, y: c.y });
      }
    }

    for (const p of this.players.values()) {
      p.pendingMoves = null;
    }

    return events;
  }

  processTickPhase1() {
    this.tick += 1;
    const movesAllowedMap = new Map();
    for (const p of this.players.values()) {
      movesAllowedMap.set(p.id, this.movesAllowedFor(p));
    }
    this.broadcastState(movesAllowedMap, this.lastEvents);
    return movesAllowedMap;
  }

  processTickPhase2(movesAllowedMap) {
    this.lastEvents = this.resolveTick(movesAllowedMap);
  }
}

// ---------------------------------------------------------------------------
// Upravljanje sob na strežniku
// ---------------------------------------------------------------------------
const rooms = new Map();

function getOrCreateRoom(mapName) {
  const validMap = mapModule.RAW_MAPS[mapName] ? mapName : 'default';
  if (!rooms.has(validMap)) {
    rooms.set(validMap, new Room(validMap));
  }
  return rooms.get(validMap);
}

// Inicializiramo VSE sobe vnaprej (za vsak zemljevid iz map.js),
// da se med tickom nikoli ne doda nova soba "na sredi" (glej tickLoop).
for (const mapName of Object.keys(mapModule.RAW_MAPS)) {
  getOrCreateRoom(mapName);
}

// ---------------------------------------------------------------------------
// WebSocket wiring
// ---------------------------------------------------------------------------
const wss = new WebSocket.Server({ host: "0.0.0.0", port: PORT });

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
      if (player) return; // Igra že poteka za ta socket

      const requestedMap = msg.requestedMap || 'default';
      const room = getOrCreateRoom(requestedMap);

      const id = makePlayerId();
      const kind = room.assignKind();
      const displayName = room.sanitizeName(msg.displayName, id);
      
      player = new Player(ws, id, kind, displayName, room);
      room.players.set(id, player);

      send(ws, {
        type: 'welcome',
        playerId: id,
        kind,
        displayName,
        map: {
          width: room.mapData.width,
          height: room.mapData.height,
          tileLegend: { 0: 'grass', 1: 'bush', 2: 'water', 3: 'rock', 4: 'clover' },
          tiles: room.mapData.map,
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
    if (player && player.room) {
      player.room.players.delete(player.id);
    }
  });
});

// ---------------------------------------------------------------------------
// Tick Loop za vse sobe
// ---------------------------------------------------------------------------
function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function tickLoop() {
  for (;;) {
    const roomMovesMap = new Map();

    // 1. Faza: pošlji stanje vsem igralcem v vseh sobah
    for (const room of rooms.values()) {
      const movesAllowedMap = room.processTickPhase1();
      roomMovesMap.set(room, movesAllowedMap);
    }

    await waitMs(DECISION_WINDOW_MS);

    // 2. Faza: izvedi premike in obdelaj logiko za vsako sobo ločeno
    for (const room of rooms.values()) {
      const movesAllowedMap = roomMovesMap.get(room);
      if (!movesAllowedMap) continue; // varnostna mreža, če bi se soba vseeno pojavila med tickom
      room.processTickPhase2(movesAllowedMap);
    }

    const remaining = TICK_INTERVAL_MS - DECISION_WINDOW_MS;
    if (remaining > 0) await waitMs(remaining);
  }
}

tickLoop();

console.log(`Rabbits & Wolves server listening on ws://localhost:${PORT}`);