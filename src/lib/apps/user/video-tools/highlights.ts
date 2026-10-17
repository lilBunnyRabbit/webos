import type { AppHighlight } from "$lib/core/api/services/apps/type";
import {
  Gif as GifIcon,
  Scissors as ScissorsIcon,
  Terminal as TerminalIcon,
  Waveform as WaveformIcon,
} from "phosphor-svelte";

export default [
  {
    icon: ScissorsIcon,
    title: "Trim",
    text: "Mark in and out points frame by frame and save just that part as a WebM clip, sound included.",
  },
  {
    icon: GifIcon,
    title: "Video to GIF",
    text: "Turn a moment into a looping GIF: pick the frame rate and width, and see the size before you start.",
  },
  { icon: WaveformIcon, title: "Save the sound", text: "Keep only the audio of a video, or of part of it." },
  {
    icon: TerminalIcon,
    title: "From the terminal",
    text: "video trim and video gif do the same from the Terminal and hand back the file.",
  },
] satisfies AppHighlight[];
