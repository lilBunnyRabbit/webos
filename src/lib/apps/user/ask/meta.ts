import type { AppMeta } from "$lib/core/api";

export default {
  description: "Ask questions about a text file, answered by AI that runs on this device.",
  keywords: ["ai", "chat", "question", "gemini", "nano", "summarize", "explain", "assistant", "llm", "offline"],
  pitch: {
    problem: "Finding one answer in a long document takes a lot of reading.",
    solution: "Ask questions about a text file, answered by AI that runs on your own device.",
  },
} satisfies AppMeta;
