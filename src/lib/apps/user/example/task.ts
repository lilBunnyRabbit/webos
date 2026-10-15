import { createTask, createTaskGroup, ExecutionMode, type ExecutableTask } from "@lilbunnyrabbit/task-manager";
import kernel, { type TaskContext, type TaskJob, type TasksService } from "$lib/core/api";

const FILES = ["photos.zip", "notes.md", "song.mp3", "report.pdf"];
const STEPS = ["Reading", "Resizing", "Tagging", "Indexing", "Checking", "Sorting", "Thumbnails", "Cleaning up"];

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const timer = setTimeout(resolve, ms);
    signal.addEventListener("abort", () => (clearTimeout(timer), reject(signal.reason)), { once: true });
  });
}

/** About 20 s of fake work: parallel downloads, then sequential processing, then packing that can fail once. */
export function example_task(context: TaskContext, fail: boolean): ExecutableTask {
  const download = createTask<string, number>({
    name: "Download",
    parse() {
      if (this.status === "in-progress") return { status: `Downloading ${this.data}` };
      if (this.status === "success") return { status: `${this.data} downloaded` };
    },
    async execute(file) {
      this.logger.info(`Fetching ${file}`);
      for (let chunk = 1; chunk <= 10; chunk++) {
        await wait(200 + Math.random() * 400, context.signal);
        this.setProgress(chunk / 10);
      }
      return 1 + Math.round(Math.random() * 9);
    },
  });

  const downloads = createTaskGroup({
    name: "Downloads",
    mode: ExecutionMode.PARALLEL,
    tasks: () => FILES.map((file) => download(file)),
  });

  const process = createTask<void, void>({
    name: "Process",
    async execute() {
      const sizes = this.query.get(downloads).query.getResults(download);
      this.logger.info(`Processing ${sizes.reduce((sum, size) => sum + size, 0)} MB from ${sizes.length} files`);
      for (const [index, step] of STEPS.entries()) {
        context.message(`${step} · step ${index + 1} of ${STEPS.length}`);
        this.logger.debug(step);
        await wait(700, context.signal);
        this.setProgress((index + 1) / STEPS.length);
      }
    },
  });

  const pack = createTask<void, string>({
    name: "Pack",
    async execute() {
      for (let part = 1; part <= 5; part++) {
        context.message(`Packing · part ${part} of 5`);
        await wait(400, context.signal);
        if (fail && part === 3) throw new Error("Disk full (on purpose: press Retry)");
        this.setProgress(part / 5);
      }
      context.message(null);
      return "example.zip";
    },
  });

  return createTaskGroup({
    name: "Example task",
    tasks: () => [downloads(), process(), pack()],
  })();
}

/** Runs the example as a background task. With `fail`, the first run fails while packing, so Retry has something to do. */
export function run_example_task(fail = false): TaskJob {
  let runs = 0;
  return kernel.service<TasksService>("tasks").run("example", (context) => example_task(context, fail && runs++ === 0), {
    title: fail ? "Example task (fails once)" : "Example task",
    done: () => ({ title: "Example task finished", message: "4 downloads, 8 steps, 1 archive" }),
  });
}
