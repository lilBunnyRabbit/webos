import { Asn1Error, Asn1Tag, expect_tag, hex, read_node, read_oid, read_string, read_time, type Asn1Node } from "./asn1";
import { base64_to_bytes } from "./base64";
import { relative_time } from "./time";

export interface Certificate {
  subject: string;
  issuer: string;
  serial: string;
  not_before: Date;
  not_after: Date;
  san: string[];
  key: string;
  signature: string;
  self_signed: boolean;
  is_ca: boolean;
  sha1: string;
  sha256: string;
}

export type CertParse = { ok: true; certificates: Certificate[] } | { ok: false; error: string };

export const CertState = { VALID: "valid", EXPIRED: "expired", NOT_YET: "not-yet" } as const;
export type CertState = (typeof CertState)[keyof typeof CertState];

const NAME_ATTRIBUTES: Record<string, string> = {
  "2.5.4.3": "CN",
  "2.5.4.4": "SN",
  "2.5.4.5": "serialNumber",
  "2.5.4.6": "C",
  "2.5.4.7": "L",
  "2.5.4.8": "ST",
  "2.5.4.9": "street",
  "2.5.4.10": "O",
  "2.5.4.11": "OU",
  "2.5.4.12": "title",
  "2.5.4.42": "GN",
  "2.5.4.97": "organizationIdentifier",
  "0.9.2342.19200300.100.1.25": "DC",
  "1.2.840.113549.1.9.1": "emailAddress",
};

const ALGORITHMS: Record<string, string> = {
  "1.2.840.113549.1.1.1": "RSA",
  "1.2.840.113549.1.1.5": "SHA-1 with RSA",
  "1.2.840.113549.1.1.10": "RSA-PSS",
  "1.2.840.113549.1.1.11": "SHA-256 with RSA",
  "1.2.840.113549.1.1.12": "SHA-384 with RSA",
  "1.2.840.113549.1.1.13": "SHA-512 with RSA",
  "1.2.840.10045.2.1": "EC",
  "1.2.840.10045.4.3.2": "ECDSA with SHA-256",
  "1.2.840.10045.4.3.3": "ECDSA with SHA-384",
  "1.2.840.10045.4.3.4": "ECDSA with SHA-512",
  "1.3.101.112": "Ed25519",
  "1.3.101.113": "Ed448",
};

const CURVES: Record<string, string> = {
  "1.2.840.10045.3.1.7": "P-256",
  "1.3.132.0.34": "P-384",
  "1.3.132.0.35": "P-521",
  "1.3.132.0.10": "secp256k1",
};

const EXTENSION_SAN = "2.5.29.17";
const EXTENSION_BASIC_CONSTRAINTS = "2.5.29.19";

const context_tag = (number: number, constructed: boolean) => 0x80 | (constructed ? 0x20 : 0) | number;

function read_name(node: Asn1Node): string {
  return expect_tag(node, Asn1Tag.SEQUENCE, "a name")
    .children.flatMap((set) => set.children)
    .map((pair) => {
      const [type, value] = pair.children;
      const oid = read_oid(expect_tag(type, Asn1Tag.OID, "a name attribute").content);
      return `${NAME_ATTRIBUTES[oid] ?? oid}=${value ? read_string(value) : ""}`;
    })
    .join(", ");
}

function read_ip(bytes: Uint8Array): string {
  if (bytes.length === 4) return bytes.join(".");
  const groups: string[] = [];
  for (let i = 0; i + 1 < bytes.length; i += 2) groups.push(((bytes[i] << 8) | bytes[i + 1]).toString(16));
  return groups.join(":");
}

const SAN_KINDS: Record<number, [string, (bytes: Uint8Array) => string]> = {
  [context_tag(1, false)]: ["email", (bytes) => new TextDecoder().decode(bytes)],
  [context_tag(2, false)]: ["DNS", (bytes) => new TextDecoder().decode(bytes)],
  [context_tag(6, false)]: ["URI", (bytes) => new TextDecoder().decode(bytes)],
  [context_tag(7, false)]: ["IP", read_ip],
};

function read_san(value: Uint8Array<ArrayBuffer>): string[] {
  return read_node(value).children.flatMap((name) => {
    const kind = SAN_KINDS[name.tag];
    return kind ? [`${kind[0]}:${kind[1](name.content)}`] : [];
  });
}

function rsa_bits(key: Uint8Array<ArrayBuffer>): number | null {
  try {
    const [modulus] = read_node(key).children;
    let bytes = modulus.content;
    while (bytes.length > 0 && bytes[0] === 0) bytes = bytes.subarray(1);
    return bytes.length === 0 ? 0 : (bytes.length - 1) * 8 + (32 - Math.clz32(bytes[0]));
  } catch {
    return null;
  }
}

