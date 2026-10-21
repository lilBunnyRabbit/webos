export interface CaptureOptions {
  file: Blob;
  from: number;
  to: number;
  signal: AbortSignal;
  rate?: number;
  /** Read the picture synchronously; a returned promise holds playback until it settles. */
  on_frame: (video: HTMLVideoElement, time: number) => void | Promise<void>;
}

export interface CaptureResult {
  frames: number;
  /** `to`, or the video's end when it's shorter. */
  end: number;
}

function once(target: EventTarget, type: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const done = () => {
      target.removeEventListener("error", failed);
      signal.removeEventListener("abort", aborted);
    };
    const failed = () => {
      done();
      reject(new Error("This browser can't play the video"));
    };
    const aborted = () => {
      done();
      reject(signal.reason);
    };
    target.addEventListener(type, () => (done(), resolve()), { once: true });
    target.addEventListener("error", failed, { once: true });
    signal.addEventListener("abort", aborted, { once: true });
  });
}

export interface VideoInfo {
  duration: number;
  width: number;
  height: number;
}

export async function probe_video(file: Blob, signal = new AbortController().signal): Promise<VideoInfo> {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  const url = URL.createObjectURL(file);
  try {
    video.src = url;
    await once(video, "loadedmetadata", signal);
    if (!video.videoWidth || !video.videoHeight) throw new Error("This file has no picture");
    if (!Number.isFinite(video.duration)) {
      // MediaRecorder's WebM has no Duration; seeking past the end makes Chrome scan for it.
      video.currentTime = Number.MAX_SAFE_INTEGER;
      await once(video, "seeked", signal);
    }
    return {
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      width: video.videoWidth,
      height: video.videoHeight,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

/**
 * Plays the video muted in an element that's never attached and hands each frame `requestVideoFrameCallback` reports
 * to `on_frame`. No demuxer, so any format Chrome plays works, at playback speed: past 2× on a 60 Hz screen Chrome
 * presents only some of a 30 fps video's frames.
 */
export async function capture(options: CaptureOptions): Promise<CaptureResult> {
  const { from, to, signal } = options;
  signal.throwIfAborted();
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const url = URL.createObjectURL(options.file);
  try {
    video.src = url;
    await once(video, "loadedmetadata", signal);
    const end = Math.min(to, Number.isFinite(video.duration) ? video.duration : to);

    return await new Promise<CaptureResult>((resolve, reject) => {
      let frames = 0;
      let last = -Infinity;
      let settled = false;
      let holding = false;

      const finish = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve({ frames, end });
      };
      const fail = (reason: unknown) => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(reason);
      };
      const on_abort = () => fail(signal.reason);
      const on_error = () => fail(new Error("The video stopped playing"));
      const on_ended = () => {
        if (!holding) finish();
      };
      const cleanup = () => {
        signal.removeEventListener("abort", on_abort);
        video.removeEventListener("error", on_error);
        video.removeEventListener("ended", on_ended);
        video.pause();
      };
      const play = () => {
        video.playbackRate = options.rate ?? 1;
        video.play().catch((reason: unknown) => {
          if (!settled && !signal.aborted) fail(reason);
        });
      };

      const take = (time: number) => {
        if (time <= last) return;
        last = time;
        frames++;
        const pending = options.on_frame(video, time);
        if (!pending) return;
        holding = true;
        video.pause();
        pending.then(() => {
          holding = false;
          if (settled) return;
          if (video.ended) return finish();
          play();
        }, fail);
      };

      const tick: VideoFrameRequestCallback = (_, metadata) => {
        if (settled) return;
        if (metadata.mediaTime >= to) return finish();
        take(metadata.mediaTime);
        video.requestVideoFrameCallback(tick);
      };

      signal.addEventListener("abort", on_abort, { once: true });
      video.addEventListener("error", on_error);
      video.addEventListener("ended", on_ended);
      video.currentTime = from;
      once(video, "seeked", signal).then(() => {
        if (settled) return;
        // A paused seek presents its frame without a frame callback, so the first frame is taken here.
        take(video.currentTime);
        video.requestVideoFrameCallback(tick);
        if (!holding) play();
      }, fail);
    });
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export interface MediaTracks {
  duration: number;
  picture: boolean;
  /** Only sound this browser can play. */
  audio: boolean;
}

export async function probe_tracks(file: Blob, signal = new AbortController().signal): Promise<MediaTracks> {
  const video = document.createElement("video");
  video.muted = true;
  video.preload = "metadata";
  const url = URL.createObjectURL(file);
  try {
    video.src = url;
    await once(video, "loadedmetadata", signal);
    const audio = video.captureStream().getAudioTracks().length > 0;
    if (!Number.isFinite(video.duration)) {
      video.currentTime = Number.MAX_SAFE_INTEGER;
      await once(video, "seeked", signal);
    }
    return {
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      picture: video.videoWidth > 0 && video.videoHeight > 0,
      audio,
    };
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}

export interface RecordAudioOptions {
  file: Blob;
  signal: AbortSignal;
  on_progress?: (time: number, duration: number) => void;
}

/** Plays the file muted and records its sound as Opus WebM, in real time: for sound Chrome plays but `decodeAudioData` can't read. */
export async function record_audio(options: RecordAudioOptions): Promise<Blob> {
  const { signal } = options;
  signal.throwIfAborted();
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  const url = URL.createObjectURL(options.file);
  try {
    video.src = url;
    await once(video, "loadedmetadata", signal);
    const tracks = video.captureStream().getAudioTracks();
    if (tracks.length === 0) throw new Error("This video has no sound");
    const recorder = new MediaRecorder(new MediaStream(tracks), { mimeType: "audio/webm;codecs=opus", audioBitsPerSecond: 256_000 });
    const chunks: Blob[] = [];
    recorder.ondataavailable = (event) => chunks.push(event.data);
    const stopped = new Promise<void>((resolve) => (recorder.onstop = () => resolve()));
    const ended = once(video, "ended", signal);
    const report = () => options.on_progress?.(video.currentTime, video.duration);
    video.addEventListener("timeupdate", report);
    recorder.start(1000);
    try {
      await video.play();
      await ended;
    } finally {
      video.removeEventListener("timeupdate", report);
      video.pause();
      if (recorder.state !== "inactive") recorder.stop();
      await stopped;
    }
    return new Blob(chunks, { type: "audio/webm" });
  } finally {
    video.removeAttribute("src");
    video.load();
    URL.revokeObjectURL(url);
  }
}
