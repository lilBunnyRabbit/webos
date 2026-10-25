import type { IconComponent } from "$lib/core/components/ui";
import {
  Code as CodeIcon,
  DiscordLogo as DiscordLogoIcon,
  GithubLogo as GithubLogoIcon,
  LinkedinLogo as LinkedinLogoIcon,
  Package as PackageIcon,
  Palette as PaletteIcon,
  RedditLogo as RedditLogoIcon,
  StackOverflowLogo as StackOverflowLogoIcon,
  XLogo as XLogoIcon,
} from "phosphor-svelte";
import { SocialKind } from "./content/types";

export const SOCIAL_ICONS: Record<SocialKind, IconComponent> = {
  [SocialKind.LINKEDIN]: LinkedinLogoIcon,
  [SocialKind.GITHUB]: GithubLogoIcon,
  [SocialKind.X]: XLogoIcon,
  [SocialKind.DISCORD]: DiscordLogoIcon,
  [SocialKind.STACK_OVERFLOW]: StackOverflowLogoIcon,
  [SocialKind.REDDIT]: RedditLogoIcon,
  [SocialKind.TYPEHERO]: CodeIcon,
  [SocialKind.NPM]: PackageIcon,
  [SocialKind.BRAND]: PaletteIcon,
};
