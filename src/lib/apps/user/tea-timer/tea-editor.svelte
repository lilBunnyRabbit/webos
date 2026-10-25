<script lang="ts">
  import { Button, Input, Textarea } from "$lib/core/components/ui";
  import { fields_of, MAX_STEEPS, TempUnit, type TeaDraft, type TeaFields } from "./tea";

  let {
    draft = $bindable(),
    unit,
    built_in,
    onsave,
    oncancel,
  }: { draft: TeaDraft; unit: TempUnit; built_in: boolean; onsave: (fields: TeaFields) => void; oncancel: () => void } = $props();

  let problem = $state("");

  const LABEL = "text-2xs font-medium tracking-wide text-foreground/65 uppercase";

  function save(event: SubmitEvent) {
    event.preventDefault();
    const fields = fields_of($state.snapshot(draft), unit);
    if (typeof fields === "string") {
      problem = fields;
      return;
    }
    onsave(fields);
  }
</script>

<form class="h-full overflow-auto" onsubmit={save} oninput={() => (problem = "")}>
  <div class="mx-auto grid max-w-md gap-4 p-4 @md:p-6">
    <h2 class="text-lg font-medium">{draft.id ? `Edit ${built_in ? "built-in tea" : "tea"}` : "New tea"}</h2>
    <label class="grid gap-1.5">
      <span class={LABEL}>Name</span>
      <Input bind:value={draft.name} placeholder="Like Sencha or Breakfast blend" maxlength={60} required />
    </label>
    <div class="grid grid-cols-2 gap-3">
      <label class="grid gap-1.5">
        <span class={LABEL}>Water, °{unit === TempUnit.F ? "F" : "C"}</span>
        <Input type="number" inputmode="numeric" min={unit === TempUnit.F ? 32 : 0} max={unit === TempUnit.F ? 212 : 100} step="1" bind:value={draft.temp} class="font-mono tabular-nums" />
      </label>
      <label class="grid gap-1.5">
        <span class={LABEL}>Steeps</span>
        <Input type="number" inputmode="numeric" min="1" max={MAX_STEEPS} step="1" bind:value={draft.steeps} class="font-mono tabular-nums" />
      </label>
      <label class="grid gap-1.5">
        <span class={LABEL}>Shortest, min</span>
        <Input type="number" inputmode="decimal" min="0.25" step="0.25" bind:value={draft.min_minutes} class="font-mono tabular-nums" />
      </label>
      <label class="grid gap-1.5">
        <span class={LABEL}>Longest, min</span>
        <Input type="number" inputmode="decimal" min="0.25" step="0.25" bind:value={draft.max_minutes} class="font-mono tabular-nums" />
      </label>
      {#if Number(draft.steeps) > 1}
        <label class="col-span-2 grid gap-1.5">
          <span class={LABEL}>Extra seconds per steep</span>
          <Input type="number" inputmode="numeric" min="0" step="5" bind:value={draft.extra_seconds} class="font-mono tabular-nums" />
        </label>
      {/if}
    </div>
    <p class="-mt-1 text-2xs text-foreground/65">Light brews for the shortest time, Strong for the longest, Medium halfway.</p>
    <label class="grid gap-1.5">
      <span class={LABEL}>Notes</span>
      <Textarea bind:value={draft.notes} placeholder="Brand, how much, milk or not" maxlength={500} class="min-h-20" />
    </label>
    {#if problem}<p class="text-ui text-error" role="alert">{problem}</p>{/if}
    <div class="flex items-center justify-end gap-2">
      <Button variant="quiet" onclick={oncancel}>Cancel</Button>
      <Button variant="primary" type="submit">Save</Button>
    </div>
  </div>
</form>
