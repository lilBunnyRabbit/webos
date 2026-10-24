import type { Rgb } from "../contrast";
import { random, TARGET_STRIDE } from "./targets";
import { ATTRIBUTE, PALETTE_SIZE, RENDER_FRAGMENT, RENDER_VERTEX, UPDATE_FRAGMENT, UPDATE_VERTEX } from "./shaders";

const STATE_FLOATS = 7;
const SEED_FLOATS = 2;
const MAX_DPR = 2;
const MAX_STEP = 1 / 30;
const SLEEP_AFTER = 9000;
const POINTER_RADIUS = 90;
const POINTER_FORCE = 14000;
const BURST_RADIUS = 150;
const BURST_FORCE = 90000;
const BURST_DECAY = 0.25;
const PROBES = 48;
/** How close, in CSS px, every probe has to be to its target for the figure to count as gathered. */
const GATHERED_WITHIN = 5;

interface Resources {
  update: WebGLProgram;
  render: WebGLProgram;
  states: [WebGLBuffer, WebGLBuffer];
  targets: WebGLBuffer;
  seeds: WebGLBuffer;
  vaos: [WebGLVertexArrayObject, WebGLVertexArrayObject];
  update_uniforms: Record<"box" | "from" | "dt" | "time" | "pointer" | "burst" | "palette", WebGLUniformLocation | null>;
  render_uniforms: Record<"size" | "scale" | "point" | "alpha", WebGLUniformLocation | null>;
}

export interface FieldOptions {
  count: number;
  still: boolean;
  onavailability?: (available: boolean) => void;
  /** True once the particles have landed on their figure, false the moment they set off for a new one. */
  ongathered?: (gathered: boolean) => void;
  /** The first frame the canvas has drawn. */
  onpainted?: () => void;
  /** The first figure forms out of dots spread over the whole canvas, not from just outside its own outline: meant for a
   * canvas that covers a whole pane, so the swarm reads as the pane filling in, never as a filled rectangle. */
  swarm?: boolean;
}

export class ParticleField {
  private readonly canvas: HTMLCanvasElement;
  private readonly count: number;
  private readonly still: boolean;
  private readonly swarm: boolean;
  private readonly onavailability?: (available: boolean) => void;
  private readonly ongathered?: (gathered: boolean) => void;
  private onpainted?: () => void;
  private gl: WebGL2RenderingContext | null = null;
  private resources: Resources | null = null;
  private current = 0;
  private frame = 0;
  private last = 0;
  private time = 0;
  private awake_until = 0;
  private active = false;
  private lost = false;

  private width = 1;
  private height = 1;
  private dpr = 1;
  private box = { x: 0, y: 0, width: 1, height: 1 };
  private carried: { x: number; y: number; width: number; height: number } | null = null;
  private targets: Float32Array;
  private palette = new Float32Array(PALETTE_SIZE * 3).fill(0.5);
  private pointer = { x: 0, y: 0, on: false };
  private ink = { alpha: 0.95, size: 1 };
  private burst = { x: 0, y: 0, strength: 0 };
  private seeded = false;
  private seed_values: Float32Array = new Float32Array(0);
  // A few particles integrated on the CPU with the shader's own spring, so the page knows when the figure has landed
  // without reading the GPU back: wobble and pointer are left out, both tiny next to the spring near the target.
  private probes = new Float32Array(PROBES * 4);
  private gathered = true;

  constructor(canvas: HTMLCanvasElement, options: FieldOptions) {
    this.canvas = canvas;
    this.count = options.count;
    this.still = options.still;
    this.swarm = options.swarm ?? false;
    this.onavailability = options.onavailability;
    this.ongathered = options.ongathered;
    this.onpainted = options.onpainted;
    this.targets = new Float32Array(this.count * TARGET_STRIDE).fill(0.5);
    canvas.addEventListener("webglcontextlost", this.handle_lost);
    canvas.addEventListener("webglcontextrestored", this.handle_restored);
  }

