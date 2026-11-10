// NEONDECK – Mini-Engine: einheitlicher rAF-Loop mit Delta-Time, automatischem
// Pausieren im Hintergrund-Tab, Resize-Handling und einfacher Tastatureingabe.
// Alle 2D-Spiele bauen darauf auf (kein bildratenabhängiges Movement, §10).

export class GameLoop {
  private raf = 0;
  private last = 0;
  private running = false;
  private pausedByTab = false;
  /** dt in Sekunden, geklemmt gegen Zeitsprünge (Tab-Wechsel, Breakpoints). */
  constructor(private step: (dt: number) => void) {
    document.addEventListener('visibilitychange', this.onVisibility);
  }
  private onVisibility = () => {
    if (document.hidden) { this.pausedByTab = this.running; this.halt(); }
    else if (this.pausedByTab) { this.pausedByTab = false; this.run(); }
  };
  private frame = (t: number) => {
    if (!this.running) return;
    const dt = Math.min(0.05, (t - this.last) / 1000 || 0);
    this.last = t;
    this.step(dt);
    this.raf = requestAnimationFrame(this.frame);
  };
  private halt() { this.running = false; cancelAnimationFrame(this.raf); }
  private run() { this.running = true; this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); }
  start() { if (!this.running) this.run(); }
  stop() { this.pausedByTab = false; this.halt(); document.removeEventListener('visibilitychange', this.onVisibility); }
}

/** HiDPI-fähiges Canvas, das den Container sauber ausfüllt. */
export function fitCanvas(canvas: HTMLCanvasElement, box: HTMLElement): () => void {
  const resize = () => {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = box.clientWidth, h = box.clientHeight;
    canvas.width = Math.max(1, Math.round(w * dpr));
    canvas.height = Math.max(1, Math.round(h * dpr));
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
  };
  const ro = new ResizeObserver(resize);
  ro.observe(box);
  resize();
  return () => ro.disconnect();
}

/** gebündelter Input-Listener; destroy() entfernt alles (kein Listener-Leck). */
export class Input {
  keys = new Set<string>();
  private onKeyDown = (e: KeyboardEvent) => {
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
    this.keys.add(e.key.toLowerCase());
  };
  private onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.key.toLowerCase());
  private onBlur = () => this.keys.clear();
  /** Touch-Steuerung: aktive Zone ('left','right','up','down') oder null. */
  touch: string | null = null;
  constructor(private host: HTMLElement) {
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.onBlur);
    host.addEventListener('touchstart', this.onTouch);
    host.addEventListener('touchmove', this.onTouch);
    host.addEventListener('touchend', this.onTouchEnd);
    host.addEventListener('touchcancel', this.onTouchEnd);
  }
  private onTouch = (e: TouchEvent) => {
    const t = e.touches[0]; if (!t) return;
    const r = this.host.getBoundingClientRect();
    const x = t.clientX - r.left, y = t.clientY - r.top;
    // virtuelles D-Pad relativ zur Bildschirmmitte
    this.touch = (y < r.height * 0.3) ? 'up' : (x < r.width * 0.35 ? 'left' : x > r.width * 0.65 ? 'right' : 'down');
  };
  private onTouchEnd = () => { this.touch = null; };
  down(...names: string[]) { return names.some(n => this.keys.has(n)); }
  get left() { return this.down('arrowleft', 'a') || this.touch === 'left'; }
  get right() { return this.down('arrowright', 'd') || this.touch === 'right'; }
  get up() { return this.down('arrowup', 'w') || this.touch === 'up'; }
  get downKey() { return this.down('arrowdown', 's') || this.touch === 'down'; }
  get action() { return this.down(' ', 'enter'); }
  /** Konsumiert die Aktionstaste (verhindert Dauerfeuer bei gehaltener Taste). */
  consumeAction() { const had = this.action; this.keys.delete(' '); this.keys.delete('enter'); return had; }
  destroy() {
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.onBlur);
    this.host.removeEventListener('touchstart', this.onTouch);
    this.host.removeEventListener('touchmove', this.onTouch);
    this.host.removeEventListener('touchend', this.onTouchEnd);
    this.host.removeEventListener('touchcancel', this.onTouchEnd);
  }
}

export function randInt(n: number): number { return Math.floor(Math.random() * n); }
export function pick<T>(arr: T[]): T { return arr[randInt(arr.length)]; }
export function clamp(v: number, a: number, b: number): number { return v < a ? a : v > b ? b : v; }
export function dist(ax: number, ay: number, bx: number, by: number): number { return Math.hypot(ax - bx, ay - by); }
