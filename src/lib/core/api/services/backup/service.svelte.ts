import type { DialogsService, FilesService, Kernel, NotificationsService, TasksService, WindowsService } from "$lib/core/api";
import { TaskJobStatus } from "../tasks/type";
import { format_bytes } from "$lib/core/utils";
import { backup_shell } from "./shell";
import { flush_writers } from "../files/latest-writer";
import {
  BACKUP_AREAS,
  BackupActivity,
  BackupError,
  type BackupArea,
  type BackupSaved,
  type BackupService as IBackupService,
} from "./type";

declare const __VERSION_INFO__: { version: string };

const logic = () => import("./backup");
const manifest = () => import("./manifest");
const work = () => import("./tasks");

export class BackupService implements IBackupService {
  name = "BackupService";
  description = "Backs up files, settings and app data to a zip on the device, and restores one";
  inspector = () => import("./inspector.svelte");
  shell = () => backup_shell(this);

  to_string(): string {
    return `BackupService: ${this.activity ?? "idle"}`;
  }

  public activity = $state<BackupActivity | null>(null);
  public last = $state.raw<BackupSaved | null>(null);

  private files_service!: FilesService;
  private dialogs_service!: DialogsService;
  private notifications_service!: NotificationsService;
  private windows_service!: WindowsService;
  private tasks_service!: TasksService;

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.dialogs_service = $derived(this.kernel.service<DialogsService>("dialogs"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
    this.tasks_service = $derived(this.kernel.service<TasksService>("tasks"));
  }

  async sizes(): Promise<Record<BackupArea, number>> {
    return (await logic()).sizes(await this.files_service.get_root(), localStorage);
  }

  async create(areas: BackupArea[]): Promise<BackupSaved | null> {
    this.begin(BackupActivity.CREATING);
    try {
      const [run, tasks, { backup_name, normalize_areas }] = await Promise.all([logic(), work(), manifest()]);
      const picked = normalize_areas(areas);
      if (picked.length === 0) throw new BackupError("Pick at least one area to back up.");
      const created = new Date();
      const suggested = backup_name(created);
      const target = await run.pick_save_target(suggested);
      if (!target) return null;
      await flush_writers();

      const plan = {
        root: await this.files_service.get_root(),
        areas: picked,
        meta: { version: __VERSION_INFO__.version, created },
        storage: localStorage,
        save: async (blob: Blob) => {
          const name = await run.save_to_device(target, blob, suggested);
          this.last = { name, size: blob.size, areas: picked, at: created };
        },
      };
      const job = this.tasks_service.run("backup", (context) => tasks.backup_task(plan, context), {
        title: `Backing up ${picked.length === 1 ? BACKUP_AREAS.find(({ area }) => area === picked[0])!.label.toLowerCase() : `${picked.length} areas`}`,
        done: () => ({
          title: "Backup saved",
          message: this.last ? `${this.last.name} · ${format_bytes(this.last.size)}` : undefined,
        }),
        failed: (_error, cancelled) => ({ title: cancelled ? "Backup cancelled" : "Couldn't save the backup" }),
      });
      await job.done;
      return job.status === TaskJobStatus.DONE ? this.last : null;
    } finally {
      this.activity = null;
    }
  }

  async restore(): Promise<boolean> {
    this.assert_saved();
    this.begin(BackupActivity.RESTORING);
    try {
      const [run, tasks] = await Promise.all([logic(), work()]);
      const file = await run.pick_backup_file();
      if (!file) return false;
      const opened = await run.open_backup(file);
      if (!(await run.confirm_restore(this.dialogs_service, opened.manifest))) return false;
      this.assert_saved();

      const root = await this.files_service.get_root();
      let swapping = false;
      const plan = {
        root,
        opened,
        storage: localStorage,
        check: () => this.assert_saved(),
        on_swap: () => (swapping = true),
        reload: () => location.reload(),
      };
      const job = this.tasks_service.run("backup", (context) => tasks.restore_task(plan, context), {
        title: "Restoring backup",
        done: () => ({ title: "Backup restored", message: "Reloading…" }),
        failed: (_error, cancelled) => {
          // Once swapping, the swap owns the stage and finishes on its own; clearing it now would race the moves.
          if (swapping) return { title: cancelled ? "Too late to stop" : "Couldn't restore the backup", message: cancelled ? "Replacing, then reloading…" : undefined };
          void run.clear_stage(root).catch((error) => console.error("[BackupService] Couldn't clear the restore stage", error));
          return { title: cancelled ? "Restore cancelled" : "Couldn't restore the backup", message: cancelled ? "Nothing was changed." : undefined };
        },
      });
      await job.done;
      return job.status === TaskJobStatus.DONE;
    } finally {
      this.activity = null;
    }
  }

  // Reloading with unsaved work brings up the browser's "Leave site?"; staying there would keep a page whose writes are held.
  private assert_saved(): void {
    if (this.windows_service.has_dirty())
      throw new BackupError("A window has unsaved changes. Save or close it, then restore.");
  }

  private begin(activity: BackupActivity): void {
    if (this.activity)
      throw new BackupError(
        `A backup is already ${this.activity === BackupActivity.CREATING ? "being saved" : "being restored"}.`
      );
    this.activity = activity;
  }
}
