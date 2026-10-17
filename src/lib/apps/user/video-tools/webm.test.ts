import { describe, expect, it } from "vitest";
import { Ebml, mux_webm, opus_head, opus_pre_skip, vint, vint_length, WebmCodec, type WebmChunk } from "./webm";

interface Node {
  id: number;
  start: number;
  data_start: number;
  end: number;
}

function read_vint(bytes: Uint8Array, at: number, keep_marker: boolean): { value: number; length: number } {
  const first = bytes[at];
  let length = 1;
  while (length <= 8 && !(first & (0x80 >> (length - 1)))) length++;
  let value = keep_marker ? first : first & (0xff >> length);
  for (let i = 1; i < length; i++) value = value * 256 + bytes[at + i];
  return { value, length };
}

function children(bytes: Uint8Array, from: number, to: number): Node[] {
  const out: Node[] = [];
  let at = from;
  while (at < to) {
    const id = read_vint(bytes, at, true);
    const size = read_vint(bytes, at + id.length, false);
    const data_start = at + id.length + size.length;
    out.push({ id: id.value, start: at, data_start, end: data_start + size.value });
    at = data_start + size.value;
  }
  return out;
}

const child = (bytes: Uint8Array, node: Node, id: number) =>
  children(bytes, node.data_start, node.end).find((item) => item.id === id)!;
const all = (bytes: Uint8Array, node: Node, id: number) =>
  children(bytes, node.data_start, node.end).filter((item) => item.id === id);

function uint(bytes: Uint8Array, node: Node): number {
  let value = 0;
  for (let i = node.data_start; i < node.end; i++) value = value * 256 + bytes[i];
  return value;
}

const float = (bytes: Uint8Array, node: Node) => new DataView(bytes.buffer, node.data_start, 8).getFloat64(0);
const text = (bytes: Uint8Array, node: Node) => new TextDecoder().decode(bytes.subarray(node.data_start, node.end));

function chunk(track: "video" | "audio", ms: number, key: boolean, byte = ms % 256): WebmChunk {
  return { track, timestamp: ms * 1000, key, data: new Uint8Array([byte, byte, byte]) };
}

async function parse(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const [header, segment] = children(bytes, 0, bytes.length);
  return { bytes, header, segment, top: children(bytes, segment.data_start, segment.end) };
}

describe("ebml numbers", () => {
  it("sizes vints so the all-ones value stays reserved", () => {
    expect([0, 126, 127, 16382, 16383].map(vint_length)).toEqual([1, 1, 2, 2, 3]);
    expect([...vint(5)]).toEqual([0x85]);
    expect([...vint(127)]).toEqual([0x40, 0x7f]);
    expect([...vint(5, 8)]).toEqual([0x01, 0, 0, 0, 0, 0, 0, 5]);
  });

  it("round-trips the OpusHead pre-skip", () => {
    const head = opus_head(2, 48_000, 312);
    expect(head.length).toBe(19);
    expect(opus_pre_skip(head)).toBe(312);
    expect(opus_pre_skip(new Uint8Array(4))).toBe(0);
  });
});

