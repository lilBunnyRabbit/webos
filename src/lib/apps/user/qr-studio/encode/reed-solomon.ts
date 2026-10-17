const PRIMITIVE = 0x11d;

// Doubled so a product's log sum never needs a modulo.
export const EXP = new Uint8Array(512);
export const LOG = new Uint8Array(256);

{
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP[i] = x;
    LOG[x] = i;
    x <<= 1;
    if (x & 0x100) x ^= PRIMITIVE;
  }
  for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255];
}

export function gf_multiply(a: number, b: number): number {
  return a === 0 || b === 0 ? 0 : EXP[LOG[a] + LOG[b]];
}

export function generator(degree: number): number[] {
  let poly = [1];
  for (let i = 0; i < degree; i++) {
    const next = new Array<number>(poly.length + 1).fill(0);
    poly.forEach((coefficient, j) => {
      next[j] ^= coefficient;
      next[j + 1] ^= gf_multiply(coefficient, EXP[i]);
    });
    poly = next;
  }
  return poly.slice(1);
}

export function remainder(data: readonly number[], divisor: readonly number[]): number[] {
  const out = new Array<number>(divisor.length).fill(0);
  for (const byte of data) {
    const factor = byte ^ (out.shift() ?? 0);
    out.push(0);
    if (factor !== 0) divisor.forEach((coefficient, i) => (out[i] ^= gf_multiply(coefficient, factor)));
  }
  return out;
}
