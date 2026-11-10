<script lang="ts">
  import { Button, IconButton } from "$lib/core/components/ui";
  import { Check as CheckIcon, Minus as MinusIcon, Plus as PlusIcon } from "phosphor-svelte";
  import { Op, type Editor } from "./editor.svelte";
  import type { AxisDirection } from "./projection";
  import { DirectionRing, Numpad, type Spoke } from "$kit/components/length-pad";
  import { AXIS_FILL, AXIS_STROKE } from "./colors";

  interface Props {
    editor: Editor;
    directions: AxisDirection[];
    blocked: string | null;
    ready: boolean;
    hint: string;
    onpick: (direction: AxisDirection) => void;
    oncommit: () => void;
    ondone: () => void;
  }

  let { editor, directions, blocked, ready, hint, onpick, oncommit, ondone }: Props = $props();

  const TITLES: Record<Op, string> = {
    [Op.WALK]: "Draw",
    [Op.MOVE]: "Move",
    [Op.EXTRUDE]: "Extrude",
    [Op.COPY]: "Copy along",
  };

  const op = $derived(editor.panel ?? Op.WALK);
  const has_length = $derived(Number(editor.input) > 0);
  const MAX_COUNT = 99;

  const spoke_id = (direction: { axis: string; sign: number }) => `${direction.sign > 0 ? "+" : "−"}${direction.axis.toUpperCase()}`;

  const spokes = $derived<Spoke[]>(
    directions.map((direction) => {
      const id = spoke_id(direction);
      return { id, at: direction.at, label: id, name: `Along ${id}`, stroke: AXIS_STROKE[direction.axis], fill: AXIS_FILL[direction.axis] };
    })
  );

  function pick_spoke(id: string) {
    const direction = directions.find((each) => spoke_id(each) === id);
    if (direction) onpick(direction);
  }

  function keep_focus(event: PointerEvent) {
    event.preventDefault();
  }
</script>

<section class="sheet flex flex-col gap-2 border-t border-foreground/8 bg-background-light px-3 pt-2.5 pb-3" aria-label={TITLES[op]}>
  <div class="flex items-center gap-2">
    <div class="min-w-0 flex-1">
      <div class="text-ui font-medium">{TITLES[op]}</div>
      <div class={["text-2xs", blocked ? "text-warning" : "text-foreground/65"]} aria-live="polite">{blocked ?? hint}</div>
    </div>
    <Button size="sm" variant="secondary" onclick={ondone}>Done</Button>
  </div>

  <div class="flex items-center gap-2">
    <div class="flex h-12 min-w-0 flex-1 items-center gap-2 rounded-lg bg-[light-dark(var(--background-lightest),var(--background-darker))] px-3 ring-1 ring-foreground/15 ring-inset">
      {#if editor.pending}
        <span class="font-mono text-ui font-bold text-foreground/80">{editor.pending.sign > 0 ? "+" : "−"}{editor.pending.axis.toUpperCase()}</span>
      {/if}
      <output class={["min-w-0 flex-1 truncate text-right font-mono text-2xl tabular-nums", !editor.typed && "text-foreground/65"]} aria-live="polite">
        {#if editor.input}{editor.input}{:else}<span class="text-foreground/38">0</span>{/if}
      </output>
      <span class="font-mono text-ui text-foreground/65">{editor.wire.unit}</span>
    </div>
    {#if editor.pending}
      <IconButton label="Draw it (Enter)" size="lg" variant="primary" class="shrink-0" disabled={!has_length} onpointerdown={keep_focus} onclick={oncommit}>
        <CheckIcon weight="bold" />
      </IconButton>
    {/if}
  </div>

  {#if op === Op.COPY}
    <div class="flex items-center gap-2 text-ui">
      <span class="flex-1 text-foreground/80">Copies</span>
      <IconButton label="Fewer copies" size="md" disabled={editor.count <= 1} onpointerdown={keep_focus} onclick={() => (editor.count = Math.max(1, editor.count - 1))}>
        <MinusIcon weight="bold" />
      </IconButton>
      <output class="w-8 text-center font-mono tabular-nums">{editor.count}</output>
      <IconButton label="More copies" size="md" disabled={editor.count >= MAX_COUNT} onpointerdown={keep_focus} onclick={() => (editor.count = Math.min(MAX_COUNT, editor.count + 1))}>
        <PlusIcon weight="bold" />
      </IconButton>
    </div>
  {/if}

  <div class="grid grid-cols-2 items-center gap-3">
    <Numpad class="grid-rows-[repeat(4,2.75rem)]" onpress={(key) => editor.press(key)} />
    <DirectionRing
      {spokes}
      label="Axis directions"
      class="aspect-square w-full max-w-56 justify-self-center"
      disabled={!ready || !!blocked}
      armed={has_length}
      selected={editor.pending ? spoke_id(editor.pending) : null}
      onpick={(id) => pick_spoke(id)}
    />
  </div>
</section>
