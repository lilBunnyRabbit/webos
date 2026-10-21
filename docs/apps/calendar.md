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

`reminder_plan(event)` (`reminders.ts:51`) turns an event into a rule:

1. The reminder's wall time is the start (09:00 for an all-day event) minus the reminder's minutes. When that goes below midnight it carries onto earlier days: 00:30 with 1 hour is 23:30 the day before. The number of days carried is `shift`.
2. The job's `at` is `{ date: first day − shift, time, tz }`, `tz` being the device's zone when it's scheduled (ADR-062: fixed zone per job).
3. The job's rule is the event's moved back by `shift` days: daily is `{ every: "day" }`, weekly is `{ every: "week", days: [the reminder's weekday] }`, monthly is `{ every: "month", day }` on the day it lands on, yearly is `{ every: "year" }`. `until` and every `skip` move back by `shift`, so they stay one to one with the event's days.

**Why the check.** With `shift` 0 the rule is the event's own. With a shift, month-end clamping can break it: a day before the 31st is the 30th in a 31-day month, the 29th in a 30-day month and the 27th in February. So a shifted monthly or yearly rule isn't trusted; `follows()` (`reminders.ts:84`) runs the scheduler's own `next_occurrence` in UTC over 48 months or 8 years, which meets every month length after every other and both kinds of year, and compares it to Calendar's occurrences moved back by `shift`. For monthly it tries the day the first reminder lands on and, when that's its month's last day, `31` (the month's end), which covers "the day before the 1st" and "a week before the 7th".

| Event | Reminder | Job |
|-------|----------|-----|
| Wed 14 Oct 10:00, weekly | 1 day before | Tue 13 Oct 10:00, `week [2]` |
| 15th, monthly | 1 day before | `month 14` |
| 1st, monthly | 1 day before | the previous month's last day, `month 31` |
| 31st, monthly | at the start | `month 31` |
| 31st (or 29th, 30th), monthly | 1 day before | refused |
| 1st–7th, monthly | 1 week before | refused, except the 7th (`month 31`) |
| 29 February, yearly | at the start | `year` from a 29 February, clamped by the scheduler |
| 29 February, yearly | 1 day before | refused |
| 1 March, yearly, first year a leap year | 1 day before | `year` from 29 February |
| 1 March, yearly, first year not a leap year | 1 day before | refused |

A refused combination schedules nothing. The editor shows the reason under Reminder and won't save (`reminder_error`, `reminders.ts:98`); `cal add` fails with it. How to schedule these is an open owner decision (brainstorm).

`reminders.test.ts` checks the whole mapping against Calendar's occurrences for 11 first days (month ends, leap days), 6 reminder lengths, every repeat, timed and all day, with `until` and `skip`: each accepted plan has to fire on exactly the old reminder instants.

### Keeping jobs in step

`sync_reminder(event)` (`jobs.ts:18`) runs after Save, Delete this one (adds a `skip`) and `cal add`; Delete calls `cancel_reminder`. It builds the job with `reminder_input` (`reminders.ts:135`) and then:

- no reminder, a refused one, or no occurrence left from now on: cancels the job;
- the job exists with the same wall date, time and rule (`same_timing`, key order and zone ignored): updates only the title and message, so the zone and `armed_at` stay;
- otherwise: `schedule()`, which re-arms it from now.

Uninstalling Calendar drops its jobs (the scheduler does it).

### Firing

The notification's title is the event's; the message is its time and how far ahead the reminder is, the same for every occurrence ("14:30–15:30 · in 15 min", "All day · tomorrow"). No buttons.

A job's `open` is fixed, so the body click would always open the first occurrence's day. The `on_fire` handler (`on-fire.ts:8`) fixes that: after each fired or missed reminder it reads the job from the registry, finds the event and points `open.props.day` at the next pending occurrence's day (`reminded_day`: the next reminder's date in the job's zone plus `shift`). With no occurrence left, or the event or its reminder gone, it cancels the job, so finished one-off reminders don't pile up in the registry.

The status bar and the widget show the soonest pending `calendar:` job (`next_reminder`, `reminders.ts:116`).

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
- Refused monthly and yearly combinations (above).
- A reminder saved after its time for the next occurrence has passed doesn't fire for that occurrence.
- Events have no time zone: they show at the same wall time wherever the device is, while their reminder keeps the zone it was scheduled in until the event is edited.
- If the leader tab closes between a reminder firing and its handler running, the next reminder opens the day of the one before.

## Decisions

- [ADR-062](../adrs/062-background-scheduler.md), revision "Calendar on the scheduler".
- [Background scheduler brainstorm](../brainstorm/2026-10-21_background-scheduler.md): the registry, fixed zones, `on_fire`, and the open question on refused reminders.
