# ADR-063: Moonrabbit Journal Encryption
**Date:** 2026-10-22
**Status:** Implemented

## Context
Moonrabbit is a password-protected journal built for quick entries ([brainstorm](../brainstorm/2026-10-22_moonrabbit.md)). WebOS has no backend and no secure hardware of its own: anything stored in OPFS can be copied with the profile, a backup zip or another page on the shared origin, and then attacked offline. Terminal history, session restore, scheduler jobs and window titles are stored or shown in plain text.

## Decision
**Layout.** Each journal is a folder `/home/Journal/{name}/`:
- `journal.json`: plain header `{ version, id, kdf: { iterations, salt }, wraps: { phrase, recovery }, inbox_public_key, inbox_private_wrapped }`.
- `index.bin`: encrypted index (entry id, date, mood, activities, tags, word count).
- `entries/{random}.bin`, `media/{random}.bin`: one encrypted blob per entry or attachment.
- `inbox/{random}.bin`: entries added while locked.

**Keys.**
- A random 256-bit AES-GCM **data key** encrypts everything (random 96-bit IV per write; additional data = journal id, item id, format version).
- The header wraps the data key twice: with a key derived from the **master phrase** (PBKDF2-HMAC-SHA256, 600,000 iterations, stored so it can rise) and with a 128-bit **recovery code** (HKDF). Changing the phrase rewraps only the data key.
- After unlock the data key is a non-extractable `CryptoKey` in memory only; locking drops it. Never in session, window state, localStorage or files.

**Quick unlock per device (optional).** Stored in IndexedDB, outside `/home` and outside backups:
- a passkey via WebAuthn PRF (`prf.eval.first` → HKDF → wrap), offered only when the provider returns a PRF result;
- otherwise a rabbit tap sequence or a 6-digit PIN: wrap key = HMAC(device key, PBKDF2(canonical input, salt, 600k)), the device key a non-extractable HMAC `CryptoKey` in IndexedDB.
- Five wrong attempts delete the quick wrap; the master phrase is required every 7 days and after a restore.

**Adding while locked.** The header holds an X25519 public key; its private key is wrapped by the data key. The widget and capture dialog encrypt with an ephemeral X25519 key pair → HKDF → AES-GCM into `inbox/`. Unlock merges the inbox into entries under the data key.

**No leaks.** Window titles stay generic ("Moonrabbit · locked" or a date); notifications and the reminder job never quote entries; no shell command reads or adds (only `journal lock`); no `ai: "read"` commands and no model use; session/window state holds no entry text.

**Auto-lock.** 5 min idle, 1 min hidden on desktop, immediately when hidden on a phone; adjustable.

## Alternatives Considered
- Argon2 via WASM: a new dependency; Chrome's Web Crypto doesn't ship Argon2.
- A single `.journal` container: atomic, but every save rewrites it.
- Mood and dates readable while locked: leaks feelings per day.
- A shell flag to keep `journal add` out of history: rejected by the owner; no shell add at all.
- Picture passwords, rhythm, drawn shapes: unstable input, low entropy.

## Consequences
- Forgotten phrase and lost recovery code = the journal is unreadable.
- Short quick-unlock secrets protect only against casual use of this browser; a full profile copy makes them attackable offline. The master phrase is the real protection.
- Entry count, sizes and file times are visible.
- Passkey quick unlock depends on the passkey provider supporting PRF.

