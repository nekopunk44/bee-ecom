import {
  BoxGeometry,
  CanvasTexture,
  CatmullRomCurve3,
  CircleGeometry,
  Color,
  CylinderGeometry,
  DoubleSide,
  EdgesGeometry,
  Group,
  InstancedMesh,
  LineBasicMaterial,
  LineSegments,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  RepeatWrapping,
  SphereGeometry,
  SRGBColorSpace,
  Vector3,
  type Material,
  type Object3D,
} from 'three';

/* Модели собраны из простых тел прямо в коде: файлов моделей нет, пчеловодные размеры
   настоящие. Единица сцены — 10 см: улей Дадан 50×46, рамка корпуса 435×300,
   рамка магазина 435×145. */

export const palette = {
  night: '#17150f',
  raised: '#2a2720',
  honey: '#f5b700',
  deep: '#c77800',
  roof: '#3a3529',
  wood: '#c8955a',
  wax: '#d9b25a',
  cap: '#e9c25e',
  bright: '#ffd54f',
};

export const HIVE = { width: 5, depth: 4.6, wall: 0.25 };
export const BODY_FRAME = { length: 4.35, height: 3 };
export const SUPER_FRAME = { length: 4.35, height: 1.5 };
export const CELL = 0.105;

function canvasTexture(
  width: number,
  height: number,
  draw: (g: CanvasRenderingContext2D) => void,
) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (context) draw(context);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  return texture;
}

/** Плитка сот: две колонки и четыре ряда, повторяется без шва. */
export function combTexture(fill: [string, string], wall: string) {
  const r = 37;
  const w = Math.sqrt(3) * r;
  const texture = canvasTexture(128, 222, (g) => {
    g.fillStyle = wall;
    g.fillRect(0, 0, 128, 222);
    for (let j = -1; j <= 5; j++) {
      for (let i = -1; i <= 3; i++) {
        const cx = i * w + (j % 2 ? w / 2 : 0);
        const cy = j * 1.5 * r;
        g.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = Math.PI / 6 + (k * Math.PI) / 3;
          const x = cx + Math.cos(a) * r * 0.84;
          const y = cy + Math.sin(a) * r * 0.84;
          if (k === 0) g.moveTo(x, y);
          else g.lineTo(x, y);
        }
        g.closePath();
        const shade = g.createRadialGradient(
          cx,
          cy - r * 0.2,
          r * 0.1,
          cx,
          cy,
          r * 0.9,
        );
        shade.addColorStop(0, fill[0]);
        shade.addColorStop(1, fill[1]);
        g.fillStyle = shade;
        g.fill();
      }
    }
  });
  texture.wrapS = texture.wrapT = RepeatWrapping;
  return texture;
}

export function glowTexture() {
  return canvasTexture(256, 256, (g) => {
    const glow = g.createRadialGradient(128, 128, 0, 128, 128, 128);
    glow.addColorStop(0, 'rgba(255,214,120,1)');
    glow.addColorStop(0.35, 'rgba(245,183,0,0.55)');
    glow.addColorStop(1, 'rgba(245,183,0,0)');
    g.fillStyle = glow;
    g.fillRect(0, 0, 256, 256);
  });
}

function stripeTexture() {
  return canvasTexture(32, 128, (g) => {
    g.fillStyle = palette.honey;
    g.fillRect(0, 0, 32, 128);
    g.fillStyle = palette.night;
    for (const [y, h] of [
      [34, 14],
      [60, 14],
      [86, 14],
      [108, 20],
    ] as const)
      g.fillRect(0, y, 32, h);
  });
}

export type Bee = Group & { flap: (time: number, speed?: number) => void };

let stripes: CanvasTexture | undefined;

