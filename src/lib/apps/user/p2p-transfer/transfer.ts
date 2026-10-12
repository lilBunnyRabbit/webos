import type { FilesService } from "$lib/core/api";
import { PATHS } from "$lib/core/api/services/files/hierarchy";
import type { Inbox } from "./peer";
import { parse_message, part_name, resume_offset, type FileEntry, type Message } from "./protocol";

/** Small enough for every browser's SCTP message limit, big enough to keep the per-message overhead low. */
const CHUNK_SIZE = 64 * 1024;
/** `send()` never blocks; past this much queued data the sender waits for the channel to drain. */
const HIGH_WATER = 4 * 1024 * 1024;
const LOW_WATER = 1024 * 1024;
/** Half-received files. /tmp is emptied at boot, so a resume survives a lost connection but not a reload. */
const PARTS_FOLDER = "p2p-transfer";

type MessageOf<T extends Message["type"]> = Extract<Message, { type: T }>;

function send_message(channel: RTCDataChannel, message: Message) {
  channel.send(JSON.stringify(message));
}

async function expect_message<T extends Message["type"]>(inbox: Inbox, type: T): Promise<MessageOf<T>> {
  const data = await inbox.next();
  const message = typeof data === "string" ? parse_message(data) : null;
  if (message?.type !== type) throw new Error(`The other device sent something unexpected (wanted ${type})`);
  return message as MessageOf<T>;
}

function drained(channel: RTCDataChannel): Promise<void> {
  if (channel.bufferedAmount <= HIGH_WATER) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const done = () => {
      channel.removeEventListener("bufferedamountlow", done);
      channel.removeEventListener("close", lost);
      resolve();
    };
    const lost = () => {
      channel.removeEventListener("bufferedamountlow", done);
      reject(new Error("The connection was lost"));
    };
    channel.addEventListener("bufferedamountlow", done);
    channel.addEventListener("close", lost, { once: true });
  });
}

export function describe_file(file: File): FileEntry {
  return { name: file.name, size: file.size, type: file.type };
}

export interface SendEvents {
  /** The receiver's answer to the manifest: bytes it holds per file, `null` for files it already saved. */
  on_resume?(offsets: (number | null)[]): void;
  on_progress(index: number, bytes: number): void;
}

/** Sends `files` from wherever the receiver says it left off. Resolves once the receiver has saved everything. */
export async function send_files(channel: RTCDataChannel, inbox: Inbox, files: File[], events: SendEvents): Promise<void> {
  const { on_progress } = events;
  channel.bufferedAmountLowThreshold = LOW_WATER;
  send_message(channel, { type: "manifest", files: files.map(describe_file) });
  const { offsets } = await expect_message(inbox, "resume");
  if (offsets.length !== files.length) throw new Error("The other device answered for a different set of files");
  events.on_resume?.(offsets);

  for (const [index, file] of files.entries()) {
    const offset = offsets[index];
    if (offset === null || offset > file.size) {
      on_progress(index, file.size);
      if (offset === null) continue;
      throw new Error("The other device holds more of a file than there is");
    }
    on_progress(index, offset);

    send_message(channel, { type: "start", index, offset });
    for (let position = offset; position < file.size; position += CHUNK_SIZE) {
      const chunk = await file.slice(position, position + CHUNK_SIZE).arrayBuffer();
      await drained(channel);
      channel.send(chunk);
      on_progress(index, position + chunk.byteLength);
    }
    send_message(channel, { type: "end", index });
  }

  send_message(channel, { type: "done" });
  await expect_message(inbox, "received");
}

export interface ReceiveEvents {
  on_manifest(entries: FileEntry[]): void;
  /** What this side asked the sender for: bytes held per file, `null` for files already saved. */
  on_resume?(offsets: (number | null)[]): void;
  on_progress(index: number, bytes: number): void;
  /** `path` is where the finished file landed in Downloads, after any rename for a taken name. */
  on_saved(index: number, path: string): void;
}

interface OpenPart {
  index: number;
  handle: FileSystemFileHandle;
  writable: FileSystemWritableFileStream;
  written: number;
}

async function held_bytes(parts: FileSystemDirectoryHandle, name: string): Promise<number> {
  try {
    return (await (await parts.getFileHandle(name)).getFile()).size;
  } catch (reason) {
    if (reason instanceof DOMException && reason.name === "NotFoundError") return 0;
    throw reason;
  }
}

/**
 * Receives one connection's worth of files into `/home/Downloads`, writing each into `/tmp/p2p-transfer` first.
 * `completed` holds the part names saved by earlier connections of the same session, so a resume skips them; a lost
 * connection leaves the current part on disk to continue from.
 */
export async function receive_files(
  files: FilesService,
  channel: RTCDataChannel,
  inbox: Inbox,
  completed: Set<string>,
  events: ReceiveEvents
): Promise<void> {
  const tmp = await files.get_directory(PATHS.tmp);
  const downloads = await files.get_directory(PATHS.downloads);
  if (!tmp || !downloads) throw new Error("The Downloads or /tmp folder is missing");
  const parts = await tmp.getDirectoryHandle(PARTS_FOLDER, { create: true });

  const { files: entries } = await expect_message(inbox, "manifest");
  events.on_manifest(entries);

  const offsets: (number | null)[] = [];
  for (const [index, entry] of entries.entries()) {
    const name = part_name(entry);
    const held = completed.has(name) ? null : resume_offset(entry, await held_bytes(parts, name));
    offsets.push(held);
    events.on_progress(index, held ?? entry.size);
  }
  send_message(channel, { type: "resume", offsets });
  events.on_resume?.(offsets);

  let current: OpenPart | null = null;
  try {
    while (true) {
      const data = await inbox.next();

      if (typeof data !== "string") {
        if (!current) throw new Error("The other device sent data outside a file");
        current.written += data.byteLength;
        if (current.written > entries[current.index].size) throw new Error("The other device sent more than it announced");
        await current.writable.write(data);
        events.on_progress(current.index, current.written);
        continue;
      }

      const message = parse_message(data);
      if (message.type === "start") {
        const entry = entries[message.index];
        if (current || !entry || message.offset !== offsets[message.index]) throw new Error("The transfer got out of step");
        const handle = await parts.getFileHandle(part_name(entry), { create: true });
        const writable = await handle.createWritable({ keepExistingData: true });
        await writable.truncate(message.offset);
        await writable.seek(message.offset);
        current = { index: message.index, handle, writable, written: message.offset };
      } else if (message.type === "end") {
        if (current?.index !== message.index) throw new Error("The transfer got out of step");
        const finished: OpenPart = current;
        current = null;
        await finished.writable.close();
        if (finished.written !== entries[finished.index].size) throw new Error("A file arrived incomplete");
        const entry = entries[finished.index];
        const saved = await files.move_file(parts, finished.handle, downloads, entry.name);
        completed.add(part_name(entry));
        events.on_saved(finished.index, `${PATHS.downloads}/${saved.name}`);
      } else if (message.type === "done") {
        send_message(channel, { type: "received" });
        return;
      } else {
        throw new Error(`The other device sent something unexpected (${message.type})`);
      }
    }
  } finally {
    // Closing commits what was written, which is what the next connection resumes from.
    await current?.writable.close().catch(() => {});
  }
}
