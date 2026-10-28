## Getting started

The first run makes a journal and shows a five-word master phrase and a recovery code. Keep both somewhere safe: nothing can reset them, and without one of them the journal can't be opened. **Use my own** lets you type your own phrase instead; a weak one is refused.

Then pick a faster way in on this device: a passkey (where the browser supports it), the **Carrot patch** (six hops across a meadow of plants) or a 6-digit PIN. It allows 5 wrong tries, and asks for the master phrase again if you haven't used it on this device for 7 days.

## Writing

- The box at the top has focus when the journal opens. Type a line and press Enter to save it as today's entry; Shift+Enter starts a new line.
- Tap a face to add your mood. A mood on its own is an entry too. **Activities** adds what you did, your energy and your sleep.
- **New** opens a blank entry or a template: Morning, Evening, Gratitude 3 or Brain dump. **Answer** starts an entry from the day's prompt, **Skip prompt** shows another.
- The editor saves as you type. Markdown shows as you write it: `#` headings, `-` lists, `**bold**`, `*italic*`. A `#word` anywhere tags the entry. Ctrl+Z undoes (Cmd+Z on a Mac).
- Paste or drop photos into an entry, or use **Add photo**. They're shrunk and encrypted with it.

## Looking back

- Search finds words in every entry; `#tag` searches tags only.
- **Calendar** and **Year** colour each day by its mood. **Insights** shows your mood week by week, and which activities, sleep and energy go with better days.
- **On this day** shows what you wrote on the same date before.

## While it's locked

**Add a quick line** on the lock screen, and the Moonrabbit widget, take a line or a mood without unlocking. It joins the journal the next time you unlock it.

## Locking and settings

- **Lock** locks right away, and closing the window locks too. On its own it locks after 5 minutes without use, and when hidden: after a minute on a computer, at once on a phone.
- **Journal settings** changes those times, the master phrase, the recovery code, the quick unlock, your activities and a daily reminder, and renames or deletes the journal.
- **Export** saves a range of dates as Markdown, or prints it. That file isn't encrypted.
- Journals live in `/home/Journal`, one folder each, and go into backups still encrypted. `journal lock` in the Terminal locks every open journal.
