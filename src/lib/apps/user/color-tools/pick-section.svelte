<script lang="ts">
  import kernel, { type DialogsService, type FilesService } from "$lib/core/api";
  import { Button, Section, Select, Spinner } from "$lib/core/components/ui";
  import { get_app_context } from "$lib/core/contexts/app";
  import { cn } from "$lib/core/utils";
  import { pick_device_files } from "$lib/core/utils/device-file";
  import { has_files, image_files, load_image, read_pixels } from "$kit/utils/image";
  import { report_error } from "$kit/utils/report-error";
  import {
    Camera as CameraIcon,
    Devices as DevicesIcon,
    Eyedropper as EyedropperIcon,
    FolderOpen as FolderOpenIcon,
    Stop as StopIcon,
    X as XIcon,
  } from "phosphor-svelte";
  import { Camera } from "./camera.svelte";
  import ChannelSliders from "./channel-sliders.svelte";
  import { from_hex, rgb8, type Color } from "./color";
  import ColorField from "./color-field.svelte";
  import { convert, MODELS, model_by_id, DEFAULT_MODEL } from "./models";
  import { fit_size, pixel_at, read_rgba, type Rgba } from "./sample";
  import Sampler from "./sampler.svelte";

  interface Props {
    color: Color;
    text: string;
    model: string;
    active: boolean;
    onchange: (color: Color) => void;
  }

  let { color, text, model = $bindable(), active, onchange }: Props = $props();

  const { app_id, window_id, window: win } = get_app_context();
  const files = $derived(kernel.service<FilesService>("files"));
  const dialogs = $derived(kernel.service<DialogsService>("dialogs"));

  interface EyeDropperInstance {
    open(): Promise<{ sRGBHex: string }>;
  }
  const EyeDropperApi = (globalThis as { EyeDropper?: new () => EyeDropperInstance }).EyeDropper;

  const MODEL_OPTIONS = MODELS.map((item) => ({ value: item.id, label: item.id }));
  const current_model = $derived(model_by_id(model) ?? model_by_id(DEFAULT_MODEL)!);
  const in_model = $derived(convert(color, current_model));

  let picture = $state.raw<{ bitmap: ImageBitmap; name: string } | null>(null);
  let loading = $state(false);
  let dragging = $state(false);
  let root = $state<HTMLElement>();
  let video = $state<HTMLVideoElement>();

  const camera = new Camera(
    () => active && win.is_visible,
    (reason) => report_error(app_id, "Couldn't start the camera", reason)
  );

  $effect(() => () => picture?.bitmap.close());

  function show(bitmap: ImageBitmap, name: string) {
    picture?.bitmap.close();
    picture = { bitmap, name };
  }

  async function shrink(source: ImageBitmap): Promise<ImageBitmap> {
    const target = fit_size(source);
    if (target.width === source.width && target.height === source.height) return source;
    const canvas = new OffscreenCanvas(target.width, target.height);
    canvas.getContext("2d")!.drawImage(source, 0, 0, target.width, target.height);
    source.close();
    return canvas.transferToImageBitmap();
  }

  async function take(file: File) {
    loading = true;
    try {
      const image = await load_image(file);
      camera.stop();
      show(await shrink(image.bitmap), image.name);
    } catch (reason) {
      report_error(app_id, `Couldn't open ${file.name}`, reason);
    } finally {
      loading = false;
    }
  }

  async function open_file() {
    const path = await win.pick_file({ accept: ["image/*"], title: "Pick a colour from an image" });
    if (!path) return;
    const file = await files.get_file(path).catch(() => null);
    if (file) await take(file);
    else report_error(app_id, "Couldn't open the image", new Error(`${path} is gone.`));
  }

  async function open_device() {
    const [file] = await pick_device_files({ accept: ["image/*"] });
    if (file) await take(file);
  }

  async function screen() {
    if (!EyeDropperApi) return;
    try {
      const result = await new EyeDropperApi().open();
      const picked = from_hex(result.sRGBHex);
      if (picked) onchange(picked);
    } catch {
      // Esc cancels the eyedropper with an AbortError; nothing to report.
    }
  }

  function pick(rgba: Rgba) {
    onchange(rgb8(rgba.r, rgba.g, rgba.b, rgba.a));
  }

  async function freeze(event?: PointerEvent) {
    if (!video || !video.videoWidth) return;
    const rect = video.getBoundingClientRect();
    const frame = await shrink(await createImageBitmap(video));
    camera.stop();
    show(frame, "Camera");
    if (!event) return;
    const point = pixel_at({ x: event.clientX - rect.left, y: event.clientY - rect.top }, rect, frame);
    const pixels = read_pixels(frame);
    pick(read_rgba(pixels.data, pixels.width, point));
  }

  function start_camera() {
    void camera.start();
  }

  function on_paste(event: ClipboardEvent) {
    if (!active || !win.is_focused || dialogs.system.length > 0 || dialogs.for_window(window_id).length > 0) return;
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) return;
    if (target instanceof Node && target !== document.body && !root?.contains(target)) return;
    const [file] = image_files(event.clipboardData);
    if (!file) return;
    event.preventDefault();
    void take(file);
  }

  function on_dragover(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dragging = true;
  }

  function on_drop(event: DragEvent) {
    if (!has_files(event)) return;
    event.preventDefault();
    dragging = false;
    const [file] = image_files(event.dataTransfer);
    if (file) void take(file);
  }
