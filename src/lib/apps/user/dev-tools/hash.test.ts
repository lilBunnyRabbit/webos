import { describe, expect, test } from "vitest";
import { HashAlgorithm, digest_all } from "./hash";

describe("digest_all", () => {
  test("gives the known digests of 'abc' in algorithm order", async () => {
    const results = await digest_all("abc");
    expect(results.map((result) => result.algorithm)).toEqual([
      HashAlgorithm.SHA_1,
      HashAlgorithm.SHA_256,
      HashAlgorithm.SHA_384,
      HashAlgorithm.SHA_512,
    ]);
    expect(results[0].hex).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
    expect(results[1].hex).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(results[2].hex).toHaveLength(96);
    expect(results[3].hex).toHaveLength(128);
  });

  test("hashes strings as UTF-8, the same as their bytes", async () => {
    const bytes = new TextEncoder().encode("čšž 🐰");
    expect(await digest_all("čšž 🐰")).toEqual(await digest_all(bytes));
  });
});
