import { analyze_solution, type Ink } from "./puzzle";

export interface AnalysisRequest {
  width: number;
  height: number;
  palette: readonly Ink[];
  cells: readonly number[];
  budget: number;
  time_ms: number;
}

self.onmessage = ({ data }: MessageEvent<AnalysisRequest>) => {
  const { width, height, palette, cells, budget, time_ms } = data;
  self.postMessage(analyze_solution(width, height, palette, cells, budget, Date.now() + time_ms));
};
