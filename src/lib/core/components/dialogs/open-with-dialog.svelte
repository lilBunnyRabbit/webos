<script lang="ts" module>
  import type { AppId } from "$lib/core/api";

  export interface OpenWithChoice {
    app_id: AppId;
    always: boolean;
  }
</script>

<script lang="ts">
  import type { AppManifest, DialogProps } from "$lib/core/api";

  interface Props extends DialogProps<OpenWithChoice> {
    file_name: string;
    /** Empty when the file has no extension; "Always use" is then hidden. */
    extension: string;
    apps: AppManifest[];
  }

  let { file_name, extension, apps, resolve }: Props = $props();

  let always = $state(false);

  function move_focus(event: KeyboardEvent & { currentTarget: HTMLElement }) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-option]")];
    const index = items.indexOf(document.activeElement as HTMLElement);
    const next = event.key === "ArrowDown" ? index + 1 : index - 1;
    items.at(next % items.length)?.focus();
  }
</script>

<div
  role="menu"
  tabindex="-1"
  onkeydown={move_focus}
  class="grid min-w-56 max-w-80 rounded-md border border-foreground/20 bg-background py-1 text-sm shadow-window"
>
  <p class="px-3 py-1.5 text-foreground/60 truncate">Open {file_name} with</p>

  {#each apps as app, index (app.id)}
    <!-- svelte-ignore a11y_autofocus -->
    <button
      data-option
      autofocus={index === 0}
      role="menuitem"
      class="flex items-center gap-3 px-3 py-2 text-left hover:bg-foreground/10 focus:bg-foreground/10 outline-none"
      onclick={() => resolve({ app_id: app.id, always })}
    >
      <app.icon class="size-5 shrink-0" />
      <span class="truncate">{app.name}</span>
    </button>
  {/each}

  {#if extension}
    <label class="mt-1 flex items-center gap-2 border-t border-t-foreground/20 px-3 pt-2 pb-1.5 text-foreground/80">
      <input type="checkbox" bind:checked={always} class="accent-primary" />
      Always use for {extension}
    </label>
  {/if}
</div>
