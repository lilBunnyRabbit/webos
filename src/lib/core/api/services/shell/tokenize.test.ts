import { describe, expect, it } from "vitest";
import { escape, split_stages, tokenize } from "./tokenize";

const values = (input: string) => tokenize(input).map((token) => token.value);

describe("tokenize", () => {
  it("splits on whitespace and keeps quoted text together", () => {
    expect(values(`cp "my file.txt"  'a b' c`)).toEqual(["cp", "my file.txt", "a b", "c"]);
  });

  it("treats an unquoted pipe as its own token", () => {
    const tokens = tokenize("ls|where name =~ a | count");
    expect(tokens.map((token) => token.value)).toEqual(["ls", "|", "where", "name", "=~", "a", "|", "count"]);
    expect(tokens.filter((token) => token.pipe)).toHaveLength(2);
    expect(values(`echo "a|b"`)).toEqual(["echo", "a|b"]);
  });

  it("escapes with backslashes outside quotes and inside double quotes", () => {
    expect(values(String.raw`cd My\ Files`)).toEqual(["cd", "My Files"]);
    expect(values(String.raw`echo "say \"hi\""`)).toEqual(["echo", 'say "hi"']);
    expect(values(String.raw`echo 'a\b'`)).toEqual(["echo", String.raw`a\b`]);
  });

  it("keeps positions and marks quoted tokens", () => {
    const [, second] = tokenize(`rm "-r"`);
    expect(second).toMatchObject({ value: "-r", start: 3, end: 7, quoted: true });
  });

  it("runs an unclosed quote to the end", () => {
    expect(values(`cd "My Fi`)).toEqual(["cd", "My Fi"]);
  });

  it("round-trips escaped values", () => {
    for (const value of ["plain", "with space", `quote"s`, "pi|pe", String.raw`back\slash`]) {
      expect(values(escape(value))).toEqual([value]);
    }
  });
});

describe("split_stages", () => {
  it("keeps empty stages so the parser can report them", () => {
    expect(split_stages(tokenize("a | | b")).map((stage) => stage.length)).toEqual([1, 0, 1]);
  });
});
