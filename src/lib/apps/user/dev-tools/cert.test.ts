import { describe, expect, test } from "vitest";
import { Asn1Error, read_node, read_oid } from "./asn1";
import { base64_to_bytes } from "./base64";
import { CertState, cert_state, read_certificates, type Certificate } from "./cert";

const EC_PEM = `-----BEGIN CERTIFICATE-----
MIIB+jCCAaGgAwIBAgIIASNFZ4mrze8wCgYIKoZIzj0EAwIwOzELMAkGA1UEBhMC
U0kxFzAVBgNVBAoMDmxpbEJ1bm55UmFiYml0MRMwEQYDVQQDDAp3ZWJvcy50ZXN0
MB4XDTI2MDEwMTAwMDAwMFoXDTM2MDEwMTAwMDAwMFowOzELMAkGA1UEBhMCU0kx
FzAVBgNVBAoMDmxpbEJ1bm55UmFiYml0MRMwEQYDVQQDDAp3ZWJvcy50ZXN0MFkw
EwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAEE5Ky0LESPhZ3hUKh2lZ3jlcJb8OIjR7c
pYzw1JGlcjSXscMfcwmwupHwHYwF2UQqb+S/B71UT0RpfVK7ZgXIVaOBjjCBizAd
BgNVHQ4EFgQUBWcjw/FUKGodkKPDR/9VJMWdcbkwHwYDVR0jBBgwFoAUBWcjw/FU
KGodkKPDR/9VJMWdcbkwDwYDVR0TAQH/BAUwAwEB/zA4BgNVHREEMTAvggp3ZWJv
cy50ZXN0ggwqLndlYm9zLnRlc3SHBH8AAAGBDWhpQHdlYm9zLnRlc3QwCgYIKoZI
zj0EAwIDRwAwRAIgWUI5pdjpYzmguTU9E3PU5+Z5NutsI/19UGgDh8mXZbECIBWO
Yhd46skRiP5UdlSsdlRMFDhjYz/4szEFE3Y3F8vC
-----END CERTIFICATE-----`;

const RSA_PEM = `-----BEGIN CERTIFICATE-----
MIIDHDCCAgSgAwIBAgIBATANBgkqhkiG9w0BAQsFADAnMRMwEQYDVQQDDArFvWFi
YSBSb290MRAwDgYDVQQKDAdUZXN0aW5nMB4XDTIwMDEwMTAwMDAwMFoXDTIxMDEw
MTAwMDAwMFowJzETMBEGA1UEAwwKxb1hYmEgUm9vdDEQMA4GA1UECgwHVGVzdGlu
ZzCCASIwDQYJKoZIhvcNAQEBBQADggEPADCCAQoCggEBAMPcwe5bNUARMwa8KZmU
PsXV6pwl/fy0rHj/gKBDxcAPBqzGzyuX9fUi4W1gAB8cfHnaf3oV+bbmrjods9jC
OaVwnMwSCFQz5r4SeZe6Q3QI01971zfkg/YCoWRJ95YvdN99+Gvqe5x+dp6zUDBT
B9NEgA9Es9jg6P745/gi+q8aw8XWrUCf4NLi4w5+DvVehq5ql9tbsCQ5SI28yP6R
8XTkinEhNFSsANceCAws0xxfrOe0+0w9lAYCdOdd7MUVFOVnuGtIlbpU1tC8JcJE
M61tlRM2T35gUzj3arWK7zg/pn8JQTd5YMpvcHXm0mJlx8o1hm6SiaVaaliiTfvu
j2kCAwEAAaNTMFEwHQYDVR0OBBYEFOcHZIpDl1GYHBWwyaFmWI5l3PFOMB8GA1Ud
IwQYMBaAFOcHZIpDl1GYHBWwyaFmWI5l3PFOMA8GA1UdEwEB/wQFMAMBAf8wDQYJ
KoZIhvcNAQELBQADggEBAAQ9HkGWY8Zhsq2/wX14akkmLoTs4FnwXW5nrdf7wA0J
dIoh5x5QbRuuDkk/q5ya7p+slXSpt98s3oJtCBhcMbuUjwu1zKr26v9Ts+ykUDyR
8A1W0VgeG4YuY7k3X4cbWe+Fj3NwUCFNniTKPzpBoueVdKR5owMgLhwJ6NHQJW91
ya8XuZ3K1ns5Bcd8tbDzSK4WECx24MVZ+jzmk1tjrnfk1BATN16Ul/lOZ7NpuZds
uXHh1IpYEs8Zt9NtoRzR0K7LMgmZygktDmDnHlOfYYlnYIcqJBmyC3nkkv8TCnzz
YKNVB9SA/w9TqOfWtLmoOaFc1Svx4fcxomuTm4W5aXE=
-----END CERTIFICATE-----`;

