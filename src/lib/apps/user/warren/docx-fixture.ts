import { Method } from "$lib/core/utils/zip/format";
import { write_zip } from "$lib/core/utils/zip/write";

const W = `xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
const DRAWING =
  `xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" ` +
  `xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"`;
const RELS = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";

const run = (text: string, props = "") => `<w:r>${props ? `<w:rPr>${props}</w:rPr>` : ""}<w:t xml:space="preserve">${text}</w:t></w:r>`;

const PICTURE =
  `<w:r><w:drawing><wp:inline><wp:extent cx="952500" cy="952500"/><wp:docPr id="1" name="Picture 1" descr="Logo"/>` +
  `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic>` +
  `<pic:blipFill><a:blip r:embed="rIdImage"/></pic:blipFill></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`;

const DOCUMENT =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document ${W} ${DRAWING}><w:body>` +
  `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr>${run("Jane Doe")}</w:p>` +
  `<w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr>${run("Experience")}</w:p>` +
  `<w:p>${run("Led a ")}${run("small", "<w:b/>")}${run(" team, ")}${run("on time", "<w:i/>")}${run(" and ")}${run("on budget", '<w:u w:val="single"/>')}${run(".")}</w:p>` +
  `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run("Shipped the app")}</w:p>` +
  `<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr>${run("Hired three people")}</w:p>` +
  `<w:p>${run("See ")}<w:hyperlink r:id="rIdLink">${run("my site", '<w:rStyle w:val="Hyperlink"/>')}</w:hyperlink>${run(".")}</w:p>` +
  `<w:p>${PICTURE}</w:p>` +
  `<w:tbl><w:tr><w:tc><w:p>${run("Skill")}</w:p></w:tc><w:tc><w:p>${run("Level")}</w:p></w:tc></w:tr></w:tbl>` +
  `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` +
  `<w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr>${run("References")}</w:p>` +
  `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/></w:sectPr></w:body></w:document>`;

const STYLES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles ${W}>` +
  `<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style>` +
  `<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style>` +
  `<w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/></w:style>` +
  `<w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/></w:style>` +
  `</w:styles>`;

const NUMBERING =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering ${W}>` +
  `<w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum>` +
  `<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`;

const CONTENT_TYPES =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">` +
  `<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` +
  `<Default Extension="png" ContentType="image/png"/>` +
  `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`;

const PACKAGE_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rId1" Type="${RELS}/officeDocument" Target="word/document.xml"/></Relationships>`;

const DOCUMENT_RELS =
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">` +
  `<Relationship Id="rIdStyles" Type="${RELS}/styles" Target="styles.xml"/>` +
  `<Relationship Id="rIdNumbering" Type="${RELS}/numbering" Target="numbering.xml"/>` +
  `<Relationship Id="rIdImage" Type="${RELS}/image" Target="media/image1.png"/>` +
  `<Relationship Id="rIdLink" Type="${RELS}/hyperlink" Target="https://example.com/jane" TargetMode="External"/></Relationships>`;

const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFBQIAX8jx0gAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

export async function word_like_docx(): Promise<ArrayBuffer> {
  const now = new Date();
  const parts: [string, Blob][] = [
    ["[Content_Types].xml", new Blob([CONTENT_TYPES])],
    ["_rels/.rels", new Blob([PACKAGE_RELS])],
    ["word/document.xml", new Blob([DOCUMENT])],
    ["word/styles.xml", new Blob([STYLES])],
    ["word/numbering.xml", new Blob([NUMBERING])],
    ["word/_rels/document.xml.rels", new Blob([DOCUMENT_RELS])],
    ["word/media/image1.png", new Blob([PNG])],
  ];
  const zip = await write_zip(
    parts.map(([name, data]) => ({ name, data, modified: now })),
    { method: Method.DEFLATE }
  );
  return new Blob([zip]).arrayBuffer();
}
