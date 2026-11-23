import { reducedMotion } from './motion';

/* Живые соты для пустых состояний: пчёлы то и дело заливают ячейки мёдом, под курсором
   соты наливаются, по нажатию расходится волна. Рисуется на 2D-холсте, без three.js.
   Цвет пустых ячеек берётся из CSS-свойства color у холста, так соты подходят к фону.
   При «уменьшить движение» остаётся неподвижный кадр. */

type Cell = {
  x: number;
  y: number;
  level: number;
  goal: number;
  until: number;
};

const HONEY = [245, 183, 0] as const;
const DEEP = [199, 120, 0] as const;

function parseColor(value: string): [number, number, number] {
  const match = value.match(/\d+(\.\d+)?/g);
  if (!match || match.length < 3) return [233, 227, 211];
  return [Number(match[0]), Number(match[1]), Number(match[2])];
}

const mix = (a: readonly number[], b: readonly number[], t: number) =>
  `rgb(${a.map((v, i) => Math.round(v + ((b[i] ?? v) - v) * t)).join(' ')})`;

export function mountCombField(canvas: HTMLCanvasElement): () => void {
  const context = canvas.getContext('2d');
  if (!context) return () => {};
  const g = context;
  const still = reducedMotion();
  const radius = 15;
  const step = Math.sqrt(3) * radius;
  let empty = parseColor(getComputedStyle(canvas).color);
  let cells: Cell[] = [];
  let width = 0;
  let height = 0;
  const pointer = { x: -1000, y: -1000, seen: 0 };
  const ripples: { x: number; y: number; start: number }[] = [];

  function layout() {
    const rect = canvas.getBoundingClientRect();
    width = rect.width;
    height = rect.height;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
    g.setTransform(ratio, 0, 0, ratio, 0, 0);
    empty = parseColor(getComputedStyle(canvas).color);
    cells = [];
    for (let row = -1; row * 1.5 * radius < height + radius; row++) {
      for (let col = -1; col * step < width + step; col++) {
        const x = col * step + (row % 2 ? step / 2 : 0);
        const y = row * 1.5 * radius;
        // В неподвижном кадре часть сот уже залита: узор, а не пустая сетка.
        const level = still
          ? Math.max(0, Math.sin(x * 0.02 + y * 0.035) * 1.4 - 0.4)
          : 0;
        cells.push({ x, y, level, goal: 0, until: 0 });
      }
    }
  }

  function hexagon(x: number, y: number, r: number) {
    g.beginPath();
    for (let k = 0; k < 6; k++) {
      const angle = Math.PI / 6 + (k * Math.PI) / 3;
      const px = x + Math.cos(angle) * r;
      const py = y + Math.sin(angle) * r;
      if (k === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
  }

  function draw() {
    g.clearRect(0, 0, width, height);
    for (const cell of cells) {
      const level = Math.min(1, cell.level);
      hexagon(cell.x, cell.y, radius * (0.86 + level * 0.06));
      g.fillStyle =
        level < 0.5
          ? mix(empty, DEEP, level * 1.2)
          : mix(DEEP, HONEY, (level - 0.5) * 2);
      g.fill();
    }
  }

  let frame = 0;
  let last = performance.now();
  let visible = true;
  function tick(now: number) {
    frame = requestAnimationFrame(tick);
    if (!visible) {
      last = now;
      return;
    }
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const seconds = now / 1000;
    // Без мыши соты заливают «пчёлы»: случайные ячейки наполняются и потом тускнеют.
    if (Math.random() < dt * 9) {
      const cell = cells[Math.floor(Math.random() * cells.length)];
      if (cell) {
        cell.goal = 1;
        cell.until = seconds + 1.2 + Math.random() * 1.8;
      }
    }
    while (ripples.length && seconds - (ripples[0]?.start ?? 0) > 2.5)
      ripples.shift();
    const active = seconds - pointer.seen < 1.5;
    for (const cell of cells) {
      if (cell.until && seconds > cell.until) {
        cell.goal = 0;
        cell.until = 0;
      }
      let target = cell.goal;
      if (active) {
        const d = Math.hypot(cell.x - pointer.x, cell.y - pointer.y);
        target = Math.max(target, Math.exp(-(d * d) / (2 * 38 * 38)));
      }
      for (const ripple of ripples) {
        const age = seconds - ripple.start;
        const d = Math.hypot(cell.x - ripple.x, cell.y - ripple.y);
        target = Math.max(
          target,
          Math.exp(-age * 1.4) * Math.exp(-((d - age * 220) ** 2) / 900),
        );
      }
      // Наполняется быстро, стекает медленно: за курсором остаётся медовый след.
      const speed = target > cell.level ? 9 : 1.6;
      cell.level += (target - cell.level) * Math.min(1, dt * speed);
    }
    draw();
  }

  const move = (event: PointerEvent) => {
    const rect = canvas.getBoundingClientRect();
    pointer.x = event.clientX - rect.left;
    pointer.y = event.clientY - rect.top;
    pointer.seen = performance.now() / 1000;
  };
  const press = (event: PointerEvent) => {
    move(event);
    ripples.push({
      x: pointer.x,
      y: pointer.y,
      start: performance.now() / 1000,
    });
  };

  const resize = new ResizeObserver(() => {
    layout();
    draw();
  });
  resize.observe(canvas);
  layout();
  draw();
  if (still) return () => resize.disconnect();

  const watch = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? true;
  });
  watch.observe(canvas);
  canvas.addEventListener('pointermove', move);
  canvas.addEventListener('pointerdown', press);
  frame = requestAnimationFrame(tick);
  return () => {
    cancelAnimationFrame(frame);
    resize.disconnect();
    watch.disconnect();
    canvas.removeEventListener('pointermove', move);
    canvas.removeEventListener('pointerdown', press);
  };
}
