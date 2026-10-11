/**
 * RFC 4180 parser: quoted fields, `""` escapes, CRLF or LF, line breaks inside quotes.
 * Lenient where the RFC is strict: a stray quote in an unquoted field is kept as text, and text after a closing quote is appended.
 * A trailing line break doesn't add an empty last row. A leading BOM is dropped.
 */
export function parse_csv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let index = text.charCodeAt(0) === 0xfeff ? 1 : 0;

  while (index < text.length) {
    const char = text[index];

    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }
        quoted = false;
      } else {
        field += char;
      }
      index++;
      continue;
    }

    if (char === '"' && field === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(field);
      field = "";
    } else if (char === "\n" || char === "\r") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      if (char === "\r" && text[index + 1] === "\n") index++;
    } else {
      field += char;
    }
    index++;
  }

  if (field !== "" || row.length > 0 || quoted) {
    row.push(field);
    rows.push(row);
  }

  return rows;
}

/** `.tsv` → tab, anything else → comma. */
export function delimiter_for(extension: string): string {
  return extension === ".tsv" ? "\t" : ",";
}

/** Spreadsheet-style column name: 0 → A, 25 → Z, 26 → AA. */
export function column_label(index: number): string {
  let label = "";
  for (let rest = index + 1; rest > 0; rest = Math.floor((rest - 1) / 26)) {
    label = String.fromCharCode(65 + ((rest - 1) % 26)) + label;
  }
  return label;
}