## Revision 2026-10-22: part 1 built
Built as decided, with these details the ADR left open ([internals](../apps/moonrabbit.md)):
- **Recovery salt.** HKDF over the recovery code uses the journal id as its salt, so the header keeps the shape above and a phrase change can take a fresh `kdf.salt` without touching the recovery wrap.
- **Rewrapping needs a secret.** Web Crypto only wraps an extractable key, and the unlocked data key is not. Changing the phrase, making a new recovery code and setting up quick unlock unwrap the data key again from the phrase (or recovery code) just typed, as extractable, wrap it and drop that copy. Each of those therefore asks for the master phrase.
- **Iterations rise on unlock.** A stored count below 600,000 is rewrapped at the current count with a new salt the next time the phrase opens the journal. 600,000 measured at about 55 ms in headless Chromium on Apple silicon.
- **Quick-unlock key.** HKDF(HMAC(device key, PBKDF2-SHA256(secret, salt, 600,000))) for a path or PIN, HKDF(PRF output) for a passkey; the ADR's "HMAC(...)" is fed through HKDF to get an AES key. The Carrot patch's secret is the sequence of plants, so shuffling moves the plants, not the path.
- **Restore marker.** The quick-unlock record keeps `journal.json`'s `lastModified`. The app updates it on its own header writes; a restore (or any other rewrite) changes it and quick unlock waits for the master phrase.
- **Inbox key check.** Every unlock checks that the wrapped inbox private key matches `inbox_public_key`, so a header pointed at someone else's key is refused before part 2 ever encrypts to it.
- **Additional data** is `moonrabbit/1/{journal id}/{item}`; a `.bin` is one version byte, the IV, then ciphertext and tag.
- **Weak own phrases** (under about 40 bits by the meter) can't be used.
- **Own picker exception.** While a camera or device file chooser the editor opened is up, the hidden-lock waits: on a phone the camera hides the page, and locking then threw the photo away. The idle lock still runs. Approved by the owner (revision below).
- **One session per window.** Each window unlocks on its own; `journal lock` locks every window in the tab. Index writes take a Web Lock per journal so two windows don't drop each other's entries.


## Revision 2026-10-22: part 2 built
The locked inbox, mood and the views ([follow-up](../brainstorm/2026-10-22_moonrabbit.md#follow-up-2026-10-22-part-2), [internals](../apps/moonrabbit.md)):
- **Own picker exception approved** by the owner: the hidden-lock pauses only while the journal's own camera or file chooser is open; the idle lock still runs.
- **Inbox item format.** `inbox/{id}.bin` is one version byte, the 32-byte ephemeral X25519 public key, a 12-byte IV, then AES-GCM ciphertext and tag. The AES key is HKDF-SHA256 over the X25519 shared secret, salt = ephemeral public key ‖ journal public key, info `moonrabbit/inbox`; additional data `moonrabbit/1/{journal id}/inbox/{id}`, so an item renamed or copied into another journal fails its tag. The plaintext is `{ date, created, body, mood? }`: activities, energy and sleep need the journal's activity list, which is encrypted, so they're added after unlock.
- **Merge.** On unlock, and whenever the `inbox/` folder changes while unlocked, each item becomes an entry under the data key with the item's id as its entry id (a merge cut short, or two windows merging at once, never duplicates), the index is updated in one write, then the inbox files are deleted. An item that fails its tag or schema stays in `inbox/` and the journal says how many couldn't be read.
- **Activity list.** Custom names are as private as entries, so the list (id, name, icon, hidden) lives in the encrypted index as an optional `activities` field; absent means the defaults. Entries store activity ids, so a rename or a hide never rewrites an entry.
- **Editor.** Live formatting re-renders the `plaintext-only` editor as styled spans that keep every character (markers dimmed), so the stored body stays plain Markdown and the caret maps one to one. Re-rendering breaks the browser's undo, so the editor keeps its own undo history in memory (dropped on lock).
- **Not built: pinning the inbox key.** A writer while locked can't check `inbox_public_key` against the wrapped private key (that needs the data key), so a header edited to point at another key would receive locked captures until the next unlock refuses it. Pinning the verified key per device is an open decision for the owner.

## Revision 2026-10-22: quick unlock offered, rename and delete
- **Quick unlock is offered, not hidden in settings.** After the recovery-code step a new journal shows "Faster unlock on this device" (passkey when available, Carrot patch, PIN, or "Not now"), and the first master-phrase unlock on a device without a quick unlock offers it once; "Not now" there is remembered per device as a journal id in localStorage. Both use the phrase the user just typed, held only in that step's state, so the rewrap rule above still holds. The master phrase stays required at creation; quick unlock stays optional and one method per device.
- **Rename and delete need no secret.** The folder name is visible and the folder can be deleted in Files anyway; a lost phrase must not trap a journal. Delete asks for a danger confirm and the typed name, removes the folder permanently (WebOS has no trash), this device's quick record, and the reminder when no journal is left. Rename keeps the journal id, so no key, wrap or entry changes; the quick record's restore marker moves along only when the header text is unchanged by the folder copy.

## Revision 2026-10-22: spellcheck and the inbox key
Every Moonrabbit text box sets `spellcheck=false`, so Chrome's Enhanced spell check never sends journal text to Google. The inbox public key is not pinned per device: by the owner's call, a header swapped by someone with write access is out of scope.
