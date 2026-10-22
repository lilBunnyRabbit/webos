export type QueryCase = [query: string, right: string[]];

export const SAMPLE_QUERIES: QueryCase[] = [
  ["tool that allows me to make pixelart", ["hopsprite"]],
  ["daily notes logging", ["moonrabbit", "quick-notes"]],
  ["draw", ["paint", "hopsprite"]],
  ["edit pdf", ["pdf-tools"]],
  ["convert units", ["unit-converter"]],
  ["timer for cooking", ["recipe-box", "clock"]],
  ["write my cv", ["warren"]],
  ["journal", ["moonrabbit"]],
  ["puzzle like sudoku", ["sudoku", "futoshiki", "kakuro"]],
  ["record my voice", ["recorder"]],
  ["remove background from photo", ["image-tools"]],
];

export const UNSEEN_QUERIES: QueryCase[] = [
  ["send a file to my phone", ["p2p-transfer"]],
  ["make a qr code", ["qr-studio"]],
  ["habit tracker", ["time-since"]],
  ["design my own font", ["font-maker"]],
  ["zip some files", ["archive"]],
  ["scan a qr code", ["qr-reader"]],
  ["compare two texts", ["diff"]],
  ["test my keyboard", ["hid-lab"]],
  ["trim a video", ["video-tools"]],
  ["to do list", ["quick-notes", "kanban"]],
  ["track hours at work", ["work-hours"]],
  ["shrink an image", ["image-tools"]],
  ["something to help me focus while studying", ["pomodoro"]],
  ["make a survey", ["forms"]],
  ["groceries", ["shopping-list"]],
  ["read faster", ["speed-reader"]],
  ["sign a contract", ["pdf-tools"]],
  ["test an api endpoint", ["api-client"]],
  ["see exif data of a photo", ["metadata"]],
  ["play a card game", ["solitaire"]],
];

export const NAME_QUERIES: QueryCase[] = [
  ["term", ["terminal"]],
  ["calc", ["calculator"]],
  ["pdf", ["pdf-viewer", "pdf-tools"]],
  ["sett", ["settings"]],
  ["mines", ["minesweeper"]],
  ["2048", ["twenty-forty-eight"]],
  ["text edi", ["text-editor"]],
  ["paitn", ["paint"]],
];
