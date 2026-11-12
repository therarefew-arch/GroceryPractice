'use strict';
// Store layout: a 40x26 tile grid built in code so it's easy to rearrange.
const TILE = 32, MW = 40, MH = 26;
const WALKABLE = new Set(['.', 'r', 'f', 'o', '=', ',', 'X']);
const SHELF_DEPT = { '1': 'A1', '2': 'A2', '3': 'A3', '4': 'A4', 'H': 'HBC', 'M': 'DAI', 'F': 'FRZ' };
const GONDOLAS = [[4, '1'], [8, '2'], [12, '3'], [27, '4'], [31, 'H'], [35, 'F']];
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const MAPD = {
  grid: [], floatSpots: [], rackDept: {}, rackTile: {}, endcaps: [], registers: [], access: {}, shelfTiles: {},
  recvSpots: [], dockTiles: [], staffDoor: { x: 25, y: 3 }, vendorSpot: { x: 23, y: 3 }, frontDoor: [], backroomTiles: [],
};

function buildMap() {
  const g = MAPD.grid;
  for (let y = 0; y < MH; y++) g.push(new Array(MW).fill('~'));
  for (let y = 2; y <= 24; y++) for (let x = 0; x < MW; x++) {
    const edge = y === 2 || y === 10 || y === 24 || x === 0 || x === MW - 1;
    g[y][x] = edge ? '#' : (y < 10 ? '.' : ',');
  }
  // Backroom: dock doors, staff/DSD door, receiving, floats, backstock racks, office
  for (let x = 2; x <= 5; x++) { g[2][x] = 'D'; MAPD.dockTiles.push({ x, y: 3 }); }
  g[2][25] = 'v';
  for (let y = 4; y <= 8; y++) for (let x = 1; x <= 8; x++) g[y][x] = 'r';
  for (const y of [4, 6, 8]) for (const x of [1, 3, 5, 7]) MAPD.recvSpots.push({ x, y });
  for (const y of [5, 7]) for (const x of [2, 4, 6, 8]) MAPD.recvSpots.push({ x, y });
  DEPTS.forEach((d, i) => { const x = 11 + i * 2, y = 5; g[y][x] = 'f'; MAPD.floatSpots.push({ x, y, dept: d.id }); });
  DEPTS.forEach((d, i) => { const x = 27 + i, y = 3; g[y][x] = 'b'; MAPD.rackDept[x + ',' + y] = d.id; MAPD.rackTile[d.id] = { x, y }; });
  for (let y = 3; y <= 9; y++) { g[y][34] = '#'; for (let x = 35; x <= 38; x++) g[y][x] = 'o'; }
  g[6][34] = 'o';
  g[3][36] = 'C'; g[3][37] = 'C';
  for (let x = 18; x <= 21; x++) g[10][x] = '=';
  // Sales floor
  for (const [gx, ch] of GONDOLAS) {
    for (let y = 13; y <= 19; y++) g[y][gx] = ch;
    g[12][gx] = 'E'; g[20][gx] = 'E';
    MAPD.endcaps.push({ id: gx + ',12', x: gx, y: 12, gondola: ch, end: 'Back' }, { id: gx + ',20', x: gx, y: 20, gondola: ch, end: 'Front' });
  }
  for (let y = 12; y <= 21; y++) g[y][38] = 'M';
  for (const x of [9, 13, 25, 29]) { g[22][x] = 'R'; MAPD.registers.push({ x, y: 23 }); }
  for (let x = 18; x <= 21; x++) { g[24][x] = 'X'; MAPD.frontDoor.push({ x, y: 24 }); }

  for (let y = 0; y < MH; y++) for (let x = 0; x < MW; x++) {
    const dept = SHELF_DEPT[g[y][x]];
    if (!dept) continue;
    (MAPD.shelfTiles[dept] = MAPD.shelfTiles[dept] || []).push({ x, y });
    const acc = (MAPD.access[dept] = MAPD.access[dept] || []);
    for (const [dx, dy] of DIRS) {
      const nx = x + dx, ny = y + dy;
      if (walkable(nx, ny) && !acc.some(a => a.x === nx && a.y === ny)) acc.push({ x: nx, y: ny });
    }
  }
  if (typeof setupBackroom === 'function') setupBackroom();
  for (let y = 3; y <= 9; y++) for (let x = 9; x <= 24; x++) if (walkable(x, y)) MAPD.backroomTiles.push({ x, y });
}

function walkable(x, y) {
  return y >= 0 && y < MH && x >= 0 && x < MW && WALKABLE.has(MAPD.grid[y][x]);
}

// Breadth-first search on the tile grid. Returns tiles after the start, ending on a goal tile.
function bfs(sx, sy, isGoal) {
  if (isGoal(sx, sy)) return [];
  const prev = new Int32Array(MW * MH).fill(-1);
  const start = sy * MW + sx;
  prev[start] = start;
  const q = [start];
  let qi = 0;
  while (qi < q.length) {
    const c = q[qi++], cx = c % MW, cy = (c / MW) | 0;
    for (const [dx, dy] of DIRS) {
      const nx = cx + dx, ny = cy + dy;
      if (!walkable(nx, ny)) continue;
      const ni = ny * MW + nx;
      if (prev[ni] !== -1) continue;
      prev[ni] = c;
      if (isGoal(nx, ny)) {
        const path = [];
        let k = ni;
        while (k !== start) { path.push({ x: k % MW, y: (k / MW) | 0 }); k = prev[k]; }
        return path.reverse();
      }
      q.push(ni);
    }
  }
  return null;
}

function pathToTiles(from, tiles) {
  const set = new Set(tiles.map(t => t.x + ',' + t.y));
  return bfs(Math.floor(from.x), Math.floor(from.y), (x, y) => set.has(x + ',' + y));
}

function tilesAround(pt, r) {
  const cx = Math.floor(pt.x), cy = Math.floor(pt.y), out = [];
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) if (walkable(cx + dx, cy + dy)) out.push({ x: cx + dx, y: cy + dy });
  return out;
}

function rackAccess(dept) { const t = MAPD.rackTile[dept]; return { x: t.x, y: t.y + 1 }; }
