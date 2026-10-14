export const Section = {
  MERGE: "merge",
  ORGANIZE: "organize",
  SPLIT: "split",
  SIGN: "sign",
  IMAGES: "images",
  EXPORT: "export",
  SIGNATURES: "signatures",
} as const;
export type Section = (typeof Section)[keyof typeof Section];

export const SECTION_IDS = Object.values(Section) as [Section, ...Section[]];

export interface LaunchProps {
  section?: Section;
  path?: string;
  paths?: string[];
}

const IMAGE_NAME = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;

export function initial_section(props: LaunchProps): Section {
  if (props.section) return props.section;
  const paths = [...(props.paths ?? []), ...(props.path ? [props.path] : [])];
  if (paths.length && paths.every((path) => IMAGE_NAME.test(path))) return Section.IMAGES;
  if (paths.length > 1) return Section.MERGE;
  return Section.ORGANIZE;
}

export function launch_paths(props: LaunchProps): string[] {
  return [...(props.path ? [props.path] : []), ...(props.paths ?? [])];
}
