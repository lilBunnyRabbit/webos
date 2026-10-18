import type { AppMeta } from "$lib/core/api";

export default {
  description: "Opens CSV and TSV files as a table.",
  keywords: ["csv", "tsv", "table", "spreadsheet", "data", "excel", "columns"],
  pitch: { problem: "A CSV file reads like a wall of commas in a text editor.", solution: "Open it as a clean table, TSV files too." },
} satisfies AppMeta;
