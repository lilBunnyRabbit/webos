/** The repository whose Actions runs `pipeline()` reads. The API is public and answers CORS without a token. */
export const PIPELINE_REPO = "lilBunnyRabbit/webos";
const API = `https://api.github.com/repos/${PIPELINE_REPO}/actions`;

export const PipelineState = {
  QUEUED: "queued",
  RUNNING: "running",
  SUCCESS: "success",
  FAILURE: "failure",
  CANCELLED: "cancelled",
  SKIPPED: "skipped",
} as const;
export type PipelineState = (typeof PipelineState)[keyof typeof PipelineState];

export interface PipelineJob {
  name: string;
  state: PipelineState;
  /** ms epoch; `null` until it starts. */
  started: number | null;
  /** ms epoch; `null` until it ends. */
  completed: number | null;
  url: string;
}

/** The newest CI run on master and its jobs. */
export interface Pipeline {
  state: PipelineState;
  sha: string;
  title: string;
  /** ms epoch */
  created: number;
  url: string;
  jobs: PipelineJob[];
}

interface ApiRun {
  id: number;
  status: string;
  conclusion: string | null;
  head_sha: string;
  display_title: string;
  created_at: string;
  html_url: string;
}

interface ApiJob {
  name: string;
  status: string;
  conclusion: string | null;
  started_at: string | null;
  completed_at: string | null;
  html_url: string;
}

export function pipeline_state(status: string, conclusion: string | null): PipelineState {
  if (status !== "completed") return status === "in_progress" ? PipelineState.RUNNING : PipelineState.QUEUED;
  if (conclusion === "success") return PipelineState.SUCCESS;
  if (conclusion === "cancelled") return PipelineState.CANCELLED;
  if (conclusion === "skipped" || conclusion === "neutral") return PipelineState.SKIPPED;
  return PipelineState.FAILURE;
}

export function is_settled(state: PipelineState): boolean {
  return state !== PipelineState.QUEUED && state !== PipelineState.RUNNING;
}

const time = (value: string | null) => (value ? Date.parse(value) : null);

export function parse_pipeline(run: ApiRun, jobs: ApiJob[]): Pipeline {
  return {
    state: pipeline_state(run.status, run.conclusion),
    sha: run.head_sha,
    title: run.display_title,
    created: Date.parse(run.created_at),
    url: run.html_url,
    jobs: jobs.map((job) => ({
      name: job.name,
      state: pipeline_state(job.status, job.conclusion),
      started: time(job.started_at),
      completed: time(job.completed_at),
      url: job.html_url,
    })),
  };
}

/** Unauthenticated calls share 60 an hour per IP; GitHub answers 403 or 429 with the reset time once they run out. */
async function get<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, headers: { Accept: "application/vnd.github+json" } });
  if (response.ok) return response.json() as Promise<T>;
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if ((response.status === 403 || response.status === 429) && response.headers.get("x-ratelimit-remaining") === "0" && reset) {
    const at = new Date(reset * 1000).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    throw new Error(`GitHub's hourly limit is used up until ${at}`);
  }
  throw new Error(`GitHub answered ${response.status}`);
}

export async function fetch_pipeline(signal?: AbortSignal): Promise<Pipeline | null> {
  const { workflow_runs } = await get<{ workflow_runs: ApiRun[] }>(`${API}/runs?branch=master&per_page=1`, signal);
  const run = workflow_runs[0];
  if (!run) return null;
  const { jobs } = await get<{ jobs: ApiJob[] }>(`${API}/runs/${run.id}/jobs`, signal);
  return parse_pipeline(run, jobs);
}

/** `38s`, `4m 12s`, `1h 3m`. */
export function format_took(ms: number): string {
  const seconds = Math.max(0, Math.round(ms / 1000));
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ${seconds % 60}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

/** Whether the run is the commit this build came from: `commit` is the short hash baked in at build time. */
export function is_this_build(pipeline: Pipeline, commit: string): boolean {
  return commit.length >= 7 && pipeline.sha.startsWith(commit);
}
