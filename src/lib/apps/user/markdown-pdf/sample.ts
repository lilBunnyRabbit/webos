export const SAMPLE = `# Field notes

A short tour of what this app lays out. Edit on the left, watch the pages on the right, then **Export PDF** and pick *Save as PDF* in the print dialog.

## Text

Paragraphs wrap to the page width you choose. Inline \`code\`, **bold**, *italic*, ~~struck~~ and [links](https://lilbunnyrabbit.github.io/brand/) all carry over.

> A quotation sits on its own, set off by a rule on the left.

## Lists

1. Pick a page size and orientation
2. Choose a template: Clean, Report or Notes
3. Turn on a table of contents for long documents

- [x] Headings become the contents
- [x] Page numbers go in the footer
- [ ] Images load from a web address

## Code

\`\`\`ts
export function count_pages(flow_height: number, box: PageBox): number {
  const content = box.height - 2 * box.margin;
  const gap = 2 * box.margin + PAGE_GAP_MM;
  return Math.max(1, Math.round((flow_height + gap) / (content + gap)));
}
\`\`\`

## Tables

| Page size | Width | Height |
|-----------|------:|-------:|
| A4 | 210 mm | 297 mm |
| Letter | 215.9 mm | 279.4 mm |

### Margins

Narrow is 12.7 mm, Normal 20 mm and Wide 30 mm on every side. Headers and footers sit inside the margin, so a narrow margin leaves them less room.

---

That's all. Replace this text with your own, or open a Markdown file.
`;
