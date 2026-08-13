'use strict';

// Tile legend
const TILE = {
  GRASS: 0,   // walkable, open ground
  BUSH: 1,    // walkable, hides rabbits from wolves (unless wolf also on a bush)
  WATER: 2,   // unwalkable
  ROCK: 3,    // unwalkable
  CLOVER: 4,  // walkable, food spot (dynamic availability tracked separately)
  beartrap: 5,
  rabbithole: 6, 
};

const TILE_NAME = {
  [TILE.GRASS]: 'grass',
  [TILE.BUSH]: 'bush',
  [TILE.WATER]: 'water',
  [TILE.ROCK]: 'rock',
  [TILE.CLOVER]: 'clover',
  [TILE.beartrap]: "beartrap",
  [TILE.rabbithole]: 'rabbithole'
};

// 20 columns x 14 rows. Border of rock, a pond, a couple of bush thickets,
// scattered clover. Feel free to hand-author a different layout later --
// the server only cares about tile codes, not how they were produced.
const RAW_MAP = [
  "333333333333333333333333333333",
  "300111000001111000001110000043",
  "306011102201110000011111060003",
  "300001122220000000111111100003",
  "311000022220004001111100110003",
  "311100002200000011110000011003",
  "311110000000000111100000011103",
  "301111000004001111000050001103",
  "300111100000011100000000000003",
  "300011110000111000022200000003",
  "340001111001110002222220040003",
  "300000111111100022222222000003",
  "305000011111000022222222000003",
  "300000001110000002222200000503",
  "300400000100040000220000000003",
  "300000000000000000000000004003",
  "306000000000000040000000000003",
  "300002220000000000001110000003",
  "300022222000400000111111000003",
  "300222222200000001111111100403",
  "300222222200000011111111110003",
  "300022222000000111111111110003",
  "340002220000001111111111110003",
  "300000000000011111111111100003",
  "305000000000111111111111000603",
  "300040004001111111111110000003",
  "300000000011111111111000040003",
  "304000000111111111100000000403",
  "340000001111111100000400000043",
  "333333333333333333333333333333"
];


function parseMap(rows) {
  return rows.map((row) => row.split('').map((ch) => parseInt(ch, 10)));
}

const MAP = parseMap(RAW_MAP);
const HEIGHT = MAP.length;
const WIDTH = MAP[0].length;

function inBounds(x, y) {
  return x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
}

function tileAt(x, y) {
  return MAP[y][x];
}

function isWalkable(x, y) {
  if (!inBounds(x, y)) return false;
  const t = tileAt(x, y);
  return t !== TILE.WATER && t !== TILE.ROCK;
}

function isBush(x, y) {
  return inBounds(x, y) && tileAt(x, y) === TILE.BUSH;
}

function findTilesOfType(type) {
  const out = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (MAP[y][x] === type) out.push({ x, y });
    }
  }
  return out;
}

// Any walkable, non-clover tile is a valid generic spawn point.
function findSpawnableTiles() {
  const out = [];
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      if (isWalkable(x, y) && MAP[y][x] !== TILE.CLOVER) out.push({ x, y });
    }
  }
  return out;
}

module.exports = {
  TILE,
  TILE_NAME,
  MAP,
  WIDTH,
  HEIGHT,
  inBounds,
  tileAt,
  isWalkable,
  isBush,
  findTilesOfType,
  findSpawnableTiles,
};
