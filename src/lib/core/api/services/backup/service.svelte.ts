import type { DialogsService, FilesService, Kernel, NotificationsService, WindowsService } from "$lib/core/api";
import { format_bytes } from "$lib/core/utils";
import { backup_shell } from "./shell";
import {
  BackupActivity,
  BackupError,
  type BackupArea,
  type BackupSaved,
  type BackupService as IBackupService,
} from "./type";

declare const __VERSION_INFO__: { version: string };

const logic = () => import("./backup");
const manifest = () => import("./manifest");

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

  constructor(private kernel: Kernel) {
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.dialogs_service = $derived(this.kernel.service<DialogsService>("dialogs"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
  }

  async sizes(): Promise<Record<BackupArea, number>> {
    return (await logic()).sizes(await this.files_service.get_root(), localStorage);
  }

  async create(areas: BackupArea[]): Promise<BackupSaved | null> {
    this.begin(BackupActivity.CREATING);
    try {
      const [run, { backup_name, normalize_areas }] = await Promise.all([logic(), manifest()]);
      const picked = normalize_areas(areas);
      if (picked.length === 0) throw new BackupError("Pick at least one area to back up.");
      const created = new Date();
      const suggested = backup_name(created);
      const target = await run.pick_save_target(suggested);
      if (!target) return null;

      const blob = await run.build_backup(
        await this.files_service.get_root(),
        picked,
        { version: __VERSION_INFO__.version, created },
        localStorage
      );
      const name = await run.save_to_device(target, blob, suggested);
      this.last = { name, size: blob.size, areas: picked, at: created };
      this.notifications_service.notify("backup", {
        title: "Backup saved",
        message: `${name} · ${format_bytes(blob.size)}`,
      });
      return this.last;
    } finally {
      this.activity = null;
    }
  }

  async restore(): Promise<boolean> {
    this.assert_saved();
    this.begin(BackupActivity.RESTORING);
    try {
      const run = await logic();
      const file = await run.pick_backup_file();
      if (!file) return false;
      const opened = await run.open_backup(file);
      if (!(await run.confirm_restore(this.dialogs_service, opened.manifest))) return false;
      this.assert_saved();

      await run.restore_backup(await this.files_service.get_root(), opened, localStorage);
      location.reload();
      return true;
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