function read_key(info: Asn1Node): string {
  const [algorithm, bits] = info.children;
  const [oid_node, params] = expect_tag(algorithm, Asn1Tag.SEQUENCE, "a key algorithm").children;
  const oid = read_oid(oid_node.content);
  const name = ALGORITHMS[oid] ?? oid;
  if (name === "EC" && params?.tag === Asn1Tag.OID) {
    const curve = read_oid(params.content);
    return `EC ${CURVES[curve] ?? curve}`;
  }
  if (name === "RSA" && bits?.tag === Asn1Tag.BIT_STRING) {
    const size = rsa_bits(bits.content.subarray(1));
    if (size) return `RSA ${size}-bit`;
  }
  return name;
}

async function fingerprint(algorithm: string, bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest(algorithm, bytes)), ":");
}

export async function parse_certificate(der: Uint8Array<ArrayBuffer>): Promise<Certificate> {
  const root = expect_tag(read_node(der), Asn1Tag.SEQUENCE, "a certificate");
  const [tbs, signature_algorithm] = root.children;
  const fields = expect_tag(tbs, Asn1Tag.SEQUENCE, "a certificate body").children;
  let index = fields[0]?.tag === context_tag(0, true) ? 1 : 0;
  const serial = expect_tag(fields[index++], Asn1Tag.INTEGER, "a serial number");
  index++;
  const issuer = read_name(fields[index++]);
  const [not_before, not_after] = expect_tag(fields[index++], Asn1Tag.SEQUENCE, "a validity period").children.map(read_time);
  const subject = read_name(fields[index++]);
  const key = read_key(expect_tag(fields[index++], Asn1Tag.SEQUENCE, "a public key"));

  let san: string[] = [];
  let is_ca = false;
  const extensions = fields.find((field) => field.tag === context_tag(3, true))?.children[0]?.children ?? [];
  for (const extension of extensions) {
    const [oid_node, ...rest] = extension.children;
    const value = rest.at(-1);
    if (!value || value.tag !== Asn1Tag.OCTET_STRING) continue;
    const oid = read_oid(oid_node.content);
    if (oid === EXTENSION_SAN) san = read_san(value.content);
    if (oid === EXTENSION_BASIC_CONSTRAINTS) {
      const [flag] = read_node(value.content).children;
      is_ca = flag?.tag === Asn1Tag.BOOLEAN && flag.content[0] !== 0;
    }
  }

  let serial_bytes = serial.content;
  while (serial_bytes.length > 1 && serial_bytes[0] === 0) serial_bytes = serial_bytes.subarray(1);
  const signature_oid = read_oid(signature_algorithm?.children[0]?.content ?? new Uint8Array());

  return {
    subject,
    issuer,
    serial: hex(serial_bytes, ":"),
    not_before,
    not_after,
    san,
    key,
    signature: ALGORITHMS[signature_oid] ?? signature_oid,
    self_signed: subject === issuer,
    is_ca,
    sha1: await fingerprint("SHA-1", root.raw),
    sha256: await fingerprint("SHA-256", root.raw),
  };
}

const PEM_BLOCK = /-----BEGIN CERTIFICATE-----([\s\S]*?)-----END CERTIFICATE-----/g;

export function certificate_blobs(input: string | Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer>[] | string {
  if (typeof input !== "string") {
    if (input[0] === Asn1Tag.SEQUENCE) return [input];
    input = new TextDecoder().decode(input);
  }
  const blocks = [...input.matchAll(PEM_BLOCK)];
  if (blocks.length > 0) {
    const decoded = blocks.map((block) => base64_to_bytes(block[1]));
    return decoded.every((bytes) => bytes !== null) ? decoded : "A PEM block isn't valid Base64";
  }
  if (/-----BEGIN [A-Z ]+-----/.test(input)) return "That PEM holds something other than a certificate";
  const bare = base64_to_bytes(input);
  return bare && bare.length > 0 ? [bare] : "Paste a PEM certificate, or pick a .pem, .crt or .der file";
}

export async function read_certificates(input: string | Uint8Array<ArrayBuffer>): Promise<CertParse> {
  const blobs = certificate_blobs(input);
  if (typeof blobs === "string") return { ok: false, error: blobs };
  try {
    return { ok: true, certificates: await Promise.all(blobs.map(parse_certificate)) };
  } catch (error) {
    if (error instanceof Asn1Error || error instanceof TypeError || error instanceof RangeError)
      return { ok: false, error: `Not an X.509 certificate: ${error.message}` };
    throw error;
  }
}

export function cert_state(cert: Certificate, now = Date.now()): { state: CertState; text: string } {
  if (cert.not_before.getTime() > now)
    return { state: CertState.NOT_YET, text: `Valid ${relative_time(cert.not_before.getTime(), now)}` };
  if (cert.not_after.getTime() <= now)
    return { state: CertState.EXPIRED, text: `Expired ${relative_time(cert.not_after.getTime(), now)}` };
  return { state: CertState.VALID, text: `Expires ${relative_time(cert.not_after.getTime(), now)}` };
}
