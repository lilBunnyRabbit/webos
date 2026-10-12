<script lang="ts">
  import { get_app_context } from "$lib/core/contexts/app";
  import { Badge, IconButton, Input, Section, SettingRow, Switch } from "$lib/core/components/ui";
  import { ArrowsClockwise as ArrowsClockwiseIcon } from "phosphor-svelte";
  import CopyButton from "../copy-button.svelte";
  import { as_number } from "../form";
  import {
    CHARACTERS,
    CHARACTER_SETS,
    DEFAULT_PASSWORD_SETTINGS,
    MAX_LENGTH,
    MIN_LENGTH,
    Strength,
    check_password,
    entropy_bits,
    generate_password,
    password_settings_schema,
    strength_of,
    type CharacterSet,
    type PasswordSettings,
  } from "../password";

  const SET_LABELS: Record<CharacterSet, string> = {
    lower: "Lowercase",
    upper: "Uppercase",
    digits: "Digits",
    symbols: "Symbols",
  };
  const SET_HINTS: Record<CharacterSet, string> = {
    lower: "a to z",
    upper: "A to Z",
    digits: "0 to 9",
    symbols: CHARACTERS.symbols,
  };
  const STRENGTH_LABELS: Record<Strength, string> = {
    [Strength.WEAK]: "Weak",
    [Strength.FAIR]: "Fair",
    [Strength.STRONG]: "Strong",
    [Strength.VERY_STRONG]: "Very strong",
  };
  const STRENGTH_TONES = {
    [Strength.WEAK]: "error",
    [Strength.FAIR]: "warning",
    [Strength.STRONG]: "success",
    [Strength.VERY_STRONG]: "success",
  } as const;

  interface Generated {
    password: string;
    bits: number;
  }

  const { storage } = get_app_context();
  const settings = storage.persisted<PasswordSettings>("password", DEFAULT_PASSWORD_SETTINGS, password_settings_schema);

  const checked = $derived(check_password(settings.value));
  let generated = $state.raw<Generated | null>(create());

  function create(): Generated | null {
    const result = check_password(settings.value);
    if (!result.ok) return null;
    return { password: generate_password(result.value), bits: entropy_bits(result.value) };
  }

  function regenerate() {
    generated = create() ?? generated;
  }

  function update(patch: Partial<PasswordSettings>) {
    settings.value = { ...settings.value, ...patch };
    regenerate();
  }

  function toggle_set(set: CharacterSet, on: boolean) {
    update({ sets: { ...settings.value.sets, [set]: on } });
  }
</script>

<Section flush>
  <div class="flex flex-col gap-3 rounded-xl bg-background-light p-4 ring-1 ring-foreground/8">
    <div class="flex items-start gap-2">
      <output aria-live="polite" class="min-w-0 flex-1 font-mono text-lg break-all select-all">{generated?.password ?? ""}</output>
      <IconButton label="New password" size="sm" disabled={!checked.ok} onclick={regenerate}><ArrowsClockwiseIcon /></IconButton>
      <CopyButton text={generated?.password ?? ""} label="Copy password" disabled={!generated} />
    </div>
    {#if generated}
      {@const strength = strength_of(generated.bits)}
      <div class="flex items-center gap-2">
        <Badge tone={STRENGTH_TONES[strength]}>{STRENGTH_LABELS[strength]}</Badge>
        <span class="font-mono text-2xs text-foreground/65 tabular-nums">about {Math.floor(generated.bits)} bits</span>
      </div>
    {/if}
    {#if !checked.ok}<p role="alert" class="text-ui text-error">{checked.error}</p>{/if}
  </div>
</Section>

<Section title="Options" description="Changing an option makes a new password.">
  <SettingRow label="Length" description="{MIN_LENGTH} to {MAX_LENGTH} characters.">
    {#snippet children({ id, describedby })}
      <Input {id} aria-describedby={describedby} type="number" min={MIN_LENGTH} max={MAX_LENGTH} step="1" size="sm" class="w-24" bind:value={() => settings.value.length, (value) => update({ length: as_number(value) })} />
    {/snippet}
  </SettingRow>
  {#each CHARACTER_SETS as set (set)}
    <SettingRow label={SET_LABELS[set]} description={SET_HINTS[set]}>
      {#snippet children({ id, describedby })}
        <Switch {id} aria-describedby={describedby} bind:checked={() => settings.value.sets[set], (on) => toggle_set(set, on)} />
      {/snippet}
    </SettingRow>
  {/each}
  <SettingRow label="Leave out look-alikes" description="Skips I, l, 1, |, O, 0 and o.">
    {#snippet children({ id, describedby })}
      <Switch {id} aria-describedby={describedby} bind:checked={() => settings.value.exclude_ambiguous, (exclude_ambiguous) => update({ exclude_ambiguous })} />
    {/snippet}
  </SettingRow>
</Section>
