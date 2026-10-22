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
- [x] ADR-063 (journal format, key hierarchy, device key in IndexedDB).
- [x] Builder 1: crypto core, format, unlock (master, recovery, passkey PRF, rabbit grid, PIN), auto-lock, today box, entries, list, search, templates, prompts, photos, export, reminder, several journals.
- [x] Builder 2: mood (tap, activities, sliders, Year in Pixels, chart), calendar heat map, On This Day, the locked inbox with widget and capture dialog.
- [x] Live light formatting in the editor (follow-up below).
- [ ] Owner: pin the verified inbox key per device, or accept the gap (follow-up below).

## Follow-up 2026-10-22 (part 2)
Owner decisions after part 1:
- **Own picker exception approved.** The hidden-lock pauses only while the journal's own camera or file chooser is open; the idle lock still runs. Built in part 1, now confirmed (ADR-063 revision).
- **Live light formatting in the editor.** Headings, lists, bold and italic render as you type, live-preview style (markers stay, dimmed); the body is still stored as plain text with Markdown.
- **Shell:** still only `journal lock`; no add command.

Built in part 2:
- **Mood.** Five faces (Awful, Bad, Okay, Good, Great) on the today box, each entry, the widget and the capture box. A mood alone saves an entry titled "Feeling good" and counts as a day written. Activities: 15 defaults with Phosphor icons; add, rename, re-icon and hide in Journal settings › Activities, stored in the encrypted index. Energy (0 to 10) and sleep (0 to 14 h) sliders, unset until touched.
- **Views** (Entries, Calendar, Year, Insights): a month heat map coloured by the day's average mood (secondary for low, primary for high, neutral for okay, an outline for written without a mood); Year in Pixels (months as columns on a phone, rows in a wide window; tap a day for its entries); weekly average mood as a line and area over 3, 6 or 12 months; activities ranked by average mood with against without; sleep and energy split at the median; On This Day above the entry list (same date in earlier years, same day in the last eleven months).
- **Adding while locked.** A widget (desktop and phone home) with the five faces, where a tap saves at once with Undo, and "Write a line" opening the capture box; the locked screen's "Add a quick line". Both seal into `inbox/` with the public key. The next unlock merges them and says "N new entries since last unlock".

Open for the owner:
- **Pinning the inbox key.** The locked writer trusts `inbox_public_key` from `journal.json`; it can't check the key without the data key. Someone who can rewrite the header could point it at their own key and read lines captured while locked until the next unlock, which refuses the header. Options: (a) accept it, as now; (b) remember the verified key per device at every unlock, in the existing IndexedDB database (a new `inbox` store, DB version 2), and refuse to write when the header differs; (c) the same in localStorage. Recommendation: (b), next to the quick-unlock records and out of backups. Against it: one more store for an attack that already needs write access to the files.

## Next session topics
- Voice memos, location and weather, a time capsule (entries that open later).

## Follow-up 2026-10-22: after part 2
- **Inbox key not pinned (decided).** Locked capture trusts `inbox_public_key` in `journal.json`; someone who can rewrite the header could swap in their own key and read lines captured until the next unlock, which refuses the changed header. Owner: "this really is that no one can just directly access it and can encrypt it on other devices. if someones to go ahead and swap headers - go ahead". Rejected: pinning the key per device in IndexedDB or localStorage.
- **Spellcheck off (decided).** The today box, editor, capture box, search and activity names set `spellcheck=false`, so Chrome's opt-in Enhanced spell check never sends journal text to Google. Rejected: keeping spellcheck.
