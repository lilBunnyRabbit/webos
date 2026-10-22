# Calendar
Id `calendar` · Source: `src/lib/apps/user/calendar/` · [ADR-062](../adrs/062-background-scheduler.md) (reminders), [scheduler](../system/services/scheduler.md#calendar), [brainstorm](../brainstorm/2026-10-21_background-scheduler.md)

## What it does

A month, week and agenda calendar for local events, with Work Hours days and Kanban due dates shown alongside. Events can repeat daily, weekly, monthly or yearly, skip single days and carry a reminder. Reminders ring through the scheduler, with Calendar closed, in any WebOS tab.

## How it works

### Occurrences

`occurrences(event, from, to)` (`calendar.ts:176`) lists the days an event happens on in a range. Days are `YYYY-MM-DD` strings stepped in UTC, so DST never moves a day.

| Repeat | Days |
|--------|------|
| none | `day` |
| daily | every day from `day` |
| weekly | every 7 days from `day` |
| monthly | `day`'s day of the month, clamped to shorter months: the 31st is the 30th in April, the 28th or 29th in February |
| yearly | `day`'s month and day, clamped the same way: 29 February is the 28th in other years |

`until` is the last day, inclusive; `skip` lists days left out, by their real (clamped) day. Saving an edit keeps `skip` only while the first day and the rule stay the same (`event_from_draft`, `calendar.ts:431`), since old skips wouldn't line up.

### Reminders as scheduler jobs

Every event with a reminder has one job, `calendar:reminder-{event id}`, kind `reminder`. Calendar never stores when a reminder last fired; the scheduler does.

`reminder_input(event, zone, now)` (`reminders.ts:77`) makes the job the event itself, with the reminder as the scheduler's lead time:

1. `at` is `{ date: the event's first day, time: its start (09:00 all day), tz }`, `tz` being the device's zone when it's scheduled (ADR-062: fixed zone per job).
2. The rule is the event's own (`event_repeat`, `reminders.ts:29`): daily is `{ every: "day" }`, weekly is `{ every: "week", days: [the event's weekday] }`, monthly is `{ every: "month", day }` on the event's day, yearly is `{ every: "year" }`, with the event's `until` and `skip` as they are.
3. `before` is the reminder's minutes, left out for "at the start". The scheduler takes it off each occurrence on the wall clock in the job's zone ([scheduler](../system/services/scheduler.md#occurrences)).

Month ends and 29 February need nothing special: the scheduler clamps the event's day the way Calendar does, then takes the lead time off the clamped day. A day before a monthly 31st fires on the 30th, the 29th or 27 or 28 February; a week before the 5th fires late in the previous month; a day before a yearly 29 February fires on the 28th, or the 27th in other years.

| Event | Reminder | Job |
|-------|----------|-----|
| Wed 14 Oct 10:00, weekly | 1 day before | 14 Oct 10:00, `week [3]`, `before` 1440: Tuesdays 10:00 |
| 31st, monthly | 1 day before | `month 31`, `before` 1440 |
| 29 February, yearly | at the start | `year` from a 29 February, clamped by the scheduler |
| 29 February, yearly | 1 day before | `year`, `before` 1440 |

`lead_days(event)` (`reminders.ts:47`) is how many days the reminder sits before its event (00:30 with 1 hour is 1); the message and the click's day use it.

`reminders.test.ts` checks the whole mapping against Calendar's occurrences for 14 first days (month ends, the 1st–7th, leap days, 1 March from both kinds of year), 6 reminder lengths, every repeat, timed and all day, with `until` and `skip`: each job has to fire on exactly the old reminder instants, and none is refused.

Until 2026-10-22 the job held the reminder's own time and the event's rule shifted by whole days, and a day ahead of a monthly 29th–31st, a week ahead of the 1st–7th, and a day ahead of a yearly 29 February or of 1 March from a non-leap year were refused because that shift couldn't express them. Such a job doesn't match the event's timing, so the next edit or the next time it fires (`on_fire`) schedules it afresh in the event's form; until then it fires at the same instants.

### Keeping jobs in step

`sync_reminder(event)` (`jobs.ts:18`) runs after Save, Delete this one (adds a `skip`) and `cal add`; Delete calls `cancel_reminder`. It builds the job with `reminder_input` and then:

- no reminder, or no occurrence left from now on: cancels the job;
- the job exists with the same wall date, time, rule and lead time (`same_timing`, `reminders.ts:113`, key order and zone ignored): updates only the title and message, so the zone and `armed_at` stay;
- otherwise: `schedule()`, which re-arms it from now.

Uninstalling Calendar drops its jobs (the scheduler does it).

### Firing

The notification's title is the event's; the message is its time and how far ahead the reminder is, the same for every occurrence ("14:30–15:30 · in 15 min", "All day · tomorrow"). No buttons.

A job's `open` is fixed, so the body click would always open the first occurrence's day. The `on_fire` handler (`on-fire.ts:8`) fixes that: after each fired or missed reminder it reads the job from the registry, finds the event and points `open.props.day` at the next pending occurrence's day (`reminded_day`: the next reminder's date in the job's zone plus `lead_days`). With no occurrence left, or the event or its reminder gone, it cancels the job, so finished one-off reminders don't pile up in the registry. A job whose timing no longer matches the event (an old-form one) is scheduled afresh instead.

The status bar and the widget show the soonest pending `calendar:` job (`next_reminder`, `reminders.ts:57`).

## Data

| Where | What |
|-------|------|
| `/var/lib/apps/calendar/events.json` | `{ version: 1, events }`: id, title, day, all_day, start, end (`24:00` allowed), repeat `{ every, until }`, skip, notes, color, reminder (minutes before, or `null`). Shared cell between windows, the widget, the shell and the handler (`json_file`) |
| `/var/lib/scheduler/jobs.json` | the reminder jobs ([scheduler](../system/services/scheduler.md)) |
| `app.calendar.*` | which sources show (Work Hours, Kanban), per-window view and anchor day |

Props: `day` (`YYYY-MM-DD`), `view` (`month`, `week`, `agenda`).

## Dependencies & licences

zod. No packages of its own.

## Limits

- Reminders count in wall time: across a DST change between a reminder and its event, "1 day before" is the same clock time the day before (23 or 25 h), and "1 hour before" 03:30 on a spring-forward night lands in the gap and fires at 03:30. The old in-app check subtracted milliseconds.
- A reminder saved after its time for the next occurrence has passed doesn't fire for that occurrence.
- Events have no time zone: they show at the same wall time wherever the device is, while their reminder keeps the zone it was scheduled in until the event is edited.
- If the leader tab closes between a reminder firing and its handler running, the next reminder opens the day of the one before.

## Decisions

- [ADR-062](../adrs/062-background-scheduler.md), revision "Calendar on the scheduler".
- [Background scheduler brainstorm](../brainstorm/2026-10-21_background-scheduler.md): the registry, fixed zones, `on_fire`, and the reminders the old shifted rule couldn't express, settled by the lead time ([owner calls](../brainstorm/2026-10-22_owner-calls.md)).
