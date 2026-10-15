import type { ExecutableTask, LogEntry, Task, TaskGroup, TaskManager } from "@lilbunnyrabbit/task-manager";
import { createSubscriber } from "svelte/reactivity";

export interface TreeNode {
  id: string;
  name: string;
  group: boolean;
  status: string;
  progress: number;
  /** A group's `sequential` or `parallel`. */
  mode: string | null;
  /** A task's own `parse().status`, when it sets one. */
  note: string | null;
  logs: LogEntry[];
  children: TreeNode[];
}

type Target = TaskManager | ExecutableTask;

interface Emitter {
  onAll(listener: () => void): unknown;
  offAll(listener: () => void): unknown;
}

const is_task = (target: Target): target is Task => "parse" in target;
const children_of = (target: Target): ExecutableTask[] => (is_task(target) ? [] : (target as TaskManager | TaskGroup).tasks);

// A task's default parse() repeats its status; only a status line the task wrote itself is worth showing.
function note_of(task: Task): string | null {
  const status = task.parse().status;
  return status && status !== task.status ? status : null;
}

/** The groups and tasks of one run, kept live from the package's events while something reads them. */
export class TaskTree {
  private readonly subscribe: () => void;

  readonly nodes = $derived.by(() => {
    this.subscribe();
    return this.manager.tasks.map((task) => this.node(task));
  });

  constructor(private readonly manager: TaskManager) {
    this.subscribe = createSubscriber((update) => {
      const emitters: Emitter[] = [];
      const walk = (target: Target) => {
        emitters.push(target as unknown as Emitter);
        children_of(target).forEach(walk);
      };
      walk(manager);
      for (const emitter of emitters) emitter.onAll(update);
      return () => emitters.forEach((emitter) => emitter.offAll(update));
    });
  }

  private node(target: ExecutableTask): TreeNode {
    const task = is_task(target) ? target : null;
    return {
      id: target.id,
      name: target.name,
      group: !task,
      status: target.status,
      progress: target.progress,
      mode: task ? null : (target as TaskGroup).mode,
      note: task ? note_of(task) : null,
      logs: task ? [...task.logs] : [],
      children: children_of(target).map((child) => this.node(child)),
    };
  }
}
