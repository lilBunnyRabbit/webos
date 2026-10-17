import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import kernel from "$lib/core/api";
import { clear_opfs } from "$lib/core/api/services/files/opfs";
import { FilesService } from "$lib/core/api/services/files/service.svelte";
import { file_value } from "$lib/core/api/services/files/shell";
import type { CommandContext, Value } from "$lib/core/api/services/shell/type";
import { base64_to_bytes } from "./base64";
import { b64, cert, cron, hash, jwt, ts, uuid } from "./shell";

let files: FilesService;

beforeAll(() => {
  files = new FilesService();
  kernel.services.set("files", files);
});

beforeEach(async () => {
  await clear_opfs();
  await files.init();
});

afterAll(() => {
  kernel.services.delete("files");
});

function context<T>(args: T, piped: Value[] | null = null) {
  return {
    args,
    input: (async function* () {
      yield* piped ?? [];
    })(),
    piped: piped !== null,
    session: { cwd: "/home" },
    signal: new AbortController().signal,
    elevated: false,
  } as unknown as CommandContext<T>;
}

async function all(values: AsyncIterable<Value> | Iterable<Value>): Promise<Value[]> {
  const out: Value[] = [];
  for await (const value of values) out.push(value);
  return out;
}

async function write(name: string, content: string | Uint8Array<ArrayBuffer>) {
  const home = await files.get_directory("/home");
  await files.create_file(home!, name, { content: new Blob([content]), overwrite: true });
}

const JWT_IO =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";

const EC_BODY =
  "MIIB+jCCAaGgAwIBAgIIASNFZ4mrze8wCgYIKoZIzj0EAwIwOzELMAkGA1UEBhMCU0kxFzAVBgNVBAoMDmxpbEJ1bm55UmFiYml0MRMwEQYDVQQDDAp3ZWJvcy50ZXN0MB4XDTI2MDEwMTAwMDAwMFoXDTM2MDEwMTAwMDAwMFowOzELMAkGA1UEBhMCU0kxFzAVBgNVBAoMDmxpbEJ1bm55UmFiYml0MRMwEQYDVQQDDAp3ZWJvcy50ZXN0MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEE5Ky0LESPhZ3hUKh2lZ3jlcJb8OIjR7cpYzw1JGlcjSXscMfcwmwupHwHYwF2UQqb+S/B71UT0RpfVK7ZgXIVaOBjjCBizAdBgNVHQ4EFgQUBWcjw/FUKGodkKPDR/9VJMWdcbkwHwYDVR0jBBgwFoAUBWcjw/FUKGodkKPDR/9VJMWdcbkwDwYDVR0TAQH/BAUwAwEB/zA4BgNVHREEMTAvggp3ZWJvcy50ZXN0ggwqLndlYm9zLnRlc3SHBH8AAAGBDWhpQHdlYm9zLnRlc3QwCgYIKoZIzj0EAwIDRwAwRAIgWUI5pdjpYzmguTU9E3PU5+Z5NutsI/19UGgDh8mXZbECIBWOYhd46skRiP5UdlSsdlRMFDhjYz/4szEFE3Y3F8vC";
const EC_PEM = `-----BEGIN CERTIFICATE-----\n${EC_BODY}\n-----END CERTIFICATE-----\n`;

describe("jwt", () => {
  test("decodes, and verifies with --secret", async () => {
    const [plain] = await all(jwt(context({ token: JWT_IO })));
    expect(plain).toMatchObject({ status: "Never expires", signature: "not checked: give --secret", payload: { name: "John Doe" } });
    const [checked] = await all(jwt(context({ token: JWT_IO, secret: "your-256-bit-secret" })));
    expect(checked).toMatchObject({ signature: "verified" });
    const [wrong] = await all(jwt(context({ token: JWT_IO, secret: "nope" })));
    expect(wrong).toMatchObject({ signature: "doesn't match the secret" });
  });

  test("reads piped tokens and needs one", async () => {
    expect(await all(jwt(context({}, [JWT_IO, JWT_IO])))).toHaveLength(2);
    await expect(all(jwt(context({})))).rejects.toThrow(/give a token/);
    await expect(all(jwt(context({ token: "a.b" })))).rejects.toThrow(/three parts/);
  });
});

describe("ts", () => {
  test("converts typed and piped values", async () => {
    const [typed] = await all(ts(context({ value: ["1700000000"], zone: "UTC" })));
    expect(typed).toMatchObject({ unix: 1_700_000_000, iso: "2023-11-14T22:13:20.000Z", local: "2023-11-14 22:13:20 GMT", weekday: "Tuesday" });
    const [spaced] = await all(ts(context({ value: ["2026-10-17", "12:00Z"], zone: "UTC" })));
    expect(spaced).toMatchObject({ iso: "2026-10-17T12:00:00.000Z" });
    expect(await all(ts(context({ value: [], zone: "UTC" }, [1, "1700000000000"])))).toHaveLength(2);
  });

  test("now by default; rejects bad zones and dates", async () => {
    const [now] = await all(ts(context({ value: [] })));
    expect(now).toMatchObject({ relative: "now" });
    await expect(all(ts(context({ value: [], zone: "Mars/Base" })))).rejects.toThrow(/not a time zone/);
    await expect(all(ts(context({ value: ["soon"], zone: "UTC" })))).rejects.toThrow(/ts: soon/);
  });
});

