import {
  calendar_weeks,
  date_of,
  day_minutes,
  day_span,
  format_hours,
  is_weekend,
  month_minutes,
  sorted_entries,
  worked_days,
  type MonthFile,
} from "./data";
import { escape_html } from "$lib/core/utils";

export function month_label(month: string): string {
  return date_of(`${month}-01`).toLocaleDateString([], { month: "long", year: "numeric" });
}

const weekday = (day: string) => date_of(day).toLocaleDateString([], { weekday: "short" });
const day_label = (day: string) => date_of(day).toLocaleDateString([], { dateStyle: "medium" });

// Paper, not the screen: plain greys on white whatever the OS theme is, and no fonts the print frame can't load.
const STYLE = `
@page { size: A4; margin: 16mm 14mm 18mm; @bottom-right { content: counter(page) " / " counter(pages); font: 8pt system-ui, sans-serif; color: #666; } }
* { box-sizing: border-box; }
html { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
body { margin: 0; font: 9.5pt/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; color: #111; background: #fff; }
header { display: flex; justify-content: space-between; align-items: end; gap: 12mm; padding-bottom: 4mm; border-bottom: 1.5pt solid #111; }
h1 { margin: 0; font-size: 18pt; font-weight: 700; letter-spacing: -0.01em; }
h1 small { display: block; font-size: 9pt; font-weight: 500; color: #555; letter-spacing: 0.08em; text-transform: uppercase; }
dl { display: grid; grid-template-columns: auto auto; gap: 1mm 6mm; margin: 0; font-variant-numeric: tabular-nums; }
dt { color: #555; }
dd { margin: 0; text-align: right; font-weight: 600; }
table { width: 100%; margin-top: 5mm; border-collapse: collapse; font-variant-numeric: tabular-nums; }
thead { display: table-header-group; }
th { padding: 1.6mm 2mm; border-bottom: 1pt solid #111; font-size: 7.5pt; font-weight: 600; letter-spacing: 0.06em; text-align: left; text-transform: uppercase; color: #444; }
td { padding: 1.1mm 2mm; border-bottom: 0.5pt solid #ddd; vertical-align: top; }
tr { break-inside: avoid; }
.num { text-align: right; white-space: nowrap; }
.time { white-space: nowrap; }
.day { white-space: nowrap; }
.day span { display: inline-block; width: 8mm; color: #666; }
.weekend td { background: #f3f3f3; color: #666; }
.empty { color: #aaa; }
.work { color: #333; }
.week td { border-bottom: 1pt solid #999; background: #fafafa; font-weight: 600; font-size: 8.5pt; }
.total td { border-top: 1.5pt solid #111; border-bottom: 0; font-size: 10.5pt; font-weight: 700; }
section { margin-top: 9mm; break-before: auto; }
h2 { margin: 0 0 3mm; padding-bottom: 2mm; border-bottom: 1pt solid #111; font-size: 12pt; }
article { padding: 2.5mm 0; border-bottom: 0.5pt solid #ddd; break-inside: avoid; }
article h3 { display: flex; justify-content: space-between; margin: 0 0 1mm; font-size: 9.5pt; }
article h3 span { color: #555; font-weight: 500; font-variant-numeric: tabular-nums; }
article p { margin: 0; white-space: pre-wrap; }
footer { margin-top: 6mm; color: #777; font-size: 7.5pt; }
`;

export interface ReportOptions {
  generated: Date;
}

export function month_report_html(file: MonthFile, options: ReportOptions): string {
  const title = month_label(file.month);
  const total = month_minutes(file);

  const rows = calendar_weeks(file.month).flatMap(({ week, days }) => {
    const own = days.filter((day) => day !== null);
    const lines = own.map((day) => {
      const data = file.days[day];
      const span = day_span(data);
      const minutes = day_minutes(data);
      const work = [
        ...new Set(
          sorted_entries(data)
            .map((entry) => entry.description.trim())
            .filter(Boolean)
        ),
      ].join("; ");
      const date = `<td class="day"><span>${escape_html(weekday(day))}</span>${Number(day.slice(8))}.</td>`;
      if (!span)
        return `<tr class="${is_weekend(day) ? "weekend" : ""}">${date}<td class="empty">–</td><td class="empty">–</td><td class="num empty">–</td><td></td></tr>`;
      return `<tr class="${is_weekend(day) ? "weekend" : ""}">${date}<td class="time">${span.start}</td><td class="time">${span.end}</td><td class="num">${format_hours(minutes)}</td><td class="work">${escape_html(work)}</td></tr>`;
    });
    const week_total = own.reduce((sum, day) => sum + day_minutes(file.days[day]), 0);
    return [
      ...lines,
      `<tr class="week"><td colspan="3">Week ${week}</td><td class="num">${format_hours(week_total)}</td><td></td></tr>`,
    ];
  });

  const notes = Object.entries(file.days)
    .filter(([, day]) => day.note.trim())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(
      ([key, day]) =>
        `<article><h3>${escape_html(day_label(key))}<span>${format_hours(day_minutes(day))}</span></h3><p>${escape_html(day.note.trim())}</p></article>`
    );

  const target = file.target_hours;
  const summary = [
    `<dt>Total</dt><dd>${format_hours(total)}</dd>`,
    target !== null
      ? `<dt>Target</dt><dd>${format_hours(target * 60)} (${target ? Math.round((total / (target * 60)) * 100) : 100}%)</dd>`
      : "",
    `<dt>Days worked</dt><dd>${worked_days(file)}</dd>`,
  ].join("");

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Time sheet ${escape_html(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<header><h1><small>Time sheet</small>${escape_html(title)}</h1><dl>${summary}</dl></header>
<table>
<colgroup><col style="width:18%"><col style="width:10%"><col style="width:10%"><col style="width:11%"><col></colgroup>
<thead><tr><th>Date</th><th>In</th><th>Out</th><th class="num">Hours</th><th>Work</th></tr></thead>
<tbody>
${rows.join("\n")}
<tr class="total"><td colspan="3">Total</td><td class="num">${format_hours(total)}</td><td></td></tr>
</tbody>
</table>
${notes.length ? `<section><h2>Notes</h2>${notes.join("\n")}</section>` : ""}
<footer>Generated ${escape_html(options.generated.toLocaleString([], { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }))}</footer>
</body>
</html>`;
}
