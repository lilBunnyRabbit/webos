// addInitScript serializes each function on its own: nothing outside its body is in scope.

// The splash calls show_step() before each service's init(), so the gap between label changes is that init's time.
export function boot_probe() {
  const t = () => performance.now();
  const probe = (window.__perf = { steps: [], long: [], splash_end: null, painted: null });
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) probe.long.push({ start: entry.startTime, duration: entry.duration });
  }).observe({ type: "longtask", buffered: true });
  const watch = () => {
    const label = document.getElementById("splash-label");
    if (!label) return requestAnimationFrame(watch);
    new MutationObserver(() => probe.steps.push({ label: label.textContent, at: t() })).observe(label, { childList: true, characterData: true, subtree: true });
    const splash = document.getElementById("splash");
    new MutationObserver(() => {
      if (probe.splash_end === null && !document.getElementById("splash")) {
        probe.splash_end = t();
        requestAnimationFrame(() => requestAnimationFrame(() => (probe.painted = t())));
      }
    }).observe(splash.parentNode, { childList: true });
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
}

export function frame_recorder() {
  let recording = false;
  let frames = [];
  let last = 0;
  let long = [];
  let loaf = [];
  const loop = (t) => {
    if (recording) {
      if (last) frames.push(t - last);
      last = t;
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  new PerformanceObserver((list) => {
    if (recording) for (const entry of list.getEntries()) long.push(entry.duration);
  }).observe({ type: "longtask" });
  new PerformanceObserver((list) => {
    if (!recording) return;
    for (const entry of list.getEntries()) {
      loaf.push({
        d: Math.round(entry.duration),
        block: Math.round(entry.blockingDuration),
        render: Math.round(entry.renderStart ? entry.startTime + entry.duration - entry.renderStart : 0),
        style: Math.round(entry.styleAndLayoutStart ? entry.startTime + entry.duration - entry.styleAndLayoutStart : 0),
        scripts: entry.scripts.slice(0, 4).map((s) => ({ src: (s.sourceURL || "").split("/").pop(), fn: s.sourceFunctionName, invoker: s.invoker, d: Math.round(s.duration), forced: Math.round(s.forcedStyleAndLayoutDuration) })),
      });
    }
  }).observe({ type: "long-animation-frame" });
  window.__frames = {
    start() {
      recording = true;
      frames = [];
      long = [];
      loaf = [];
      last = 0;
    },
    stop() {
      recording = false;
      return { frames, long, loaf };
    },
  };
}

// Headless Chromium keeps a background tab "visible", so hidden is simulated. The app's own visibility logic runs;
// Chrome's hidden-tab timer throttling does not.
export function idle_instrument() {
  if (window.__idle) return;
  const now = () => performance.now();
  const state = (window.__idle = { timers: {}, raf: { fires: 0, src: {} }, ric: { fires: 0 }, locks: {}, bc_post: {}, bc_recv: {}, fetch: {}, opfs: {}, listeners: {}, events: {}, observers: {}, sw_msgs: 0, log: [] });
  const log = (kind, detail) => {
    if (state.log.length < 4000) state.log.push([Math.round(now()), kind, detail]);
  };
  const site = () => {
    for (const line of (new Error().stack || "").split("\n").slice(3)) {
      const match = line.match(/\/assets\/([^:)]+):(\d+):(\d+)/) || line.match(/(https?:[^)]+)/);
      if (match) return match[1] + (match[2] ? `:${match[2]}:${match[3]}` : "");
    }
    return "?";
  };
  const bump = (map, key, field = "n", by = 1) => {
    const entry = (map[key] ||= { n: 0, fires: 0, ms: 0 });
    entry[field] = (entry[field] || 0) + by;
    return entry;
  };

  const timer = (name, tag, kind) => {
    const original = window[name];
    window[name] = function (fn, delay, ...rest) {
      const key = `${tag} ${site()} d=${Math.round(delay || 0)}`;
      bump(state.timers, key);
      if (typeof fn !== "function") return original.call(this, fn, delay, ...rest);
      return original.call(
        this,
        function (...a) {
          const started = now();
          try {
            return fn.apply(this, a);
          } finally {
            bump(state.timers, key, "fires").ms += now() - started;
            log(kind, key);
          }
        },
        delay,
        ...rest
      );
    };
  };
  timer("setTimeout", "T", "timeout");
  timer("setInterval", "I", "interval");
  const raf = window.requestAnimationFrame;
  window.requestAnimationFrame = function (fn) {
    const key = site();
    return raf.call(this, (ts) => {
      state.raf.fires++;
      state.raf.src[key] = (state.raf.src[key] || 0) + 1;
      return fn(ts);
    });
  };
  const ric = window.requestIdleCallback;
  if (ric) {
    window.requestIdleCallback = function (fn, opts) {
      return ric.call(this, (deadline) => {
        state.ric.fires++;
        log("idle", site());
        return fn(deadline);
      }, opts);
    };
  }

  if (navigator.locks) {
    const request = LockManager.prototype.request;
    LockManager.prototype.request = function (name, ...rest) {
      const opts = rest.length > 1 ? rest[0] : {};
      const key = name + (opts?.steal ? " (steal)" : opts?.ifAvailable ? " (ifAvailable)" : opts?.signal ? " (queued)" : "");
      bump(state.locks, key);
      log("lock", key);
      return request.call(this, name, ...rest);
    };
  }

  const Channel = window.BroadcastChannel;
  if (Channel) {
    const post = Channel.prototype.postMessage;
    Channel.prototype.postMessage = function (message) {
      bump(state.bc_post, this.name);
      log("bc_post", `${this.name} ${JSON.stringify(message).slice(0, 60)}`);
      return post.call(this, message);
    };
    window.BroadcastChannel = function (name) {
      const channel = new Channel(name);
      channel.addEventListener("message", (event) => {
        bump(state.bc_recv, name);
        log("bc_recv", `${name} ${JSON.stringify(event.data).slice(0, 60)}`);
      });
      bump(state.bc_recv, `${name} (opened)`);
      return channel;
    };
    window.BroadcastChannel.prototype = Channel.prototype;
  }

  const fetch = window.fetch;
  window.fetch = function (input, init) {
    const key = String(typeof input === "string" ? input : input.url).replace(location.origin, "").replace(/\?.*/, "");
    bump(state.fetch, key);
    log("fetch", key);
    return fetch.call(this, input, init);
  };

  const opfs = (proto, name, label) => {
    const original = proto?.[name];
    if (typeof original !== "function") return;
    proto[name] = function (...a) {
      bump(state.opfs, label);
      log("opfs", label + (typeof a[0] === "string" ? ` ${a[0]}` : ""));
      return original.apply(this, a);
    };
  };
  opfs(window.FileSystemFileHandle?.prototype, "getFile", "file.getFile");
  opfs(window.FileSystemFileHandle?.prototype, "createWritable", "file.createWritable");
  for (const name of ["getFileHandle", "getDirectoryHandle", "removeEntry", "entries", "values", "keys"]) opfs(window.FileSystemDirectoryHandle?.prototype, name, `dir.${name}`);
  opfs(window.FileSystemWritableFileStream?.prototype, "write", "writable.write");

  const watched = new Set(["visibilitychange", "focus", "blur", "pageshow", "pagehide", "resume", "freeze", "storage", "online", "offline", "message", "beforeunload", "unload"]);
  const add = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type, fn, opts) {
    const who = this === window ? "window" : this === document ? "document" : navigator.serviceWorker && this === navigator.serviceWorker ? "sw" : null;
    if (who && watched.has(type) && typeof fn === "function") {
      const key = `${who}:${type} @ ${site()}`;
      bump(state.listeners, key);
      const wrapped = function (...a) {
        const started = now();
        try {
          return fn.apply(this, a);
        } finally {
          bump(state.events, key, "fires").ms += now() - started;
        }
      };
      fn.__wrapped = wrapped;
      return add.call(this, type, wrapped, opts);
    }
    return add.call(this, type, fn, opts);
  };
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.removeEventListener = function (type, fn, opts) {
    return remove.call(this, type, fn?.__wrapped || fn, opts);
  };

  for (const name of ["MutationObserver", "ResizeObserver", "IntersectionObserver", "PerformanceObserver"]) {
    const Original = window[name];
    if (!Original) continue;
    const Wrapped = function (callback, ...rest) {
      const key = `${name} @ ${site()}`;
      bump(state.observers, key);
      return new Original(function (...a) {
        bump(state.observers, key, "fires");
        return callback.apply(this, a);
      }, ...rest);
    };
    Wrapped.prototype = Original.prototype;
    if (Original.supportedEntryTypes) Object.defineProperty(Wrapped, "supportedEntryTypes", { get: () => Original.supportedEntryTypes });
    window[name] = Wrapped;
  }

  navigator.serviceWorker?.addEventListener("message", () => state.sw_msgs++);

  let hidden = null;
  const visibility = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");
  const is_hidden = Object.getOwnPropertyDescriptor(Document.prototype, "hidden");
  Object.defineProperty(Document.prototype, "visibilityState", { configurable: true, get() { return hidden === null ? visibility.get.call(this) : hidden ? "hidden" : "visible"; } });
  Object.defineProperty(Document.prototype, "hidden", { configurable: true, get() { return hidden === null ? is_hidden.get.call(this) : hidden; } });
  const has_focus = Document.prototype.hasFocus;
  Document.prototype.hasFocus = function () {
    return hidden ? false : has_focus.call(this);
  };
  state.set_hidden = (next) => {
    hidden = next;
    if (next) {
      window.dispatchEvent(new Event("blur"));
      document.dispatchEvent(new Event("visibilitychange"));
    } else {
      document.dispatchEvent(new Event("visibilitychange"));
      window.dispatchEvent(new Event("focus"));
    }
  };
  state.snapshot = () => JSON.parse(JSON.stringify({ ...state, snapshot: undefined, log: undefined, now: now() }));
  state.log_since = (t) => state.log.filter((entry) => entry[0] >= t);
}
