'use strict';

const ROOM = { halfWidth: 3.8, halfDepth: 3.2, height: 2.9 };
const HOME = { x: 0.05, z: 2.9, yaw: 0, pitch: -0.14 };
const AXES = { x: 0, y: 1, z: 2 };

function face(origin, acrossAxis, alongAxis, width, height, color, style = 0) {
  const uAxis = AXES[acrossAxis];
  const vAxis = AXES[alongAxis];
  const across = [0, 0, 0];
  const along = [0, 0, 0];
  across[uAxis] = width;
  along[vAxis] = height;
  return { origin, across, along, uAxis, vAxis, normalAxis: 3 - uAxis - vAxis, width, height, color: rgb(color), style };
}

function rgb(color) {
  return [16, 8, 0].map(shift => ((color >> shift) & 255) / 255);
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a, b) {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function facet(origin, across, along, color, { style = 0, triangle = false } = {}) {
  const normal = cross(across, along);
  const size = dot(normal, normal);
  // Project intersections into the facet's unit square, including skewed cap triangles.
  const u = cross(along, normal).map(value => value / size);
  const v = cross(normal, across).map(value => value / size);
  return {
    origin, across, along, width: Math.hypot(...across), height: Math.hypot(...along), color: rgb(color),
    style, triangle, plane: { normal, u, v },
  };
}

function intersectFacet(surface, eye, direction) {
  const { normal, u, v } = surface.plane;
  const facing = dot(direction, normal);
  if (Math.abs(facing) < 0.000001) return null;
  const fromOrigin = eye.map((value, axis) => value - surface.origin[axis]);
  const distance = -dot(fromOrigin, normal) / facing;
  if (distance <= 0) return null;
  const offset = fromOrigin.map((value, axis) => value + direction[axis] * distance);
  const s = dot(offset, u);
  const t = dot(offset, v);
  return s >= 0 && t >= 0 && s <= 1 && t <= 1 && (!surface.triangle || s + t <= 1)
    ? distance : null;
}

function box({ x, y, z, width, height, depth }, colors, frontStyle = 0) {
  return {
    top: face([x, y + height, z], 'x', 'z', width, depth, colors[0]),
    front: face([x, y, z + depth], 'x', 'y', width, height, colors[1], frontStyle),
    left: face([x, y, z], 'z', 'y', depth, height, colors[2]),
    right: face([x + width, y, z], 'z', 'y', depth, height, colors[2]),
    back: face([x, y, z], 'x', 'y', width, height, colors[1]),
    bottom: face([x, y, z], 'x', 'z', width, depth, colors[2]),
  };
}

function inside(x, z, { x: left, z: back, width, depth }, margin = 0) {
  return x > left - margin && x < left + width + margin
    && z > back - margin && z < back + depth + margin;
}

const JAR_CORNER = 0.48;
const JAR_OUTLINE = [
  [-JAR_CORNER, -1], [JAR_CORNER, -1], [1, -JAR_CORNER], [1, JAR_CORNER],
  [JAR_CORNER, 1], [-JAR_CORNER, 1], [-1, JAR_CORNER], [-1, -JAR_CORNER],
];

function proteinJar({ x, y, z, radius, height }) {
  const lidHeight = 0.048;
  const lidRadius = radius * 1.10;
  const faces = [];
  const colors = [0x27252d, 0x2c2931, 0x302d35, 0x38343e, 0x34313a, 0x403a45, 0x34313a, 0x302d35];
  JAR_OUTLINE.forEach(([ax, az], i) => {
    const [bx, bz] = JAR_OUTLINE[(i + 1) % JAR_OUTLINE.length];
    const side = (bottom, span, r, color, style) => facet(
      [x + bx * r, bottom, z + bz * r],
      [(ax - bx) * r, 0, (az - bz) * r], [0, span, 0], color, { style },
    );
    faces.push(
      side(y, height, radius, colors[i], i === 4 || i === 6 ? 16 : 0),
      side(y + height, lidHeight, lidRadius, 0x201e25),
      facet([x, y + height + lidHeight, z], [ax * lidRadius, 0, az * lidRadius],
        [bx * lidRadius, 0, bz * lidRadius], 0x28252e, { triangle: true }),
    );
  });
  return faces;
}

function buildRoom(renderer, cellSize) {
  const { halfWidth, halfDepth, height } = ROOM;
  const rug = { x: -1.95, z: -0.5, width: 2.7, depth: 2.25 };
  const wardrobe = { x: -3.8, y: 0, z: -2.8, width: 0.62, height: 2.45, depth: 1.45 };
  const desk = { x: -1.05, y: 0.78, z: -3.12, width: 1.95, height: 0.09, depth: 0.83 };
  const deskPedestal = { x: -1.00, y: 0, z: -3.07, width: 0.49, height: 0.78, depth: 0.70 };
  const deskLegs = [-2.44, -3.03].map(z => ({
    x: 0.76, y: 0, z, width: 0.095, height: 0.78, depth: 0.095,
  }));
  const chair = { x: 0.11, z: -1.92, width: 0.59, depth: 0.59 };
  const bed = { x: 1.55, y: 0, z: -3.12, width: 1.52, height: 0.40, depth: 2.35 };
  const cabinet = { x: 2.92, y: 0, z: 1.17, width: 0.88, height: 0.75, depth: 0.7 };
  const plant = { x: -2.94, y: 0, z: -2.99, width: 0.29, height: 0.32, depth: 0.29 };
  const shelves = { x: -2.02, z: -3.19, width: 0.76, depth: 0.23 };
  const obstacles = [wardrobe, desk, bed, cabinet, plant, shelves];
  const floorCover = [wardrobe, deskPedestal, ...deskLegs, bed, cabinet, plant, rug];
  const faces = [];

  function panel(...geometry) {
    const surface = face(...geometry);
    faces.push(surface);
    return surface;
  }

  function model(bounds, colors, frontStyle) {
    const surfaces = box(bounds, colors, frontStyle);
    faces.push(...Object.values(surfaces));
    return surfaces;
  }

  function part(x, y, z, width, height, depth, colors, frontStyle) {
    return model({ x, y, z, width, height, depth }, colors, frontStyle);
  }

  function dusty(surface, zone, covered = () => false) {
    const columns = Math.max(1, Math.round(surface.width / cellSize));
    const rows = Math.max(1, Math.round(surface.height / cellSize));
    surface.dust = {
      zone, columns, rows, covered,
      cellWidth: surface.width / columns,
      cellHeight: surface.height / rows,
      texture: renderer.createDustTexture(columns, rows),
      amount: new Float32Array(columns * rows),
      pixels: new Uint8Array(columns * rows * 2),
    };
  }

  dusty(panel([-halfWidth, 0, -halfDepth], 'x', 'z', halfWidth * 2, halfDepth * 2, 0xd79a63, 1),
    'floor', (u, v) => floorCover.some(bounds => inside(u - halfWidth, v - halfDepth, bounds)));
  dusty(panel([rug.x, 0.008, rug.z], 'x', 'z', rug.width, rug.depth, 0x5f7f80, 2), 'carpet');
  panel([-halfWidth, height, -halfDepth], 'x', 'z', halfWidth * 2, halfDepth * 2, 0x7f86a8, 7);
  panel([-halfWidth, 0, -halfDepth], 'x', 'y', halfWidth * 2, height, 0xe9e7f2, 4);
  panel([-halfWidth, 0, halfDepth], 'x', 'y', halfWidth * 2, height, 0xd4d2e5, 4);
  panel([-halfWidth, 0, -halfDepth], 'z', 'y', halfDepth * 2, height, 0xd3d1e3, 4);
  panel([halfWidth, 0, -halfDepth], 'z', 'y', halfDepth * 2, height, 0xdcdaea, 4);
  panel([-halfWidth, 0, -halfDepth + 0.004], 'x', 'y', halfWidth * 2, 0.08, 0xf6f4fb);
  panel([-halfWidth + 0.004, 0, -halfDepth], 'z', 'y', halfDepth * 2, 0.08, 0xf6f4fb);
  panel([halfWidth - 0.004, 0, -halfDepth], 'z', 'y', halfDepth * 2, 0.08, 0xf6f4fb);

  model(wardrobe, [0xe3e3ee, 0xc9c9db, 0xe3e3ee]);
  panel([-3.177, 0.06, -2.75], 'z', 'y', 1.35, 2.31, 0xdfdfeb, 3);
  panel([-3.173, 1.25, -1.77], 'z', 'y', 0.25, 0.37, 0x3b5e8c, 8);
  part(-3.177, 0.68, -1.54, 0.015, 0.52, 0.14, [0xf7d578, 0xcda23c, 0xf2c94c]);

  panel([-2.80, 0.03, -3.191], 'x', 'y', 0.67, 2.13, 0x8d4f33);
  panel([-2.75, 0.04, -3.185], 'x', 'y', 0.57, 2.05, 0xa9643f, 9);
  part(-2.31, 1.01, -3.184, 0.085, 0.035, 0.037, [0xe6e6ef, 0xc9c9d6, 0xa6a8bd]);
  panel([-2.65, 1.30, -3.181], 'x', 'y', 0.18, 0.26, 0xe3b04b, 8);
  model(plant, [0xc96446, 0xb8553a, 0xa14b35]);
  part(-2.96, 0.29, -3.01, 0.33, 0.08, 0.33, [0x734e32, 0xc96446, 0xb8553a]);
  part(-2.87, 0.36, -2.89, 0.15, 0.55, 0.09, [0x67a966, 0x478754, 0x3a754b]);
  part(-2.99, 0.45, -2.84, 0.35, 0.14, 0.075, [0x62a368, 0x4d9158, 0x3f7d4f]);

  const books = [0xd9534f, 0x3f7cac, 0xf0ad4e, 0x5cb85c, 0x8e6bbf, 0xe8e2d0];
  for (const shelfY of [1.14, 1.44]) {
    model({ ...shelves, y: shelfY, height: 0.05 }, [0x9c6c4b, 0x7b5236, 0x6b4a32]);
    books.forEach((color, i) => {
      part(shelves.x + 0.08 + i * 0.09, shelfY + 0.05, shelves.z + 0.015, 0.073, 0.14 + (i % 3) * 0.026, 0.113,
        [0xf4efe2, color, 0x555266]);
    });
  }

  for (const [x, y, width, posterHeight, color, style] of [
    [-0.79, 1.87, 0.61, 0.48, 0x2d3848, 11], [0.35, 1.61, 0.43, 0.55, 0x4a8fd6, 15],
    [1.04, 1.96, 0.36, 0.42, 0xe6a03c, 12], [1.12, 1.49, 0.35, 0.38, 0x3a3346, 13],
    [1.68, 1.61, 0.50, 0.63, 0x5b4a9c, 14],
  ]) panel([x, y, -3.19], 'x', 'y', width, posterHeight, color, style);

  const tower = { x: -0.87, y: 0.87, z: -3.02, width: 0.27, height: 0.47, depth: 0.32 };
  const stand = { x: -0.16, y: 0.87, z: -2.98, width: 0.39, height: 0.035, depth: 0.23 };
  const keyboard = { x: -0.28, y: 0.87, z: -2.59, width: 0.62, height: 0.04, depth: 0.18 };
  const mouse = { x: 0.47, y: 0.87, z: -2.54, width: 0.10, height: 0.043, depth: 0.13 };
  const tabletop = model(desk, [0xc88a59, 0xa8703f, 0x9c663f]);
  dusty(tabletop.top, 'desk', (u, v) =>
    [tower, stand, keyboard, mouse].some(bounds => inside(desk.x + u, desk.z + v, bounds)));
  model(deskPedestal, [0xc28553, 0xb77b4b, 0xa8703f], 9);
  for (const leg of deskLegs) model(leg, [0xa8703f, 0x976536, 0x875534]);
  const computer = model(tower, [0x555b66, 0x2e3238, 0x373c45]);
  dusty(computer.top, 'desk');
  panel([-0.76, 1.24, -2.698], 'x', 'y', 0.028, 0.028, 0x4fd1c5);
  for (const y of [0.99, 1.04, 1.09]) panel([-0.82, y, -2.698], 'x', 'y', 0.155, 0.012, 0x4b5260);
  model(stand, [0x444b53, 0x30353b, 0x292d34]);
  part(-0.024, 0.905, -2.91, 0.09, 0.19, 0.08, [0x444b53, 0x30353b, 0x292d34]);
  part(-0.37, 1.06, -2.94, 0.76, 0.44, 0.075, [0x343a43, 0x1f2328, 0x272a31]);
  dusty(panel([-0.336, 1.094, -2.861], 'x', 'y', 0.692, 0.372, 0xa4643a, 5), 'desk');
  const keyboardTop = model(keyboard, [0x515761, 0x30353b, 0x30353b]).top;
  keyboardTop.style = 10;
  dusty(keyboardTop, 'desk');
  dusty(model(mouse, [0x42474f, 0x30353b, 0x30353b]).top, 'desk');
  const chairFaceStart = faces.length;
  part(chair.x, 0.45, chair.z, chair.width, 0.10, 0.55, [0x464e57, 0x30353a, 0x343b42]);
  part(0.14, 0.55, -1.43, 0.53, 0.65, 0.10, [0x4c555e, 0x30353a, 0x383f47]);
  part(0.36, 0.10, -1.7, 0.09, 0.35, 0.09, [0x666d77, 0x585e66, 0x383e46]);
  part(0.13, 0.03, -1.7, 0.55, 0.075, 0.10, [0x373c45, 0x2a2e33, 0x24272c]);
  part(0.355, 0.032, -1.91, 0.10, 0.073, 0.53, [0x373c45, 0x2a2e33, 0x24272c]);
  chair.faces = faces.slice(chairFaceStart);

  model(bed, [0xe88a5c, 0xc9673a, 0xc9673a]);
  part(bed.x, 0.4, bed.z + 0.10, bed.width, 0.175, bed.depth - 0.12, [0xf6f6fa, 0xe8e6ef, 0xdad8e6]);
  part(bed.x + 0.24, 0.575, bed.z + 0.18, 1.04, 0.11, 0.34, [0xfffffb, 0xf2f0f6, 0xe7e5ef]);
  part(bed.x - 0.025, 0.37, bed.z + 0.65, bed.width + 0.05, 0.24, bed.depth - 0.65, [0xe25b5b, 0xcb4b4c, 0xc84a4a]);
  for (const x of [bed.x + 0.37, bed.x + 1.14]) {
    panel([x, 0.612, bed.z + 0.69], 'x', 'z', 0.017, bed.depth - 0.74, 0xcf4d50);
  }
  part(bed.x, 0.30, bed.z, bed.width, 0.76, 0.10, [0xef8a58, 0xe07848, 0xcd6840], 3);
  dusty(part(bed.x - 0.04, 1.06, bed.z - 0.01, bed.width + 0.08, 0.08, 0.16, [0xef8a58, 0xe27e4f, 0xcf744a]).top, 'bed');

  panel([3.788, 0.98, -2.62], 'z', 'y', 1.63, 1.43, 0xf4f4fb);
  panel([3.782, 1.05, -2.55], 'z', 'y', 1.49, 1.30, 0xcfe9f5, 6);
  part(3.76, 1.05, -1.825, 0.03, 1.31, 0.04, [0xf6f6fb, 0xe8e8f2, 0xf4f4fb]);
  dusty(part(3.61, 0.93, -2.67, 0.18, 0.07, 1.73, [0xfafafe, 0xe5e3ef, 0xf0eff9]).top, 'windowSill');
  part(3.67, 2.46, -2.75, 0.04, 0.035, 1.91, [0x5a5f78, 0x54596e, 0x646983]);
  for (const edge of [-2.69, -1.26]) {
    [0x3fb3ad, 0x319a97, 0x47b9b0, 0x38a3a1].forEach((color, index) => {
      const inset = index % 2 ? 0.04 : 0;
      part(3.62 + inset, 1.09, edge + index * 0.093, 0.11, 1.35, 0.095, [color, color, color]);
    });
  }

  const nightstand = model(cabinet, [0x6b4632, 0x4a3022, 0x563828], 9);
  const jars = [
    { x: 3.155, y: cabinet.height, z: 1.53, radius: 0.138, height: 0.28 },
    { x: 3.49, y: cabinet.height, z: 1.44, radius: 0.169, height: 0.40 },
  ];
  dusty(nightstand.top, 'cabinet', (u, v) => jars.some(jar => {
    const x = Math.abs(cabinet.x + u - jar.x) / jar.radius;
    const z = Math.abs(cabinet.z + v - jar.z) / jar.radius;
    return Math.max(x, z) <= 1 && x + z <= 1 + JAR_CORNER;
  }));
  jars.forEach(jar => faces.push(...proteinJar(jar)));
  part(-0.055, 2.69, -0.75, 0.11, 0.21, 0.10, [0x6a7091, 0x5c6280, 0x666d8e]);
  part(-0.89, 2.68, -0.78, 1.78, 0.035, 0.16, [0x9b5a3c, 0x824a35, 0x9b5a3c]);
  part(-0.14, 2.62, -0.81, 0.28, 0.075, 0.22, [0xd8d9e8, 0xb9bdd5, 0xc9cbe0]);

  return { faces, obstacles, chair };
}
