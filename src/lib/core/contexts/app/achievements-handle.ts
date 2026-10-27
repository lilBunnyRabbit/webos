import kernel, { type AchievementsService, type AppId } from "$lib/core/api";
import type { AchievementsHandle } from "./type";

export function create_achievements_handle(app_id: AppId): AchievementsHandle {
  const achievements = () => kernel.service<AchievementsService>("achievements");
  return {
    achieve: (id) => achievements().achieve(app_id, id),
    progress: (id, n) => achievements().progress(app_id, id, n),
  };
}
