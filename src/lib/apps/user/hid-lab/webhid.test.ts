import { expect, test } from "vitest";
import { decode_report, ReportKind } from "./report";
import { count_collections, device_ids, reports_from_collections, type HidCollectionInfo, type HidReportItem } from "./webhid";

const item = (overrides: Partial<HidReportItem>): HidReportItem => ({
  isConstant: false,
  isArray: false,
  isAbsolute: true,
  isRange: false,
  usages: [],
  reportSize: 8,
  reportCount: 1,
  logicalMinimum: 0,
  logicalMaximum: 255,
  ...overrides,
});

test("reports_from_collections lays items out bit by bit per report ID and kind, across nested collections", () => {
  const collections: HidCollectionInfo[] = [
    {
      usagePage: 1,
      usage: 5,
      type: 1,
      inputReports: [
        {
          reportId: 2,
          items: [
            item({ isRange: true, usageMinimum: 0x90001, usageMaximum: 0x90004, reportSize: 1, reportCount: 4, logicalMaximum: 1 }),
            item({ isConstant: true, reportSize: 4 }),
          ],
        },
      ],
      children: [{ usagePage: 1, usage: 1, type: 0, inputReports: [{ reportId: 2, items: [item({ usages: [0x10030] })] }] }],
      featureReports: [{ reportId: 3, items: [item({})] }],
    },
  ];
  const reports = reports_from_collections(collections);
  expect(reports.map((report) => [report.kind, report.id, report.bits])).toEqual([
    [ReportKind.INPUT, 2, 16],
    [ReportKind.FEATURE, 3, 8],
  ]);
  expect(decode_report(reports[0], new Uint8Array([0b1001, 200]))).toEqual([
    { label: "Button 1", value: "1" },
    { label: "Button 2", value: "0" },
    { label: "Button 3", value: "0" },
    { label: "Button 4", value: "1" },
    { label: "X", value: "200" },
  ]);
  expect(count_collections(collections)).toBe(2);
});

test("device_ids", () => {
  expect(device_ids({ vendorId: 0x46d, productId: 0xc52b })).toBe("0x046D:0xC52B");
});
