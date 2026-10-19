const BULLET = /^(?:[-–—*•·▪◦○●□■☐☑✓✔>+]+|\[[ xX✓]?\]|\(?\d{1,2}[.)])\s+/u;

export function clean_lines(text: string): string[] {
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = raw.replace(/\s+/g, " ").trim();
    while (BULLET.test(line)) line = line.replace(BULLET, "");
    line = line.replace(/[,;.]+$/, "").trim();
    if (!/\p{L}/u.test(line)) continue;
    const key = line.toLocaleLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    lines.push(line);
  }
  return lines;
}