  /** Links off the main thread where the driver can: a synchronous link stalls the first screen for most of a second. */
  public async start(): Promise<boolean> {
    const gl = this.canvas.getContext("webgl2", {
      alpha: true,
      premultipliedAlpha: true,
      antialias: false,
      powerPreference: "low-power",
    });
    if (!gl) return false;
    this.gl = gl;
    const programs = begin_programs(gl);
    if (!programs) return false;
    const parallel = gl.getExtension("KHR_parallel_shader_compile");
    if (parallel) {
      while (!programs.every((program) => gl.getProgramParameter(program, parallel.COMPLETION_STATUS_KHR))) {
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (this.gl !== gl || gl.isContextLost()) return false;
      }
    }
    if (!programs.every((program) => linked(gl, program))) return false;
    this.resources = this.create(gl, programs[0], programs[1]);
    return true;
  }

  /** Dot size and opacity for the theme: a light page needs a lighter touch, or the overlapping dots read as rust. */
  public set_ink(light: boolean): void {
    this.ink = light ? { alpha: 0.92, size: 1.15 } : { alpha: 0.95, size: 1 };
    this.changed();
  }

  public destroy(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.canvas.removeEventListener("webglcontextlost", this.handle_lost);
    this.canvas.removeEventListener("webglcontextrestored", this.handle_restored);
    const gl = this.gl;
    if (gl && this.resources && !gl.isContextLost()) {
      const r = this.resources;
      [...r.states, r.targets, r.seeds].forEach((buffer) => gl.deleteBuffer(buffer));
      r.vaos.forEach((vao) => gl.deleteVertexArray(vao));
      gl.deleteProgram(r.update);
      gl.deleteProgram(r.render);
    }
    gl?.getExtension("WEBGL_lose_context")?.loseContext();
    this.gl = null;
    this.resources = null;
  }

  public resize(width: number, height: number): void {
    this.width = Math.max(1, width);
    this.height = Math.max(1, height);
    this.dpr = Math.min(MAX_DPR, devicePixelRatio || 1);
    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.changed();
  }

  /** `carry` moves every particle with the box at once (a resize, a scroll); without it they fly there (a new figure). */
  public set_box(x: number, y: number, width: number, height: number, carry = false): void {
    const next = { x, y, width: Math.max(1, width), height: Math.max(1, height) };
    if (Object.entries(next).every(([key, value]) => Math.abs(this.box[key as keyof typeof next] - value) < 0.5))
      return;
    if (carry && this.seeded && !this.still) this.carried ??= this.box;
    else if (this.seeded) this.set_gathered(this.still);
    this.box = next;
    this.changed();
  }

