import { arg } from "$lib/core/api/services/shell/arg";
import { define_command } from "$lib/core/api/services/shell/define";
import { z } from "zod";
import type { ShellContribution } from "$lib/core/api/services/shell/type";

const logic = () => import("./shell");

export default {
  commands: [
    define_command({
      id: "jwt",
      description: "Decode a JWT: header, payload, expiry; --secret checks an HS256/384/512 signature",
      args: z.object({
        token: z.string().optional().describe("The token, or the ones piped in"),
        secret: z.string().optional().describe("Shared secret to verify the signature with"),
      }),
      positional: ["token"],
      short: { secret: "s" },
      async *run(context) {
        yield* (await logic()).jwt(context);
      },
    }),
    define_command({
      id: "ts",
      description: "Convert a Unix timestamp (s, ms, µs or ns) or a date; now by default",
      args: z.object({
        value: z.array(z.string()).default([]).describe("Timestamp or date, or the ones piped in"),
        zone: z.string().optional().describe("Time zone for local, like Europe/Ljubljana; this device's by default"),
      }),
      positional: ["value"],
      short: { zone: "z" },
      async *run(context) {
        yield* (await logic()).ts(context);
      },
    }),
    define_command({
      id: "cron",
      description: "Describe a cron expression in plain English and list its next runs",
      args: z.object({
        expression: z.array(z.string()).default([]).describe("Five fields or a macro like @daily, or the ones piped in"),
        count: z.number().int().min(1).default(5).describe("Runs to list, up to 100"),
      }),
      positional: ["expression"],
      short: { count: "n" },
      async *run(context) {
        yield* (await logic()).cron(context);
      },
    }),
    define_command({
      id: "cert",
      description: "Read X.509 certificates: subject, issuer, names, validity, key and fingerprints",
      args: z.object({ paths: z.array(arg.path()).default([]).describe("PEM or DER files, or the files or PEM piped in") }),
      positional: ["paths"],
      async *run(context) {
        yield* (await logic()).cert(context);
      },
    }),
    define_command({
      id: "b64",
      description: "Base64-encode text or piped files; -d decodes",
      args: z.object({
        text: z.array(z.string()).default([]).describe("Text, or what's piped in"),
        decode: z.boolean().default(false).describe("Decode instead; either alphabet, padding optional"),
        url: z.boolean().default(false).describe("URL-safe alphabet, no padding"),
      }),
      positional: ["text"],
      short: { decode: "d", url: "u" },
      async *run(context) {
        yield* (await logic()).b64(context);
      },
    }),
    define_command({
      id: "hash",
      description: "Hash files, or text when no such file exists",
      args: z.object({
        inputs: z.array(arg.path()).default([]).describe("Files or text, or what's piped in"),
        algorithm: z.enum(["sha1", "sha256", "sha384", "sha512"]).default("sha256"),
      }),
      positional: ["inputs"],
      short: { algorithm: "a" },
      async *run(context) {
        yield* (await logic()).hash(context);
      },
    }),
    define_command({
      id: "uuid",
      description: "Generate UUIDs: v4 random, or v7 time-ordered",
      args: z.object({
        count: z.number().int().min(1).default(1).describe("How many, up to 1000"),
        version: z.enum(["v4", "v7"]).default("v4"),
      }),
      short: { count: "n", version: "v" },
      async *run(context) {
        yield* (await logic()).uuid(context);
      },
    }),
  ],
} satisfies ShellContribution;
