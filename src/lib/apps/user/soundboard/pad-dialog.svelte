<script lang="ts" module>
  import type { Pad } from "./board";

  export type PadEdit = { action: "save"; pad: Pad } | { action: "delete" };
</script>

<script lang="ts">
  import kernel, { type DialogProps, type FilesService } from "$lib/core/api";
  import { base_name } from "$lib/core/api/services/files/path";
  import { Button, IconButton, Input, Select, Slider, Spinner, Switch } from "$lib/core/components/ui";
  import { cn, error_message } from "$lib/core/utils";
  import {
    CaretRight as CaretIcon,
    Image as ImageIcon,
    Palette as PaletteIcon,
    Play as PlayIcon,
    Trash as TrashIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { onDestroy, tick, untrack } from "svelte";
  import { edited_name, is_hex, PAD_COLORS, type PadColor } from "./board";
  import { SWATCH } from "./colors";
  import { SoundEditor } from "./editor.svelte";
  import SoundEditorPanel from "./sound-editor.svelte";
  import { delete_sound, import_sound, read_sound } from "./store";

  let {
    pad,
    keys,
    preview,
    pick_image,
    resolve,
  }: DialogProps<PadEdit> & {
    pad: Pad;
    keys: string[];
    preview: (pad: Pad) => void;
    pick_image: () => Promise<string | null>;
  } = $props();

  const files = $derived(kernel.service<FilesService>("files"));

  let draft = $state(untrack(() => ({ ...pad })));
  const NONE = "none";
  const key_options = $derived([{ value: NONE, label: "None" }, ...keys.map((key) => ({ value: key, label: key.toUpperCase() }))]);
  let key = $state(untrack(() => pad.key ?? NONE));

  const editor = new SoundEditor();
  let saving = $state(false);
  let saved_as = $state<string | null>(null);
  let save_error = $state<string | null>(null);
  const written: string[] = [];
  let committed: string | null = null;

  onDestroy(() => {
    editor.dispose();
    const discard = written.filter((name) => name !== committed);
    for (const name of discard) void delete_sound(files, name).catch((reason) => console.warn("[Soundboard] Couldn't delete an unused edit", reason));
  });

  function submit(event: SubmitEvent) {
    event.preventDefault();
    committed = draft.sound;
    resolve({ action: "save", pad: { ...draft, label: draft.label.trim() || pad.label, key: key === NONE ? null : key } });
  }

  const color_label = (color: PadColor) => color[0].toUpperCase() + color.slice(1);
  const custom = $derived(is_hex(draft.color) ? draft.color : null);
  let custom_value = $state(untrack(() => (is_hex(pad.color) ? pad.color : "#7f7f7f")));

  async function choose_image() {
    const path = await pick_image();
    if (path) draft.image = path;
  }

  async function open_editor() {
    if (editor.pcm || editor.loading) return;
    try {
      const file = await read_sound(files, draft.sound);
      if (!file) throw new Error("The sound file is missing.");
      await editor.load(file);
    } catch (reason) {
      editor.error ??= error_message(reason);
    }
  }

  async function save_audio() {
    const blob = editor.render();
    if (!blob) return;
    saving = true;
    save_error = null;
    try {
      const file = new File([blob], edited_name(draft.sound), { type: "audio/wav" });
      const name = await import_sound(files, file);
      written.push(name);
      draft.sound = name;
      saved_as = name;
      await editor.load(file);
    } catch (reason) {
      save_error = error_message(reason);
    } finally {
      saving = false;
    }
  }
</script>

<form
  class="grid max-h-[calc(100cqh-2rem)] w-[min(26rem,calc(100cqw-2rem))] gap-4 overflow-y-auto scroll-pb-20 rounded-2xl bg-background-lighter p-5 shadow-popover"
  onsubmit={submit}
>
  <h2 class="text-sm font-semibold">Edit pad</h2>

  <label class="grid gap-1.5 text-ui text-foreground/80">
    Label
    <Input bind:value={draft.label} size="lg" maxlength={40} spellcheck="false" />
  </label>

  <fieldset class="grid gap-1.5">
    <legend class="mb-1.5 text-ui text-foreground/80">Colour</legend>
    <div class="flex flex-wrap gap-2">
      {#each PAD_COLORS as color (color)}
        <label class="relative grid size-8 cursor-pointer place-items-center rounded-full pointer-coarse:size-9" title={color_label(color)}>
          <input type="radio" name="color" value={color} bind:group={draft.color} class="peer sr-only" />
          <span
            class={cn(
              "size-6 rounded-full ring-offset-2 ring-offset-background-lighter transition-shadow peer-checked:ring-2 peer-focus-visible:ring-2 peer-focus-visible:ring-cottontail",
              SWATCH[color]
            )}
          ></span>
          <span class="sr-only">{color_label(color)}</span>
        </label>
      {/each}
      <label class="relative grid size-8 cursor-pointer place-items-center rounded-full pointer-coarse:size-9" title="Custom colour">
        <input
          type="color"
          class="peer absolute inset-0 size-full cursor-pointer opacity-0"
          aria-label="Custom colour"
          bind:value={custom_value}
          oninput={() => (draft.color = is_hex(custom_value) ? custom_value : draft.color)}
          onclick={() => {
            if (!custom && is_hex(custom_value)) draft.color = custom_value;
          }}
        />
        <span
          class={cn(
            "pointer-events-none grid size-6 place-items-center rounded-full ring-1 ring-foreground/30 ring-offset-2 ring-offset-background-lighter transition-shadow peer-focus-visible:ring-2 peer-focus-visible:ring-cottontail",
            custom && "ring-2 ring-(color:--custom)"
          )}
          style:background={custom ?? undefined}
          style:--custom={custom ?? undefined}
        >
          {#if !custom}<PaletteIcon class="size-3.5 text-foreground/80" weight="bold" />{/if}
        </span>
      </label>
    </div>
    {#if custom}<span class="font-mono text-2xs text-foreground/80">{custom}</span>{/if}
  </fieldset>

  <div class="grid gap-1.5 text-ui text-foreground/80">
    <span>Image</span>
    <div class="flex min-w-0 items-center gap-2">
      <Button size="sm" onclick={choose_image}><ImageIcon weight="bold" /> {draft.image ? "Change…" : "Choose image…"}</Button>
      {#if draft.image}
        <span class="min-w-0 flex-1 truncate font-mono text-2xs" title={draft.image}>{base_name(draft.image)}</span>
        <IconButton label="Remove image" size="sm" onclick={() => (draft.image = null)}><XIcon weight="bold" /></IconButton>
      {/if}
    </div>
  </div>

  <label class="grid gap-1 text-ui text-foreground/80">
    <span class="flex items-center justify-between">Volume <span class="font-mono text-2xs tabular-nums">{Math.round(draft.volume * 100)}%</span></span>
    <Slider min={0} max={1} step={0.05} bind:value={draft.volume} size="sm" />
  </label>

  <div class="flex items-center justify-between gap-4 text-ui text-foreground/80">
    <label for="pad-key">Key</label>
    <Select id="pad-key" size="sm" options={key_options} bind:value={key} class="w-24" />
  </div>

  <label class="flex items-center justify-between gap-4 text-ui text-foreground/80">
    <span>Loop <span class="text-foreground/65">· plays until pressed again</span></span>
    <Switch bind:checked={draft.loop} />
  </label>

  <details
    class="group grid gap-2"
    ontoggle={(event) => {
      const details = event.currentTarget;
      if (!details.open) return editor.stop();
      void open_editor().then(async () => {
        await tick();
        if (details.open) details.scrollIntoView({ block: "nearest" });
      });
    }}
  >
    <summary class="flex cursor-pointer list-none items-center gap-1.5 py-1 text-ui text-foreground/80 [&::-webkit-details-marker]:hidden">
      <CaretIcon class="size-3.5 transition-transform group-open:rotate-90" weight="bold" /> Edit audio
    </summary>
    <div class="grid gap-2 pt-2">
      {#if editor.loading}
        <div class="grid h-24 place-items-center rounded-lg bg-background-darker"><Spinner label="Reading the sound" /></div>
      {:else if editor.error}
        <p class="text-ui text-error">{editor.error}</p>
      {:else if editor.pcm}
        <SoundEditorPanel {editor} label="Sound to trim">
          {#snippet actions()}
            <Button size="sm" disabled={!editor.changed || saving} onclick={save_audio}>{saving ? "Saving…" : "Save audio"}</Button>
          {/snippet}
        </SoundEditorPanel>
        {#if save_error}
          <p class="text-ui text-error">{save_error}</p>
        {:else if saved_as}
          <p class="text-2xs text-foreground/80">Saved as <span class="font-mono">{saved_as}</span>. The original is kept.</p>
        {/if}
      {/if}
    </div>
  </details>

  <div class="sticky -bottom-5 -mx-5 -mb-5 flex flex-wrap items-center gap-2 border-t border-hairline bg-background-lighter px-5 py-3">
    <IconButton label="Delete pad" class="text-error hover:text-error" onclick={() => resolve({ action: "delete" })}><TrashIcon weight="bold" /></IconButton>
    <Button variant="quiet" onclick={() => preview({ ...draft, loop: false })}><PlayIcon weight="fill" /> Preview</Button>
    <span class="flex-1"></span>
    <Button variant="quiet" onclick={() => resolve(null)}>Cancel</Button>
    <Button variant="primary" type="submit">Save</Button>
  </div>
</form>
