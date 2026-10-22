import { from_base64, random_bytes, to_base64 } from "./crypto";

export class NoPrfError extends Error {
  constructor() {
    super("This passkey provider can't unlock a journal. Try another one, or use a pattern or PIN.");
    this.name = "NoPrfError";
  }
}

interface PrfOutputs {
  enabled?: boolean;
  results?: { first?: BufferSource };
}

/** Chrome reports PRF support up front; without that answer the option stays hidden rather than failing later. */
export async function passkey_available(): Promise<boolean> {
  if (typeof PublicKeyCredential === "undefined" || !("getClientCapabilities" in PublicKeyCredential)) return false;
  try {
    const capabilities = await PublicKeyCredential.getClientCapabilities();
    return capabilities["extension:prf"] === true;
  } catch {
    return false;
  }
}

function prf_of(credential: PublicKeyCredential): PrfOutputs | undefined {
  return (credential.getClientExtensionResults() as { prf?: PrfOutputs }).prf;
}

function bytes_of(source: BufferSource): Uint8Array<ArrayBuffer> {
  const view = source instanceof ArrayBuffer ? new Uint8Array(source) : new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  return new Uint8Array(view);
}

export async function passkey_prf(credential_id: string, salt: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
  const credential = (await navigator.credentials.get({
    publicKey: {
      challenge: random_bytes(32),
      allowCredentials: [{ type: "public-key", id: from_base64(credential_id) }],
      userVerification: "required",
      extensions: { prf: { eval: { first: salt } } },
    },
  })) as PublicKeyCredential | null;
  const first = credential && prf_of(credential)?.results?.first;
  if (!first) throw new NoPrfError();
  return bytes_of(first);
}

/** Chrome 132+; not in TypeScript's DOM types yet. */
interface SignalApi {
  signalUnknownCredential(options: { rpId: string; credentialId: string }): Promise<void>;
}

/** A passkey that can't unlock anything shouldn't stay in the user's password manager. */
async function forget(raw_id: ArrayBuffer): Promise<void> {
  const credentialId = to_base64(new Uint8Array(raw_id)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  await (PublicKeyCredential as unknown as SignalApi).signalUnknownCredential({ rpId: location.hostname, credentialId }).catch(() => undefined);
}

/** Some providers return the PRF output while creating; the rest only say `enabled` and need one sign-in. */
export async function create_passkey(label: string, salt: Uint8Array<ArrayBuffer>): Promise<{ credential_id: string; prf: Uint8Array<ArrayBuffer> }> {
  const credential = (await navigator.credentials.create({
    publicKey: {
      rp: { name: "WebOS Moonrabbit" },
      user: { id: random_bytes(16), name: label, displayName: label },
      challenge: random_bytes(32),
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: { residentKey: "discouraged", userVerification: "required" },
      extensions: { prf: { eval: { first: salt } } },
    },
  })) as PublicKeyCredential | null;
  if (!credential) throw new NoPrfError();
  const credential_id = to_base64(new Uint8Array(credential.rawId));
  const prf = prf_of(credential);
  if (prf?.results?.first) return { credential_id, prf: bytes_of(prf.results.first) };
  if (!prf?.enabled) {
    await forget(credential.rawId);
    throw new NoPrfError();
  }
  return { credential_id, prf: await passkey_prf(credential_id, salt) };
}
