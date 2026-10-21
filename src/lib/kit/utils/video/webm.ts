type Bytes = Uint8Array<ArrayBuffer>;

export const Ebml = {
  HEADER: 0x1a45dfa3,
  VERSION: 0x4286,
  READ_VERSION: 0x42f7,
  MAX_ID_LENGTH: 0x42f2,
  MAX_SIZE_LENGTH: 0x42f3,
  DOC_TYPE: 0x4282,
  DOC_TYPE_VERSION: 0x4287,
  DOC_TYPE_READ_VERSION: 0x4285,
  SEGMENT: 0x18538067,
  SEEK_HEAD: 0x114d9b74,
  SEEK: 0x4dbb,
  SEEK_ID: 0x53ab,
  SEEK_POSITION: 0x53ac,
  INFO: 0x1549a966,
  TIMESTAMP_SCALE: 0x2ad7b1,
  DURATION: 0x4489,
  MUXING_APP: 0x4d80,
  WRITING_APP: 0x5741,
  TRACKS: 0x1654ae6b,
  TRACK_ENTRY: 0xae,
  TRACK_NUMBER: 0xd7,
  TRACK_UID: 0x73c5,
  TRACK_TYPE: 0x83,
  FLAG_LACING: 0x9c,
  CODEC_ID: 0x86,
  CODEC_PRIVATE: 0x63a2,
  CODEC_DELAY: 0x56aa,
  SEEK_PRE_ROLL: 0x56bb,
  VIDEO: 0xe0,
  PIXEL_WIDTH: 0xb0,
  PIXEL_HEIGHT: 0xba,
  AUDIO: 0xe1,
  SAMPLING_FREQUENCY: 0xb5,
  CHANNELS: 0x9f,
  CLUSTER: 0x1f43b675,
  TIMESTAMP: 0xe7,
  SIMPLE_BLOCK: 0xa3,
  CUES: 0x1c53bb6b,
  CUE_POINT: 0xbb,
  CUE_TIME: 0xb3,
  CUE_TRACK_POSITIONS: 0xb7,
  CUE_TRACK: 0xf7,
  CUE_CLUSTER_POSITION: 0xf1,
} as const;

const APP = "WebOS";
const TIMESTAMP_SCALE = 1_000_000;
const MAX_BLOCK_OFFSET = 32_767;
const AUDIO_ONLY_CLUSTER_MS = 5_000;
const OPUS_SEEK_PRE_ROLL = 80_000_000;

