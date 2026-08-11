'use strict';

const TILE_COLORS = {
  0: getCssVar('--grass'),
  1: getCssVar('--bush'),
  2: getCssVar('--water'),
  3: getCssVar('--rock'),
  4: getCssVar('--grass'), // clover sits on grass; the clover icon is drawn on top
};

function getCssVar(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const KEY_TO_MOVE = {
  ArrowUp: 'moveUp', w: 'moveUp', W: 'moveUp',
  ArrowDown: 'moveDown', s: 'moveDown', S: 'moveDown',
  ArrowLeft: 'moveLeft', a: 'moveLeft', A: 'moveLeft',
  ArrowRight: 'moveRight', d: 'moveRight', D: 'moveRight',
};

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const hName = document.getElementById('hName');
const hKind = document.getElementById('hKind');
const hTick = document.getElementById('hTick');
const hEnergy = document.getElementById('hEnergy');
const hAlive = document.getElementById('hAlive');
const hMovesAllowed = document.getElementById('hMovesAllowed');
const energyBarInner = document.getElementById('energyBarInner');
const logEl = document.getElementById('log');

let ws = null;
let world = null;        // { width, height, tiles, tileSize }
let me = { id: null, kind: null, displayName: null };
let latestState = null;  // last `state` message
let moveQueue = [];      // queued directions from keypresses, consumed as ticks demand them
let tileSize = 30;
let img_trava = document.createElement("img");
img_trava.src = "images/Grass.png"
let img_bush = document.createElement("img");
img_bush.src = "images/Bush.png"
let image_water = document.createElement("img");
image_water.src = "images/water.png"; 

let image_stone = document.createElement("img");
image_stone.src = "images/stone.png"; 

let image_travazrozam = document.createElement("img");
image_travazrozam.src = "images/grasswithflowers.png";

let image_trava1 = document.createElement("img");
image_trava1.src = "images/Grass1.png";
let image_trava2 = document.createElement("img");
image_trava2.src = "images/Grass2.png";
let image_trava3 = document.createElement("img");
image_trava3.src = "images/Grass3.png";  
let image_voda = document.createElement("img");
image_voda.src = "images/voda.png"; 
let image_voda1 = document.createElement("img");
image_voda1.src = "images/voda1.png";
let image_voda2 = document.createElement("img");
image_voda2.src = "images/voda2.png";
let image_voda3 = document.createElement("img");
image_voda3.src = "images/voda3.png";
let image_voda4 = document.createElement("img");
image_voda4.src = "images/voda4.png";



let vrsta_trave = [img_trava, image_trava1, image_trava2, image_trava3];
let vrsta_vode = [image_voda, image_water, image_voda1, image_voda2, image_voda3, image_voda4]
let images = {
  0: img_trava,
  1: img_bush,
  2: image_voda,
  3: image_stone,
  4: image_travazrozam,
}



document.getElementById('connectBtn').addEventListener('click', connect);

function connect() {
  const name = document.getElementById('nameInput').value || 'Player';
  const url = document.getElementById('urlInput').value || 'ws://localhost:8080';

  ws = new WebSocket(url);
  ws.addEventListener('open', () => {
    statusEl.textContent = 'connected — saying hello…';
    ws.send(JSON.stringify({ type: 'hello', displayName: name }));
  });
  ws.addEventListener('message', onMessage);
  ws.addEventListener('close', () => { statusEl.textContent = 'disconnected'; });
  ws.addEventListener('error', () => { statusEl.textContent = 'connection error'; });
}

function onMessage(evt) {
  const msg = JSON.parse(evt.data);
  if (msg.type === 'welcome') {
    me = { id: msg.playerId, kind: msg.kind, displayName: msg.displayName };
    world = {
      width: msg.map.width,
      height: msg.map.height,
      tiles: msg.map.tiles,
      maxEnergy: msg.maxEnergy,
    };
    tileSize = Math.min(
      Math.floor(canvas.width / world.width),
      Math.floor(canvas.height / world.height)
    );
    canvas.width = tileSize * world.width;
    canvas.height = tileSize * world.height;

    hName.textContent = me.displayName;
    hKind.textContent = me.kind;
    statusEl.textContent = `playing as ${me.kind}`;
    return;
  }

  if (msg.type === 'state') {
    latestState = msg;
    handleStateTick(msg);
    render(msg);
    return;
  }

  if (msg.type === 'error') {
    console.warn('server error:', msg.message);
  }
}

// Called once per incoming `state`: pull up to `movesAllowed` queued moves
// and immediately reply with a `decision` for this tick.
function handleStateTick(msg) {
  const allowed = msg.movesAllowed || 1;
  const moves = [];
  for (let i = 0; i < allowed; i++) {
    moves.push(moveQueue.length ? moveQueue.shift() : 'stay');
  }
  ws.send(JSON.stringify({ type: 'decision', tick: msg.tick, moves }));

  hMovesAllowed.textContent = allowed;
  hAlive.textContent = msg.you.alive ? 'alive' : `dead (respawning at tick ${msg.you.respawnAtTick})`;

  const self = msg.entities.find((e) => e.self);
  if (self) {
    hEnergy.textContent = `${self.energy} / ${world.maxEnergy}`;
    energyBarInner.style.width = `${Math.max(0, (self.energy / world.maxEnergy) * 100)}%`;
  }
}


function shortId(id) {
  return id ? id.slice(-4) : '????';
}

window.addEventListener('keydown', (e) => {
  const move = KEY_TO_MOVE[e.key];
  if (!move) return;
  e.preventDefault();
  // keep the queue small so input doesn't pile up across many ticks
  if (moveQueue.length < 2) moveQueue.push(move);
});

function render(msg) {
  if (!world) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // terrain
  for (let y = 0; y < world.height; y++) {
    for (let x = 0; x < world.width; x++) {
      const t = world.tiles[y][x];
      ctx.fillStyle = TILE_COLORS[t] || '#000';
      ctx.fillRect(x * tileSize, y * tileSize, tileSize, tileSize);

      ctx.drawImage(getTileImage(t), x * tileSize, y * tileSize, tileSize, tileSize);

      /*
      if(t==2){
        ctx.drawImage(image_voda, x * tileSize, y * tileSize, tileSize, tileSize);
      }
        */
    }
  }

  // clover markers
  for (const c of msg.cloverState || []) {
    if (!c.available) continue;
    ctx.fillStyle = getCssVar('--clover');
    const cx = c.x * tileSize + tileSize / 2;
    const cy = c.y * tileSize + tileSize / 2;
    ctx.beginPath();
    ctx.arc(cx, cy, tileSize * 0.18, 0, Math.PI * 2);
    ctx.fill();
  }

  // grid lines (subtle)
  ctx.strokeStyle = 'rgba(0,0,0,0.08)';
  for (let x = 0; x <= world.width; x++) {
    ctx.beginPath(); ctx.moveTo(x * tileSize, 0); ctx.lineTo(x * tileSize, canvas.height); ctx.stroke();
  }
  for (let y = 0; y <= world.height; y++) {
    ctx.beginPath(); ctx.moveTo(0, y * tileSize); ctx.lineTo(canvas.width, y * tileSize); ctx.stroke();
  }

  // entities
  for (const e of msg.entities) {
    const cx = e.x * tileSize + tileSize / 2;
    const cy = e.y * tileSize + tileSize / 2;
    ctx.fillStyle = e.kind === 'wolf' ? getCssVar('--wolf') : getCssVar('--rabbit');
    ctx.beginPath();
    ctx.arc(cx, cy, tileSize * 0.32, 0, Math.PI * 2);
    ctx.fill();

    if (e.self) {
      ctx.strokeStyle = 'rgba(255, 211, 122, 0)';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // energy pip
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = `${Math.floor(tileSize * 1.75)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(e.kind === 'wolf' ? '🐺' : '🐰', cx, cy + tileSize * 0.11);
  }
}

function getTileImage(tile){
  if(tile == 2)
    return vrsta_vode[Math.floor(Math.random()*vrsta_vode.length)];
  
  return images[tile];

}