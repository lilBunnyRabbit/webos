export interface Pair {
  name: string;
  value: string;
}

export interface HttpRequest {
  name: string;
  method: string;
  url: string;
  headers: Pair[];
  body: string;
}

export interface HttpDocument {
  variables: Pair[];
  requests: HttpRequest[];
}

const REQUEST_LINE = /^([A-Z]+)\s+(\S.*?)(?:\s+HTTP\/[\d.]+)?$/;
const VARIABLE = /^@([\w.-]+)\s*=\s*(.*)$/;
const NAME_COMMENT = /^(?:#|\/\/)\s*@name\s+(.+)$/;
const COMMENT = /^(?:#|\/\/)/;
const HEADER = /^([^:\s][^:]*):\s?(.*)$/;

export function empty_request(name = ""): HttpRequest {
  return { name, method: "GET", url: "", headers: [], body: "" };
}

function request_line(line: string): { method: string; url: string } {
  const match = REQUEST_LINE.exec(line);
  if (match) return { method: match[1], url: match[2] };
  return { method: "GET", url: line.replace(/\s+HTTP\/[\d.]+$/, "") };
}

export function parse_http(text: string): HttpDocument {
  const variables: Pair[] = [];
  const requests: HttpRequest[] = [];
  let name = "";
  let current: HttpRequest | null = null;
  let stage: "before" | "headers" | "body" = "before";
  let body: string[] = [];

  const finish = () => {
    if (current) {
      while (body.length > 0 && body.at(-1)!.trim() === "") body.pop();
      current.body = body.join("\n");
      requests.push(current);
    }
    current = null;
    stage = "before";
    body = [];
    name = "";
  };

  for (const line of text.replace(/\r\n?/g, "\n").split("\n")) {
    if (line.startsWith("###")) {
      finish();
      name = line.slice(3).trim();
      continue;
    }
    const trimmed = line.trim();
    if (stage === "before") {
      if (trimmed === "") continue;
      const named = NAME_COMMENT.exec(trimmed);
      const variable = VARIABLE.exec(trimmed);
      if (named) name = named[1].trim();
      else if (COMMENT.test(trimmed)) continue;
      else if (variable) variables.push({ name: variable[1], value: variable[2].trim() });
      else {
        current = { ...empty_request(name), ...request_line(trimmed) };
        stage = "headers";
      }
    } else if (stage === "headers" && current) {
      if (trimmed === "") stage = "body";
      else if (/^[?&]/.test(trimmed) && current.headers.length === 0) current.url += trimmed;
      else if (!COMMENT.test(trimmed)) {
        const header = HEADER.exec(trimmed);
        if (header) current.headers.push({ name: header[1].trim(), value: header[2].trim() });
      }
    } else {
      body.push(line);
    }
  }
  finish();
  return { variables, requests };
}

export function serialize_http(document: HttpDocument): string {
  const blocks: string[] = [];
  if (document.variables.length > 0) blocks.push(document.variables.map((pair) => `@${pair.name} = ${pair.value}`).join("\n"));
  for (const request of document.requests) {
    const lines = [request.name ? `### ${request.name}` : "###", `${request.method} ${request.url}`];
    for (const header of request.headers) if (header.name.trim()) lines.push(`${header.name}: ${header.value}`);
    if (request.body !== "") lines.push("", request.body);
    blocks.push(lines.join("\n"));
  }
  return blocks.join("\n\n") + "\n";
}

// An unknown name stays as typed, so the failed request shows it.
export function substitute(text: string, variables: Pair[]): string {
  if (variables.length === 0 || !text.includes("{{")) return text;
  const values = new Map(variables.map((pair) => [pair.name, pair.value]));
  return text.replace(/\{\{\s*([\w.-]+)\s*\}\}/g, (match, key: string) => values.get(key) ?? match);
}
