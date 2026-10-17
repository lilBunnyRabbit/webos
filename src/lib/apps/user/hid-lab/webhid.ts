import { report_key, ReportKind, type Report } from "./report";
import { hex } from "./usages";

// WebHID isn't in TypeScript's DOM lib; these are the parts the lab reads.
export interface HidReportItem {
  isConstant: boolean;
  isArray: boolean;
  isAbsolute: boolean;
  isRange: boolean;
  usages?: number[];
  usageMinimum?: number;
  usageMaximum?: number;
  reportSize: number;
  reportCount: number;
  logicalMinimum: number;
  logicalMaximum: number;
}

export interface HidReportInfo {
  reportId: number;
  items?: HidReportItem[];
}

export interface HidCollectionInfo {
  usagePage: number;
  usage: number;
  type: number;
  children?: HidCollectionInfo[];
  inputReports?: HidReportInfo[];
  outputReports?: HidReportInfo[];
  featureReports?: HidReportInfo[];
}

export interface HidInputReportEvent extends Event {
  readonly device: HidDevice;
  readonly reportId: number;
  readonly data: DataView;
}

export interface HidDevice extends EventTarget {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
  readonly collections: HidCollectionInfo[];
  open(): Promise<void>;
  close(): Promise<void>;
  forget(): Promise<void>;
}

export interface HidConnectionEvent extends Event {
  readonly device: HidDevice;
}

export interface Hid extends EventTarget {
  getDevices(): Promise<HidDevice[]>;
  requestDevice(options: { filters: object[] }): Promise<HidDevice[]>;
}

export function get_hid(): Hid | null {
  return (navigator as Navigator & { hid?: Hid }).hid ?? null;
}

export function device_ids(device: Pick<HidDevice, "vendorId" | "productId">): string {
  return `${hex(device.vendorId, 4)}:${hex(device.productId, 4)}`;
}

export function device_name(device: Pick<HidDevice, "productName" | "vendorId" | "productId">): string {
  return device.productName || `Device ${device_ids(device)}`;
}

/** WebHID hands out parsed collections, never the raw descriptor, so live decoding builds its layout from these. */
export function reports_from_collections(collections: HidCollectionInfo[]): Report[] {
  const reports = new Map<string, Report>();
  const walk = (collection: HidCollectionInfo) => {
    const groups: [ReportKind, HidReportInfo[] | undefined][] = [
      [ReportKind.INPUT, collection.inputReports],
      [ReportKind.OUTPUT, collection.outputReports],
      [ReportKind.FEATURE, collection.featureReports],
    ];
    for (const [kind, infos] of groups) {
      for (const info of infos ?? []) {
        const key = report_key(kind, info.reportId);
        const report = reports.get(key) ?? { kind, id: info.reportId, bits: 0, fields: [] };
        reports.set(key, report);
        for (const item of info.items ?? []) {
          report.fields.push({
            bit_offset: report.bits,
            size: item.reportSize,
            count: item.reportCount,
            usages: item.isRange ? [] : (item.usages ?? []),
            usage_minimum: item.isRange ? (item.usageMinimum ?? null) : null,
            usage_maximum: item.isRange ? (item.usageMaximum ?? null) : null,
            logical_minimum: item.logicalMinimum,
            logical_maximum: item.logicalMaximum,
            constant: item.isConstant,
            array: item.isArray,
            relative: !item.isAbsolute,
          });
          report.bits += item.reportSize * item.reportCount;
        }
      }
    }
    collection.children?.forEach(walk);
  };
  collections.forEach(walk);
  return [...reports.values()];
}

export function count_collections(collections: HidCollectionInfo[]): number {
  return collections.reduce((sum, collection) => sum + 1 + count_collections(collection.children ?? []), 0);
}