  public set_targets(targets: Float32Array): void {
    if (targets.length !== this.targets.length) return;
    this.targets = targets;
    if (this.gl && this.resources) {
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.resources.targets);
      this.gl.bufferSubData(this.gl.ARRAY_BUFFER, 0, targets);
      this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
      if (!this.seeded) this.place(!this.still);
      else this.set_gathered(this.still);
    }
    this.changed();
  }

  /** Order: primary, secondary, tertiary, accent, dust. */
  public set_palette(colors: Rgb[]): void {
    colors.slice(0, PALETTE_SIZE).forEach((rgb, i) =>
      this.palette.set(
        rgb.map((channel) => channel / 255),
        i * 3
      )
    );
    this.changed();
  }

  public set_pointer(x: number, y: number, on: boolean): void {
    this.pointer = { x, y, on };
    if (on) this.wake();
  }

  public push(x: number, y: number): void {
    this.burst = { x, y, strength: 1 };
    this.wake();
  }

  public set_active(active: boolean): void {
    this.active = active;
    if (active) this.wake();
    else this.stop();
  }

  private changed(): void {
    if (!this.seeded) return;
    if (this.still) this.draw_still();
    else this.wake();
  }

  private wake(): void {
    this.awake_until = performance.now() + SLEEP_AFTER;
    if (this.still || !this.active || this.lost || !this.gl || this.frame) return;
    this.last = performance.now();
    this.frame = requestAnimationFrame(this.tick);
  }

  private stop(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
  }

  private readonly tick = (now: number) => {
    this.frame = 0;
    const dt = Math.min(MAX_STEP, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    this.time += dt;
    this.step(dt);
    this.draw();
    this.follow(dt);
    if (this.active && now < this.awake_until) this.frame = requestAnimationFrame(this.tick);
  };

  private step(dt: number): void {
    const gl = this.gl;
    const r = this.resources;
    if (!gl || !r) return;
    const next = 1 - this.current;
    gl.useProgram(r.update);
    gl.uniform4f(r.update_uniforms.box, this.box.x, this.box.y, this.box.width, this.box.height);
    const from = this.carried;
    gl.uniform4f(r.update_uniforms.from, from?.x ?? 0, from?.y ?? 0, from?.width ?? 0, from?.height ?? 0);
    if (from) this.carry_probes(from);
    this.carried = null;
    gl.uniform1f(r.update_uniforms.dt, dt);
    gl.uniform1f(r.update_uniforms.time, this.time);
    gl.uniform4f(
      r.update_uniforms.pointer,
      this.pointer.x,
      this.pointer.y,
      this.pointer.on ? POINTER_FORCE : 0,
      POINTER_RADIUS
    );
    gl.uniform4f(r.update_uniforms.burst, this.burst.x, this.burst.y, this.burst.strength * BURST_FORCE, BURST_RADIUS);
    gl.uniform3fv(r.update_uniforms.palette, this.palette);
    this.burst.strength = this.burst.strength > 0.02 ? this.burst.strength * Math.pow(BURST_DECAY, dt * 10) : 0;

    gl.bindVertexArray(r.vaos[this.current]);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, r.states[next]);
    gl.enable(gl.RASTERIZER_DISCARD);
    gl.beginTransformFeedback(gl.POINTS);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.endTransformFeedback();
    gl.disable(gl.RASTERIZER_DISCARD);
    gl.bindBufferBase(gl.TRANSFORM_FEEDBACK_BUFFER, 0, null);
    gl.bindVertexArray(null);
    this.current = next;
  }

  private draw(): void {
    const gl = this.gl;
    const r = this.resources;
    if (!gl || !r) return;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(r.render);
    gl.uniform2f(r.render_uniforms.size, this.width, this.height);
    gl.uniform1f(r.render_uniforms.scale, this.dpr);
    const spacing = Math.sqrt((this.box.width * this.box.height) / this.count);
    gl.uniform1f(r.render_uniforms.point, Math.min(2.6, Math.max(1.5, spacing * 0.72)) * this.ink.size);
    gl.uniform1f(r.render_uniforms.alpha, this.ink.alpha);
    gl.bindVertexArray(r.vaos[this.current]);
    gl.drawArrays(gl.POINTS, 0, this.count);
    gl.bindVertexArray(null);
    if (this.onpainted) {
      const painted = this.onpainted;
      this.onpainted = undefined;
      painted();
    }
  }

  private probe_index(p: number): number {
    // Shape particles only: dust takes the last indices, and a speck of glow off its mark tells nothing about the figure.
    return Math.floor((p * this.count * 0.94) / PROBES);
  }

  private probe_target(index: number): [number, number] {
    return [this.box.x + this.targets[index * TARGET_STRIDE] * this.box.width, this.box.y + this.targets[index * TARGET_STRIDE + 1] * this.box.height];
  }

  private carry_probes(from: { x: number; y: number; width: number; height: number }): void {
    for (let p = 0; p < PROBES; p++) {
      const at = p * 4;
      this.probes[at] = this.box.x + ((this.probes[at] - from.x) / from.width) * this.box.width;
      this.probes[at + 1] = this.box.y + ((this.probes[at + 1] - from.y) / from.height) * this.box.height;
    }
  }

  private follow(dt: number): void {
    if (this.gathered || this.seed_values.length === 0) return;
    const damping = Math.pow(0.87, dt * 60);
    let farthest = 0;
    for (let p = 0; p < PROBES; p++) {
      const index = this.probe_index(p);
      const at = p * 4;
      const [tx, ty] = this.probe_target(index);
      const stiffness = 22 + (38 - 22) * this.seed_values[index * SEED_FLOATS];
      const vx = (this.probes[at + 2] + (tx - this.probes[at]) * stiffness * dt) * damping;
      const vy = (this.probes[at + 3] + (ty - this.probes[at + 1]) * stiffness * dt) * damping;
      this.probes[at] += vx * dt;
      this.probes[at + 1] += vy * dt;
      this.probes[at + 2] = vx;
      this.probes[at + 3] = vy;
      farthest = Math.max(farthest, Math.hypot(tx - this.probes[at], ty - this.probes[at + 1]));
    }
    if (farthest < GATHERED_WITHIN) this.set_gathered(true);
  }

  private set_gathered(gathered: boolean): void {
    if (gathered === this.gathered) return;
    this.gathered = gathered;
    this.ongathered?.(gathered);
  }

  private draw_still(): void {
    if (!this.gl || !this.resources || this.lost) return;
    this.place(false);
    this.draw();
  }

  private place(scatter: boolean): void {
    const gl = this.gl;
    const r = this.resources;
    if (!gl || !r) return;
    const next = random(11);
    const state = new Float32Array(this.count * STATE_FLOATS);
    const centre = { x: this.box.x + this.box.width / 2, y: this.box.y + this.box.height / 2 };
    for (let i = 0; i < this.count; i++) {
      const tone = Math.round(this.targets[i * TARGET_STRIDE + 2]);
      const at = i * STATE_FLOATS;
      const x = this.box.x + this.targets[i * TARGET_STRIDE] * this.box.width;
      const y = this.box.y + this.targets[i * TARGET_STRIDE + 1] * this.box.height;
      // The first shape gathers inward from just outside itself, so its outline is there from the first frame and the
      // static mark under it can hand over without a jump.
      const spread = scatter ? 1.06 + next() * 0.22 : 1;
      const jitter = scatter ? 14 : 0;
      if (scatter && this.swarm) {
        state[at] = next() * this.width;
        state[at + 1] = next() * this.height;
      } else {
        state[at] = centre.x + (x - centre.x) * spread + (next() - 0.5) * jitter;
        state[at + 1] = centre.y + (y - centre.y) * spread + (next() - 0.5) * jitter;
      }
      state.set(this.palette.subarray(tone * 3, tone * 3 + 3), at + 4);
    }
    for (let p = 0; p < PROBES; p++) {
      const index = this.probe_index(p);
      this.probes.set([state[index * STATE_FLOATS], state[index * STATE_FLOATS + 1], 0, 0], p * 4);
    }
    this.gathered = !scatter;
    gl.bindBuffer(gl.ARRAY_BUFFER, r.states[this.current]);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, state);
    // A state buffer still bound to ARRAY_BUFFER can't be the transform feedback target: WebGL2 fails the draw.
    gl.bindBuffer(gl.ARRAY_BUFFER, null);
    this.seeded = true;
  }

  private create(gl: WebGL2RenderingContext, update: WebGLProgram, render: WebGLProgram): Resources {

    const next = random(5);
    const seeds = new Float32Array(this.count * SEED_FLOATS).map(() => next());
    this.seed_values = seeds;
    const buffer = (data: Float32Array | number, usage: number) => {
      const handle = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, handle);
      if (typeof data === "number") gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      else gl.bufferData(gl.ARRAY_BUFFER, data, usage);
      return handle;
    };
    const bytes = this.count * STATE_FLOATS * 4;
    const states: [WebGLBuffer, WebGLBuffer] = [buffer(bytes, gl.STREAM_COPY), buffer(bytes, gl.STREAM_COPY)];
    const targets = buffer(this.targets, gl.DYNAMIC_DRAW);
    const seed_buffer = buffer(seeds, gl.STATIC_DRAW);

    const vao = (state: WebGLBuffer) => {
      const handle = gl.createVertexArray();
      gl.bindVertexArray(handle);
      const stride = STATE_FLOATS * 4;
      gl.bindBuffer(gl.ARRAY_BUFFER, state);
      attribute(gl, ATTRIBUTE.POSITION, 2, stride, 0);
      attribute(gl, ATTRIBUTE.VELOCITY, 2, stride, 8);
      attribute(gl, ATTRIBUTE.COLOR, 3, stride, 16);
      gl.bindBuffer(gl.ARRAY_BUFFER, targets);
      attribute(gl, ATTRIBUTE.TARGET, 3, TARGET_STRIDE * 4, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, seed_buffer);
      attribute(gl, ATTRIBUTE.SEED, 2, SEED_FLOATS * 4, 0);
      gl.bindVertexArray(null);
      return handle;
    };

    const located = <K extends string>(program: WebGLProgram, names: Record<K, string>) =>
      Object.fromEntries(
        Object.entries(names).map(([key, name]) => [key, gl.getUniformLocation(program, name as string)])
      ) as Record<K, WebGLUniformLocation | null>;

    this.current = 0;
    return {
      update,
      render,
      states,
      targets,
      seeds: seed_buffer,
      // Both programs read the same VAOs: the shaders pin the same attribute locations.
      vaos: [vao(states[0]), vao(states[1])],
      update_uniforms: located(update, {
        box: "u_box",
        from: "u_from",
        dt: "u_dt",
        time: "u_time",
        pointer: "u_pointer",
        burst: "u_burst",
        palette: "u_palette",
      }),
      render_uniforms: located(render, { size: "u_size", scale: "u_scale", point: "u_point", alpha: "u_alpha" }),
    };
  }

  private readonly handle_lost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.stop();
    this.resources = null;
    this.onavailability?.(false);
  };

  private readonly handle_restored = () => {
    if (!this.gl) return;
    this.lost = false;
    const gl = this.gl;
    const programs = begin_programs(gl);
    if (!programs || !programs.every((program) => linked(gl, program))) return;
    this.resources = this.create(gl, programs[0], programs[1]);
    this.seeded = false;
    this.set_targets(this.targets);
    this.onavailability?.(true);
    if (this.still) this.draw_still();
    else this.wake();
  };
}

