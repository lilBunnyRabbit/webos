/** RFC 9285 Base45: bytes as QR alphanumeric characters, about 30% denser in a QR than base64 in byte mode. */
const BASE45 = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:";

export function to_base45(bytes: Uint8Array): string {
  let text = "";
  for (let index = 0; index < bytes.length; index += 2) {
    if (index + 1 === bytes.length) {
      const value = bytes[index];
      text += BASE45[value % 45] + BASE45[Math.floor(value / 45)];
    } else {
      const value = bytes[index] * 256 + bytes[index + 1];
      text += BASE45[value % 45] + BASE45[Math.floor(value / 45) % 45] + BASE45[Math.floor(value / 2025)];
    }
  }
  return text;
}

export function from_base45(text: string): Uint8Array {
  const digits = Array.from(text, (char) => BASE45.indexOf(char));
  if (digits.includes(-1) || digits.length % 3 === 1) throw new Error("not base45");
  const bytes: number[] = [];
  for (let index = 0; index < digits.length; index += 3) {
    const [c, d, e] = digits.slice(index, index + 3);
    if (e === undefined) {
      const value = c + d * 45;
      if (value > 255) throw new Error("not base45");
      bytes.push(value);
    } else {
      const value = c + d * 45 + e * 2025;
      if (value > 65535) throw new Error("not base45");
      bytes.push(value >> 8, value & 255);
    }
  }
  return Uint8Array.from(bytes);
}