function concat(parts: readonly Uint8Array[]): Bytes {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function id_bytes(id: number): Bytes {
  const bytes: number[] = [];
  for (let value = id; value > 0; value = Math.floor(value / 256)) bytes.unshift(value % 256);
  return new Uint8Array(bytes);
}

/** EBML variable-size integer. All value bits set is reserved for "unknown", hence the `- 1`. */
export function vint(value: number, length = vint_length(value)): Bytes {
  const out = new Uint8Array(length);
  let rest = value;
  for (let i = length - 1; i >= 0; i--) {
    out[i] = rest % 256;
    rest = Math.floor(rest / 256);
  }
  out[0] |= 1 << (8 - length);
  return out;
}

export function vint_length(value: number): number {
  let length = 1;
  while (value >= 2 ** (7 * length) - 1) length++;
  if (length > 8) throw new Error(`EBML size too large: ${value}`);
  return length;
}

function uint_bytes(value: number, length?: number): Bytes {
  const bytes: number[] = [];
  for (let rest = value; rest > 0; rest = Math.floor(rest / 256)) bytes.unshift(rest % 256);
  while (bytes.length < (length ?? 1)) bytes.unshift(0);
  return new Uint8Array(bytes);
}

export function element(id: number, ...children: Uint8Array[]): Bytes {
  const body = concat(children);
  return concat([id_bytes(id), vint(body.length), body]);
}

const uint = (id: number, value: number, length?: number) => element(id, uint_bytes(value, length));

function float(id: number, value: number): Bytes {
  const bytes = new Uint8Array(8);
  new DataView(bytes.buffer).setFloat64(0, value);
  return element(id, bytes);
}

const text = (id: number, value: string) => element(id, new TextEncoder().encode(value));

export const WebmCodec = { VP8: "V_VP8", VP9: "V_VP9", OPUS: "A_OPUS" } as const;
export type WebmCodec = (typeof WebmCodec)[keyof typeof WebmCodec];

export interface WebmVideoTrack {
  codec: typeof WebmCodec.VP8 | typeof WebmCodec.VP9;
  width: number;
  height: number;
}

export interface WebmAudioTrack {
  codec: typeof WebmCodec.OPUS;
  sample_rate: number;
  channels: number;
  private: Uint8Array;
  pre_skip: number;
}

export const TrackKind = { VIDEO: "video", AUDIO: "audio" } as const;
export type TrackKind = (typeof TrackKind)[keyof typeof TrackKind];

export interface WebmChunk {
  track: TrackKind;
  /** Microseconds from the start of the file. */
  timestamp: number;
  key: boolean;
  data: Uint8Array;
}

export interface WebmInput {
  video?: WebmVideoTrack;
  audio?: WebmAudioTrack;
  duration_ms: number;
  chunks: readonly WebmChunk[];
}

function track_entries({ video, audio }: WebmInput): { tracks: Bytes; numbers: Record<TrackKind, number> } {
  const entries: Bytes[] = [];
  const numbers = { video: 0, audio: 0 };
  if (video) {
    numbers.video = entries.length + 1;
    entries.push(
      element(
        Ebml.TRACK_ENTRY,
        uint(Ebml.TRACK_NUMBER, numbers.video),
        uint(Ebml.TRACK_UID, numbers.video),
        uint(Ebml.TRACK_TYPE, 1),
        uint(Ebml.FLAG_LACING, 0),
        text(Ebml.CODEC_ID, video.codec),
        element(Ebml.VIDEO, uint(Ebml.PIXEL_WIDTH, video.width), uint(Ebml.PIXEL_HEIGHT, video.height))
      )
    );
  }
  if (audio) {
    numbers.audio = entries.length + 1;
    entries.push(
      element(
        Ebml.TRACK_ENTRY,
        uint(Ebml.TRACK_NUMBER, numbers.audio),
        uint(Ebml.TRACK_UID, numbers.audio),
        uint(Ebml.TRACK_TYPE, 2),
        uint(Ebml.FLAG_LACING, 0),
        text(Ebml.CODEC_ID, audio.codec),
        element(Ebml.CODEC_PRIVATE, audio.private),
        uint(Ebml.CODEC_DELAY, Math.round((audio.pre_skip / audio.sample_rate) * 1e9)),
        uint(Ebml.SEEK_PRE_ROLL, OPUS_SEEK_PRE_ROLL),
        element(Ebml.AUDIO, float(Ebml.SAMPLING_FREQUENCY, audio.sample_rate), uint(Ebml.CHANNELS, audio.channels))
      )
    );
  }
  return { tracks: element(Ebml.TRACKS, ...entries), numbers };
}

function simple_block(track: number, offset: number, chunk: WebmChunk): Bytes {
  const head = new Uint8Array(4);
  head[0] = 0x80 | track;
  new DataView(head.buffer).setInt16(1, offset);
  head[3] = chunk.key ? 0x80 : 0;
  return element(Ebml.SIMPLE_BLOCK, head, chunk.data);
}

interface Cluster {
  time: number;
  blocks: Bytes[];
  cued: boolean;
}

/** Clusters start at every video keyframe (or every few seconds for audio alone) and whenever block offsets would overflow. */
function clusters(input: WebmInput, numbers: Record<TrackKind, number>): Cluster[] {
  const chunks = [...input.chunks].sort((a, b) => a.timestamp - b.timestamp);
  const cue_track: TrackKind = input.video ? TrackKind.VIDEO : TrackKind.AUDIO;
  const out: Cluster[] = [];
  let current: Cluster | null = null;
  for (const chunk of chunks) {
    const time = Math.round(chunk.timestamp / 1000);
    const starts = chunk.track === cue_track && chunk.key;
    const due = current === null || time - current.time > MAX_BLOCK_OFFSET;
    const split =
      current !== null &&
      current.blocks.length > 0 &&
      starts &&
      (cue_track === TrackKind.VIDEO || time - current.time >= AUDIO_ONLY_CLUSTER_MS);
    if (due || split) {
      current = { time, blocks: [], cued: starts };
      out.push(current);
    }
    current!.blocks.push(simple_block(numbers[chunk.track], time - current!.time, chunk));
  }
  return out;
}

const SEEK_ENTRIES = [Ebml.INFO, Ebml.TRACKS, Ebml.CUES] as const;

function seek_head(positions: readonly number[]): Bytes {
  return element(
    Ebml.SEEK_HEAD,
    ...SEEK_ENTRIES.map((id, index) =>
      element(Ebml.SEEK, element(Ebml.SEEK_ID, id_bytes(id)), uint(Ebml.SEEK_POSITION, positions[index], 8))
    )
  );
}

/**
 * A complete WebM file from encoded chunks: EBML header, then a Segment with a SeekHead, Info (with the Duration),
 * Tracks, the Clusters and Cues at the end. Positions are relative to the Segment's data, as Matroska wants.
 */
export function mux_webm(input: WebmInput): Blob {
  if (!input.video && !input.audio) throw new Error("WebM needs a video or an audio track");
  const header = element(
    Ebml.HEADER,
    uint(Ebml.VERSION, 1),
    uint(Ebml.READ_VERSION, 1),
    uint(Ebml.MAX_ID_LENGTH, 4),
    uint(Ebml.MAX_SIZE_LENGTH, 8),
    text(Ebml.DOC_TYPE, "webm"),
    uint(Ebml.DOC_TYPE_VERSION, 4),
    uint(Ebml.DOC_TYPE_READ_VERSION, 2)
  );
  const info = element(
    Ebml.INFO,
    uint(Ebml.TIMESTAMP_SCALE, TIMESTAMP_SCALE),
    float(Ebml.DURATION, input.duration_ms),
    text(Ebml.MUXING_APP, APP),
    text(Ebml.WRITING_APP, APP)
  );
  const { tracks, numbers } = track_entries(input);
  const cue_number = input.video ? numbers.video : numbers.audio;

  // Positions are 8-byte numbers, so the SeekHead's size is known before them.
  const head_size = seek_head([0, 0, 0]).length;
  const info_at = head_size;
  const tracks_at = info_at + info.length;
  let offset = tracks_at + tracks.length;
  const cluster_parts: Bytes[] = [];
  const cue_points: Bytes[] = [];
  for (const cluster of clusters(input, numbers)) {
    const bytes = element(Ebml.CLUSTER, uint(Ebml.TIMESTAMP, cluster.time), ...cluster.blocks);
    if (cluster.cued) {
      cue_points.push(
        element(
          Ebml.CUE_POINT,
          uint(Ebml.CUE_TIME, cluster.time),
          element(Ebml.CUE_TRACK_POSITIONS, uint(Ebml.CUE_TRACK, cue_number), uint(Ebml.CUE_CLUSTER_POSITION, offset))
        )
      );
    }
    cluster_parts.push(bytes);
    offset += bytes.length;
  }
  const cues = element(Ebml.CUES, ...cue_points);
  const head = seek_head([info_at, tracks_at, offset]);
  const body_size = offset + cues.length;
  const segment = concat([id_bytes(Ebml.SEGMENT), vint(body_size, 8)]);
  return new Blob([header, segment, head, info, tracks, ...cluster_parts, cues], { type: "video/webm" });
}

export function opus_head(channels: number, sample_rate: number, pre_skip: number): Bytes {
  const out = new Uint8Array(19);
  const view = new DataView(out.buffer);
  out.set(new TextEncoder().encode("OpusHead"));
  out[8] = 1;
  out[9] = channels;
  view.setUint16(10, pre_skip, true);
  view.setUint32(12, sample_rate, true);
  view.setInt16(16, 0, true);
  out[18] = 0;
  return out;
}

export function opus_pre_skip(head: Uint8Array): number {
  if (head.length < 19 || new TextDecoder().decode(head.subarray(0, 8)) !== "OpusHead") return 0;
  return new DataView(head.buffer, head.byteOffset, head.byteLength).getUint16(10, true);
}
