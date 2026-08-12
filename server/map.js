'use strict';

// Tile legend
const TILE = {
  GRASS: 0,   // walkable, open ground
  BUSH: 1,    // walkable, hides rabbits from wolves (unless wolf also on a bush)
  WATER: 2,   // unwalkable
  ROCK: 3,    // unwalkable
  CLOVER: 4,  // walkable, food spot (dynamic availability tracked separately)
  beartrap: 5, 
};

const TILE_NAME = {
  [TILE.GRASS]: 'grass',
  [TILE.BUSH]: 'bush',
  [TILE.WATER]: 'water',
  [TILE.ROCK]: 'rock',
  [TILE.CLOVER]: 'clover',
  [TILE.beartrap]: "beartrap"
};

// 20 columns x 14 rows. Border of rock, a pond, a couple of bush thickets,
// scattered clover. Feel free to hand-author a different layout later --
// the server only cares about tile codes, not how they were produced.
const RAW_MAP = [
  '33333333333333333333333333333333333333333333333',
  '30000000000000002222222200000000000000000022223',
  '30110000000004000222220000400001000000004000223',
  '30110000000000000222200000000011100000000000003',
  '30200000050000002222000000000001000000000400003',
  '32200000000000000220000000000000000000000000003',
  '32040000000000000000000100000020000000000500003',
  '30000000002220000000000000000220000000040000003',
  '30000004000220004000050000402210000000000000003',
  '30040000002200000000110000002210000000000000003',
  '30000111002200000000110000002210000000000000003',
  '30000111202000000400000000002210000000000010003',
  '30040112220000000000000400002210011100000040003',
  '30000000022000000000000000000220011100000000003',
  '30000004000000000000050000000020011100000000003',
  '30000000000000000000001000000000000000000000003',
  '30000000000000000000000000000000000000000000003',
  '30000000000004000000000000000010000004000000003',
  '30000000500000000000000000000000000022200000003',
  '30000000000000000000222000000000000000000000003',
  '30000000000010000000220000000000000100000000003',
  '30000000004000000000000000000000000000500000003',
  '30000500000000000000000000500040000000000540003',
  '30000000000000000004000000020000000000000000003',
  '30000010000000300000000000000000000000000000003',
  '30000000050003302000000000010000040000000000013',
  '31100000000033102200000000000000000000000000113',
  '31111000000333322220000000000000400000000001113',
  '33333333333333333333333333333333333333333333333',
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
