<script lang="ts" module>
  import type { WebApp } from "./web-app";

  export interface AddedWebApp {
    app: WebApp;
    folder: string;
  }
</script>

<script lang="ts">
  import type { DialogProps } from "$lib/core/api";
  import { tilde_path } from "$lib/core/api/services/files/path";
  import { Button, Input } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import type { Attachment } from "svelte/attachments";
  import Favicon from "./favicon.svelte";
  import { url_error } from "./store";
  import { DESKTOP_DIR, favicon_url, name_from_url, normalize_url } from "./web-app";

  let { resolve }: DialogProps<AddedWebApp> = $props();

  const { window: win } = get_app_context();

  let address = $state("");
  let typed_name = $state<string | null>(null);
  let folder = $state(DESKTOP_DIR);
  let touched = $state(false);

  const url = $derived(normalize_url(address));
  const suggested = $derived(url ? name_from_url(url) : "");
  const name = $derived(typed_name ?? suggested);
  const problem = $derived(url_error(address, location.origin));
  const error = $derived(touched ? problem : null);

  const focus: Attachment<HTMLInputElement> = (input) => input.focus();

  async function change_folder() {
    const chosen = await win.pick_directory({ start_path: folder, title: "Save the web app in" });
    if (chosen) folder = chosen;
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    touched = true;
    if (problem || !url) return;
    resolve({ app: { name: name.trim() || suggested, url }, folder });
  }
</script>

<form class="grid w-[min(26rem,calc(100cqw-2rem))] gap-4 rounded-2xl bg-background-lighter p-5 shadow-popover" onsubmit={submit}>
  <div>
    <h2 class="text-sm font-semibold">Add web app</h2>
    <p class="mt-0.5 text-ui text-foreground/65">It's saved as a file, so it shows up as an icon you can open.</p>
  </div>

  <label class="grid gap-1.5 text-ui text-foreground/80">
    Address
    <Input
      bind:value={address}
      size="lg"
      inputmode="url"
      placeholder="example.com"
      autocomplete="off"
      spellcheck="false"
      aria-invalid={error !== null}
      oninput={() => (touched = false)}
      {@attach focus}
    />
    {#if error}<span class="text-2xs text-error" role="alert">{error}</span>{/if}
  </label>

  <label class="grid gap-1.5 text-ui text-foreground/80">
    Name
    <Input bind:value={() => name, (value) => (typed_name = value)} size="lg" maxlength={60} spellcheck="false" placeholder="Web app" />
  </label>

  <div class="flex min-w-0 items-center gap-3 rounded-lg bg-background-lightest p-3 shadow-raised ring-1 ring-hairline">
    <Favicon src={url ? favicon_url({ url }) : null} class="size-8 rounded-md" />
    <div class="min-w-0 flex-1">
      <p class="truncate text-ui font-medium">{name || "Web app"}</p>
      <p class="truncate font-mono text-2xs text-foreground/65">{url ? new URL(url).host : "No address yet"}</p>
    </div>
  </div>

  <div class="flex min-w-0 items-center gap-2 text-ui text-foreground/80">
    <span class="min-w-0 flex-1 truncate">Save in <span class="font-mono text-2xs">{tilde_path(folder)}</span></span>
    <Button size="sm" variant="quiet" onclick={change_folder}>Change…</Button>
  </div>

  <div class="flex justify-end gap-2">
    <Button variant="quiet" onclick={() => resolve(null)}>Cancel</Button>
    <Button variant="primary" type="submit">Add</Button>
  </div>
</form>
