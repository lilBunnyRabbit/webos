import { createTask, createTaskGroup, type ExecutableTask } from "@lilbunnyrabbit/task-manager";
import { format_bytes } from "$lib/core/utils";
import { Method, type StreamOptions } from "$lib/core/utils/zip/format";
import { ZipWriter } from "$lib/core/utils/zip/write";
import type { TaskContext } from "../tasks/type";
import { area_sources, clear_stage, manifest_source, stage_area, swap_staged, STAGE_PATH, type OpenedBackup } from "./backup";
import { app_storage, area_of } from "./manifest";
import { BACKUP_AREAS, BackupArea, type BackupAreaInfo } from "./type";

const plural = (count: number, word: string) => `${count} ${count === 1 ? word : `${word}s`}`;

function bytes_stream(context: TaskContext, label: string, total: number, progress: (value: number) => void): StreamOptions {
  let done = 0;
  return {
    signal: context.signal,
    pace: context.pace,
    on_bytes: (bytes) => {
      done += bytes;
      progress(total > 0 ? done / total : 0);
      context.message(`${label}: ${format_bytes(done)} of ${format_bytes(total)}`);
    },
  };
}

export interface CreatePlan {
  root: FileSystemDirectoryHandle;
  areas: BackupArea[];
  meta: { version: string; created: Date };
  storage: Storage;
  save: (blob: Blob) => Promise<void>;
}

/** A task per picked area, then one that saves the zip: sequential, since the writer appends entries in order. */
export function backup_task(plan: CreatePlan, context: TaskContext): ExecutableTask {
  const writer = new ZipWriter(Method.DEFLATE);
  const pack = (info: BackupAreaInfo) =>
    createTask<void, void>({
      name: `${info.label} (${info.path})`,
      async execute() {
        const sources = await area_sources(plan.root, info);
        const total = sources.reduce((sum, source) => sum + (source.data?.size ?? 0), 0);
        const stream = bytes_stream(context, info.label, total, (value) => this.setProgress(value));
        for (const source of sources) await writer.add(source, stream);
        this.logger.info(`Packed ${plural(sources.filter((source) => !source.directory).length, "file")} · ${format_bytes(total)}`);
        if (info.area === BackupArea.APPS) this.logger.info(`${plural(Object.keys(app_storage(plan.storage)).length, "app storage key")}`);
      },
    })();
  const save = createTask<void, void>({
    name: "Save to device",
    async execute() {
      context.message("Saving to the device");
      await writer.add(manifest_source(plan.areas, plan.meta, plan.storage));
      const blob = writer.finish();
      await plan.save(blob);
      context.message(null);
      this.logger.info(format_bytes(blob.size));
    },
  });
  return createTaskGroup({
    name: "Back up",
    tasks: () => [...BACKUP_AREAS.filter(({ area }) => plan.areas.includes(area)).map(pack), save()],
  })();
}

export interface RestorePlan {
  root: FileSystemDirectoryHandle;
  opened: OpenedBackup;
  storage: Storage;
  /** Before anything outside the stage changes; throws to stop. */
  check: () => void;
  /** From here Cancel no longer stops it. */
  on_swap: () => void;
  reload: () => void;
}

/**
 * Unpacks each area into `STAGE_PATH` (Cancel there changes nothing), then swaps the staged areas in and reloads. The
 * swap ignores Cancel and reloads itself, so a Retry that reaches it reloads too.
 */
export function restore_task(plan: RestorePlan, context: TaskContext): ExecutableTask {
  const { manifest, archive } = plan.opened;
  const prepare = createTask<void, void>({
    name: `Clear ${STAGE_PATH}`,
    execute: () => clear_stage(plan.root),
  });
  const unpack = (info: BackupAreaInfo) => {
    const entries = archive.entries.filter((entry) => !entry.directory && area_of(entry.path)?.area === info.area);
    const total = entries.reduce((sum, entry) => sum + entry.size, 0);
    return createTask<void, void>({
      name: `Unpack ${info.label} (${info.path})`,
      async execute() {
        const files = await stage_area(plan.root, plan.opened, info.area, bytes_stream(context, info.label, total, (value) => this.setProgress(value)));
        this.logger.info(`Unpacked ${plural(files, "file")} · ${format_bytes(total)}`);
      },
    })();
  };
  const swap = createTask<void, void>({
    name: "Replace and reload",
    async execute() {
      plan.check();
      plan.on_swap();
      context.message("Replacing, then reloading");
      await swap_staged(plan.root, manifest, plan.storage);
      plan.reload();
    },
  });
  return createTaskGroup({
    name: "Restore",
    tasks: () => [prepare(), ...BACKUP_AREAS.filter(({ area }) => manifest.areas.includes(area)).map(unpack), swap()],
  })();
}
