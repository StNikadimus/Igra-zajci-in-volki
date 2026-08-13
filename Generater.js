// Procedural or fixed generator output for a 30x30 map with strict entity limits
const MAP_WIDTH = 30;
const MAP_HEIGHT = 30;


function generateMap() {
  // Initialize empty grid
  const grid = Array.from({ length: MAP_HEIGHT }, () => Array(MAP_WIDTH).fill(TILE.GRASS));

  // 1. Rock Border (30x30 outer boundary = 116 ROCK tiles)
  for (let x = 0; x < MAP_WIDTH; x++) {
    grid[0][x] = TILE.ROCK;
    grid[MAP_HEIGHT - 1][x] = TILE.ROCK;
  }
  for (let y = 0; y < MAP_HEIGHT; y++) {
    grid[y][0] = TILE.ROCK;
    grid[y][MAP_WIDTH - 1] = TILE.ROCK;
  }

  // Helper to place specific counts of tiles on remaining open GRASS spots
  function placeTiles(tileType, count) {
    let placed = 0;
    while (placed < count) {
      const rx = Math.floor(Math.random() * (MAP_WIDTH - 2)) + 1;
      const ry = Math.floor(Math.random() * (MAP_HEIGHT - 2)) + 1;
      if (grid[ry][rx] === TILE.GRASS) {
        grid[ry][rx] = tileType;
        placed++;
      }
    }
  }

  // 2. Lakes (Water clusters)
  const lakeCenters = [{ x: 8, y: 8 }, { x: 20, y: 20 }, { x: 8, y: 22 }];
  lakeCenters.forEach(center => {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const nx = center.x + dx;
        const ny = center.y + dy;
        if (nx > 0 && nx < MAP_WIDTH - 1 && ny > 0 && ny < MAP_HEIGHT - 1) {
          if (Math.abs(dx) + Math.abs(dy) <= 3) {
            grid[ny][nx] = TILE.WATER;
          }
        }
      }
    }
  });

  // 3. Exact Limited Entity Placement
  placeTiles(TILE.rabbithole, 4);  // Exactly 4
  placeTiles(TILE.CLOVER, 20);      // Exactly 20
  placeTiles(TILE.BUSH, 150);      // Exactly 150
  placeTiles(TILE.beartrap, 8);    // Optional traps on open ground

  return grid;
}

const map = generateMap();