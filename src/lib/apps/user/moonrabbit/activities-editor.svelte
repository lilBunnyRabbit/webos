<script lang="ts">
  import kernel, { type DialogsService } from "$lib/core/api";
  import { Button, IconButton, Input, Switch } from "$lib/core/components/ui";
  import { report_error } from "$kit/utils/report-error";
  import { Plus as PlusIcon } from "phosphor-svelte";
  import { add_activity, clean_activity_label, ICON_NAMES, update_activity, type ActivityDef } from "./activities";
  import { activity_icon, ACTIVITY_ICONS } from "./icons";
  import { APP_ID } from "./journal";
  import type { JournalSession } from "./session.svelte";

  interface Props {
    session: JournalSession;
  }

  let { session }: Props = $props();

  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  let label = $state("");
  let icon = $state<string>("star");
  const NewIcon = $derived(activity_icon(icon));

  async function save(next: ActivityDef[]) {
    try {
      await session.set_activities(next);
    } catch (reason) {
      report_error(APP_ID, "Couldn't save the activities", reason);
    }
  }

  async function pick_icon(event: MouseEvent): Promise<string | null> {
    const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
    return dialogs.menu(
      ICON_NAMES.map((name) => ({ id: name, label: name[0].toUpperCase() + name.slice(1), icon: ACTIVITY_ICONS[name] })),
      { anchor: { x: box.left, y: box.bottom + 4 } }
    );
  }

  function add(event: SubmitEvent) {
    event.preventDefault();
    if (!clean_activity_label(label)) return;
    void save(add_activity(session.activities, label, icon));
    label = "";
    icon = "star";
  }
</script>

<div class="grid gap-4">
  <p class="text-ui text-foreground/65">Hidden ones stay on the entries that have them. Names are encrypted with the journal.</p>
  <ul class="grid gap-1">
    {#each session.activities as activity (activity.id)}
      {@const Icon = activity_icon(activity.icon)}
      <li class="flex items-center gap-2">
        <IconButton
          label={`Icon for ${activity.label}`}
          size="sm"
          onclick={async (event) => {
            const next = await pick_icon(event);
            if (next) void save(update_activity(session.activities, activity.id, { icon: next }));
          }}
        >
          <Icon weight="bold" />
        </IconButton>
        <Input
          size="sm"
          spellcheck={false}
          class="min-w-0 flex-1"
          value={activity.label}
          aria-label="Name"
          onchange={(event) => {
            const clean = clean_activity_label(event.currentTarget.value);
            if (clean && clean !== activity.label) void save(update_activity(session.activities, activity.id, { label: clean }));
            else event.currentTarget.value = activity.label;
          }}
        />
        <Switch
          checked={!activity.hidden}
          aria-label={`Show ${activity.label}`}
          onchange={(event) => void save(update_activity(session.activities, activity.id, { hidden: event.currentTarget.checked ? undefined : true }))}
        />
      </li>
    {/each}
  </ul>
  <form class="flex items-center gap-2" onsubmit={add}>
    <IconButton
      label="Icon for the new activity"
      size="sm"
      onclick={async (event) => {
        const next = await pick_icon(event);
        if (next) icon = next;
      }}
    >
      <NewIcon weight="bold" />
    </IconButton>
    <Input bind:value={label} spellcheck={false} size="sm" class="min-w-0 flex-1" placeholder="New activity" aria-label="New activity" maxlength={40} />
    <Button size="sm" type="submit" disabled={!label.trim()}><PlusIcon weight="bold" />Add</Button>
  </form>
</div>
