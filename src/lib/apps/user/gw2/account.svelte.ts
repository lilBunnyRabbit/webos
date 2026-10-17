import type { Snippet } from "svelte";
import { token_info, type TokenInfo } from "./api";
import { Resource } from "./resource.svelte";
import type { Section } from "./sections";

export class Account {
  readonly key: { value: string };
  readonly token: Resource<TokenInfo>;

  constructor(key: { value: string }) {
    this.key = key;
    this.token = new Resource((max_age) => token_info(this.key.value, max_age));
  }

  get permissions(): string[] {
    return this.token.data?.permissions ?? [];
  }
}

export interface SectionProps {
  account: Account;
  picker: Snippet;
  active: boolean;
  onnavigate: (section: Section) => void;
}