/** Пчела смотрит вдоль +z, чтобы внешняя группа могла lookAt() по ходу полёта. */
export function makeBee(size: number): Bee {
  stripes ??= stripeTexture();
  const outer = new Group() as Bee;
  const body = new Group();
  body.rotation.y = -Math.PI / 2;
  outer.add(body);
  const furry = new MeshStandardMaterial({ color: '#3a3326', roughness: 0.9 });
  const black = new MeshStandardMaterial({
    color: palette.night,
    roughness: 0.5,
  });
  const abdomen = new Mesh(
    new SphereGeometry(0.5, 20, 16),
    new MeshStandardMaterial({ map: stripes, roughness: 0.55 }),
  );
  abdomen.scale.set(0.6, 0.95, 0.6);
  abdomen.rotation.z = -Math.PI / 2;
  abdomen.position.x = -0.42;
  const thorax = new Mesh(new SphereGeometry(0.3, 16, 12), furry);
  thorax.position.x = 0.12;
  const head = new Mesh(new SphereGeometry(0.21, 16, 12), black);
  head.position.x = 0.48;
  body.add(abdomen, thorax, head);
  for (const side of [1, -1]) {
    const antenna = new Mesh(
      new CylinderGeometry(0.018, 0.018, 0.34, 5),
      black,
    );
    antenna.position.set(0.66, 0.2, 0.08 * side);
    antenna.rotation.set(0.35 * side, 0, -0.75);
    body.add(antenna);
  }
  const wingMaterial = new MeshStandardMaterial({
    color: '#fff8e0',
    transparent: true,
    opacity: 0.5,
    roughness: 0.2,
    side: DoubleSide,
    depthWrite: false,
  });
  const wings: { pivot: Group; side: number }[] = [];
  for (const side of [1, -1]) {
    const geometry = new CircleGeometry(0.42, 20);
    geometry.scale(1, 0.48, 1);
    geometry.rotateX(-Math.PI / 2);
    geometry.translate(-0.12, 0, 0.36 * side);
    const pivot = new Group();
    pivot.position.set(0.1, 0.24, 0);
    pivot.add(new Mesh(geometry, wingMaterial));
    body.add(pivot);
    wings.push({ pivot, side });
  }
  outer.scale.setScalar(size);
  outer.flap = (time, speed = 1) => {
    const lift = 0.3 + 0.55 * Math.sin(time * 62 * speed);
    for (const wing of wings) wing.pivot.rotation.x = -lift * wing.side;
  };
  return outer;
}

/** Ползущая пчела: спиной от сот, голова по направлению движения в плоскости XY. */
export function makeCrawler(size: number) {
  const bee = makeBee(size);
  const body = bee.children[0];
  if (body) body.rotation.y = 0;
  bee.rotation.x = Math.PI / 2;
  const holder = new Group();
  holder.add(bee);
  return { holder, bee };
}

function box(
  parent: Object3D,
  size: [number, number, number],
  position: [number, number, number],
  material: Material,
  edges?: LineBasicMaterial,
) {
  const geometry = new BoxGeometry(...size);
  const mesh = new Mesh(geometry, material);
  mesh.position.set(...position);
  parent.add(mesh);
  if (edges) {
    const lines = new LineSegments(new EdgesGeometry(geometry), edges);
    lines.position.copy(mesh.position);
    parent.add(lines);
  }
  return mesh;
}

export type HivePart = {
  object: Group;
  closedY: number;
  explodedY: number;
  height: number;
};