describe("mux_webm", () => {
  const video = { codec: WebmCodec.VP9, width: 320, height: 240 } as const;
  const audio = {
    codec: WebmCodec.OPUS,
    sample_rate: 48_000,
    channels: 2,
    private: opus_head(2, 48_000, 312),
    pre_skip: 312,
  } as const;

  it("writes the webm header, duration and both tracks", async () => {
    const { bytes, header, segment, top } = await parse(
      mux_webm({ video, audio, duration_ms: 1234.5, chunks: [chunk("video", 0, true), chunk("audio", 0, true)] })
    );
    expect(header.id).toBe(Ebml.HEADER);
    expect(text(bytes, child(bytes, header, Ebml.DOC_TYPE))).toBe("webm");
    expect(segment.id).toBe(Ebml.SEGMENT);
    expect(segment.end).toBe(bytes.length);
    expect(top.map((node) => node.id)).toEqual([Ebml.SEEK_HEAD, Ebml.INFO, Ebml.TRACKS, Ebml.CLUSTER, Ebml.CUES]);

    const info = top[1];
    expect(uint(bytes, child(bytes, info, Ebml.TIMESTAMP_SCALE))).toBe(1_000_000);
    expect(float(bytes, child(bytes, info, Ebml.DURATION))).toBe(1234.5);

    const entries = all(bytes, top[2], Ebml.TRACK_ENTRY);
    expect(entries.map((entry) => text(bytes, child(bytes, entry, Ebml.CODEC_ID)))).toEqual(["V_VP9", "A_OPUS"]);
    const picture = child(bytes, entries[0], Ebml.VIDEO);
    expect(uint(bytes, child(bytes, picture, Ebml.PIXEL_WIDTH))).toBe(320);
    expect(uint(bytes, child(bytes, picture, Ebml.PIXEL_HEIGHT))).toBe(240);
    expect(uint(bytes, child(bytes, entries[1], Ebml.CODEC_DELAY))).toBe(6_500_000);
    const sound = child(bytes, entries[1], Ebml.AUDIO);
    expect(float(bytes, child(bytes, sound, Ebml.SAMPLING_FREQUENCY))).toBe(48_000);
    expect(bytes.subarray(child(bytes, entries[1], Ebml.CODEC_PRIVATE).data_start).slice(0, 8)).toEqual(
      new TextEncoder().encode("OpusHead")
    );
  });

  it("points the seek head at info, tracks and cues", async () => {
    const { bytes, segment, top } = await parse(
      mux_webm({ video, duration_ms: 100, chunks: [chunk("video", 0, true)] })
    );
    const seeks = all(bytes, top[0], Ebml.SEEK);
    const targets = seeks.map((seek) => {
      const position = uint(bytes, child(bytes, seek, Ebml.SEEK_POSITION));
      return read_vint(bytes, segment.data_start + position, true).value;
    });
    expect(targets).toEqual([Ebml.INFO, Ebml.TRACKS, Ebml.CUES]);
  });

  it("starts a cluster at each video keyframe and cues it", async () => {
    const chunks = [
      chunk("video", 0, true),
      chunk("audio", 10, true),
      chunk("video", 33, false),
      chunk("audio", 30, true),
      chunk("video", 2000, true),
      chunk("video", 2033, false),
    ];
    const { bytes, segment, top } = await parse(mux_webm({ video, audio, duration_ms: 2066, chunks }));
    const clusters = top.filter((node) => node.id === Ebml.CLUSTER);
    expect(clusters.map((cluster) => uint(bytes, child(bytes, cluster, Ebml.TIMESTAMP)))).toEqual([0, 2000]);

    const blocks = all(bytes, clusters[0], Ebml.SIMPLE_BLOCK).map((block) => ({
      track: bytes[block.data_start] & 0x7f,
      offset: new DataView(bytes.buffer, block.data_start + 1, 2).getInt16(0),
      key: (bytes[block.data_start + 3] & 0x80) !== 0,
    }));
    expect(blocks).toEqual([
      { track: 1, offset: 0, key: true },
      { track: 2, offset: 10, key: true },
      { track: 2, offset: 30, key: true },
      { track: 1, offset: 33, key: false },
    ]);

    const points = all(bytes, top.at(-1)!, Ebml.CUE_POINT);
    const cues = points.map((point) => {
      const positions = child(bytes, point, Ebml.CUE_TRACK_POSITIONS);
      return {
        time: uint(bytes, child(bytes, point, Ebml.CUE_TIME)),
        track: uint(bytes, child(bytes, positions, Ebml.CUE_TRACK)),
        at: segment.data_start + uint(bytes, child(bytes, positions, Ebml.CUE_CLUSTER_POSITION)),
      };
    });
    expect(cues).toEqual([
      { time: 0, track: 1, at: clusters[0].start },
      { time: 2000, track: 1, at: clusters[1].start },
    ]);
  });

  it("opens a new cluster before block offsets overflow 16 bits", async () => {
    const { bytes, top } = await parse(
      mux_webm({
        video,
        duration_ms: 40_000,
        chunks: [chunk("video", 0, true), chunk("video", 20_000, false), chunk("video", 40_000, false)],
      })
    );
    const clusters = top.filter((node) => node.id === Ebml.CLUSTER);
    expect(clusters.map((cluster) => uint(bytes, child(bytes, cluster, Ebml.TIMESTAMP)))).toEqual([0, 40_000]);
  });

  it("clusters audio alone every few seconds", async () => {
    const chunks = Array.from({ length: 600 }, (_, i) => chunk("audio", i * 20, true));
    const { bytes, top } = await parse(mux_webm({ audio, duration_ms: 12_000, chunks }));
    const clusters = top.filter((node) => node.id === Ebml.CLUSTER);
    expect(clusters.map((cluster) => uint(bytes, child(bytes, cluster, Ebml.TIMESTAMP)))).toEqual([0, 5000, 10_000]);
    expect(all(bytes, top.at(-1)!, Ebml.CUE_POINT)).toHaveLength(3);
  });
});
