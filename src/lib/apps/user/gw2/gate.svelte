<script lang="ts">
  import { Spinner } from "$lib/core/components/ui";
  import type { Snippet } from "svelte";
  import { Gw2Error, Gw2ErrorKind, missing_scopes, type Scope } from "./api";
  import type { Account } from "./account.svelte";
  import Problem from "./problem.svelte";

  let {
    account,
    scopes,
    onkey,
    children,
  }: { account: Account; scopes: readonly Scope[]; onkey: () => void; children: Snippet } = $props();

  const missing = $derived(missing_scopes(account.permissions, scopes));
  const blocked = $derived.by(() => {
    if (!account.key.value) return new Gw2Error(Gw2ErrorKind.NO_KEY, "Add a Guild Wars 2 API key to see your account here.");
    if (account.token.error) return account.token.error;
    if (account.token.data && missing.length > 0)
      return new Gw2Error(
        Gw2ErrorKind.MISSING_SCOPE,
        `This key lacks the ${missing.join(" and ")} ${missing.length === 1 ? "permission" : "permissions"}. Make a key that includes ${missing.length === 1 ? "it" : "them"}.`
      );
    return null;
  });
</script>

{#if blocked}
  <Problem error={blocked} {onkey} onretry={() => void account.token.load(true)} />
{:else if !account.token.data}
  <div class="grid h-full place-items-center"><Spinner label="Checking the key" /></div>
{:else}
  {@render children()}
{/if}
