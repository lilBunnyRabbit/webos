import kernel, { type AppsService } from "$lib/core/api";
import type { TopicId } from "./ids";

export function tour(topic: TopicId | undefined): void {
  kernel.service<AppsService>("apps").launch("getting-started", topic ? { topic } : undefined);
}
