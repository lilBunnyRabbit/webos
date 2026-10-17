import { createTask, type ExecutableTask } from "@lilbunnyrabbit/task-manager";
import type { TaskContext } from "../tasks/type";

export function download_task<T>(
  name: string,
  create: (options: BuiltInCreateOptions) => Promise<T>,
  context: TaskContext
): ExecutableTask {
  return createTask<void, T>({
    name,
    async execute() {
      return create({
        signal: context.signal,
        monitor: (monitor) =>
          monitor.addEventListener("downloadprogress", (event) => {
            this.setProgress(event.loaded);
            context.message(`${Math.round(event.loaded * 100)}% downloaded`);
          }),
      });
    },
  })();
}
