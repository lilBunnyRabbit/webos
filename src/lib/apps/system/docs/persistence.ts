import { plain } from "$kit/utils/roadmap";

export interface Table {
  header: string[];
  rows: string[][];
}

/** One table row's cells, raw markdown. A `|` inside backticks or escaped as `\|` stays in its cell. */
export function split_row(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let code = false;
  const body = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  for (let index = 0; index < body.length; index++) {
    const char = body[index];
    if (char === "\\" && body[index + 1] === "|") {
      cell += "|";
      index++;
    } else if (char === "`") {
      code = !code;
      cell += char;
    } else if (char === "|" && !code) {
      cells.push(cell.trim());
      cell = "";
    } else cell += char;
  }
  cells.push(cell.trim());
  return cells;
}

export function parse_tables(markdown: string): Table[] {
  const tables: Table[] = [];
  const lines = markdown.split("\n");
  for (let index = 0; index < lines.length - 1; index++) {
    if (!lines[index].startsWith("|") || !/^\|[\s:|-]+\|\s*$/.test(lines[index + 1])) continue;
    const table: Table = { header: split_row(lines[index]).map(plain), rows: [] };
    index += 2;
    while (index < lines.length && lines[index].startsWith("|")) table.rows.push(split_row(lines[index++]));
    tables.push(table);
  }
  return tables;
}

export interface StorageEntry {
  store: string;
  key: string;
  owner: string;
  owner_detail: string;
  format: string;
}

export interface AppKey {
  key: string;
  app: string;
  value: string;
}

export interface StorageMap {
  entries: StorageEntry[];
  app_keys: AppKey[];
}

function short_owner(cell: string): string {
  const text = plain(cell);
  const cut = text.search(/[(,;]/);
  return (cut < 0 ? text : text.slice(0, cut)).trim();
}

/** `docs/system/persistence.md`: the storage map (`Store | Key / path | Owner | Format …`) and the app keys table (`Key | App | Value`). */
export function parse_storage_map(markdown: string): StorageMap {
  const map: StorageMap = { entries: [], app_keys: [] };
  for (const table of parse_tables(markdown)) {
    const [first, second, third] = table.header;
    if (first === "Store" && second === "Key / path" && third === "Owner") {
      const format = table.header.indexOf("Format");
      for (const row of table.rows) {
        map.entries.push({
          store: plain(row[0]),
          key: plain(row[1]),
          owner: short_owner(row[2]),
          owner_detail: plain(row[2]),
          format: format < 0 ? "" : plain(row[format] ?? ""),
        });
      }
    } else if (first === "Key" && second === "App" && third === "Value") {
      for (const row of table.rows) map.app_keys.push({ key: plain(row[0]), app: plain(row[1]), value: plain(row[2]) });
    }
  }
  return map;
}

export function opfs_area(path: string): string {
  const match = /^\/(var\/lib|etc|home|tmp|var)\b/.exec(path);
  return match ? `/${match[1]}` : "/";
}