async function certificates(input: string | Uint8Array<ArrayBuffer>): Promise<Certificate[]> {
  const result = await read_certificates(input);
  if (!result.ok) throw new Error(result.error);
  return result.certificates;
}

describe("asn1", () => {
  test("reads OIDs, including the first two arcs", () => {
    expect(read_oid(new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]))).toBe("1.2.840.113549.1.1.11");
    expect(read_oid(new Uint8Array([0x55, 0x1d, 0x11]))).toBe("2.5.29.17");
  });

  test("rejects truncated and indefinite lengths", () => {
    expect(() => read_node(new Uint8Array([0x30, 0x05, 0x02]))).toThrow(Asn1Error);
    expect(() => read_node(new Uint8Array([0x30, 0x80, 0x00, 0x00]))).toThrow(/Indefinite/);
  });
});

describe("read_certificates", () => {
  test("reads an EC certificate the way openssl does", async () => {
    const [cert] = await certificates(EC_PEM);
    expect(cert).toMatchObject({
      subject: "C=SI, O=lilBunnyRabbit, CN=webos.test",
      issuer: "C=SI, O=lilBunnyRabbit, CN=webos.test",
      serial: "01:23:45:67:89:AB:CD:EF",
      san: ["DNS:webos.test", "DNS:*.webos.test", "IP:127.0.0.1", "email:hi@webos.test"],
      key: "EC P-256",
      signature: "ECDSA with SHA-256",
      self_signed: true,
      is_ca: true,
      sha1: "04:DE:68:D7:C8:F0:1B:D8:EF:2D:4D:80:14:D2:D0:92:FA:F9:AB:15",
      sha256: "0E:64:6D:66:91:8C:F9:08:C9:58:5A:6E:90:8B:6A:27:52:F5:B5:E9:E2:3C:15:3E:10:0E:EA:22:90:8A:CB:17",
    });
    expect(cert.not_before.toISOString()).toBe("2026-01-01T00:00:00.000Z");
    expect(cert.not_after.toISOString()).toBe("2036-01-01T00:00:00.000Z");
  });

  test("reads RSA key size and UTF-8 names", async () => {
    const [cert] = await certificates(RSA_PEM);
    expect(cert).toMatchObject({
      subject: "CN=Žaba Root, O=Testing",
      serial: "01",
      key: "RSA 2048-bit",
      signature: "SHA-256 with RSA",
      san: [],
      sha256: "F4:40:2B:0A:5E:1F:14:EE:15:4F:53:3D:CF:FC:3F:CF:8B:ED:7F:A0:45:4E:8A:58:CE:50:1D:99:6D:14:01:AB",
    });
  });

  test("reads a chain, DER bytes and bare Base64", async () => {
    expect(await certificates(`${EC_PEM}\n${RSA_PEM}`)).toHaveLength(2);
    const body = EC_PEM.split("\n").slice(1, -1).join("");
    const der = base64_to_bytes(body);
    if (!der) throw new Error("fixture");
    expect((await certificates(der))[0].key).toBe("EC P-256");
    expect((await certificates(body))[0].key).toBe("EC P-256");
    expect((await certificates(new TextEncoder().encode(RSA_PEM)))[0].serial).toBe("01");
  });

  test("explains what it can't read", async () => {
    expect(await read_certificates("-----BEGIN PRIVATE KEY-----\nAAAA\n-----END PRIVATE KEY-----")).toEqual({
      ok: false,
      error: "That PEM holds something other than a certificate",
    });
    expect((await read_certificates("hello there")).ok).toBe(false);
    const broken = await read_certificates("MAMCAQE=");
    expect(broken.ok).toBe(false);
    if (!broken.ok) expect(broken.error).toMatch(/^Not an X.509 certificate/);
  });
});

describe("cert_state", () => {
  test("not yet, valid, expired", async () => {
    const [cert] = await certificates(EC_PEM);
    expect(cert_state(cert, Date.UTC(2025, 11, 1)).state).toBe(CertState.NOT_YET);
    expect(cert_state(cert, Date.UTC(2026, 9, 17))).toEqual({ state: CertState.VALID, text: "Expires in 9 years" });
    expect(cert_state(cert, Date.UTC(2037, 0, 1)).state).toBe(CertState.EXPIRED);
  });
});
