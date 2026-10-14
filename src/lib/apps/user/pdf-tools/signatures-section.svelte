<script lang="ts">
  import kernel, { NotificationType, type NotificationsService } from "$lib/core/api";
  import { Button, IconButton, Section as Group, StatusBar, Toolbar } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import {
    ArrowCounterClockwise as ArrowCounterClockwiseIcon,
    Eraser as EraserIcon,
    FloppyDisk as FloppyDiskIcon,
    PenNib as PenNibIcon,
    PencilSimple as PencilSimpleIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import type { Snippet } from "svelte";
  import { signature_file_name } from "./naming";
  import { SIGNATURES_DIR, delete_signature, rename_signature, save_signature } from "./pdf-files";
  import SignaturePad from "./signature-pad.svelte";
  import SignaturePreview from "./signature-preview.svelte";
  import { watch_signatures } from "./signatures.svelte";
  import { build_signature, type StrokePoint } from "./stroke";
  import { file_stem } from "$lib/core/api/services/files/path";
  import { error_message } from "$lib/core/utils";

  const { picker, on_use }: { picker: Snippet; on_use: (name: string) => void } = $props();
  const { app_id, window: win } = get_app_context();
  const notifications = $derived(kernel.service<NotificationsService>("notifications"));

  let strokes = $state.raw<StrokePoint[][]>([]);
  let saving = $state(false);
  const list = watch_signatures();

  const result = $derived(build_signature(strokes));

  function undo() {
    strokes = strokes.slice(0, -1);
  }

  function taken(name: string, except?: string): boolean {
    return list.items.some((item) => item.name.toLowerCase() === name.toLowerCase() && item.name !== except);
  }

  async function save() {
    if (!result || saving) return;
    const name = await win.prompt("Name this signature", {
      initial: `Signature${list.items.length ? ` ${list.items.length + 1}` : ""}`,
      confirm_label: "Save",
      validate: (value) => (value.trim() ? null : "Give it a name"),
    });
    if (name === null) return;
    saving = true;
    try {
      const path = await save_signature(signature_file_name(name), result);
      strokes = [];
      notifications.notify(app_id, { title: "Signature saved", message: path });
    } catch (error) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't save the signature", message: error_message(error) });
    } finally {
      saving = false;
    }
  }

  async function rename(name: string) {
    const next = await win.prompt(`Rename “${file_stem(name)}”`, {
      initial: name,
      select_stem: true,
      confirm_label: "Rename",
      validate: (value) => {
        if (!value.trim()) return "Give it a name";
        return taken(signature_file_name(value), name) ? "A signature already has that name" : null;
      },
    });
    if (next === null || signature_file_name(next) === name) return;
    try {
      await rename_signature(name, signature_file_name(next));
    } catch (error) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't rename the signature", message: error_message(error) });
    }
  }

  async function remove(name: string) {
    const ok = await win.confirm(`Delete “${file_stem(name)}”?`, { detail: `The file ${name} is removed from ${SIGNATURES_DIR}.`, confirm_label: "Delete", danger: true });
    if (!ok) return;
    try {
      await delete_signature(name);
    } catch (error) {
      notifications.notify(app_id, { type: NotificationType.ERROR, title: "Couldn't delete the signature", message: error_message(error) });
    }
  }
</script>

<div class="grid h-full grid-rows-[auto_1fr_auto]">
  <Toolbar>
    {@render picker()}
    <IconButton label="Undo stroke" size="sm" disabled={!strokes.length} onclick={undo}><ArrowCounterClockwiseIcon weight="bold" /></IconButton>
    <IconButton label="Clear" size="sm" disabled={!strokes.length} onclick={() => (strokes = [])}><EraserIcon weight="bold" /></IconButton>
    <span class="flex-1"></span>
    <Button variant="primary" size="sm" disabled={!result || saving} onclick={save}><FloppyDiskIcon weight="bold" /> Save…</Button>
  </Toolbar>

  <div class="min-h-0 overflow-auto">
    <div class="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-5 @md:px-6">
      <Group title="Draw a signature" description="A pen's pressure sets the line width; with a mouse or finger, slower is thicker.">
        <div class="p-2">
          <SignaturePad bind:strokes class="rounded-lg bg-background-darker" />
        </div>
        <div class="flex min-h-12 items-center gap-3 px-4 py-2">
          <span class="text-2xs font-medium tracking-wide text-foreground/65 uppercase">Preview</span>
          {#if result}
            <SignaturePreview signature={result} class="h-8 max-w-48" />
            <span class="ml-auto font-mono text-2xs text-foreground/65 tabular-nums">{result.width} × {result.height}</span>
          {:else}
            <span class="text-ui text-foreground/65">Nothing drawn yet</span>
          {/if}
        </div>
      </Group>

      <Group title="Saved signatures" description="Single-colour SVG files in {SIGNATURES_DIR}.">
        {#if !list.items.length}
          <p class="px-4 py-3 text-ui text-foreground/65">{list.ready ? "None yet. Draw one above and save it." : "Loading…"}</p>
        {:else}
          <ul class="grid grid-cols-1 gap-px @md:grid-cols-2">
            {#each list.items as item (item.path)}
              <li class="flex items-center gap-3 px-4 py-2">
                <div class="grid h-12 w-24 shrink-0 place-items-center rounded-md bg-background-darker p-1.5">
                  <SignaturePreview signature={item.signature} class="max-h-full max-w-full" />
                </div>
                <span class="min-w-0 flex-1 truncate text-ui" title={item.path}>{file_stem(item.name)}</span>
                <IconButton label="Sign a PDF with “{file_stem(item.name)}”" size="sm" onclick={() => on_use(item.name)}><PenNibIcon weight="bold" /></IconButton>
                <IconButton label="Rename" size="sm" onclick={() => rename(item.name)}><PencilSimpleIcon weight="bold" /></IconButton>
                <IconButton label="Delete" size="sm" onclick={() => remove(item.name)}><TrashIcon weight="bold" /></IconButton>
              </li>
            {/each}
          </ul>
        {/if}
      </Group>
    </div>
  </div>

  <StatusBar>
    <span>{strokes.length} {strokes.length === 1 ? "stroke" : "strokes"}</span>
    <span>{list.items.length} saved</span>
  </StatusBar>
</div>
