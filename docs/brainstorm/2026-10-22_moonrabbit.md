# Moonrabbit, a locked journal
**Date:** 2026-10-22
**Participants:** owner, Claude

## Context
Owner: "app idea. I want to start writing journals/diary. This needs to be password protected, optimized for quick entries and everything you would need in a journal - i dont really know what i never wrote it", then "think of other ways of password protection. Like some sort of different inputs like you have to unlock an android phone" and "Maybe like mood and stuff like that would be good here". The roadmap had "Night Journal" under AI-native apps (`2026-10-20_ai-native-apps.md`).

Investigation (feature research across Day One, Apple Journal, Daylio, 5-Minute Journal, Stoic, Journey, Penzu, bullet journaling; crypto research):
- Web Crypto has no Argon2 in Chrome (2026); PBKDF2-HMAC-SHA256 at 600,000 iterations is OWASP's figure. X25519 is in Web Crypto since Chrome 133. WebAuthn PRF has shipped since 2023; support depends on the passkey provider (Google Password Manager on Android, iCloud Keychain on macOS 15 with Chrome 132+; others vary).
- Rate limits mean nothing once the files are copied: a 4-digit PIN falls in under a second at 600k PBKDF2 on one GPU, a 3×3 pattern in ~26 s, 6 taps from 20 in ~70 min; a 5-word diceware phrase is out of reach; a passkey has no offline attack.
- Leaks to avoid: Terminal history is plain text (`shell/service.svelte.ts:143-148`); session restore saves window props and state; scheduler job text is plain (`jobs.json`); window titles show in the taskbar and switcher.
- Streak research: a broken streak lowers the chance people continue, so count days instead.

## Decisions
- **Name:** Moonrabbit (`moonrabbit`). Rejected: Night Journal, Form, Nest.
- **Scope (B):** an encrypted journal with a today box that opens focused, entry list, calendar heat map, On This Day, search after unlock, templates (Morning, Evening, Gratitude 3, Brain dump), one skippable rotating prompt, photos (`$kit/utils/picture`, encrypted), one scheduler reminder with generic text, export of a decrypted range to Markdown and print to PDF, several journals; **plus adding while locked** (widget "Write a line" with a mood tap, a capture dialog) through an X25519 inbox, so only reading needs a secret. Rejected: the locked diary without capture; the AI/voice/weather tier.
- **Mood (all of it):** 5-level mood tap; a mood tap alone counts as the day's entry; Daylio-style activities; Year in Pixels and a mood chart over weeks; optional energy and sleep sliders. "Days written this month" instead of a breakable streak.
- **Unlock:** master = a generated 5-word passphrase (re-rollable; own phrase allowed with a strength meter) + a 128-bit recovery code shown once (copy/print), both wrapping the random data key in the journal header. Per device, optional quick unlock: passkey/fingerprint via WebAuthn PRF when the provider returns it; otherwise the "Carrot patch" rabbit tap grid (6 hops on a 4×5 meadow, theme icons, not colour emoji) or a 6-digit PIN, mixed with a non-extractable device key in IndexedDB that never enters backups. Five wrong tries or 7 days → master phrase again; master required after a restore. Rejected: phrase + fingerprint only; own password only. Picture passwords, rhythm and drawn shapes rejected (unstable or weak).
- **Storage:** everything encrypted (entries, titles, mood, activities, tags, dates, the index) with AES-GCM per entry and attachment, additional data binding journal id, entry id and version; files in `/home/Journal/{journal}/` under random names; drafts autosave encrypted. Visible: entry count, sizes and file times. Rejected: a single `.journal` file; mood and dates readable while locked.
- **Auto-lock:** 5 min idle, 1 min hidden on desktop, immediately when hidden on a phone; lock button; adjustable. While locked the title is "Moonrabbit · locked" and nothing renders.
- **Shell:** only `journal lock`. No add or read commands (Terminal history is plain text). Rejected: a no-history command flag; palette-only add.
- **AI:** none. No `ai: "read"` commands, no model use. Rejected: an opt-in follow-up question; Ask reading while unlocked.

## Action items
- [ ] ADR-063 (journal format, key hierarchy, device key in IndexedDB).
- [ ] Builder 1: crypto core, format, unlock (master, recovery, passkey PRF, rabbit grid, PIN), auto-lock, today box, entries, list, search, templates, prompts, photos, export, reminder, several journals.
- [ ] Builder 2: mood (tap, activities, sliders, Year in Pixels, chart), calendar heat map, On This Day, the locked inbox with widget and capture dialog.

## Next session topics
- Voice memos, location and weather, a time capsule (entries that open later).
