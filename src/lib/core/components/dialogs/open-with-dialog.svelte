<script lang="ts" module>
  import type { AppId } from "$lib/core/api";

  export interface OpenWithChoice {
    app_id: AppId;
    always: boolean;
  }
</script>

<script lang="ts">
  import type { AppManifest, DialogProps } from "$lib/core/api";
  import { Checkbox } from "../ui";

  interface Props extends DialogProps<OpenWithChoice> {
    file_name: string;
    /** Empty when the file has no extension; "Always use" is then hidden. */
    extension: string;
    apps: AppManifest[];
    /** Set by the mobile dialogs host: a full-width bottom sheet. */
    sheet?: boolean;
  }

  let { file_name, extension, apps, sheet = false, resolve }: Props = $props();

  let always = $state(false);

  function move_focus(event: KeyboardEvent & { currentTarget: HTMLElement }) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLElement>("[data-option]")];
    const index = items.indexOf(event.currentTarget.ownerDocument.activeElement as HTMLElement);
    // From outside the list (the checkbox), Down goes to the first app and Up to the last.
    const next = index === -1 ? (event.key === "ArrowDown" ? 0 : items.length - 1) : event.key === "ArrowDown" ? index + 1 : index - 1;
    items.at(next % items.length)?.focus();
  }
</script>

<div
  role="menu"
  tabindex="-1"
  onkeydown={move_focus}
  class={[
    "grid gap-0.5 bg-background-lighter text-ui",
    sheet ? "w-full rounded-t-2xl p-2 pt-5 pb-[max(0.5rem,env(safe-area-inset-bottom))]" : "min-w-60 max-w-80 animate-pop-in rounded-xl p-1.5 shadow-popover",
  ]}
>
  <p class="truncate px-2 pt-1 pb-1.5 text-2xs font-medium tracking-wide text-foreground/80 uppercase">Open {file_name} with</p>

  {#each apps as app, index (app.id)}
    <!-- svelte-ignore a11y_autofocus -->
    <button
      data-option
      autofocus={index === 0}
      role="menuitem"
      class="flex h-9 pointer-coarse:h-11 items-center gap-2.5 rounded-lg px-2 text-left transition-colors outline-none hover:bg-foreground/8 focus:bg-foreground/10"
      onclick={() => resolve({ app_id: app.id, always })}
    >
      <span class="grid size-6 shrink-0 place-items-center rounded-md bg-background-light ring-1 ring-foreground/10"><app.icon class="size-4" weight="duotone" /></span>
      <span class="truncate">{app.name}</span>
    </button>
  {/each}

  {#if extension}
    <label class="mt-1 flex cursor-pointer items-center gap-2 border-t border-foreground/8 px-2 pt-2.5 pb-1 text-foreground/80">
      <Checkbox bind:checked={always} />
      Always use for <span class="font-mono">{extension}</span>
    </label>
  {/if}
</div>
