import { z } from "zod";

/** OPFS rejects path separators and the dot names; a peer's file name is untrusted input. */
export function safe_name(name: string): string {
  const cleaned = name.replace(/[\\/\u0000-\u001f]/g, "_").trim();
  return cleaned === "" || cleaned === "." || cleaned === ".." ? "file" : cleaned;
}

export const FileEntry = z.object({
  name: z.string().transform(safe_name),
  size: z.number().int().nonnegative(),
  type: z.string(),
});
export type FileEntry = z.infer<typeof FileEntry>;

const index = z.number().int().nonnegative();

/**
 * Bumped when the two sides would misread each other. 2: the receiver confirms written bytes with `ack`. A manifest
 * without it comes from a version 1 sender, which can't read `ack`.
 */
export const PROTOCOL_VERSION = 2;

/** Control messages, sent as JSON strings. File bytes travel as binary messages between `start` and `end`. */
export const Message = z.discriminatedUnion("type", [
  /** Sender → receiver, first thing after the channel opens. */
  z.object({ type: z.literal("manifest"), protocol: z.number().int().optional(), files: z.array(FileEntry) }),
  /** Receiver → sender: bytes it already holds per file, `null` for a file it has already saved. */
  z.object({ type: z.literal("resume"), offsets: z.array(z.number().int().nonnegative().nullable()) }),
  z.object({ type: z.literal("start"), index, offset: z.number().int().nonnegative() }),
  z.object({ type: z.literal("end"), index }),
  /** Receiver → sender: bytes of file `index` written so far. The sender's progress shows these, not what it queued. */
  z.object({ type: z.literal("ack"), index, bytes: z.number().int().nonnegative() }),
  /** Sender → receiver: every file was sent. */
  z.object({ type: z.literal("done") }),
  /** Receiver → sender: every file is saved, the sender may close. Closing earlier drops what's still buffered. */
  z.object({ type: z.literal("received") }),
]);
export type Message = z.infer<typeof Message>;

export function parse_message(text: string): Message {
  return Message.parse(JSON.parse(text));
}

/** Keyed by size too, so a different file with the same name never resumes onto the wrong bytes. */
export function part_name(entry: FileEntry): string {
  return `${entry.size}-${entry.name}.part`;
}

/** Where to continue: the bytes already held, unless they can't belong to this file. */
export function resume_offset(entry: FileEntry, held: number): number {
  return held <= entry.size ? held : 0;
}
