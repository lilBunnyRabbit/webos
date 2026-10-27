import type { IService } from "../../type";
import type { AppId, AppProps } from "../apps/type";
import type { SpawnOptions, WorkerApi, WorkerHandle } from "$lib/core/utils/worker";

/** A browser tab, random per page load. */
export type TabId = string;

export interface BackgroundWorker {
  id: number;
  name: string;
  since: number;
}

export interface BackgroundJob {
  app_id: AppId;
  /** The job's own status line, from `ctx.status()`. Empty until it sets one. */
  status: string;
  since: number;
  tab: TabId;
  /** This tab runs it: only then is `view` set and can its windows show it live. */
  here: boolean;
  /** Run by a solo tab (ADR-047). */
  solo: boolean;
  /** Workers the job started with `ctx.spawn`, still alive. */
  workers: BackgroundWorker[];
  /** What the job shared with its windows (`ctx.share`); `null` in other tabs and until it shares. */
  view: unknown;
}

export interface BackgroundSpawnOptions<Event> extends SpawnOptions<Event> {
  /** Shown under the job in Activity Monitor. Defaults to "worker". */
  name?: string;
}

/** What a background job gets. Services come through `kernel.service`, as everywhere. */
export interface BackgroundContext<Props extends AppProps = AppProps> {
  app_id: AppId;
  props: Partial<Props>;
  /** Aborted by Stop (Arm off, `bg stop`, Activity Monitor). The job resolves once it has let go of everything. */
  signal: AbortSignal;
  /** The one-line status every tab shows: "Watching", "Recording". */
  status(text: string): void;
  /** Hands the job's windows in this tab a live object (reactive state, a `MediaStream`). The last one shared wins. */
  share(view: unknown): void;
  /**
   * Offer Resume after a reload with these props (the job's own when omitted); `null` takes the offer back. Cleared when
   * the job ends or is stopped; only a page that closed while it ran keeps it.
   */
  resumable(props?: AppProps | null): Promise<void>;
  /** The kit worker helper's `spawn`, ended when the job returns (not on abort, so it can finish a write after Stop) and listed under the job in Activity Monitor. */
  spawn<Api extends WorkerApi<Api>, Event = never>(
    WorkerCtor: new () => Worker,
    options?: BackgroundSpawnOptions<Event>
  ): WorkerHandle<Api>;
}

/** The default export of an app's `background` module: runs with no window until `signal` aborts or it returns. */
export type BackgroundRun<Props extends AppProps = AppProps> = (context: BackgroundContext<Props>) => Promise<void>;

/**
 * Code an app runs with no window (ADR-081): one job per app per browser, held by a Web Lock, its status shared with
 * every tab. The app's windows are views onto it.
 */
export interface BackgroundService extends IService {
  readonly tab: TabId;
  /** Every job this browser runs, this tab's first. Reactive. */
  list(): BackgroundJob[];
  get(app_id: AppId): BackgroundJob | undefined;
  /**
   * Runs the app's `background` module in this tab. `true` when this tab runs it (started now or already), `false` when
   * another tab does: the lock is never stolen. Rejects when the app has no background module or the props fail its schema.
   */
  start(app_id: AppId, props?: AppProps): Promise<boolean>;
  /** Stops the job wherever it runs; resolves once this tab's has finished. `false` when nothing ran. */
  stop(app_id: AppId): Promise<boolean>;
}
