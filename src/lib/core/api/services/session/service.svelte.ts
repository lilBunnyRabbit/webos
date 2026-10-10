import type {
  AppsService,
  DialogsService,
  FilesService,
  Kernel,
  NotificationsService,
  WindowSnapshot,
  WindowsService,
} from "$lib/core/api";
import RestoreSessionDialog from "$lib/core/components/dialogs/restore-session-dialog.svelte";
import { LatestWriter } from "../files/latest-writer";
import { SESSION_FLAGS, SESSION_PATH, parse_session, serialize_session } from "./persistence";
import { SessionStatus, type SessionService as ISessionService } from "./type";

export class SessionService implements ISessionService {
  name = "SessionService";
  description = "Saves open windows and offers to restore them at boot";
  inspector = () => import("./inspector.svelte");

  to_string(): string {
    return `SessionService: ${this.status}, ${this.saved_count} saved windows`;
  }

  public status = $state<SessionStatus>(SessionStatus.NONE);
  public saved_count = $state(0);
  public last_saved = $state<Date | null>(null);

  private windows_service!: WindowsService;
  private apps_service!: AppsService;
  private files_service!: FilesService;
  private dialogs_service!: DialogsService;
  private notifications_service!: NotificationsService;

  private writer = new LatestWriter(() => this.files_service, SESSION_PATH, "session");
  private dispose_saving?: () => void;
  private destroyed = false;

  constructor(private kernel: Kernel) {
    this.windows_service = $derived(this.kernel.service<WindowsService>("windows"));
    this.apps_service = $derived(this.kernel.service<AppsService>("apps"));
    this.files_service = $derived(this.kernel.service<FilesService>("files"));
    this.dialogs_service = $derived(this.kernel.service<DialogsService>("dialogs"));
    this.notifications_service = $derived(this.kernel.service<NotificationsService>("notifications"));
  }

  async init(): Promise<void> {
    const file = await this.files_service.get_file(SESSION_PATH);
    const saved = file ? parse_session(await file.text()) : [];
    this.saved_count = saved.length;

    if (saved.length === 0) {
      this.start_saving();
      return;
    }

    // Not awaited: the kernel awaits init() before mounting, and the dialog only renders once the shell is mounted.
    this.status = SessionStatus.PENDING;
    this.offer_restore(saved).catch((error) => {
      console.error("[SessionService] Restore failed:", error);
      this.start_saving();
    });
  }

  destroy(): void {
    this.destroyed = true;
    this.dispose_saving?.();
  }

  private async offer_restore(saved: WindowSnapshot[]): Promise<void> {
    const apps = saved.map((snapshot) => this.apps_service.get(snapshot.app_id) ?? null);
    // Dismissing the dialog (Esc, outside click) counts as "Start fresh".
    const restore = await this.dialogs_service.show(RestoreSessionDialog, { apps });
    if (this.destroyed) return;

    if (restore) {
      const result = this.windows_service.restore(saved, (app_id, props) => this.apps_service.create_instance(app_id, props));
      this.status = SessionStatus.RESTORED;

      if (result.skipped.length > 0) {
        console.warn("[SessionService] Windows that couldn't be restored:", result.skipped);
        const count = result.skipped.length;
        this.notifications_service.notify("session", {
          type: "warning",
          title: `${count} ${count === 1 ? "window" : "windows"} couldn't be restored`,
          message: "The app is gone or its saved data is no longer valid.",
        });
      }
    } else {
      this.status = SessionStatus.DECLINED;
    }

    this.start_saving();
  }

  /** Starts only after the restore decision, so the empty boot desktop can't overwrite the saved session first. */
  private start_saving(): void {
    if (this.dispose_saving || this.destroyed) return;

    this.dispose_saving = $effect.root(() => {
      $effect(() => {
        const windows = this.snapshot();
        this.saved_count = windows.length;
        this.writer.write(serialize_session(windows));
        this.last_saved = new Date();
      });
    });
  }

  private snapshot(): WindowSnapshot[] {
    return this.windows_service
      .sorted_list(([, a], [, b]) => a.order - b.order)
      .filter(([, instance]) => instance.app.manifest.restore !== false)
      .map(([, instance]) => ({
        app_id: instance.app.id,
        props: $state.snapshot(instance.app.props),
        bounds: { ...instance.bounds },
        flags: [...instance.flags].filter((flag) => SESSION_FLAGS.includes(flag)),
        snap_zone: instance.snap_zone,
      }));
  }
}
