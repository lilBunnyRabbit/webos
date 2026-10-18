import kernel, { NotificationType, type FilesService, type NotificationsService, type SettingsService } from "$lib/core/api";
import { parent_path, resolve_path } from "$lib/core/api/services/files/path";
import { assert_writable, file_value, type FileValue } from "$lib/core/api/services/files/shell";
import { ArgKind } from "$lib/core/api/services/shell/arg";
import { ShellError, type CommandContext, type Completion, type ShellService, type ShellSession } from "$lib/core/api/services/shell/type";
import { is_image_file } from "$kit/utils/image";
import { DEFAULT_PACK, pack_name, parse_padding, type PackOptions } from "./pack";
import { build_pack, card_style, close_source, load_card_fonts, load_icon_source } from "./render";
import { is_svg } from "./svg";

const APP_ID = "icon-pack";
const IMAGE_NAME = /\.(png|jpe?g|gif|webp|bmp|svg|avif)$/i;

const files = () => kernel.service<FilesService>("files");

const child_path = (folder: string, name: string) => `${folder === "/" ? "" : folder}/${name}`;

export interface IconsArgs {
  path: string;
  bg?: string;
  padding: string;
  to?: string;
}

export async function icons({ args, session, elevated }: CommandContext<IconsArgs>): Promise<FileValue> {
  const padding = parse_padding(args.padding);
  if (padding === null) throw new ShellError(`${args.padding}: give the padding like 10%, from 0 to 40`);
  const path = resolve_path(session.cwd, args.path);
  const file = await files().get_file(path);
  if (!file) throw new ShellError(`${path}: no such file`);
  if (!is_image_file(file) && !is_svg(file)) throw new ShellError(`${path}: not an SVG or an image`);

  const folder = args.to === undefined ? parent_path(path) : resolve_path(session.cwd, args.to);
  const directory = await files().get_directory(folder);
  if (!directory) throw new ShellError(`${folder}: no such folder`);
  assert_writable(child_path(folder, pack_name(file.name)), elevated);

  const transparent = args.bg === undefined || args.bg === "transparent";
  const background = transparent ? DEFAULT_PACK.icon.background : args.bg!;
  const options: PackOptions = {
    icon: { ...DEFAULT_PACK.icon, background, transparent, padding },
    card: { ...DEFAULT_PACK.card, background: transparent ? null : background },
  };

  const source = await load_icon_source(file, path).catch(() => {
    throw new ShellError(`${path}: not an image this browser can read`);
  });
  try {
    await load_card_fonts();
    const theme = kernel.service<SettingsService>("settings").theme.background;
    const zip = await build_pack(source, options, card_style(options.card, theme));
    const handle = await files().create_file(directory, pack_name(file.name), { content: zip });
    if (source.warnings.length)
      kernel.service<NotificationsService>("notifications").notify(APP_ID, {
        type: NotificationType.WARNING,
        title: `Check ${file.name}`,
        message: source.warnings.join(" "),
      });
    return file_value(child_path(folder, handle.name), "file", zip.size, Date.now());
  } finally {
    close_source(source);
  }
}

export async function complete_images(partial: string, context: { session: ShellSession }): Promise<Completion[]> {
  const completer = kernel.service<ShellService>("shell").completer(ArgKind.PATH);
  if (!completer) return [];
  return (await completer(partial, context)).filter((item) => item.final === false || IMAGE_NAME.test(item.value));
}