</script>

<svelte:document onpaste={on_paste} />

<div bind:this={root} class="flex flex-col gap-6">
  {#if EyeDropperApi}
    <Section title="From the screen" description="Any pixel on your screen, inside WebOS or outside it." flush>
      <div><Button variant="primary" onclick={screen}><EyedropperIcon weight="bold" />Pick from screen</Button></div>
    </Section>
  {/if}

  <Section title="From a picture" description={camera.active ? "Tap the view to freeze it on that colour." : "Open an image, drop it here or paste it, or use the camera."} flush>
    {#snippet actions()}
      {#if picture || camera.active}
        <Button
          size="sm"
          variant="quiet"
          onclick={() => {
            camera.stop();
            picture?.bitmap.close();
            picture = null;
          }}
        >
          <XIcon weight="bold" />Clear
        </Button>
      {/if}
    {/snippet}
    <div
      role="group"
      aria-label="Picture to pick from"
      class={cn("flex flex-col gap-3 rounded-xl", dragging && "ring-2 ring-primary ring-offset-4 ring-offset-background")}
      ondragover={on_dragover}
      ondragleave={(event) => !root?.contains(event.relatedTarget as Node | null) && (dragging = false)}
      ondrop={on_drop}
    >
      {#if loading || camera.starting}
        <div class="grid h-40 place-items-center"><Spinner label={loading ? "Opening the image" : "Starting the camera"} /></div>
      {:else if camera.stream}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={video}
          {@attach camera.preview}
          muted
          playsinline
          class="mx-auto block h-auto max-h-96 w-auto max-w-full cursor-crosshair rounded-lg bg-background-darkest"
          onpointerup={(event) => void freeze(event)}
        ></video>
        <div class="flex flex-wrap justify-center gap-2">
          <Button size="sm" onclick={() => void freeze()}><CameraIcon weight="bold" />Freeze frame</Button>
          <Button size="sm" variant="quiet" onclick={() => camera.stop()}><StopIcon weight="bold" />Stop camera</Button>
        </div>
      {:else if picture}
        <Sampler picture={picture.bitmap} label="Pick a colour from {picture.name}" onpick={pick} />
        <p class="text-center text-2xs text-foreground/80">Drag over the picture to aim, let go to pick.</p>
      {/if}
      <div class="flex flex-wrap gap-2">
        <Button size="sm" onclick={open_file}><FolderOpenIcon weight="bold" />Open image…</Button>
        <Button size="sm" onclick={open_device}><DevicesIcon weight="bold" />From device…</Button>
        {#if !camera.stream}
          <Button size="sm" onclick={start_camera}><CameraIcon weight="bold" />Camera</Button>
        {/if}
      </div>
    </div>
  </Section>

  <Section title="Type it" description="A hex, a name, any CSS colour function, or any model's own syntax like hsv(30 50% 80%)." flush>
    <ColorField {color} {text} label="Colour" {onchange} />
  </Section>

  <Section title="Adjust" flush>
    {#snippet actions()}
      <Select size="sm" aria-label="Colour model" class="w-auto max-w-44" options={MODEL_OPTIONS} bind:value={model} />
    {/snippet}
    {#if in_model}
      <ChannelSliders color={in_model} model={current_model} {onchange} />
    {:else}
      <p class="text-ui text-foreground/65">This colour is outside what {current_model.id} can hold. Pick another model.</p>
    {/if}
  </Section>
</div>

