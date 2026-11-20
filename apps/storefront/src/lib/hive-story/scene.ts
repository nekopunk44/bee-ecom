import {
  ACESFilmicToneMapping,
  AdditiveBlending,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  MathUtils,
  Matrix4,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  Plane,
  PointLight,
  Quaternion,
  Raycaster,
  Scene,
  SphereGeometry,
  Sprite,
  SpriteMaterial,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  BODY_FRAME,
  HIVE,
  buildHeroFrame,
  buildHive,
  glowTexture,
  makeBee,
  makeCrawler,
  palette,
} from './models';

export type StoryOptions = {
  /** Высокая секция, которую прокручивают; её прокрутка ведёт всю сцену. */
  story: HTMLElement;
  /** Шаги текста: первый экран, две главы и поиск. */
  steps: HTMLElement[];
  /** Липкая сцена во весь экран. */
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  /** Подписи частей улья в порядке: дно, корпус, магазин, потолок, крыша. */
  labels: HTMLElement[];
  onLost: () => void;
};

const clamp = (v: number, min = 0, max = 1) => Math.min(max, Math.max(min, v));
const smooth = (v: number) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};
const ramp = (from: number, to: number, v: number) =>
  smooth((v - from) / (to - from));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* Сцена одна на всю историю: собранный улей на первом экране, при прокрутке он
   разбирается с подписями частей, рамка корпуса выходит к зрителю и встаёт против
   света, соты заливаются мёдом, потом камера подходит вплотную и соты оживают под
   курсором. Время истории считается в шагах: 0 — первый экран у верха окна, 1 — первая
   глава, 2 — вторая, 3 — поиск. Так этапы совпадают с текстом и на телефоне, где шаги
   выше экрана. */
const timeline = {
  explode: [0.24, 0.9],
  labelsIn: [0.54, 0.9],
  labelsOut: [1.2, 1.41],
  frame: [1.2, 1.86],
  fill: [1.44, 2.4],
  crawl: [1.56, 1.98],
  dive: [2.22, 2.91],
} as const;

/** Сколько шагов прокручено: k, когда верх шага k у верха окна, между ними линейно. */
function storyTime(scrolled: number, steps: HTMLElement[]) {
  let time = 0;
  for (let k = 0; k + 1 < steps.length; k++) {
    const from = steps[k]?.offsetTop ?? 0;
    const to = steps[k + 1]?.offsetTop ?? from;
    if (scrolled <= from) break;
    time = k + clamp((scrolled - from) / Math.max(1, to - from));
  }
  return time;
}

type Shot = {
  center: Vector3;
  dir: Vector3;
  dist: number;
  anchor: [number, number];
};

