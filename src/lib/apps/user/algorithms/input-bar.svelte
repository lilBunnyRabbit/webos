<script lang="ts">
  import { Button, IconButton, Input } from "$lib/core/components/ui";
  import { cn } from "$lib/core/utils";
  import { ArrowRight as ArrowRightIcon, Shuffle as ShuffleIcon } from "phosphor-svelte";
  import { untrack } from "svelte";
  import { InputError, type InputSpec } from "./engine/inputs";

  let { spec, value, onchange }: { spec: InputSpec<unknown>; value: unknown; onchange: (value: unknown) => void } = $props();

  let text = $state(untrack(() => spec.format(value)));
  let error = $state<string | null>(null);
  const changed = $derived(text !== spec.format(value));

  function apply(event?: SubmitEvent) {
    event?.preventDefault();
    try {
      onchange(spec.parse(text));
      error = null;
    } catch (reason) {
      error = reason instanceof InputError ? reason.message : "That input doesn't work here.";
    }
  }
</script>

<form class="flex min-w-0 flex-1 basis-full flex-col gap-1 @xl:basis-0" onsubmit={apply}>
  <div class="flex min-w-0 items-center gap-1.5">
    <Input
      bind:value={text}
      aria-label="Input"
      aria-invalid={error ? "true" : undefined}
      aria-describedby="algorithm-input-hint"
      placeholder={spec.hint}
      spellcheck="false"
      autocomplete="off"
      class={cn("min-w-0 flex-1 font-mono", error && "ring-error")}
    />
    <Button type="submit" size="md" variant={changed ? "primary" : "secondary"} disabled={!changed}>
      <ArrowRightIcon weight="bold" /> Run
    </Button>
    <IconButton label="Random input" size="md" onclick={() => onchange(spec.random())}><ShuffleIcon weight="bold" /></IconButton>
  </div>
  <p id="algorithm-input-hint" class={cn("text-2xs", error ? "text-error" : "text-foreground/80")}>{error ?? spec.hint}</p>
</form>
