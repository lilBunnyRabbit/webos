<script lang="ts">
  import { Button, Checkbox, Input, Section, Segmented, Select, SettingRow, Textarea } from "$lib/core/components/ui";
  import { Shuffle as ShuffleIcon } from "phosphor-svelte";
  import {
    DEFAULT_CUP_POINTS,
    default_advance,
    FormatKind,
    group_count,
    max_players,
    MAX_RACE_SIZE,
    MAX_RACES,
    MIN_PLAYERS,
    parse_names,
    parse_points,
    shuffle,
    type Format,
  } from "./bracket";
  import { bracket_size } from "./elimination";

  interface Props {
    busy: boolean;
    oncreate: (name: string, players: string[], format: Format) => void;
    oncancel: () => void;
  }

  let { busy, oncreate, oncancel }: Props = $props();

  const KINDS = [
    { value: FormatKind.SINGLE, label: "Knockout" },
    { value: FormatKind.DOUBLE, label: "Double" },
    { value: FormatKind.ROUND_ROBIN, label: "Round robin" },
    { value: FormatKind.CUP, label: "Race cup" },
  ];
  const ABOUT: Record<FormatKind, string> = {
    single: "Lose once and you're out. Top seeds get byes when the count isn't a power of two.",
    double: "Out after two losses: losers drop into a second bracket, whose winner meets the unbeaten player in the grand final.",
    round_robin: "Everyone plays everyone; the table decides.",
    cup: "Everyone races; points by finishing place add up over the races.",
  };

  let name = $state("Game night");
  let kind = $state<FormatKind>(FormatKind.SINGLE);
  let players_text = $state("");
  let third_place = $state(false);
  let reset = $state(true);
  let legs = $state<"1" | "2">("1");
  let win = $state(3);
  let draw = $state(1);
  let loss = $state(0);
  let races = $state(4);
  let race_size_input = $state<number | null>(null);
  let points_text = $state("");
  let advance_input = $state<number | null>(null);

  const names = $derived(parse_names(players_text));
  const limit = $derived(max_players(kind));
  const duplicate = $derived(names.find((player, index) => names.findIndex((other) => other.toLowerCase() === player.toLowerCase()) !== index));

  const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, Math.round(Number.isFinite(value) ? value : min)));
  const race_size = $derived(clamp(race_size_input ?? Math.min(Math.max(names.length, MIN_PLAYERS), 12), MIN_PLAYERS, MAX_RACE_SIZE));
  const points = $derived.by(() => {
    const parsed = parse_points(points_text).slice(0, MAX_RACE_SIZE);
    return parsed.length ? parsed : DEFAULT_CUP_POINTS.slice(0, race_size);
  });
  const groups = $derived(group_count(names.length, race_size));
  const advance = $derived(groups > 1 ? clamp(advance_input ?? default_advance(names.length, race_size), 0, Math.floor(names.length / groups)) : 0);

  const problem = $derived.by(() => {
    if (names.length < MIN_PLAYERS) return `Add at least ${MIN_PLAYERS} players, one per line.`;
    if (names.length > limit) return `${limit} players at most for this format.`;
    if (duplicate) return `“${duplicate}” is listed twice.`;
    return null;
  });

  const summary = $derived.by(() => {
    const count = names.length;
    if (count < MIN_PLAYERS) return "";
    if (kind === FormatKind.SINGLE || kind === FormatKind.DOUBLE) {
      const size = bracket_size(count);
      const byes = size - count;
      return `A bracket of ${size}${byes ? ` with ${byes} ${byes === 1 ? "bye" : "byes"}` : ""}.`;
    }
    if (kind === FormatKind.ROUND_ROBIN) {
      const matches = ((count * (count - 1)) / 2) * Number(legs);
      return `${matches} matches over ${(count % 2 ? count : count - 1) * Number(legs)} rounds.`;
    }
    return groups > 1
      ? `${groups} groups of up to ${race_size}${advance ? `; the top ${advance} of each race the final` : ""}.`
      : "Everyone in every race.";
  });

  function format(): Format {
    switch (kind) {
      case FormatKind.SINGLE:
        return { kind, third_place };
      case FormatKind.DOUBLE:
        return { kind, reset };
      case FormatKind.ROUND_ROBIN:
        return { kind, legs: legs === "2" ? 2 : 1, win: clamp(win, 0, 1000), draw: clamp(draw, 0, 1000), loss: clamp(loss, 0, 1000) };
      case FormatKind.CUP:
        return { kind, races: clamp(races, 1, MAX_RACES), points, race_size, advance };
    }
  }

  function submit(event: SubmitEvent) {
    event.preventDefault();
    if (problem || busy) return;
    oncreate(name, names, format());
  }

  const number = (event: Event) => Number((event.currentTarget as HTMLInputElement).value);
</script>