function attribute(gl: WebGL2RenderingContext, location: number, size: number, stride: number, offset: number): void {
  gl.enableVertexAttribArray(location);
  gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset);
}

function compile(gl: WebGL2RenderingContext, type: number, source: string): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

function begin(gl: WebGL2RenderingContext, vertex: string, fragment: string, feedback?: string[]): WebGLProgram | null {
  const vs = compile(gl, gl.VERTEX_SHADER, vertex);
  const fs = compile(gl, gl.FRAGMENT_SHADER, fragment);
  if (!vs || !fs) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  if (feedback) gl.transformFeedbackVaryings(program, feedback, gl.INTERLEAVED_ATTRIBS);
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function begin_programs(gl: WebGL2RenderingContext): [WebGLProgram, WebGLProgram] | null {
  const update = begin(gl, UPDATE_VERTEX, UPDATE_FRAGMENT, ["v_position", "v_velocity", "v_color"]);
  const render = begin(gl, RENDER_VERTEX, RENDER_FRAGMENT);
  return update && render ? [update, render] : null;
}

function linked(gl: WebGL2RenderingContext, program: WebGLProgram): boolean {
  if (gl.getProgramParameter(program, gl.LINK_STATUS)) return true;
  console.error(gl.getProgramInfoLog(program));
  gl.deleteProgram(program);
  return false;
}
