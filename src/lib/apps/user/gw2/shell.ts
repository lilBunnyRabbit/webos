import kernel, { type AppsService } from "$lib/core/api";
import { ShellError, type Tagged } from "$lib/core/api/services/shell/type";
import { create_storage_handle } from "$lib/core/contexts/app";
import { z } from "zod";
import { Gw2Error, vault, VaultPeriod, type VaultObjective } from "./api";
import { format_progress } from "./format";
import { APP_ID, KEY_STORAGE, Section } from "./sections";

export function objective_value(objective: VaultObjective): Tagged {
  return {
    $type: "gw2-objective",
    id: objective.id,
    name: objective.title,
    track: objective.track,
    acclaim: objective.acclaim,
    progress: format_progress(objective.progress_current, objective.progress_complete),
    done: objective.progress_current >= objective.progress_complete,
    claimed: objective.claimed,
  };
}

export async function* daily(): AsyncGenerator<Tagged> {
  const key = create_storage_handle(APP_ID, {}).get(KEY_STORAGE, z.string());
  if (!key) throw new ShellError("gw2 daily: no API key yet; add one in GW2 Tracker › API key");
  try {
    const { data } = await vault(key, VaultPeriod.DAILY);
    for (const objective of data.objectives) yield objective_value(objective);
  } catch (error) {
    if (error instanceof Gw2Error) throw new ShellError(`gw2 daily: ${error.message}`);
    throw error;
  }
}

export function open(section: Section = Section.TODAY): void {
  kernel.service<AppsService>("apps").launch(APP_ID, { section });
}
