import * as opfs from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { accept_answer, accept_offer, channel_open, create_offer, create_peer, Inbox } from "./peer";
import { receive_files, send_files } from "./transfer";

let files: FilesService;
const peers: RTCPeerConnection[] = [];

beforeEach(async () => {
  await opfs.clear_opfs();
  files = new FilesService();
  await files.init();
});

afterEach(() => {
  peers.splice(0).forEach((pc) => pc.close());
});

/** Two peers connected the way the app does it: offer code → answer code, nothing else shared. */
async function connect() {
  const sender = create_peer();
  const receiver = create_peer();
  peers.push(sender, receiver);
  const { code, channel } = await create_offer(sender);
  const answer = await accept_offer(receiver, code);
  await accept_answer(sender, answer);
  const [send_channel, receive_channel] = await Promise.all([channel_open(sender, channel), channel_open(receiver)]);
  return {
    sender: { pc: sender, channel: send_channel, inbox: new Inbox(send_channel, sender) },
    receiver: { pc: receiver, channel: receive_channel, inbox: new Inbox(receive_channel, receiver) },
  };
}

function random_file(name: string, size: number): File {
  const bytes = new Uint8Array(size);
  for (let offset = 0; offset < size; offset += 65536) crypto.getRandomValues(bytes.subarray(offset, offset + 65536));
  return new File([bytes], name, { type: "application/octet-stream" });
}

async function bytes_of(path: string): Promise<Uint8Array> {
  const file = await files.get_file(path);
  expect(file, path).not.toBeNull();
  return new Uint8Array(await file!.arrayBuffer());
}

function events(saved: string[], progress: number[] = []) {
  return {
    on_manifest: () => {},
    on_progress: (index: number, bytes: number) => (progress[index] = bytes),
    on_saved: (index: number, path: string) => (saved[index] = path),
  };
}

describe("send_files / receive_files", () => {
  test("delivers every file byte for byte into Downloads, keeping both on a name clash", async () => {
    const downloads = await files.get_directory("/home/Downloads");
    await files.create_file(downloads, "photo.bin", { content: "already here" });
    const sent = [random_file("photo.bin", 300_000), new File([], "empty.txt"), random_file("a/b.bin", 10)];

    const { sender, receiver } = await connect();
    const saved: string[] = [];
    await Promise.all([
      send_files(sender.channel, sender.inbox, sent, () => {}),
      receive_files(files, receiver.channel, receiver.inbox, new Set(), events(saved)),
    ]);

    expect(saved).toEqual(["/home/Downloads/photo (1).bin", "/home/Downloads/empty.txt", "/home/Downloads/a_b.bin"]);
    for (const [index, file] of sent.entries()) {
      expect(await bytes_of(saved[index])).toEqual(new Uint8Array(await file.arrayBuffer()));
    }
    expect(new TextDecoder().decode(await bytes_of("/home/Downloads/photo.bin"))).toBe("already here");
  });

  test("resumes after a lost connection without resending what arrived", async () => {
    const sent = [random_file("small.bin", 1000), random_file("big.bin", 2_000_000)];
    const completed = new Set<string>();
    const saved: string[] = [];

    const first = await connect();
    const progress: number[] = [];
    const sending = send_files(first.sender.channel, first.sender.inbox, sent, () => {}).catch(() => {});
    const receiving = receive_files(files, first.receiver.channel, first.receiver.inbox, completed, {
      ...events(saved, progress),
      on_progress: (index, bytes) => {
        progress[index] = bytes;
        if (index === 1 && bytes > 500_000) first.sender.pc.close();
      },
    });
    await expect(receiving).rejects.toThrow("The connection was lost");
    await sending;
    expect(saved[0]).toBe("/home/Downloads/small.bin");
    expect(progress[1]).toBeGreaterThan(0);
    expect(progress[1]).toBeLessThan(2_000_000);

    const second = await connect();
    let resent_from = -1;
    const counted: number[] = [];
    await Promise.all([
      send_files(second.sender.channel, second.sender.inbox, sent, (index, bytes) => {
        if (counted[index] === undefined) counted[index] = bytes;
        if (index === 1 && resent_from < 0) resent_from = bytes;
      }),
      receive_files(files, second.receiver.channel, second.receiver.inbox, completed, events(saved)),
    ]);

    expect(counted[0]).toBe(1000);
    expect(resent_from).toBeGreaterThan(0);
    expect(await bytes_of(saved[1])).toEqual(new Uint8Array(await sent[1].arrayBuffer()));
    expect(await files.get_directory("/home/Downloads")).not.toBeNull();
    expect((await files.list(await files.get_directory("/home/Downloads"))).map((item) => item.name).sort()).toEqual([
      "big.bin",
      "small.bin",
    ]);
  });
});
