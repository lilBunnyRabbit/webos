import { z } from "zod";
import { define_app } from "$lib/core/api";
import { AppCategory } from "$lib/core/api/services/apps/type";
import { define_command } from "$lib/core/api/services/shell/define";
import { format_bytes, format_datetime } from "$lib/core/utils";
import { Record as RecordIcon } from "phosphor-svelte";
import { RECORDER_PROPS, SOURCES } from "./props";

const logic = () => import("./shell");

export default define_app({
  id: "recorder",
  name: "Recorder",
  icon: RecordIcon,
  version: "1.0.0",
  category: AppCategory.MEDIA,
  description: "Record your voice, your screen or your camera, and take photos.",
  keywords: ["voice", "microphone", "audio", "screen", "screencast", "camera", "video", "photo", "webcam"],
  props: RECORDER_PROPS,
  defaults: {
    constraints: {
      width: { min: 340 },
      height: { min: 380 },
    },
  },
  shell: {
    values: {
      recording: {
        columns: ["name", "kind", "size", "date"],
        text: (value) => `${value.name}  ${value.kind}`,
        cell: (value, column) =>
          column === "size" ? format_bytes(Number(value.size)) : column === "date" ? format_datetime(Number(value.date)) : String(value[column] ?? ""),
        open: (value) => void logic().then((m) => m.open_recording(String(value.path))),
      },
    },
    commands: [
      define_command({
        id: "rec list",
        description: "Recordings, newest first",
        yields: "recording",
        async *run() {
          yield* (await logic()).list();
        },
      }),
      define_command({
        id: "rec start",
        description: "Open Recorder ready to record from a source",
        args: z.object({ source: z.enum(SOURCES).default("mic") }),
        short: { source: "s" },
        run: async (context) => (await logic()).start(context),
      }),
    ],
  },
  component: () => import("./recorder.app.svelte"),
});
