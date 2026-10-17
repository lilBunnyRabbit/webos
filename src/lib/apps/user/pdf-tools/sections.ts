import { is_image_name } from "./naming";

export const Section = {
  MERGE: "merge",
  ORGANIZE: "organize",
  SPLIT: "split",
  SIGN: "sign",
  IMAGES: "images",
  EXPORT: "export",
  SIGNATURES: "signatures",
  TEST_PDF: "test-pdf",
} as const;
export type Section = (typeof Section)[keyof typeof Section];

export const SECTION_IDS = Object.values(Section) as [Section, ...Section[]];

export interface LaunchProps {
  section?: Section;
  path?: string;
  paths?: string[];
  signature?: string;
}

export function initial_section(props: LaunchProps): Section {
  if (props.section) return props.section;
  if (props.signature) return Section.SIGN;
  const paths = [...(props.paths ?? []), ...(props.path ? [props.path] : [])];
  if (paths.length && paths.every(is_image_name)) return Section.IMAGES;
  if (paths.length > 1) return Section.MERGE;
  return Section.ORGANIZE;
}

export function launch_paths(props: LaunchProps): string[] {
  return [...(props.path ? [props.path] : []), ...(props.paths ?? [])];
}
