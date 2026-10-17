<script lang="ts">
  import { Badge, Button, IconButton, Input, Section as Group, Spinner, Toolbar } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { ArrowSquareOut as ArrowSquareOutIcon, Eye as EyeIcon, EyeSlash as EyeSlashIcon, Trash as TrashIcon } from "phosphor-svelte";
  import { get_app_context } from "$lib/core/contexts/app";
  import { Gw2Error, looks_like_key, Scope, token_info } from "./api";
  import type { SectionProps } from "./account.svelte";
  import { Section } from "./sections";

  let { account, picker, onnavigate }: SectionProps = $props();
  const { window: win } = get_app_context();

  const KEYS_URL = "https://account.arena.net/applications";

  const USES = [
    { scope: Scope.ACCOUNT, use: "Required for every key" },
    { scope: Scope.PROGRESSION, use: "Today: Wizard's Vault and world bosses" },
    { scope: Scope.WALLET, use: "Wallet" },
    { scope: Scope.INVENTORIES, use: "Goals: bank, materials and shared slots" },
    { scope: Scope.CHARACTERS, use: "Goals: character bags (with inventories)" },
  ];

  let draft = $state("");
  let reveal = $state(false);
  let checking = $state(false);
  let error = $state<string | null>(null);

  const token = $derived(account.token.data);
  const stored = $derived(account.key.value);
  const masked = $derived(stored ? `${stored.slice(0, 8)}…${stored.slice(-4)}` : "");

  async function save(event: SubmitEvent) {
    event.preventDefault();
    const candidate = draft.trim();
    error = null;
    if (!looks_like_key(candidate)) {
      error = "That doesn't look like a Guild Wars 2 API key. Copy the whole key from your account page.";
      return;
    }
    checking = true;
    try {
      await token_info(candidate, 0);
      account.key.value = candidate;
      draft = "";
      reveal = false;
      await account.token.load();
      onnavigate(Section.TODAY);
    } catch (reason) {
      error = reason instanceof Gw2Error ? reason.message : "Couldn't check the key.";
    } finally {
      checking = false;
    }
  }

  async function clear() {
    if (!(await win.confirm("Remove the API key from this browser?", { confirm_label: "Remove", danger: true }))) return;
    account.key.value = "";
    account.token.data = null;
    account.token.error = null;
  }
</script>

<div class="flex h-full flex-col">
  <Toolbar>
    {@render picker()}
    <span class="min-w-0 flex-1 truncate px-1 text-ui font-medium">API key</span>
  </Toolbar>

  <div class="min-h-0 flex-1 overflow-auto">
    <div class="mx-auto flex max-w-2xl flex-col gap-6 p-4">
      {#if stored}
        <Group title="Current key">
          <div class="flex flex-col gap-3 px-4 py-3">
            <div class="flex flex-wrap items-center gap-2">
              <span class="min-w-0 flex-1 truncate text-ui font-medium">
                {#if token}{token.name || "Unnamed key"}{:else if account.token.loading}<Spinner label="Checking the key" />{:else}Couldn't check this key{/if}
              </span>
              <code class="font-mono text-2xs text-foreground/65">{masked}</code>
              <Button size="sm" variant="danger" onclick={clear}><TrashIcon />Remove</Button>
            </div>
            {#if account.token.error}
              <p class="text-ui text-error">{account.token.error.message}</p>
            {/if}
            {#if token}
              <div class="flex flex-wrap gap-1">
                {#each token.permissions as permission (permission)}
                  <Badge tone="primary">{permission}</Badge>
                {/each}
              </div>
            {/if}
          </div>
        </Group>
      {/if}

      <Group title={stored ? "Replace the key" : "Add your API key"} description="Kept in this browser only, never sent anywhere but the Guild Wars 2 API.">
        <form class="flex flex-col gap-3 px-4 py-3" onsubmit={save}>
          <div class="flex gap-2">
            <Input
              type={reveal ? "text" : "password"}
              bind:value={draft}
              placeholder="XXXXXXXX-XXXX-…"
              autocomplete="off"
              spellcheck={false}
              aria-label="API key"
              class="flex-1 font-mono"
            />
            <IconButton label={reveal ? "Hide key" : "Show key"} onclick={() => (reveal = !reveal)}>
              {#if reveal}<EyeSlashIcon />{:else}<EyeIcon />{/if}
            </IconButton>
            <Button type="submit" variant="primary" disabled={checking || !draft.trim()}>
              {#if checking}<Spinner label="Checking" />{/if}Save
            </Button>
          </div>
          {#if error}<p class="text-ui text-error" role="alert">{error}</p>{/if}
          <a class="self-start text-ui text-primary hover:opacity-85" href={KEYS_URL} target="_blank" rel="noreferrer">
            Make a key on your ArenaNet account <ArrowSquareOutIcon class="inline size-3.5 align-[-2px]" />
          </a>
        </form>
      </Group>

      <Group title="Permissions" description="GW2 keys can only read. Tick just what you need; a key without a permission hides that view.">
        {#each USES as entry (entry.scope)}
          {@const has = token?.permissions.includes(entry.scope)}
          <div class="flex items-center gap-3 px-4 py-2.5">
            <code class={cn("w-24 shrink-0 font-mono text-ui", token && !has && "text-foreground/65 line-through")}>{entry.scope}</code>
            <span class="min-w-0 flex-1 text-ui text-foreground/80">{entry.use}</span>
            {#if token}<Badge tone={has ? "success" : "neutral"}>{has ? "granted" : "missing"}</Badge>{/if}
          </div>
        {/each}
      </Group>
    </div>
  </div>
</div>
