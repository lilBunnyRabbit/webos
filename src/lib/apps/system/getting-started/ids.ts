export const TOPIC_IDS = [
  "launcher",
  "palette",
  "terminal",
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
