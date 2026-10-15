export interface Sort<K extends string> {
  key: K;
  desc: boolean;
}

export function next_sort<K extends string>(sort: Sort<K> | null, key: K): Sort<K> {
  return sort?.key === key ? { key, desc: !sort.desc } : { key, desc: key !== "name" };
}
