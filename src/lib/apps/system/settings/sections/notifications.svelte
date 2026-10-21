<script lang="ts">
  import kernel, { JobKind, type NotificationsService, type SchedulerService } from "$lib/core/api";
  import { Badge, Button, Section, SettingRow } from "$lib/core/components/ui";
  import { BellRinging as BellRingingIcon, PaperPlaneTilt as PaperPlaneTiltIcon } from "phosphor-svelte";

  const notifications = $derived(kernel.service<NotificationsService>("notifications"));
  const scheduler = $derived(kernel.service<SchedulerService>("scheduler"));

  type Status = NotificationPermission | "unsupported";
  let status = $state<Status>("Notification" in window ? Notification.permission : "unsupported");
  let sending = $state(false);

  $effect(() => {
    if (status === "unsupported") return;
    let cancelled = false;
    let watched: PermissionStatus | null = null;
    const read = () => (status = Notification.permission);
    navigator.permissions
      .query({ name: "notifications" })
      .then((result) => {
        if (cancelled) return;
        watched = result;
        result.addEventListener("change", read);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      watched?.removeEventListener("change", read);
    };
  });

  const STATUS: Record<Status, { label: string; tone: "success" | "warning" | "error" | "neutral"; description: string }> = {
    granted: { label: "Allowed", tone: "success", description: "Alarms, timers and reminders show up as system notifications." },
    default: { label: "Not asked yet", tone: "warning", description: "Until you allow them, alerts only show inside WebOS while it's on screen." },
    denied: { label: "Blocked", tone: "error", description: "Blocked for this site. Allow them again from the site settings next to the address bar." },
    unsupported: { label: "Unavailable", tone: "neutral", description: "This browser can't show system notifications." },
  };
  const current = $derived(STATUS[status]);

  async function allow() {
    await notifications.request_system();
    status = Notification.permission;
  }

  async function send_test() {
    sending = true;
    try {
      if (status !== "unsupported") {
        await notifications.request_system();
        status = Notification.permission;
      }
      await scheduler.schedule("settings", {
        key: "test",
        title: "Test notification",
        message: "Alarms, timers and reminders from WebOS look like this.",
        at: { epoch: Date.now() + 1000 },
        kind: JobKind.REMINDER,
        open: { app: "settings", props: { section: "notifications" } },
      });
    } catch (error) {
      console.error("[Settings] Test notification:", error);
      notifications.notify("settings", { type: "error", title: "Couldn't send a test notification", message: error instanceof Error ? error.message : String(error) });
    } finally {
      sending = false;
    }
  }
</script>

<div class="flex flex-col gap-8">
  <Section title="System notifications" description="Alarms, timers, Pomodoro phases and reminders ring through your system's notifications, even when WebOS is in a background tab.">
    <SettingRow setting="notification-permission" label="Permission" description={current.description}>
      {#snippet children({ id, describedby })}
        <Badge tone={current.tone}>{current.label}</Badge>
        {#if status === "default"}
          <Button {id} aria-describedby={describedby} variant="primary" onclick={allow}><BellRingingIcon weight="bold" />Allow</Button>
        {/if}
      {/snippet}
    </SettingRow>
    <SettingRow setting="notification-test" label="Send a test" description="Fires one in a second, the same way an alarm would.">
      {#snippet children({ id, describedby })}
        <Button {id} aria-describedby={describedby} disabled={sending} onclick={send_test}><PaperPlaneTiltIcon weight="bold" />Send test</Button>
      {/snippet}
    </SettingRow>
  </Section>

  <Section title="When WebOS is closed" description="A browser page can't keep time once it's closed, so what you get depends on this browser.">
    <SettingRow
      setting="notification-closed"
      label="Alerts with every tab closed"
      description={scheduler.triggers
        ? "On: Chrome's notification triggers show alerts on time even with WebOS closed."
        : "Off: alerts need a WebOS tab or the installed app open, minimised is fine. Anything due while it's closed is summed up when you come back."}
    >
      {#snippet children()}
        <Badge tone={scheduler.triggers ? "success" : "neutral"}>{scheduler.triggers ? "On" : "Off"}</Badge>
      {/snippet}
    </SettingRow>
  </Section>
</div>
