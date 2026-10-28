## Making a code

- Pick what the code holds (Link, Text, Wi-Fi, Contact, Email, Phone or UPN payment) and fill in the fields. The code updates as you type.
- The badge under it says whether the code reads back right. If it says it doesn't scan, check the colours and the quiet zone.
- Choose PNG or SVG in the toolbar, then copy the image or **Save…** it to your files.
- Higher error correction survives more damage but makes a bigger code. **Module size** sets the image size.

## How it works

Press **How it's built** under a code, or switch to **How it works**, to follow your own text (up to 600 characters) in eight steps: the bits, the error correction, where each bit goes and which mask is chosen. Press Play, or drag the slider, to watch the bits fill in.

In the Terminal, `qr "some text"` saves a code as `qr.png`; `-o` picks another file or a `.svg`.
