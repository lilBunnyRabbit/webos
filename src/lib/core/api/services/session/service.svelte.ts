import { untrack } from "svelte";
import type {
  AppsService,
  DialogsService,
  FilesService,
  Kernel,
  NotificationsService,
  WindowId,
  WindowSnapshot,
  WindowsService,
} from "$lib/core/api";
import { WindowFlag } from "../windows/type";
import RestoreSessionDialog from "$lib/core/components/dialogs/restore-session-dialog.svelte";
import { LatestWriter } from "../files/latest-writer";
import { SESSION_FLAGS, SESSION_PATH, parse_session, remove_legacy_view_keys, serialize_session } from "./persistence";
import { SessionStatus, type SessionService as ISessionService } from "./type";
import { session_shell } from "./shell";

const MAX_CLOSED = 10;

export class SessionService implements ISessionService {
  name = "SessionService";
  description = "Saves open windows and offers to restore them at boot";
  inspector = () => import("./inspector.svelte");
  shell = () => session_shell(this);

  to_string(): string {
    return `SessionService: ${this.status}, ${this.saved_count} saved windows`;
  }

  public status = $state<SessionStatus>(SessionStatus.NONE);
  public saved_count = $state(0);
  public last_saved = $state<Date | null>(null);
  public closed = $state.raw<WindowSnapshot[]>([]);

  /** The previous save's windows by id: one missing from the next save was closed. */
  private previous = new Map<WindowId, WindowSnapshot>();

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
    remove_legacy_view_keys();
    const file = await this.files_service.get_file(SESSION_PATH);
    const { windows: saved, frames } = file ? parse_session(await file.text()) : { windows: [], frames: {} };
    this.saved_count = saved.length;
    // Frames apply whatever the restore answer: Start fresh drops windows, not where apps like to open.
    this.windows_service.load_frames(frames);

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
    const restore = await this.dialogs_service.show(RestoreSessionDialog, { apps }, { dismissible: false });
    if (this.destroyed) return;

    if (restore) {
      const result = this.windows_service.restore(saved, ({ app_id, props, state }) => this.apps_service.create_instance(app_id, props, state));
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
        const entries = this.snapshot();
        const windows = entries.map(([, snapshot]) => snapshot);
        this.saved_count = windows.length;
        this.writer.write(serialize_session({ windows, frames: this.windows_service.frames }));
        this.last_saved = new Date();
        untrack(() => this.track_closed(entries));
      });
    });
  }

  /** Pushes windows that were in the previous save and aren't now. Oldest-first input, so the topmost ends newest. */
  private track_closed(entries: [WindowId, WindowSnapshot][]): void {
    const current = new Map(entries);
    const gone = [...this.previous].filter(([id]) => !current.has(id)).map(([, snapshot]) => snapshot);
    this.previous = current;
    if (gone.length > 0) this.closed = [...gone.reverse(), ...this.closed].slice(0, MAX_CLOSED);
  }

  public reopen_closed(): WindowId | null {
    const [snapshot, ...rest] = this.closed;
    if (!snapshot) return null;
    this.closed = rest;

    const flags = snapshot.flags.filter((flag) => flag !== WindowFlag.MINIMIZED);
    const { restored } = this.windows_service.restore([{ ...snapshot, flags }], ({ app_id, props, state }) =>
      this.apps_service.create_instance(app_id, props, state)
    );
    const id = restored[0] ?? null;
    // Mobile's restore goes home; a reopened window is meant to be on screen.
    if (id) this.windows_service.focus(id);
    return id;
  }

  private snapshot(): [WindowId, WindowSnapshot][] {
    return this.windows_service
      .sorted_list(([, a], [, b]) => a.order - b.order)
      .filter(([, instance]) => instance.app.manifest.restore !== false)
      .map(([id, instance]) => [
        id,
        {
        app_id: instance.app.id,
        props: $state.snapshot(instance.app.props),
        bounds: { ...instance.bounds },
        flags: [...instance.flags].filter((flag) => SESSION_FLAGS.includes(flag)),
        snap_zone: instance.snap_zone,
        ...(Object.keys(instance.app.state).length > 0 && { state: $state.snapshot(instance.app.state) }),
        },
      ]);
  }
}