/** Улей Дадан: дно, корпус, магазин, потолок и крыша; рамки внутри корпусов. */
export function buildHive() {
  const { width: W, depth: D, wall: T } = HIVE;
  const honey = new MeshStandardMaterial({
    color: palette.honey,
    roughness: 0.62,
  });
  const dark = new MeshStandardMaterial({
    color: palette.roof,
    roughness: 0.7,
    metalness: 0.15,
  });
  const wood = new MeshStandardMaterial({
    color: palette.wood,
    roughness: 0.75,
  });
  const tin = new MeshStandardMaterial({
    color: '#8d8a80',
    metalness: 0.75,
    roughness: 0.35,
  });
  const inkEdge = new LineBasicMaterial({
    color: palette.night,
    transparent: true,
    opacity: 0.55,
  });
  const honeyEdge = new LineBasicMaterial({
    color: palette.honey,
    transparent: true,
    opacity: 0.55,
  });
  const broodComb = combTexture(['#7a5410', '#3d2a07'], palette.wax);
  const honeyComb = combTexture(['#f6c64a', '#b97a10'], '#e2b350');

  function frame(length: number, height: number, texture: CanvasTexture) {
    const group = new Group();
    box(group, [length + 0.5, 0.12, 0.22], [0, height - 0.06, 0], wood);
    box(
      group,
      [0.1, height - 0.12, 0.2],
      [length / 2 - 0.05, (height - 0.12) / 2, 0],
      wood,
    );
    box(
      group,
      [0.1, height - 0.12, 0.2],
      [-length / 2 + 0.05, (height - 0.12) / 2, 0],
      wood,
    );
    box(group, [length, 0.08, 0.18], [0, 0.04, 0], wood);
    const cw = length - 0.2;
    const ch = height - 0.24;
    const map = texture.clone();
    map.needsUpdate = true;
    map.repeat.set(cw / (2 * Math.sqrt(3) * CELL), ch / (6 * CELL));
    const comb = new Mesh(
      new BoxGeometry(cw, ch, 0.14),
      new MeshStandardMaterial({ map, roughness: 0.4 }),
    );
    comb.position.y = 0.08 + ch / 2;
    group.add(comb);
    return group;
  }
  function shell(height: number) {
    const group = new Group();
    box(group, [W, height, T], [0, height / 2, D / 2 - T / 2], honey, inkEdge);
    box(group, [W, height, T], [0, height / 2, -D / 2 + T / 2], honey, inkEdge);
    box(
      group,
      [T, height, D - 2 * T],
      [W / 2 - T / 2, height / 2, 0],
      honey,
      inkEdge,
    );
    box(
      group,
      [T, height, D - 2 * T],
      [-W / 2 + T / 2, height / 2, 0],
      honey,
      inkEdge,
    );
    for (const side of [1, -1])
      box(
        group,
        [0.06, 0.18, 0.9],
        [side * (W / 2 + 0.01), height * 0.72, 0],
        dark,
      );
    return group;
  }
  function frames(length: number, height: number, texture: CanvasTexture) {
    const group = new Group();
    const list: Group[] = [];
    for (let i = 0; i < 10; i++) {
      const item = frame(length, height, texture);
      item.userData.z = (i - 4.5) * 0.39;
      item.position.set(0, 0.12, item.userData.z);
      group.add(item);
      list.push(item);
    }
    return { group, list };
  }

  const hive = new Group();
  const parts: HivePart[] = [];
  const add = (
    object: Group,
    closedY: number,
    explodedY: number,
    height: number,
  ) => {
    object.position.y = closedY;
    hive.add(object);
    parts.push({ object, closedY, explodedY, height });
  };

  const bottom = new Group();
  box(bottom, [W, 0.18, D + 0.7], [0, 0.09, 0.35], dark, honeyEdge);
  box(bottom, [W, 0.42, T], [0, 0.39, -D / 2 + T / 2], dark, honeyEdge);
  box(bottom, [T, 0.42, D - T], [W / 2 - T / 2, 0.39, T / 2], dark, honeyEdge);
  box(bottom, [T, 0.42, D - T], [-W / 2 + T / 2, 0.39, T / 2], dark, honeyEdge);
  box(bottom, [1.1, 0.42, T], [-1.7, 0.39, D / 2 - T / 2], dark, honeyEdge);
  box(bottom, [1.1, 0.42, T], [1.7, 0.39, D / 2 - T / 2], dark, honeyEdge);
  box(
    bottom,
    [W - 0.6, 0.08, 1.1],
    [0, 0.12, D / 2 + 0.7],
    wood,
    inkEdge,
  ).rotation.x = 0.18;
  add(bottom, 0, -1.4, 0.6);

  const body = new Group();
  body.add(shell(3.2));
  const bodyFrames = frames(BODY_FRAME.length, BODY_FRAME.height, broodComb);
  body.add(bodyFrames.group);
  add(body, 0.6, 0.2, 3.2);

  const honeySuper = new Group();
  honeySuper.add(shell(1.7));
  const superFrames = frames(SUPER_FRAME.length, SUPER_FRAME.height, honeyComb);
  honeySuper.add(superFrames.group);
  add(honeySuper, 3.8, 5.6, 1.7);

  const cover = new Group();
  box(cover, [W, 0.14, D], [0, 0.07, 0], wood, inkEdge);
  add(cover, 5.5, 9.8, 0.14);

  const roof = new Group();
  box(roof, [W + 0.5, 0.75, D + 0.5], [0, 0.4, 0], dark, honeyEdge);
  box(roof, [W + 0.62, 0.08, D + 0.62], [0, 0.8, 0], tin, honeyEdge);
  add(roof, 5.64, 11.1, 0.84);

  const shadow = new Mesh(
    new CircleGeometry(4.6, 48),
    new MeshBasicMaterial({
      map: glowTexture(),
      color: '#000000',
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    }),
  );
  shadow.rotation.x = -Math.PI / 2;
  shadow.position.y = -1.45;
  hive.add(shadow);

  const loops: [number, number, number][][] = [
    [
      [6, 3, 2],
      [2, 6, 5],
      [-5, 4, 3],
      [-3, 1, -4],
      [4, 2, -4],
    ],
    [
      [-6, 6, 1],
      [-1, 8, 4],
      [5, 7, 1],
      [2, 5, -5],
      [-4, 7, -4],
    ],
    [
      [3, 1.2, 5],
      [6, 2.5, 0],
      [1, 2, -5],
      [-5, 2.2, 0],
      [-2, 1.4, 5],
    ],
  ];
  const orbits = loops.map((points, index) => {
    const bee = makeBee(0.42);
    hive.add(bee);
    return {
      bee,
      curve: new CatmullRomCurve3(
        points.map(([x, y, z]) => new Vector3(x, y, z)),
        true,
      ),
      offset: index / 3,
      speed: 0.035 + index * 0.008,
    };
  });

  return {
    hive,
    parts,
    bodyFrames: bodyFrames.list,
    superFrames: superFrames.list,
    orbits,
  };
}

