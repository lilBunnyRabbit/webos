<script lang="ts">
  import { Input } from "$lib/core/components/ui";
  import type { Color } from "./color";
  import { parse_css } from "./models";
  import Swatch from "./swatch.svelte";

  interface Props {
    color: Color;
    text: string;
    label: string;
    onchange: (color: Color) => void;
    size?: "sm" | "md";
  }

  let { color, text, label, onchange, size = "md" }: Props = $props();

  const id = $props.id();
  // `null` shows `text`; typing holds the draft until Enter or leaving the field.
  let draft = $state<string | null>(null);
  let invalid = $state(false);

  function commit() {
    if (draft === null) return;
    const parsed = parse_css(draft);
    if (!parsed) {
      invalid = draft.trim() !== "";
      if (!invalid) draft = null;
      return;
    }
    invalid = false;
    draft = null;
    onchange(parsed);
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === "Enter") {
      event.preventDefault();
      commit();
    } else if (event.key === "Escape" && draft !== null) {
      event.preventDefault();
      draft = null;
      invalid = false;
    }
  }
</script>

<div class="flex min-w-0 flex-col gap-1">
  <div class="flex min-w-0 items-center gap-2">
    <Swatch {color} label="Preview of {text}" class="size-8 shrink-0 pointer-coarse:size-10" />
    <Input
      {size}
      class="min-w-0 flex-1 font-mono"
      aria-label={label}
      aria-invalid={invalid}
      aria-describedby={invalid ? `${id}-error` : undefined}
      spellcheck={false}
      autocapitalize="off"
      autocomplete="off"
      value={draft ?? text}
      oninput={(event) => {
        draft = event.currentTarget.value;
        invalid = false;
      }}
      onblur={commit}
      {onkeydown}
    />
  </div>
  {#if invalid}
    <p id="{id}-error" class="text-2xs text-error">Not a colour. Try a hex, a name, rgb(), hsl(), oklch() or any model's own syntax.</p>
  {/if}
</div>
