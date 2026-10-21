import type { FilesService } from "../files/type";
import { LatestWriter } from "../files/latest-writer";
import { parse_registry, SCHEDULER_PATH, serialize_registry, type Registry } from "./persistence";

export const LEADER_LOCK = "webos:scheduler";
const STORE_LOCK = "webos:scheduler-store";
export const CHANNEL = "webos:scheduler";

export interface Transaction<T> {
  registry: Registry;
  text: string | null;
  written: boolean;
  result: T;
}

export interface Change<T> {
  next: Registry | null;
  result: T;
}

/**
 * `jobs.json` for every tab of the browser. A change re-reads the file under the store lock and writes it back before
 * releasing, so two tabs' changes never overwrite each other; a LatestWriter only ever saw this tab's text.
 */
export class RegistryStore {
  private readonly writer: LatestWriter;

  constructor(private readonly files: () => FilesService) {
    this.writer = new LatestWriter(files, SCHEDULER_PATH, "scheduler jobs");
  }

  async read(): Promise<{ registry: Registry; text: string | null }> {
    const file = await this.files().get_file(SCHEDULER_PATH);
    const text = file ? await file.text() : null;
    return { registry: parse_registry(text), text };
  }

  async transact<T>(change: (registry: Registry) => Change<T>): Promise<Transaction<T>> {
    return await navigator.locks.request(STORE_LOCK, async (): Promise<Transaction<T>> => {
      const { registry, text } = await this.read();
      const { next, result } = change(registry);
      if (!next) return { registry, text, written: false, result };
      const serialized = serialize_registry(next);
      // Another tab may have written since this one did: compare with the disk, not with this writer's last text.
      this.writer.seed(text);
      this.writer.write(serialized);
      await this.writer.idle();
      return { registry: next, text: serialized, written: serialized !== text, result };
    });
  }
}