export function startHiveStory(options: StoryOptions): (() => void) | null {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas: options.canvas,
      antialias: true,
      alpha: true,
    });
  } catch {
    return null;
  }
  // Без видеокарты WebGL считается программно: меньше пикселей и каждый второй кадр.
  const gl = renderer.getContext();
  const info = gl.getExtension('WEBGL_debug_renderer_info');
  const software = /swiftshader|llvmpipe|software/i.test(
    String(gl.getParameter(info ? info.UNMASKED_RENDERER_WEBGL : gl.RENDERER)),
  );
  const lowPower = software || (navigator.hardwareConcurrency ?? 8) <= 4;
  renderer.toneMapping = ACESFilmicToneMapping;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const fog = new Fog(palette.night, 20, 60);
  scene.fog = fog;
  const camera = new PerspectiveCamera(30, 1, 0.1, 200);
  scene.add(new HemisphereLight('#fff2c7', palette.night, 2));
  const key = new DirectionalLight('#ffffff', 3.4);
  key.position.set(6, 12, 9);
  const rim = new DirectionalLight(palette.honey, 3);
  rim.position.set(-8, 4, -6);
  scene.add(key, rim);

  const { hive, parts, bodyFrames, superFrames, orbits } = buildHive();
  scene.add(hive);
  // Эта рамка корпуса потом выходит из улья к зрителю.
  const slot = bodyFrames[4];
  if (!slot) {
    renderer.dispose();
    return null;
  }
  const travelling = slot;
  const hero = buildHeroFrame();
  hero.group.visible = false;
  scene.add(hero.group);

  const halo = new Sprite(
    new SpriteMaterial({
      map: glowTexture(),
      color: '#ffd36b',
      transparent: true,
      opacity: 0,
      blending: AdditiveBlending,
      depthWrite: false,
    }),
  );
  halo.scale.set(7.5, 7.5, 1);
  halo.position.set(0, 0.2, -2.6);
  hero.group.add(halo);
  const backlight = new PointLight('#ffcf5a', 0, 14, 2);
  backlight.position.set(0, 0.4, -2);
  hero.group.add(backlight);
  const cursorLight = new PointLight(palette.honey, 0, 6, 2);
  scene.add(cursorLight);

  const crawlers = [0, 1, 2].map((i) => {
    const crawler = makeCrawler(0.2);
    hero.group.add(crawler.holder);
    return {
      ...crawler,
      x: (i - 1) * 1.2,
      y: (i - 1) * 0.5 - 0.1,
      heading: i * 2.1,
      rest: 0,
    };
  });
  const drop = new Mesh(
    new SphereGeometry(0.1, 16, 12),
    new MeshStandardMaterial({
      color: '#f2a400',
      roughness: 0.1,
      emissive: '#b36200',
      emissiveIntensity: 0.6,
    }),
  );
  hero.group.add(drop);
  const dropState = { phase: 0, y: 0, speed: 0 };
  const followers = [makeBee(0.13), makeBee(0.11)].map((bee, i) => {
    bee.visible = false;
    scene.add(bee);
    return { bee, position: new Vector3(), lag: i ? 1.4 : 2.4 };
  });

  // Где стоит камера на каждом шаге: точка интереса, направление взгляда, дальность и
  // место объекта на экране (на широком экране справа от текста, на узком сверху).
  const finalFrame = new Vector3(-0.6, 4.4, 7.5);
  const shots = (wide: boolean): [Shot, Shot, Shot, Shot] => [
    {
      center: new Vector3(0, 3.2, 0),
      dir: new Vector3(0.18, 0.29, 1).normalize(),
      dist: wide ? 24 : 36,
      anchor: wide ? [0.4, 0.02] : [0, 0.5],
    },
    {
      center: new Vector3(0, 5, 0),
      dir: new Vector3(0.18, 0.29, 1).normalize(),
      dist: wide ? 32 : 54,
      anchor: wide ? [0.22, 0] : [-0.24, 0.42],
    },
    {
      center: finalFrame,
      dir: new Vector3(0.06, 0.05, 1).normalize(),
      dist: wide ? 12.5 : 18,
      anchor: wide ? [0.34, 0] : [0, 0.45],
    },
    {
      center: finalFrame.clone().add(new Vector3(0, -0.1, 0)),
      dir: new Vector3(0.5, 0.42, 1).normalize(),
      dist: wide ? 3.6 : 4.6,
      anchor: wide ? [0.1, 0] : [0, 0.12],
    },
  ];
  let plan = shots(true);

  const up = new Vector3(0, 1, 0);
  const forward = new Vector3();
  const right = new Vector3();
  const screenUp = new Vector3();
  const pose = () => ({ position: new Vector3(), target: new Vector3() });
  const aimed = [pose(), pose(), pose(), pose()] as const;
  function aim(shot: Shot, out: { position: Vector3; target: Vector3 }) {
    const halfHeight = Math.tan(MathUtils.degToRad(camera.fov / 2)) * shot.dist;
    const halfWidth = halfHeight * camera.aspect;
    forward.copy(shot.dir).negate();
    right.crossVectors(forward, up).normalize();
    screenUp.crossVectors(right, forward).normalize();
    out.target
      .copy(shot.center)
      .addScaledVector(right, -shot.anchor[0] * halfWidth)
      .addScaledVector(screenUp, -shot.anchor[1] * halfHeight);
    out.position.copy(out.target).addScaledVector(shot.dir, shot.dist);
  }

  // Указатель: на всей секции, потому что текст лежит поверх сцены.
  const pointer = {
    x: 0,
    y: 0,
    goalX: 0,
    goalY: 0,
    ndc: new Vector2(),
    moved: -10,
  };
  const onMove = (event: PointerEvent) => {
    const rect = options.stage.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    pointer.goalX = clamp(x, -1, 1);
    pointer.goalY = clamp(y, -1, 1);
    pointer.ndc.set(x, y);
    pointer.moved = performance.now() / 1000;
  };
  const ripples: { x: number; y: number; start: number }[] = [];
  const combPoint = new Vector3(6, 0, 0);
  let dive = 0;
  const onDown = (event: PointerEvent) => {
    if (
      event.target instanceof Element &&
      event.target.closest('a, button, input, label, select, textarea')
    )
      return;
    onMove(event);
    if (dive > 0.4)
      ripples.push({
        x: combPoint.x,
        y: combPoint.y,
        start: performance.now() / 1000,
      });
  };
  window.addEventListener('pointermove', onMove, { passive: true });
  options.story.addEventListener('pointerdown', onDown);

  let size = { width: 1, height: 1 };
  const resize = () => {
    const rect = options.stage.getBoundingClientRect();
    size = { width: Math.max(1, rect.width), height: Math.max(1, rect.height) };
    const wide = size.width / size.height >= 1.1;
    renderer.setPixelRatio(
      software
        ? 0.75
        : Math.min(window.devicePixelRatio || 1, lowPower ? 1 : wide ? 2 : 1.5),
    );
    renderer.setSize(size.width, size.height, false);
    camera.aspect = size.width / size.height;
    camera.updateProjectionMatrix();
    plan = shots(wide);
  };
  const resizeObserver = new ResizeObserver(resize);
  resizeObserver.observe(options.stage);
  resize();

  let visible = true;
  const intersection = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  intersection.observe(options.story);

  const startPosition = new Vector3();
  const startQuaternion = new Quaternion();
  const endQuaternion = new Quaternion();
  const sway = new Quaternion();
  const yAxis = new Vector3(0, 1, 0);
  const anchor = new Vector3();
  const plane = new Plane();
  const normal = new Vector3();
  const raycaster = new Raycaster();
  const hit = new Vector3();
  const local = new Vector3();
  const look = new Vector3();
  const ahead = new Vector3();
  const matrix = new Matrix4();
  const scale = new Vector3();
  const cellPosition = new Vector3();
  const cellColor = new Color();
  const empty = new Color('#3d2a07');
  const honey = new Color('#e89400');
  const capped = new Color(palette.cap);
  const bright = new Color(palette.bright);
  const shade = new Color('#7a4a00');
  const front = new Quaternion();
  const back = new Quaternion().setFromAxisAngle(yAxis, Math.PI);
  const target = new Vector3();

  let frameId = 0;
  let lastDepth = '';
  let last = performance.now();
  const started = last;
  let stopped = false;

  function update(now: number) {
    const dt = clamp((now - last) / 1000, 0, 0.05);
    last = now;
    const t = Math.max(0, now - started) / 1000;
    const progress = storyTime(
      -options.story.getBoundingClientRect().top,
      options.steps,
    );

    pointer.x = lerp(pointer.x, pointer.goalX, 1 - Math.pow(0.03, dt));
    pointer.y = lerp(pointer.y, pointer.goalY, 1 - Math.pow(0.03, dt));

    const explode = ramp(...timeline.explode, progress);
    const travel = ramp(...timeline.frame, progress);
    const fill = ramp(...timeline.fill, progress);
    dive = ramp(...timeline.dive, progress);
    const labelsShown =
      ramp(...timeline.labelsIn, progress) *
      (1 - ramp(...timeline.labelsOut, progress));
    const intro = smooth(t / 1.6);

    // Улей: появляется, поворачивается за курсором, разбирается и уходит в глубину.
    hive.rotation.y =
      -0.55 + Math.sin(t * 0.22) * 0.15 + pointer.x * 0.3 * (1 - travel);
    hive.rotation.x = pointer.y * 0.05 * (1 - travel);
    hive.scale.setScalar(0.92 + 0.08 * intro);
    hive.position.set(0, -2 * travel - (1 - intro) * 0.6, -14 * travel);
    parts.forEach((part, i) => {
      part.object.position.y = lerp(
        part.closedY,
        part.explodedY,
        smooth(explode * 1.35 - i * 0.07),
      );
    });
    superFrames.forEach((frame, i) => {
      const lift = smooth(explode * 1.6 - 0.45 - i * 0.025);
      frame.position.y = 0.12 + lift * 2;
      frame.position.z = frame.userData.z * (1 + lift * 0.9);
      frame.rotation.x = (i - 4.5) * 0.035 * lift;
    });
    bodyFrames.forEach((frame, i) => {
      const lift = i === 4 || i === 5 ? smooth(explode * 1.6 - 0.55) : 0;
      frame.position.y = 0.12 + lift * 1.9;
      frame.position.z = frame.userData.z + lift * (i === 4 ? -0.3 : 0.3);
    });
    orbits.forEach((orbit) => {
      orbit.bee.visible = travel < 0.95;
      const u = (orbit.offset + t * orbit.speed) % 1;
      orbit.curve.getPointAt(u, orbit.bee.position);
      orbit.curve.getPointAt((u + 0.01) % 1, look);
      orbit.bee.lookAt(hive.localToWorld(look));
      orbit.bee.flap(t);
    });
    hive.updateMatrixWorld(true);

    // Рамка корпуса подменяется рамкой с отдельными ячейками и летит к зрителю.
    travelling.visible = travel <= 0.001;
    hero.group.visible = travel > 0.001;
    if (hero.group.visible) {
      travelling.localToWorld(startPosition.set(0, BODY_FRAME.height / 2, 0));
      travelling.getWorldQuaternion(startQuaternion);
      const swing = (1 - dive) * travel;
      sway.setFromAxisAngle(
        yAxis,
        Math.sin(t * 0.28) * 0.32 * swing + pointer.x * 0.2 * swing,
      );
      endQuaternion.copy(sway);
      hero.group.position.lerpVectors(startPosition, finalFrame, travel);
      hero.group.position.y += Math.sin(travel * Math.PI) * 1.4;
      hero.group.quaternion.slerpQuaternions(
        startQuaternion,
        endQuaternion,
        travel,
      );
      hero.group.updateMatrixWorld(true);
    }
    halo.material.opacity = travel * (1 - 0.7 * dive);
    backlight.intensity = 45 * travel * (1 - 0.5 * dive);

    // Камера: от общего плана улья к рамке и вплотную к сотам.
    aim(plan[0], aimed[0]);
    aim(plan[1], aimed[1]);
    aim(plan[2], aimed[2]);
    aim(plan[3], aimed[3]);
    camera.position.lerpVectors(aimed[0].position, aimed[1].position, explode);
    target.lerpVectors(aimed[0].target, aimed[1].target, explode);
    camera.position.lerp(aimed[2].position, travel);
    target.lerp(aimed[2].target, travel);
    camera.position.lerp(aimed[3].position, dive);
    target.lerp(aimed[3].target, dive);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    const distance = camera.position.distanceTo(target);
    fog.near = distance + 5;
    fog.far = distance + 30;

    // Курсор над сотами: точка на плоскости рамки, без мыши её водит сама сцена.
    const nowSeconds = now / 1000;
    if (dive > 0) {
      if (nowSeconds - pointer.moved < 2.5) {
        normal.set(0, 0, 1).applyQuaternion(hero.group.quaternion);
        plane.setFromNormalAndCoplanarPoint(normal, hero.group.position);
        raycaster.setFromCamera(pointer.ndc, camera);
        if (raycaster.ray.intersectPlane(plane, hit)) {
          local.copy(hit);
          hero.group.worldToLocal(local);
          combPoint.lerp(local, 1 - Math.pow(0.004, dt));
        }
      } else {
        local.set(
          Math.sin(t * 0.45) * 1.3,
          hero.comb.centerY + Math.sin(t * 0.7) * 0.7,
          0,
        );
        combPoint.lerp(local, 1 - Math.pow(0.02, dt));
      }
    }
    while (ripples.length && nowSeconds - (ripples[0]?.start ?? 0) > 3.5)
      ripples.shift();

    // Ячейки: заливка мёдом сверху вниз, крышечки воска, подъём и свечение под курсором.
    const decay = Math.pow(0.3, dt);
    for (const cell of hero.cells) {
      if (dive <= 0) {
        cell.glow = 0;
        continue;
      }
      const dx = cell.x - combPoint.x;
      const dy = cell.y - combPoint.y;
      let wave = 0;
      for (const ripple of ripples) {
        const age = nowSeconds - ripple.start;
        const d = Math.hypot(cell.x - ripple.x, cell.y - ripple.y);
        wave = Math.max(
          wave,
          Math.exp(-age * 1.1) * Math.exp(-((d - age * 1.6) ** 2) / 0.02),
        );
      }
      cell.glow = Math.max(
        cell.glow * decay,
        Math.exp(-(dx * dx + dy * dy) / (2 * 0.32 * 0.32)),
        wave,
      );
    }
    for (const { mesh, side } of hero.sides) {
      hero.cells.forEach((cell, i) => {
        const filled = clamp(
          (fill * 1.35 - cell.order - (side < 0 ? 0.06 : 0)) * 3.5,
        );
        const sealed = clamp((fill * 1.35 - cell.order - 0.95) * 5);
        const lift = side > 0 ? smooth(cell.glow) * dive : 0;
        cellPosition.set(cell.x, cell.y, side * 0.04);
        scale.set(1, 1, 0.02 + filled * 0.1 - sealed * 0.02 + lift * 0.24);
        matrix.compose(cellPosition, side > 0 ? front : back, scale);
        mesh.setMatrixAt(i, matrix);
        // Вблизи светится только место под курсором, остальные соты темнеют.
        cellColor
          .copy(empty)
          .lerp(honey, filled)
          .lerp(capped, sealed * 0.75)
          .lerp(shade, dive * (1 - smooth(cell.glow)) * 0.55)
          .lerp(bright, lift * 0.6);
        mesh.setColorAt(i, cellColor);
      });
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    }
    if (dive > 0) {
      hero.group.localToWorld(hit.set(combPoint.x, combPoint.y, 0.9));
      cursorLight.position.copy(hit);
    }
    cursorLight.intensity = 6 * dive;
    // Затемнение под текстом на сцене густеет вместе с приближением к сотам.
    const depth = dive.toFixed(2);
    if (depth !== lastDepth) {
      options.stage.style.setProperty('--story-dive', depth);
      lastDepth = depth;
    }

    // Пчёлы на рамке ползают, пока она висит против света; над сотами летят за курсором.
    const crawlScale = 0.2 * ramp(...timeline.crawl, progress) * (1 - dive);
    for (const [i, crawler] of crawlers.entries()) {
      crawler.holder.visible = crawlScale > 0.001;
      crawler.holder.scale.setScalar(crawlScale / 0.2);
      crawler.rest -= dt;
      if (crawler.rest <= 0) {
        crawler.heading += (Math.random() - 0.5) * 14 * dt;
        crawler.x += Math.cos(crawler.heading) * dt * 0.32;
        crawler.y += Math.sin(crawler.heading) * dt * 0.32;
        if (Math.random() < dt * 0.3) crawler.rest = 0.8 + Math.random() * 1.6;
      }
      const maxX = hero.comb.width / 2 - 0.4;
      const maxY = hero.comb.height / 2 - 0.35;
      if (Math.abs(crawler.x) > maxX) {
        crawler.heading = Math.PI - crawler.heading;
        crawler.x = Math.sign(crawler.x) * maxX;
      }
      if (Math.abs(crawler.y - hero.comb.centerY) > maxY) {
        crawler.heading = -crawler.heading;
        crawler.y =
          hero.comb.centerY + Math.sign(crawler.y - hero.comb.centerY) * maxY;
      }
      crawler.holder.position.set(crawler.x, crawler.y, 0.2);
      crawler.holder.rotation.z = crawler.heading;
      crawler.bee.flap(t + i, crawler.rest > 0 ? 0.08 : 0.02);
    }
    drop.visible = travel > 0.7 && dive < 0.6;
    if (drop.visible) {
      dropState.phase += dt;
      if (dropState.phase < 2.4) {
        const grow = dropState.phase / 2.4;
        drop.scale.set(0.6 + grow * 0.5, 0.6 + grow * 1.1, 0.6 + grow * 0.5);
        dropState.y = -BODY_FRAME.height / 2 - 0.12 - grow * 0.1;
        dropState.speed = 0;
      } else {
        dropState.speed += 3.9 * dt;
        dropState.y -= dropState.speed * dt;
        drop.scale.set(0.9, 1.5, 0.9);
        if (dropState.y < -6) dropState.phase = 0;
      }
      drop.position.set(0.85, dropState.y, 0.02);
    }
    for (const [i, follower] of followers.entries()) {
      follower.bee.visible = dive > 0.3;
      if (!follower.bee.visible) continue;
      hero.group.localToWorld(
        look.set(
          combPoint.x + Math.cos(t * 1.3 + i * 2) * 0.45,
          combPoint.y + Math.sin(t * 1.3 + i * 2) * 0.32,
          0.55 + Math.sin(t * 2.1 + i) * 0.12,
        ),
      );
      const before = ahead.copy(follower.position);
      follower.position.lerp(look, 1 - Math.pow(0.5, dt * follower.lag));
      follower.bee.position.copy(follower.position);
      ahead
        .copy(follower.position)
        .sub(before)
        .multiplyScalar(20)
        .add(follower.position);
      if (ahead.distanceToSquared(follower.position) > 1e-8)
        follower.bee.lookAt(ahead);
      follower.bee.flap(t);
    }

    // Подписи частей держатся справа от своих частей на экране.
    options.labels.forEach((label, i) => {
      const part = parts[i];
      if (!part) return;
      part.object.localToWorld(
        anchor.set(HIVE.width / 2 + 0.45, part.height / 2, -HIVE.depth / 2),
      );
      anchor.project(camera);
      const x = (anchor.x * 0.5 + 0.5) * size.width;
      const y = (-anchor.y * 0.5 + 0.5) * size.height;
      const shown = labelsShown * smooth(explode * 1.6 - 0.35 - i * 0.05);
      label.style.opacity = shown.toFixed(3);
      label.style.transform = `translate(${x.toFixed(1)}px, ${(y - 10).toFixed(1)}px)`;
    });
  }

  let skip = false;
  function tick(now: number) {
    frameId = requestAnimationFrame(tick);
    if (!visible) {
      last = now;
      return;
    }
    skip = software && !skip;
    if (skip) return;
    update(now);
    renderer.render(scene, camera);
  }
  frameId = requestAnimationFrame(tick);

  function stop() {
    if (stopped) return;
    stopped = true;
    cancelAnimationFrame(frameId);
    resizeObserver.disconnect();
    intersection.disconnect();
    window.removeEventListener('pointermove', onMove);
    options.story.removeEventListener('pointerdown', onDown);
    options.canvas.removeEventListener('webglcontextlost', lost);
    renderer.dispose();
  }
  function lost(event: Event) {
    event.preventDefault();
    stop();
    options.onLost();
  }
  options.canvas.addEventListener('webglcontextlost', lost);
  return stop;
}
