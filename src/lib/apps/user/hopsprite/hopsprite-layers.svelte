<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import { IconButton, Slider } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import {
    ArrowDown as ArrowDownIcon,
    ArrowUp as ArrowUpIcon,
    Copy as CopyIcon,
    DotsThree as DotsThreeIcon,
    Eye as EyeIcon,
    EyeSlash as EyeSlashIcon,
    Lock as LockIcon,
    LockOpen as LockOpenIcon,
    PencilSimple as PencilSimpleIcon,
    Plus as PlusIcon,
    Stack as StackIcon,
    Trash as TrashIcon,
  } from "phosphor-svelte";
  import * as doc from "./document";
  import type { Editor } from "./editor.svelte";
  import { below } from "./menu";
  import { type Layer } from "./model";

  let { editor, class: class_name }: { editor: Editor; class?: string } = $props();

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));
  const { window: win } = get_app_context();

  const sprite = $derived(editor.sprite);
  const layers = $derived([...sprite.layers].reverse());

  function add_layer() {
    const index = sprite.layers.findIndex((layer) => layer.id === editor.layer.id);
    const result = doc.add_layer(editor.sprite, index);
    if (!result) return;
    editor.apply(() => result.sprite);
    editor.set_layer(result.layer.id);
  }

  async function rename_layer(layer: Layer) {
    const name = await win.prompt("Layer name", { initial: layer.name, confirm_label: "Rename" });
    if (name?.trim()) editor.apply((value) => doc.update_layer(value, layer.id, { name: name.trim() }));
  }

  async function layer_menu(layer: Layer, event: MouseEvent) {
    event.preventDefault();
    editor.set_layer(layer.id);
    const position = sprite.layers.findIndex((item) => item.id === layer.id);
    const choice = await dialogs.menu(
      [
        { id: "copy", label: "Duplicate layer", icon: CopyIcon },
        { id: "rename", label: "Rename…", icon: PencilSimpleIcon },
        { separator: true },
        { id: "up", label: "Move up", icon: ArrowUpIcon, disabled: position === sprite.layers.length - 1 },
        { id: "down", label: "Move down", icon: ArrowDownIcon, disabled: position === 0 },
        { id: "merge", label: "Merge down", icon: StackIcon, disabled: position === 0 },
        { separator: true },
        { id: "delete", label: "Delete layer", icon: TrashIcon, danger: true, disabled: sprite.layers.length <= 1 },
      ],
      { anchor: event.type === "contextmenu" ? { x: event.clientX, y: event.clientY } : below(event) }
    );
    if (choice === "copy") {
      const result = doc.duplicate_layer(editor.sprite, layer.id);
      if (result) {
        editor.apply(() => result.sprite);
        editor.set_layer(result.layer.id);
      }
    } else if (choice === "rename") void rename_layer(layer);
    else if (choice === "up") editor.apply((value) => doc.move_layer(value, layer.id, 1));
    else if (choice === "down") editor.apply((value) => doc.move_layer(value, layer.id, -1));
    else if (choice === "merge") editor.apply((value) => doc.merge_down(value, layer.id));
    else if (choice === "delete") editor.apply((value) => doc.remove_layer(value, layer.id));
  }
</script>

<section class={["flex min-h-0 flex-col", class_name]} aria-label="Layers">
  <div class="flex items-center gap-1 pb-1 pl-1.5">
    <span class="flex-1 text-2xs font-medium tracking-wide text-foreground/65 uppercase">Layers</span>
    <IconButton label="New layer" size="sm" onclick={add_layer}><PlusIcon weight="bold" /></IconButton>
  </div>
  <ul class="flex min-h-0 flex-col gap-0.5 overflow-y-auto">
    {#each layers as layer (layer.id)}
      {@const active = layer.id === editor.layer.id}
      <li
        class={["row flex h-8 items-center gap-0.5 rounded-md pr-0.5", active ? "active bg-primary/14" : "hover:bg-foreground/6"]}
        oncontextmenu={(event) => layer_menu(layer, event)}
      >
        <IconButton
          label={layer.visible ? `Hide ${layer.name}` : `Show ${layer.name}`}
          size="sm"
          onclick={() => editor.apply((value) => doc.update_layer(value, layer.id, { visible: !layer.visible }))}
        >
          {#if layer.visible}<EyeIcon weight="bold" />{:else}<EyeSlashIcon weight="bold" class="opacity-50" />{/if}
        </IconButton>
        <button
          type="button"
          class={["h-full min-w-0 flex-1 truncate text-left text-ui", active ? "font-medium text-primary" : "text-foreground/80", !layer.visible && "opacity-50"]}
          title="{layer.name} · double-click to rename"
          onclick={() => editor.set_layer(layer.id)}
          ondblclick={() => rename_layer(layer)}
        >
          {layer.name}
        </button>
        {#if layer.opacity < 1}<span class="font-mono text-2xs text-foreground/65 tabular-nums">{Math.round(layer.opacity * 100)}%</span>{/if}
        <IconButton
          label={layer.locked ? `Unlock ${layer.name}` : `Lock ${layer.name}`}
          size="sm"
          class={layer.locked ? "" : "extra"}
          pressed={layer.locked}
          onclick={() => editor.apply((value) => doc.update_layer(value, layer.id, { locked: !layer.locked }))}
        >
          {#if layer.locked}<LockIcon weight="fill" />{:else}<LockOpenIcon weight="bold" class="opacity-50" />{/if}
        </IconButton>
        <IconButton label="More for {layer.name}" size="sm" class="extra" onclick={(event) => layer_menu(layer, event)}><DotsThreeIcon weight="bold" /></IconButton>
      </li>
    {/each}
  </ul>
  <label class="mt-1.5 flex items-center gap-2 border-t border-hairline px-1.5 pt-2 text-2xs text-foreground/80">
    Opacity
    <Slider
      size="sm"
      min={0}
      max={100}
      class="flex-1"
      value={Math.round(editor.layer.opacity * 100)}
      onchange={(event) => {
        const opacity = Number(event.currentTarget.value) / 100;
        editor.apply((value) => doc.update_layer(value, editor.layer.id, { opacity }));
      }}
    />
    <span class="w-8 text-right font-mono tabular-nums">{Math.round(editor.layer.opacity * 100)}%</span>
  </label>
</section>

<style>
  .row:not(:hover, :focus-within, .active) :global(.extra) {
    display: none;
  }
</style>
