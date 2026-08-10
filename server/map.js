'use strict';

// Tile legend
const TILE = {
  GRASS: 0,   // walkable, open ground
  BUSH: 1,    // walkable, hides rabbits from wolves (unless wolf also on a bush)
  WATER: 2,   // unwalkable
  ROCK: 3,    // unwalkable
  CLOVER: 4,  // walkable, food spot (dynamic availability tracked separately)
};

const TILE_NAME = {
  [TILE.GRASS]: 'grass',
  [TILE.BUSH]: 'bush',
  [TILE.WATER]: 'water',
  [TILE.ROCK]: 'rock',
  [TILE.CLOVER]: 'clover',
};

// 20 columns x 14 rows. Border of rock, a pond, a couple of bush thickets,
// scattered clover. Feel free to hand-author a different layout later --
// the server only cares about tile codes, not how they were produced.
const RAW_MAP = [
  '33333333333333333333333333333333333333',
  '30000000000000022222222000000000022223',
  '30110000000004002222200004000004000223',
  '30110000000000002222000000000000000003',
  '30200000000000022220000000000000400003',
  '32200000000000002200000000000000000003',
  '32040000000000000000000000000200000003',
  '30000000002220000000000000002200000003',
  '30000004000220040000000004022100000003',
  '30040000000000000001100000022100000003',
  '30000111000000000001100000022100000003',
  '30000111200000004000000000022100000003',
  '30040112220000000000004000022100111003',
  '30000000022000000000000000002200111003',
  '30000004000000000000000000000200111003',
  '30000000000000300000000000000000000003',
  '30000000000003302000000000000000400013',
  '31100000000033102200000000000000000113',
  '31111000000333322220000000000000001113',
  '33333333333333333333333333333333333333',
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
