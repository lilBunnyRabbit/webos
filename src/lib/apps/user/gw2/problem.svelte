<script lang="ts">
  import { Button, EmptyState } from "$lib/core/components/ui";
  import {
    Hourglass as HourglassIcon,
    Key as KeyIcon,
    LockKey as LockKeyIcon,
    WarningCircle as WarningCircleIcon,
    WifiSlash as WifiSlashIcon,
  } from "phosphor-svelte";
  import { Gw2ErrorKind, type Gw2Error } from "./api";

  let { error, onretry, onkey }: { error: Gw2Error; onretry: () => void; onkey: () => void } = $props();

  const TITLES: Record<Gw2ErrorKind, string> = {
    [Gw2ErrorKind.NO_KEY]: "No API key yet",
    [Gw2ErrorKind.INVALID_KEY]: "The key doesn't work",
    [Gw2ErrorKind.MISSING_SCOPE]: "The key can't see this",
    [Gw2ErrorKind.OFFLINE]: "You're offline",
    [Gw2ErrorKind.RATE_LIMIT]: "Slow down",
    [Gw2ErrorKind.NOT_FOUND]: "Not found",
    [Gw2ErrorKind.UNAVAILABLE]: "The API is down",
    [Gw2ErrorKind.FAILED]: "Couldn't load",
  };

  const icon = $derived.by(() => {
    if (error.kind === Gw2ErrorKind.OFFLINE) return WifiSlashIcon;
    if (error.kind === Gw2ErrorKind.RATE_LIMIT) return HourglassIcon;
    if (error.kind === Gw2ErrorKind.MISSING_SCOPE) return LockKeyIcon;
    if (error.kind === Gw2ErrorKind.INVALID_KEY || error.kind === Gw2ErrorKind.NO_KEY) return KeyIcon;
    return WarningCircleIcon;
  });
  const about_key = $derived(
    error.kind === Gw2ErrorKind.INVALID_KEY || error.kind === Gw2ErrorKind.MISSING_SCOPE || error.kind === Gw2ErrorKind.NO_KEY
  );
</script>

<EmptyState icon={icon} title={TITLES[error.kind]} description={error.message} tone={about_key ? "muted" : "error"}>
  {#snippet actions()}
    {#if about_key}
      <Button variant="primary" onclick={onkey}><KeyIcon />API key</Button>
    {/if}
    {#if error.kind !== Gw2ErrorKind.NO_KEY}
      <Button onclick={onretry}>Try again</Button>
    {/if}
  {/snippet}
</EmptyState>
