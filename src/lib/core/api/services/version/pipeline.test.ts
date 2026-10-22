import { describe, expect, test } from "vitest";
import { format_took, is_this_build, parse_pipeline, pipeline_state, PipelineState } from "./pipeline";

describe("pipeline_state", () => {
  test("maps status and conclusion", () => {
    expect(pipeline_state("queued", null)).toBe(PipelineState.QUEUED);
    expect(pipeline_state("waiting", null)).toBe(PipelineState.QUEUED);
    expect(pipeline_state("in_progress", null)).toBe(PipelineState.RUNNING);
    expect(pipeline_state("completed", "success")).toBe(PipelineState.SUCCESS);
    expect(pipeline_state("completed", "cancelled")).toBe(PipelineState.CANCELLED);
    expect(pipeline_state("completed", "skipped")).toBe(PipelineState.SKIPPED);
    expect(pipeline_state("completed", "timed_out")).toBe(PipelineState.FAILURE);
  });
});

test("parse_pipeline keeps the run and each job", () => {
  const pipeline = parse_pipeline(
    { id: 1, status: "in_progress", conclusion: null, head_sha: "7b657deead", display_title: "feat: x", created_at: "2026-10-22T10:54:33Z", html_url: "https://run" },
    [
      { name: "fork", status: "completed", conclusion: "success", started_at: "2026-10-22T10:54:40Z", completed_at: "2026-10-22T10:58:52Z", html_url: "https://job/1" },
      { name: "deploy", status: "queued", conclusion: null, started_at: null, completed_at: null, html_url: "https://job/2" },
    ]
  );
  expect(pipeline.state).toBe(PipelineState.RUNNING);
  expect(pipeline.created).toBe(Date.parse("2026-10-22T10:54:33Z"));
  expect(pipeline.jobs.map((job) => [job.name, job.state, job.started && job.completed && job.completed - job.started])).toEqual([
    ["fork", PipelineState.SUCCESS, 252_000],
    ["deploy", PipelineState.QUEUED, null],
  ]);
  expect(is_this_build(pipeline, "7b657de")).toBe(true);
  expect(is_this_build(pipeline, "fda50a7")).toBe(false);
  expect(is_this_build(pipeline, "unknown")).toBe(false);
});

test("format_took", () => {
  expect(format_took(38_400)).toBe("38s");
  expect(format_took(252_000)).toBe("4m 12s");
  expect(format_took(3_780_000)).toBe("1h 3m");
});
