## Key tester

- Click or tap the big box, then press keys. It shows each key's name, code, location and modifiers, how long you held it and how often it repeated.
- While the box listens, WebOS shortcuts are paused so every key reaches it. Press **Esc twice** quickly, or click outside, to stop.
- **Held now** lists the keys down at this moment. Hold more and more at once: a key that doesn't appear was dropped by the keyboard, which is its rollover limit.
- **Layout** colours each key you've pressed, darker for more presses. Pick **ANSI** or **ISO** for your keyboard's shape; pressing the extra ISO key switches it for you. **Reset** clears the count.
- **Events** lists the latest presses and releases, newest first.
- Some combinations never reach a web page, like Alt+Tab, Cmd+Q or Fn. Their missing isn't the keyboard's fault.
- On a phone, the on-screen keyboard only reports the text it types, not real key codes.

## HID devices

- Press **Connect…** and pick a device from the browser's list. Devices you've allowed before show up on their own.
- Pick a device to see its collections and reports. **Listen** shows its input live, decoded field by field. **Forget** takes back the permission.
- Gamepads, macro pads and vendor interfaces work. Keyboards and mice connect, but the browser keeps their input to itself.
- This needs Chrome or Edge on a computer.

## Report descriptor

Paste a HID report descriptor as hex bytes, a `0x` list or a C array to read it item by item, with each report's fields and sizes. The **Samples** buttons load a few to start from. This part works in any browser.