describe("cron", () => {
  test("describes, then lists runs", async () => {
    const [text, ...runs] = await all(cron(context({ expression: ["0", "9", "*", "*", "1-5"], count: 3 })));
    expect(text).toBe("At 09:00, on Monday through Friday");
    expect(runs).toHaveLength(3);
    expect(runs[0]).toHaveProperty("iso");
  });

  test("says when it never runs, and rejects bad fields", async () => {
    expect(await all(cron(context({ expression: ["0 0 31 2 *"], count: 5 })))).toEqual([
      "At 00:00, on the 31st of the month, in February",
      "Never runs: no date matches every field",
    ]);
    await expect(all(cron(context({ expression: ["61 * * * *"], count: 1 })))).rejects.toThrow(/minute: 61/);
  });
});

describe("cert", () => {
  test("reads a PEM file, DER file and piped PEM", async () => {
    await write("site.pem", EC_PEM);
    await write("site.der", base64_to_bytes(EC_BODY)!);
    const [from_pem] = await all(cert(context({ paths: ["site.pem"] })));
    expect(from_pem).toMatchObject({ subject: "C=SI, O=lilBunnyRabbit, CN=webos.test", issuer: "self-signed", key: "EC P-256", ca: true });
    const [from_der] = await all(cert(context({ paths: ["/home/site.der"] })));
    expect(from_der).toEqual(from_pem);
    expect(await all(cert(context({ paths: [] }, [EC_PEM + EC_PEM])))).toHaveLength(2);
    expect(await all(cert(context({ paths: [] }, [file_value("/home/site.pem", "file")])))).toHaveLength(1);
  });

  test("errors name the problem", async () => {
    await write("notes.txt", "hello");
    await expect(all(cert(context({ paths: ["notes.txt"] })))).rejects.toThrow(/cert: /);
    await expect(all(cert(context({ paths: ["gone.pem"] })))).rejects.toThrow(/no such file/);
  });
});

describe("b64", () => {
  test("encodes and decodes text", async () => {
    expect(await all(b64(context({ text: ["hello", "world"], decode: false, url: false })))).toEqual(["aGVsbG8gd29ybGQ="]);
    expect(await all(b64(context({ text: ["aGVsbG8gd29ybGQ"], decode: true, url: false })))).toEqual(["hello world"]);
    expect(await all(b64(context({ text: [], decode: false, url: true }, ["??>"])))).toEqual(["Pz8-"]);
    await expect(all(b64(context({ text: ["*"], decode: true, url: false })))).rejects.toThrow(/b64: Not valid/);
  });

  test("encodes the bytes of piped files", async () => {
    await write("bin", new Uint8Array([0, 255, 1]));
    expect(await all(b64(context({ text: [], decode: false, url: false }, [file_value("/home/bin", "file")])))).toEqual(["AP8B"]);
  });
});

describe("hash", () => {
  const SHA256_ABC = "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";

  test("hashes a file, or the text when there's no such file", async () => {
    await write("abc.txt", "abc");
    expect(await all(hash(context({ inputs: ["abc.txt"], algorithm: "sha256" })))).toEqual([
      { algorithm: "sha256", hash: SHA256_ABC, of: "/home/abc.txt" },
    ]);
    expect(await all(hash(context({ inputs: ["abc"], algorithm: "sha256" })))).toEqual([
      { algorithm: "sha256", hash: SHA256_ABC, of: "abc" },
    ]);
    const [sha1] = await all(hash(context({ inputs: ["abc"], algorithm: "sha1" })));
    expect(sha1).toMatchObject({ hash: "a9993e364706816aba3e25717850c26c9cd0d89d" });
  });

  test("piped text and files; a missing file among real ones fails", async () => {
    await write("abc.txt", "abc");
    const rows = await all(hash(context({ inputs: [], algorithm: "sha256" }, ["abc", file_value("/home/abc.txt", "file")])));
    expect(rows.map((row) => (row as { hash: string }).hash)).toEqual([SHA256_ABC, SHA256_ABC]);
    await expect(all(hash(context({ inputs: ["abc.txt", "nope.txt"], algorithm: "sha256" })))).rejects.toThrow(/nope.txt: no such file/);
  });
});

test("uuid streams the asked count", async () => {
  const ids = await all(uuid(context({ count: 3, version: "v7" as const })));
  expect(ids).toHaveLength(3);
  expect(ids[0]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7/);
});