<form class="mx-auto flex max-w-2xl flex-col gap-6 p-4 @md:p-6" onsubmit={submit}>
  <Section>
    <SettingRow label="Name" description="Also the file name in Documents.">
      {#snippet children({ id, describedby })}
        <Input {id} aria-describedby={describedby} bind:value={name} maxlength={60} class="w-56" required />
      {/snippet}
    </SettingRow>
    <SettingRow label="Format" description={ABOUT[kind]}>
      {#snippet children({ id, describedby })}
        <Segmented {id} aria-describedby={describedby} bind:value={kind} options={KINDS} label="Format" class="hidden @2xl:inline-flex" />
        <Select bind:value={kind} options={KINDS} aria-label="Format" class="w-40 @2xl:hidden" />
      {/snippet}
    </SettingRow>
  </Section>

  <Section title="Players" description="One per line, best first: the order is the seeding.">
    {#snippet actions()}
      <Button size="sm" variant="quiet" disabled={names.length < 2} onclick={() => (players_text = shuffle(names).join("\n"))}>
        <ShuffleIcon weight="bold" />Shuffle
      </Button>
    {/snippet}
    <div class="flex flex-col gap-2 p-3">
      <Textarea bind:value={players_text} rows={8} aria-label="Players" placeholder={"Ana\nBor\nCene\nDora"} />
      <p class="text-2xs text-foreground/65">
        {names.length}
        {names.length === 1 ? "player" : "players"}{summary ? ` · ${summary}` : ""}
      </p>
    </div>
  </Section>

  <Section title="Options">
    {#if kind === FormatKind.SINGLE}
      <SettingRow label="Third-place match" description="The semifinal losers play for third. Without it they share third.">
        {#snippet children({ id, describedby })}
          <Checkbox {id} aria-describedby={describedby} bind:checked={third_place} />
        {/snippet}
      </SettingRow>
    {:else if kind === FormatKind.DOUBLE}
      <SettingRow label="Grand final reset" description="If the losers' bracket winner takes the grand final, a second final decides, so everyone is out on two losses.">
        {#snippet children({ id, describedby })}
          <Checkbox {id} aria-describedby={describedby} bind:checked={reset} />
        {/snippet}
      </SettingRow>
    {:else if kind === FormatKind.ROUND_ROBIN}
      <SettingRow label="Meetings" description="Twice plays every pairing again with sides swapped.">
        {#snippet children({ id, describedby })}
          <Segmented {id} aria-describedby={describedby} bind:value={legs} options={[{ value: "1", label: "Once" }, { value: "2", label: "Twice" }]} label="Meetings" />
        {/snippet}
      </SettingRow>
      <SettingRow label="Points" description="For a win, a draw and a loss.">
        {#snippet children({ id, describedby })}
          <Input {id} aria-describedby={describedby} aria-label="Points for a win" type="number" min={0} value={win} onchange={(event) => (win = number(event))} class="w-16" />
          <Input aria-label="Points for a draw" type="number" min={0} value={draw} onchange={(event) => (draw = number(event))} class="w-16" />
          <Input aria-label="Points for a loss" type="number" min={0} value={loss} onchange={(event) => (loss = number(event))} class="w-16" />
        {/snippet}
      </SettingRow>
    {:else}
      <SettingRow label="Races" description="How many races each group runs.">
        {#snippet children({ id, describedby })}
          <Input {id} aria-describedby={describedby} type="number" min={1} max={MAX_RACES} value={races} onchange={(event) => (races = number(event))} class="w-20" />
        {/snippet}
      </SettingRow>
      <SettingRow label="Players per race" description="With more players than this, they race in groups.">
        {#snippet children({ id, describedby })}
          <Input
            {id}
            aria-describedby={describedby}
            type="number"
            min={MIN_PLAYERS}
            max={MAX_RACE_SIZE}
            value={race_size}
            onchange={(event) => (race_size_input = number(event))}
            class="w-20"
          />
        {/snippet}
      </SettingRow>
      <SettingRow label="Points by place" description="First place first. Places past the list score 0.">
        {#snippet children({ id, describedby })}
          <Input {id} aria-describedby={describedby} bind:value={points_text} placeholder={points.join(", ")} class="w-56 font-mono text-2xs" />
        {/snippet}
      </SettingRow>
      {#if groups > 1}
        <SettingRow label="Final" description="How many from each group race the final. 0 ranks everyone on their group points.">
          {#snippet children({ id, describedby })}
            <Input
              {id}
              aria-describedby={describedby}
              type="number"
              min={0}
              value={advance}
              onchange={(event) => (advance_input = number(event))}
              class="w-20"
            />
          {/snippet}
        </SettingRow>
      {/if}
    {/if}
  </Section>

  <div class="flex flex-wrap items-center justify-end gap-2">
    {#if problem && names.length > 0}<p class="mr-auto text-ui text-error">{problem}</p>{/if}
    <Button variant="quiet" onclick={oncancel}>Cancel</Button>
    <Button variant="primary" type="submit" disabled={problem !== null || busy}>Create bracket</Button>
  </div>
</form>
