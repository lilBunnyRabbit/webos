import kernel, { type SchedulerService } from "$lib/core/api";
import { app_data_path, live_file } from "$lib/core/contexts/app";
import { report_error } from "$kit/utils/report-error";
import { APP_ID, brew_input, DATA_FILE, drop_orphans, EMPTY_TEAS, new_id, TeaDataSchema, type Brew, type Strength, type TeaData, type TeaEntry } from "./tea";

const scheduler = () => kernel.service<SchedulerService>("scheduler");

export const tea_file = live_file(app_data_path(APP_ID, DATA_FILE), EMPTY_TEAS, TeaDataSchema);

export function attempt(title: string, work: Promise<unknown>): void {
  work.catch((reason) => report_error(APP_ID, title, reason));
}

function edit(change: (data: TeaData) => void): Promise<TeaData> {
  return tea_file.edit((data) => {
    change(data);
    return data;
  });
}

// The job is written first: an armed job reads as brewing whatever the extras say.

export async function start_brew(tea: TeaEntry, strength: Strength): Promise<string> {
  const id = new_id();
  const job = await scheduler().schedule(APP_ID, brew_input(id, tea, strength, 1, Date.now()));
  await edit((data) => {
    data.brews[job.id] = { tea: tea.id, steep: 1, strength };
    data.strength[tea.id] = strength;
  });
  return job.id;
}

export async function steep_again(brew: Brew, tea: TeaEntry, steep: number): Promise<void> {
  await scheduler().schedule(APP_ID, brew_input(brew.id, tea, brew.strength, steep, Date.now()));
  await edit((data) => {
    data.brews[brew.job] = { tea: tea.id, steep, strength: brew.strength };
  });
}

export async function stop_brew(brew: Brew): Promise<void> {
  await scheduler().cancel(brew.job);
  await edit((data) => drop_orphans(data, scheduler().jobs));
}
