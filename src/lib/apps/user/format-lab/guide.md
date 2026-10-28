## Comparing

- Open an image with the folder button, **From device…**, by dropping or pasting it, or with **Open with** on a picture. All four formats start encoding at once; a progress toast lets you cancel.
- Drag the divider across the picture to compare. Pick what sits on each side from the two lists above it: the source or any format on the left, a format on the right. **Show** on a card puts that format on the right.
- **Heatmap** colours the right side where it lost the most detail compared with the source.

## Reading the cards

- **Size** and **Of source** say how big the file is and how it compares to the original. **Time** is how long it took to encode.
- **SSIM** scores how close it looks to the source: 1 is identical, lower means more was lost.
- Change **Quality**, effort or **Lossless** on a card, then press **Encode** to redo just the formats you changed. Your settings are kept for next time.

## Saving

- **Save** on a card, or **Save all**. An image opened from your files saves next to it, with a new name if one is taken. A dropped or pasted image asks where to go, starting in Pictures.

## Inspect

**Inspect** shows what an AVIF or JPEG XL file says about itself: size, bit depth, transparency, animation, colour and HDR. These files open there first.

## In the Terminal

`convert photo.png --to avif` turns images, or every image in a folder, into AVIF, JPEG XL (`jxl`), WebP, JPEG or PNG. Add `-q 80` for the quality and `-o folder` for where to write; by default the new files go next to the originals and never replace a file.
