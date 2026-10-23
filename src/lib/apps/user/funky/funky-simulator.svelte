<script lang="ts">
  import kernel, { NotificationType, type FilesService, type NotificationsService } from "$lib/core/api";
  import { base_name, file_stem, parent_path } from "$lib/core/api/services/files/path";
  import { Badge, Button, IconButton, Input, Select, Slider, Switch, Textarea } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    DownloadSimple as DownloadSimpleIcon,
    Pause as PauseIcon,
    Play as PlayIcon,
    Plus as PlusIcon,
    Record as RecordIcon,
    SkipForward as SkipForwardIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { Control, VARIABLES_BY_NAME, ValueType, type BuiltinVariable } from "./builtins";
  import { MAX_SERIES, SERIES_COLOURS, format_value, to_csv, type Series } from "./chart";
  import { compile_watch, type CompileResult } from "./compile";
  import FunkyChart from "./funky-chart.svelte";
  import { PRESETS, PRESETS_BY_ID, type SimSetup } from "./presets";
  import { apply_due, parse_script } from "./script";
  import { AMMO, BEHAVIOURS, Evidence, Simulator, type Entry, type Value } from "./simulator";
  import { report_error } from "$kit/utils/report-error";

  interface Props {
    result: CompileResult;
    setup: SimSetup;
    path: string | null;
    active: boolean;
  }

  let { result, setup, path, active }: Props = $props();

  const { app_id, window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  const DT = 1 / 60;
  const WINDOW_SECONDS = 20;
  const MAX_RECORDED = 60 * 60 * 10;
  const SPEEDS = ["0.25", "0.5", "1", "2", "4"];

  let preset = $state(untrack(() => setup.preset));
  let script_text = $state(untrack(() => setup.script));
  let plot = $state<string[]>(untrack(() => [...setup.plot]));
  let watches = $state<string[]>([]);
  let world = $state<Record<string, Value>>({});
  let running = $state(false);
  let speed = $state("1");
  let shared = $state(false);
  let recording = $state(false);
  let recorded = $state(0);
  let time = $state(0);
  let tick = $state(0);
  let values = $state.raw<Record<string, Value>>({});

  let simulator: Simulator | null = null;
  const times: number[] = [];
  const history = new Map<string, number[]>();
  let rows: (number | string)[][] = [];
  let columns: string[] = [];

  const script = $derived(parse_script(script_text));
  const watch_results = $derived(watches.map((source) => (source.trim() ? compile_watch(source, result.scope) : null)));
  const watch_entries = $derived(
    watch_results.flatMap((watch, index): Entry[] => (watch?.expr ? [{ name: watch_name(watches[index]), expr: watch.expr }] : []))
  );
  const names = $derived([...result.outputs.map((entry) => entry.name), ...result.setters.map((entry) => entry.name), ...watch_entries.map((entry) => entry.name)]);
  const uses_ammo = $derived([...result.setters, ...result.outputs].some((entry) => entry.ft.includes("ammo(")));

  const inputs = $derived.by(() => {
    const wanted = new Set<string>(result.builtins);
    for (const watch of watch_results) for (const name of watch?.builtins ?? []) wanted.add(name);
    for (const step of script.steps) if (step.name !== AMMO) wanted.add(step.name);
    wanted.delete("Time");
    const groups = new Map<string, BuiltinVariable[]>();
    for (const name of wanted) {
      const variable = VARIABLES_BY_NAME.get(name);
      if (!variable) continue;
      groups.set(variable.group, [...(groups.get(variable.group) ?? []), variable]);
    }
    return [...groups];
  });

  function watch_name(source: string): string {
    return `= ${source.trim()}`;
  }

  function initial_world(): Record<string, Value> {
    const base: Record<string, Value> = { [AMMO]: 10 };
    for (const [name, variable] of VARIABLES_BY_NAME) base[name] = variable.sim.initial;
    return { ...base, ...PRESETS_BY_ID.get(preset)?.world };
  }

  function rebuild() {
    simulator = new Simulator(result.setters, result.outputs);
    reset();
  }

  function reset() {
    simulator?.reset();
    world = initial_world();
    apply_due(script.steps, -1, 0, world);
    times.length = 0;
    history.clear();
    tick++;
    rows = [];
    recorded = 0;
    time = 0;
    values = {};
    sample(false);
  }

  function sample(advance: boolean) {
    if (!simulator) return;
    const env = $state.snapshot(world) as Record<string, Value>;
    if (advance && apply_due(script.steps, simulator.time, simulator.time + DT, env)) Object.assign(world, env);
    const at = simulator.time;
    const next = advance ? simulator.step(env, DT, watch_entries) : simulator.peek(env, DT, watch_entries);
    values = next;
    time = simulator.time;
    if (!advance) return;
    times.push(at);
    for (const name of names) {
      const list = history.get(name) ?? [];
      const value = next[name];
      list.push(typeof value === "number" ? value : NaN);
      history.set(name, list);
    }
    const limit = WINDOW_SECONDS * 60;
    if (times.length > limit) {
      times.splice(0, times.length - limit);
      for (const list of history.values()) list.splice(0, list.length - limit);
    }
    if (recording && rows.length < MAX_RECORDED) {
      if (!rows.length) columns = ["t", ...names];
      rows.push([Number(at.toFixed(4)), ...columns.slice(1).map((name) => next[name] ?? "")]);
      recorded = rows.length;
    }
  }

  const structure = $derived(
    [...result.setters, ...result.outputs].map((entry) => `${entry.name}=${entry.ft}`).join("\n") + "\n" + watch_entries.map((entry) => entry.name).join("\n")
  );
  $effect(() => {
    void structure;
    untrack(rebuild);
  });

  $effect(() => {
    const next = setup;
    untrack(() => {
      preset = next.preset;
      script_text = next.script;
      plot = [...next.plot];
      rebuild();
    });
  });

  const live = $derived(running && active && win.is_visible);
  $effect(() => {
    if (!live) return;
    let frame = 0;
    let last = 0;
    let carry = 0;
    const loop = (now: number) => {
      carry += Math.min(last ? (now - last) / 1000 : 0, 0.1) * Number(speed);
      last = now;
      let steps = 0;
      while (carry >= DT && steps < 480) {
        sample(true);
        carry -= DT;
        steps++;
      }
      if (steps) tick++;
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  });

  $effect(() => {
    void $state.snapshot(world);
    if (!untrack(() => running)) untrack(() => sample(false));
  });

  function step_once() {
    running = false;
    sample(true);
    tick++;
  }

  function toggle_plot(name: string) {
    if (plot.includes(name)) plot = plot.filter((entry) => entry !== name);
    else plot = [...plot.slice(-(MAX_SERIES - 1)), name];
  }

  const series = $derived.by((): Series[] => {
    void tick;
    return plot
      .filter((name) => names.includes(name))
      .map((name, index) => ({ name, ...SERIES_COLOURS[index], values: history.get(name) ?? [] }));
  });

  function apply_preset(id: string) {
    preset = id;
    Object.assign(world, PRESETS_BY_ID.get(id)?.world ?? {});
  }

  function set_toggle(variable: BuiltinVariable, on: boolean) {
    const [yes, no] = variable.sim.values ?? [1, -1];
    world[variable.name] = on ? yes : no;
  }

  async function export_csv() {
    if (!rows.length) return;
    const stem = path ? file_stem(base_name(path)) : "funky";
    const target = await win.pick_save({ name: `${stem}-simulation.csv`, accept: [".csv"], start_path: path ? parent_path(path) : "/home", title: "Export recording" });
    if (!target) return;
    try {
      const directory = await files.get_directory(parent_path(target));
      if (!directory) throw new Error(`Folder not found: ${parent_path(target)}`);
      await files.create_file(directory, base_name(target), { content: to_csv(columns, rows), overwrite: true });
      notifications.notify(app_id, { type: NotificationType.INFO, title: "Recording exported", message: target });
    } catch (reason) {
      report_error(app_id, "Couldn't export the recording", reason);
    }
  }

  function toggle_recording() {
    recording = !recording;
    if (recording) {
      rows = [];
      recorded = 0;
    }
  }
</script>

<div class="flex flex-col gap-4 p-3">
  <div class="flex flex-wrap items-center gap-1.5">
    <Button size="sm" variant="primary" onclick={() => (running = !running)}>
      {#if running}<PauseIcon weight="fill" /> Pause{:else}<PlayIcon weight="fill" /> Play{/if}
    </Button>
    <IconButton label="Step one tick" size="sm" onclick={step_once}><SkipForwardIcon weight="bold" /></IconButton>
    <IconButton label="Reset" size="sm" onclick={reset}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
    <Select size="sm" aria-label="Speed" class="w-20" bind:value={speed} options={SPEEDS.map((value) => ({ value, label: `${value}×` }))} />
    <span class="ml-auto font-mono text-2xs text-foreground/80 tabular-nums">t {time.toFixed(2)} s</span>
  </div>

  <div class="flex flex-wrap items-center gap-1.5">
    <Select size="sm" aria-label="Flight state" class="w-auto min-w-0 flex-1" value={preset} onchange={(event) => apply_preset(event.currentTarget.value)} options={PRESETS.map((entry) => ({ value: entry.id, label: entry.label }))} />
    <IconButton label={recording ? "Stop recording" : "Record"} size="sm" pressed={recording} onclick={toggle_recording}><RecordIcon weight={recording ? "fill" : "bold"} /></IconButton>
    <IconButton label="Export recording as CSV" size="sm" disabled={!recorded} onclick={export_csv}><DownloadSimpleIcon weight="bold" /></IconButton>
    {#if recorded}<span class="font-mono text-2xs text-foreground/65 tabular-nums">{recorded} rows</span>{/if}
  </div>

  <FunkyChart {times} {series} {shared} {tick} />
  <label class="flex items-center gap-2 text-ui text-foreground/80">
    <Switch bind:checked={shared} />
    One scale for every line
  </label>

  <section aria-label="Values" class="flex flex-col">
    <h3 class="mb-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Values · tap to plot (up to {MAX_SERIES})</h3>
    {#each names as name (name)}
      {@const index = plot.indexOf(name)}
      {@const output = result.outputs.some((entry) => entry.name === name)}
      <button
        type="button"
        class={cn(
          "flex h-8 items-center gap-2 rounded-md px-2 text-left focus-visible:ring-2 focus-visible:ring-cottontail focus-visible:outline-none pointer-coarse:h-10",
          index >= 0 && "bg-primary/8"
        )}
        aria-pressed={index >= 0}
        onclick={() => toggle_plot(name)}
      >
        <span class={cn("size-2 shrink-0 rounded-full", index >= 0 ? SERIES_COLOURS[index]?.fill : "bg-foreground/15")}></span>
        <span class="min-w-0 flex-1 truncate font-mono text-2xs">{name}</span>
        {#if output}<Badge>part</Badge>{/if}
        <span class="font-mono text-2xs tabular-nums">{format_value(values[name])}</span>
      </button>
    {:else}
      <p class="text-ui text-foreground/65">Nothing to simulate: add a var or an output.</p>
    {/each}
  </section>

  <section aria-label="Watches" class="flex flex-col gap-1.5">
    <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Watches</h3>
    {#each watches as source, index (index)}
      {@const watch = watch_results[index]}
      <div class="flex items-center gap-1.5">
        <Input size="sm" class="font-mono" aria-label="Watch expression {index + 1}" placeholder="PID(0, RollAngle, 0.05, 0, 0.02)" bind:value={watches[index]} />
        <IconButton label="Remove watch" size="sm" onclick={() => (watches = watches.filter((_, position) => position !== index))}><XIcon weight="bold" /></IconButton>
      </div>
      {#if watch?.error}<p class="text-2xs text-error">{watch.error}</p>{/if}
    {/each}
    <Button size="sm" class="self-start" onclick={() => (watches = [...watches, ""])}><PlusIcon weight="bold" /> Add a watch</Button>
  </section>

  <section aria-label="Inputs" class="flex flex-col gap-3">
    <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">World</h3>
    {#if !inputs.length && !uses_ammo}<p class="text-ui text-foreground/65">The code reads no built-in variables.</p>{/if}
    {#each inputs as [group, variables] (group)}
      <div class="flex flex-col gap-2">
        <span class="text-2xs text-foreground/65">{group}</span>
        {#each variables as variable (variable.name)}
          <div class="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2">
            <span class="truncate font-mono text-2xs" title={variable.detail}>{variable.name}</span>
            {#if variable.sim.control === Control.TOGGLE}
              <Switch aria-label={variable.name} checked={world[variable.name] === variable.sim.values?.[0]} onchange={(event) => set_toggle(variable, event.currentTarget.checked)} />
            {:else if variable.sim.control === Control.TEXT}
              <Input size="sm" aria-label={variable.name} value={String(world[variable.name] ?? "")} oninput={(event) => (world[variable.name] = event.currentTarget.value)} />
            {:else}
              <Slider
                size="sm"
                aria-label={variable.name}
                min={variable.sim.min}
                max={variable.sim.max}
                step={variable.sim.step}
                value={Number(world[variable.name] ?? 0)}
                oninput={(event) => (world[variable.name] = Number(event.currentTarget.value))}
              />
            {/if}
            <span class="min-w-14 text-right font-mono text-2xs text-foreground/80 tabular-nums">
              {variable.type === ValueType.STRING ? "" : format_value(world[variable.name])}{variable.sim.unit ?? ""}
            </span>
          </div>
        {/each}
      </div>
    {/each}
    {#if uses_ammo}
      <div class="grid grid-cols-[minmax(0,7rem)_1fr_auto] items-center gap-2">
        <span class="font-mono text-2xs" title="What every ammo() call returns here">{AMMO}</span>
        <Slider size="sm" aria-label="Ammo" min={0} max={100} step={1} value={Number(world[AMMO] ?? 0)} oninput={(event) => (world[AMMO] = Number(event.currentTarget.value))} />
        <span class="min-w-14 text-right font-mono text-2xs tabular-nums">{format_value(world[AMMO])}</span>
      </div>
    {/if}
  </section>

  <section aria-label="Script" class="flex flex-col gap-1.5">
    <h3 class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Script</h3>
    <p class="text-2xs text-foreground/65">One step a line, run from Reset: <code class="font-mono">2s Pitch = 1</code>, <code class="font-mono">5s GearDown = off</code>.</p>
    <Textarea mono rows={4} aria-label="Script" bind:value={script_text} onchange={reset} />
    {#each script.errors as error (error.line)}
      <p class="text-2xs text-error">Line {error.line}: {error.message}</p>
    {/each}
  </section>

  <details class="group rounded-lg bg-background-light p-3 shadow-card ring-1 ring-hairline">
    <summary class="cursor-pointer text-ui font-medium">How the simulator models Funky Trees</summary>
    <p class="mt-2 text-2xs text-foreground/65">
      There is no flight model: the world only changes when you or the script change it. "Documented" comes from the game's notes or the funkyguide; "assumed" hasn't been checked in the game.
    </p>
    <ul class="mt-2 flex flex-col gap-2">
      {#each BEHAVIOURS as behaviour (behaviour.title)}
        <li class="flex flex-col gap-0.5">
          <span class="flex items-center gap-2 text-ui">
            <Badge tone={behaviour.evidence === Evidence.DOCUMENTED ? "success" : "warning"}>{behaviour.evidence}</Badge>
            {behaviour.title}
          </span>
          <span class="text-2xs text-foreground/65">{behaviour.detail}</span>
        </li>
      {/each}
    </ul>
  </details>
</div>
