import { motion_reduced } from "$lib/core/utils/motion";
import { measure_colors } from "../desk/measure";
import { draw_shape, shape_key, type Shape } from "./shapes";
import { PALETTE_SIZE } from "./shaders";
import { ParticleField } from "./field";
import { even_targets } from "./even-targets";
import { local_box, local_point, type LocalBox } from "./local-box";

const RESAMPLE_AT = 0.04;
/** Particles per CSS px² of the figure's box: dense enough to read as a fill, sparse enough that every dot stays a dot. */
const DENSITY = 0.24;
const MIN_COUNT = 5000;
const MAX_COUNT = 22000;

/** Lets a frame paint between the heavy steps of setting a field up, so the page never stalls on one long task. */
const breathe = () => new Promise<void>((resolve) => requestAnimationFrame(() => setTimeout(resolve, 0)));

export interface StageNodes {
  stage: HTMLElement;
  canvas: HTMLCanvasElement;
  figure: HTMLElement;
}

/** Portfolio's particle stage: one colour (primary) for every tone, and an optional second box the shape can fly to. */
export class ParticleStage {
  /** False without WebGL2, or while a lost context hasn't come back. */
  public available = $state(true);
  public still = $state(false);
  /** The canvas has drawn its first frame; until then the static mark holds the slot. */
  public painted = $state(false);
  /** The particles are on their figure, not on their way to it. */
  public gathered = $state(true);

  private field: ParticleField | null = null;
  private nodes: StageNodes | null = null;
  private shape: Shape | null = null;
  private sampled = { key: "", aspect: 0 };
  private count = 0;
  private visible = true;
  private on_screen = false;
  private resample_timer: ReturnType<typeof setTimeout> | undefined;

  public mount(nodes: StageNodes, swarm = false): () => void {
    this.nodes = nodes;
    const still = motion_reduced();
    this.still = still;
    this.painted = false;
    this.gathered = true;
    const count = Math.round(Math.min(MAX_COUNT, Math.max(MIN_COUNT, nodes.figure.offsetWidth * nodes.figure.offsetHeight * DENSITY)));
    let alive = true;
    let cleanup = () => {};

    // Shader setup, the shape's sampling and the first upload each get a frame of their own: done in one go they block
    // the main thread for most of a second on a slow GPU, right as the first window appears.
    const setup = async () => {
      await breathe();
      if (!alive) return;
      const field = new ParticleField(nodes.canvas, {
        count,
        still,
        swarm,
        onavailability: (available) => (this.available = available),
        ongathered: (gathered) => (this.gathered = gathered),
        onpainted: () => (this.painted = true),
      });
      const started = await field.start();
      if (!alive) return field.destroy();
      if (!started) {
        field.destroy();
        this.available = false;
        return;
      }
      await breathe();
      if (!alive) return field.destroy();
      this.field = field;
      this.count = count;
      this.measure_size();
      this.refresh_palette();
      this.measure_box(false);
      await breathe();
      if (!alive) {
        field.destroy();
        this.field = null;
        return;
      }
      this.retarget();

      const sizes = new ResizeObserver(() => {
        this.measure_size();
        this.measure_box(true);
      });
      sizes.observe(nodes.stage);
      sizes.observe(nodes.figure);
      const seen = new IntersectionObserver(([entry]) => {
        this.on_screen = entry?.isIntersecting ?? false;
        this.sync_active();
      });
      seen.observe(nodes.stage);
      const scrolled = () => this.measure_box(true);
      addEventListener("scroll", scrolled, { capture: true, passive: true });
      cleanup = () => {
        clearTimeout(this.resample_timer);
        sizes.disconnect();
        seen.disconnect();
        removeEventListener("scroll", scrolled, { capture: true });
        field.destroy();
        this.field = null;
      };
    };
    void setup();

    return () => {
      alive = false;
      cleanup();
      this.nodes = null;
      this.sampled = { key: "", aspect: 0 };
    };
  }

  public set_visible(visible: boolean): void {
    this.visible = visible;
    this.sync_active();
  }

  public show(shape: Shape): void {
    this.shape = shape;
    this.retarget();
  }

  public refresh_palette(): void {
    if (!this.field) return;
    const measured = measure_colors({ primary: "var(--primary)", background: "var(--background)" });
    const primary = measured.primary?.rgb ?? [128, 128, 128];
    const [r, g, b] = measured.background?.rgb ?? [0, 0, 0];
    this.field.set_palette(Array.from({ length: PALETTE_SIZE }, () => primary));
    this.field.set_ink(0.2126 * r + 0.7152 * g + 0.0722 * b > 140);
  }

  public pointer(event: PointerEvent, on: boolean): void {
    const at = this.local(event);
    if (!at || !this.field) return;
    if (event.type === "pointerdown") this.field.push(at.x, at.y);
    else this.field.set_pointer(at.x, at.y, on && (event.pointerType !== "touch" || event.buttons > 0));
  }

  private local(event: PointerEvent): { x: number; y: number } | null {
    return this.nodes ? local_point(this.nodes.canvas, event.clientX, event.clientY) : null;
  }

  private sync_active(): void {
    this.field?.set_active(this.visible && this.on_screen);
  }

  private measure_size(): void {
    const canvas = this.nodes?.canvas;
    if (canvas) this.field?.resize(canvas.clientWidth, canvas.clientHeight);
  }

  private box(): LocalBox | null {
    const rect = this.nodes && local_box(this.nodes.canvas, this.nodes.figure);
    return rect && rect.width >= 1 && rect.height >= 1 ? rect : null;
  }

  private measure_box(carry: boolean): void {
    if (!this.nodes || !this.field) return;
    const figure = this.box();
    if (!figure) return;
    this.field.set_box(figure.x, figure.y, figure.width, figure.height, carry);
    const aspect = figure.width / figure.height;
    if (this.sampled.aspect && Math.abs(aspect / this.sampled.aspect - 1) > RESAMPLE_AT) {
      clearTimeout(this.resample_timer);
      this.resample_timer = setTimeout(() => this.retarget(true), 120);
    }
  }

  private retarget(force = false): void {
    const shape = this.shape;
    const nodes = this.nodes;
    if (!shape || !nodes || !this.field) return;
    const figure = this.box();
    if (!figure) return;
    const aspect = figure.width / figure.height;
    const key = shape_key(shape);
    if (!force && key === this.sampled.key && Math.abs(aspect / this.sampled.aspect - 1) <= RESAMPLE_AT) return;

    const drawn = draw_shape(shape, aspect);
    this.sampled = { key, aspect };
    this.field.set_targets(even_targets(drawn.mask, this.count, { seed: drawn.seed, rule: drawn.rule }));
  }
}
