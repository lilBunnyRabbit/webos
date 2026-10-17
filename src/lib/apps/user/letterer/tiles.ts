export const LETTER_ROWS = ["q w e r t y u i o p", "a s d f g h j k l", "enter z x c v b n m backspace"] as const;
export const NERDLE_ROWS = ["1 2 3 4 5 6 7 8 9 0", "+ - * / = enter backspace"] as const;

const SYMBOLS: Record<string, string> = { "*": "×", "/": "÷", "-": "−" };

export function display(char: string): string {
  return SYMBOLS[char] ?? char.toUpperCase();
}

export function key_of(event: KeyboardEvent, nerdle: boolean): string | null {
  if (event.key === "Enter") return "enter";
  if (event.key === "Backspace") return "backspace";
  const key = event.key.toLowerCase();
  if (nerdle) return /^[0-9+\-*/=]$/.test(key) ? key : null;
  return /^[a-z]$/.test(key) ? key : null;
}
