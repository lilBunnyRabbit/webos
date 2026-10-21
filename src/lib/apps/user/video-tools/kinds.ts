export { Quality, QUALITIES } from "$kit/utils/video/plan";
export { VIDEO_ACCEPT, is_video_name } from "$kit/utils/video/files";

export const GIF_FPS = { MIN: 5, MAX: 30, DEFAULT: 12 } as const;
export const GIF_WIDTH = { MIN: 16, MAX: 1920, DEFAULT: 480 } as const;