export type Cell = { x: number; y: number; order: number; glow: number };

/**
 * Рамка, которая выходит из улья: того же размера, что рамка корпуса, но соты в ней
 * отдельные ячейки, чтобы их можно было залить мёдом и поднимать под курсором.
 * Начало координат в центре рамки.
 */
export function buildHeroFrame() {
  const { length, height } = BODY_FRAME;
  const group = new Group();
  const wood = new MeshStandardMaterial({
    color: palette.wood,
    roughness: 0.75,
  });
  const half = height / 2;
  box(group, [length + 0.5, 0.12, 0.22], [0, half - 0.06, 0], wood);
  box(group, [0.1, height - 0.12, 0.2], [length / 2 - 0.05, -0.06, 0], wood);
  box(group, [0.1, height - 0.12, 0.2], [-length / 2 + 0.05, -0.06, 0], wood);
  box(group, [length, 0.08, 0.18], [0, -half + 0.04, 0], wood);
  const cw = length - 0.2;
  const ch = height - 0.24;
  const centerY = -half + 0.08 + ch / 2;
  const core = new Mesh(
    new BoxGeometry(cw, ch, 0.08),
    new MeshStandardMaterial({ color: palette.wax, roughness: 0.6 }),
  );
  core.position.y = centerY;
  group.add(core);

  const step = Math.sqrt(3) * CELL;
  const cells: Cell[] = [];
  const cols = Math.floor(cw / step);
  const rows = Math.floor(ch / (1.5 * CELL));
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = (i - (cols - 1) / 2) * step + (j % 2 ? step / 2 : 0);
      const y = centerY + ch / 2 - CELL - j * 1.5 * CELL;
      if (
        Math.abs(x) > cw / 2 - CELL * 0.9 ||
        y < centerY - ch / 2 + CELL * 0.9
      )
        continue;
      // Пчёлы заливают соты сверху и от середины к краям.
      const order =
        ((centerY + ch / 2 - y) / ch) * 0.75 +
        (Math.abs(x) / cw) * 0.35 +
        Math.random() * 0.12;
      cells.push({ x, y, order, glow: 0 });
    }
  }
  const geometry = new CylinderGeometry(CELL * 0.86, CELL * 0.86, 1, 6);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, 0.5);
  const honey = new MeshStandardMaterial({
    roughness: 0.18,
    metalness: 0,
    emissive: '#b36200',
    emissiveIntensity: 0.5,
  });
  const sides = [1, -1].map((side) => {
    const mesh = new InstancedMesh(geometry, honey, cells.length);
    const color = new Color(palette.night);
    cells.forEach((_, i) => mesh.setColorAt(i, color));
    group.add(mesh);
    return { mesh, side };
  });
  return {
    group,
    cells,
    sides,
    comb: { width: cw, height: ch, centerY },
    honey,
  };
}
