export const TOPIC_IDS = [
  "launcher",
  "palette",
  "terminal",
  "ask",
  "shortcuts",
  "snap",
  "widgets",
  "files",
  "apps",
  "tasks",
  "links",
  "backup",
  "home",
  "switcher",
] as const;
export type TopicId = (typeof TOPIC_IDS)[number];
