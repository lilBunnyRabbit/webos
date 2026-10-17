import { page_size_label } from "$lib/apps/user/pdf-tools/geometry";
import { load_pdf } from "$lib/apps/user/pdf-tools/pdf";
import { format_bytes } from "$lib/core/utils";
import { Group, type Row } from "./groups";
import type { Inspection } from "./inspect";

const pad = (value: number) => String(value).padStart(2, "0");

function stamp(date: Date | undefined): string | null {
  if (!date || Number.isNaN(date.getTime())) return null;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function rows(entries: [string, string | null | undefined][]): Row[] {
  return entries.flatMap(([label, value]) => (value?.trim() ? [{ label, value: value.trim() }] : []));
}

export async function pdf_inspection(bytes: Uint8Array, name: string): Promise<Inspection> {
  const document = await load_pdf(bytes, name);
  const first = document.getPageCount() > 0 ? document.getPage(0).getSize() : null;
  const created = stamp(document.getCreationDate());
  const groups = [
    {
      title: Group.DOCUMENT,
      rows: rows([
        ["Format", "PDF"],
        ["Title", document.getTitle()],
        ["Author", document.getAuthor()],
        ["Subject", document.getSubject()],
        ["Keywords", document.getKeywords()],
        ["Pages", String(document.getPageCount())],
        ["Page size", first && page_size_label(first.width, first.height)],
        ["File size", format_bytes(bytes.length)],
        ["Created", created],
        ["Modified", stamp(document.getModificationDate())],
      ]),
    },
    {
      title: Group.SOFTWARE,
      rows: rows([
        ["Created with", document.getCreator()],
        ["Producer", document.getProducer()],
      ]),
    },
  ];
  return {
    format: "pdf",
    groups: groups.filter((group) => group.rows.length > 0),
    camera: null,
    date: created,
    gps: null,
    orientation: 1,
    removable: 0,
  };
}
