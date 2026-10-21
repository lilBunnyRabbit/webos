import { createTask } from "@lilbunnyrabbit/task-manager";
import kernel, { type TaskJob, type TasksService } from "$lib/core/api";
import { record_audio } from "$kit/utils/video/capture";
import { format_time } from "$kit/utils/video/plan";
import { APP_ID } from "./store";

export function record_video_sound(file: File): TaskJob<Blob> {
  return kernel.service<TasksService>("tasks").run<Blob>(
    APP_ID,
    (context) =>
      createTask<void, Blob>({
        name: "Record the sound",
        async execute() {
          return record_audio({
            file,
            signal: context.signal,
            on_progress: (time, duration) => {
              if (duration > 0) this.setProgress(Math.min(1, time / duration));
              context.message(`${format_time(time, 0)} of ${format_time(duration, 0)}`);
            },
          });
        },
      })(),
    { title: `Reading the sound of “${file.name}”`, done: () => null }
  );
}
