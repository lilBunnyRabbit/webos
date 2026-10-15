export type Run = [count: number, index: number];

export function encode_rle(data: ArrayLike<number>): Run[] {
  const runs: Run[] = [];
  for (let i = 0; i < data.length; ) {
    const index = data[i];
    let end = i + 1;
    while (end < data.length && data[end] === index) end++;
    runs.push([end - i, index]);
    i = end;
  }
  return runs;
}

export function decode_rle(runs: readonly (readonly [number, number])[], length: number): Uint8Array {
  const data = new Uint8Array(length);
  let offset = 0;
  for (const [count, index] of runs) {
    if (offset + count > length) throw new Error("Cel data is longer than the cel");
    data.fill(index, offset, offset + count);
    offset += count;
  }
  if (offset !== length) throw new Error("Cel data is shorter than the cel");
  return data;
}
