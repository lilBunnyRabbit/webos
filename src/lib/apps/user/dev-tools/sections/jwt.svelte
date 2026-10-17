<script lang="ts">
  import { Badge, CopyButton, Input, Section, Textarea } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { format_datetime } from "$lib/core/utils";
  import { Ticker } from "$lib/core/utils/ticker.svelte";
  import { JwtState, decode_jwt, is_hmac, jwt_status, jwt_times, verify_hmac, type JsonObject } from "../jwt";
  import type { DevToolsState } from "../tools";

  let { value = $bindable() }: { value: DevToolsState["jwt"] } = $props();

  // The secret stays in this window: it is never written to storage with the token.
  let secret = $state("");

  const { window: win } = get_app_context();
  const clock = new Ticker(() => win.is_visible, 30_000);

  const STATE_TONES = {
    [JwtState.ACTIVE]: "success",
    [JwtState.EXPIRED]: "error",
    [JwtState.NOT_YET]: "warning",
    [JwtState.NO_EXPIRY]: "neutral",
  } as const;

  const result = $derived(value.input.trim() === "" ? null : decode_jwt(value.input));
  const jwt = $derived(result?.ok ? result.jwt : null);
  const now = $derived(clock.now);
  const status = $derived(jwt ? jwt_status(jwt.payload, now) : null);
  const times = $derived(jwt ? jwt_times(jwt.payload, now) : []);
  const verified = $derived(jwt && secret !== "" ? verify_hmac(jwt, secret) : null);

  const pretty = (object: JsonObject) => JSON.stringify(object, null, 2);
</script>

{#snippet json(title: string, object: JsonObject)}
  <Section {title} flush>
    {#snippet actions()}
      <CopyButton text={pretty(object)} />
    {/snippet}
    <pre
      class="max-h-80 overflow-auto rounded-xl bg-background-light p-3 font-mono text-2xs leading-relaxed break-words whitespace-pre-wrap ring-1 ring-foreground/8">{pretty(object)}</pre>
  </Section>
{/snippet}

<Section title="Token" flush>
  <Textarea mono bind:value={value.input} rows={5} aria-label="JWT" placeholder="eyJhbGciOi… (a Bearer prefix is fine)" class="break-all" />
  {#if result && !result.ok}
    <p role="alert" class="rounded-md bg-error/12 px-3 py-2 text-ui text-error">{result.error}</p>
  {:else if jwt && status}
    <div class="flex flex-wrap items-center gap-2">
      <Badge tone={STATE_TONES[status.state]}>{status.text}</Badge>
      {#if typeof jwt.header.alg === "string"}<Badge>{jwt.header.alg}</Badge>{/if}
    </div>
  {:else}
    <p class="text-ui text-foreground/65">Decoded here, in the browser. Nothing is sent anywhere.</p>
  {/if}
</Section>

{#if jwt}
  {@render json("Header", jwt.header)}
  {@render json("Payload", jwt.payload)}

  {#if times.length}
    <Section title="Times" flush>
      <dl class="divide-y divide-foreground/8 rounded-xl bg-background-light ring-1 ring-foreground/8">
        {#each times as time (time.claim)}
          <div class="flex flex-wrap items-center gap-x-3 gap-y-0.5 px-3 py-1.5">
            <dt class="w-24 shrink-0 text-ui text-foreground/65">{time.label} <span class="font-mono text-2xs">{time.claim}</span></dt>
            <dd class="min-w-0 flex-1 text-ui">
              {format_datetime(time.seconds * 1000)} <span class="text-foreground/65">· {time.relative}</span>
            </dd>
            <CopyButton text={time.iso} label="Copy {time.claim} as ISO" />
          </div>
        {/each}
      </dl>
    </Section>
  {/if}

  <Section title="Signature" flush>
    {#if is_hmac(jwt.header)}
      <Input bind:value={secret} type="password" autocomplete="off" aria-label="Secret" placeholder="Secret to verify {jwt.header.alg}" class="font-mono" />
      {#if verified}
        {#await verified then valid}
          <Badge tone={valid ? "success" : "error"}>{valid ? "Signature verified" : "Signature doesn't match this secret"}</Badge>
        {/await}
      {:else}
        <p class="text-ui text-foreground/65">The secret stays in this window and isn't saved.</p>
      {/if}
    {:else}
      <p class="text-ui text-foreground/65">
        Only HS256, HS384 and HS512 can be checked here, with the shared secret. {jwt.header.alg ?? "This algorithm"} needs the
        issuer's public key.
      </p>
    {/if}
  </Section>
{/if}
