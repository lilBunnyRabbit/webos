import { resolve_token } from "$lib/core/utils";
import { against, darkest, lightest, type Tone } from "./draw-math";

export interface Paint {
  body: string;
  glass: string;
  roof: string;
}

export interface Palette {
  void: string;
  asphalt: string;
  floor: string;
  garage: string;
  ramp: string;
  pavement: string;
  kerb: string;
  paint: string;
  faint: string;
  wall: string;
  wall_edge: string;
  pillar: string;
  shelf: string;
  water: string;
  water_edge: string;
  cars: Paint[];
  player: Paint;
  ink: string;
  edge: string;
  shadow: string;
  glow: string;
  glow_clear: string;
  /** Headlights only throw light on ground darker than they are; on a light theme it reads as a grey smear. */
  beams: boolean;
  tread: string;
  brake: string;
  brake_glow: string;
  target: string;
  target_fill: string;
  free: string;
  parked: string;
  parked_fill: string;
  guide: string;
  warning: string;
  warning_glow: string;
  error: string;
  info: string;
  info_glow: string;
  success: string;
  grass: string;
  hedge: string;
  hedge_edge: string;
  hedge_leaf: string;
  /** Steel: forks, and a rack's beams take `beam`, its uprights `upright`. */
  steel: string;
  beam: string;
  upright: string;
  /** A pallet's deck boards, a job's cardboard boxes (`load_edge` their seams and tape), the shrink-wrapped stock around it. */
  wood: string;
  load: string;
  load_edge: string;
  stock: string;
  beacon: string;
  beacon_clear: string;
}

export function read_palette(probe: HTMLElement): Palette {
  const token = (value: string) => resolve_token(probe, value);
  const mix = (name: string, share: number) => token(`color-mix(in oklch, var(--${name}) ${share}%, transparent)`);
  const solid = (name: string, share: number) =>
    token(`color-mix(in oklch, var(--${name}) ${share}%, var(--background))`);
  const tone = (colour: string): Tone => ({
    colour,
    l: Number(/oklch\(\s*([\d.]+)/.exec(token(`oklch(from ${colour} l 0 0)`))?.[1] ?? 0),
  });
  const of = (name: string) => tone(token(`var(--${name})`));

  // Lamps, glass and tyres sit on bodies of any theme colour, the default's primary as light as its foreground, so
  // they take the theme's darkest and lightest tones: whichever the body is, one of the two stands off it.
  const ink = darkest([of("foreground"), of("background-darkest")]);
  const glow = lightest([of("foreground"), of("background-lightest"), of("cottontail")]);
  // Glass takes the plain light tone, not the accent a lamp may get, so a dark car's windows don't light up.
  const pale = lightest([of("foreground"), of("background-lightest")]);
  const dark_ground = glow.l - of("background").l > 0.35;
  const paint = (colour: string): Paint => {
    const body = tone(colour);
    const over = against(body.l, ink, pale);
    const share = over === ink ? 72 : 50;
    return {
      body: colour,
      glass: token(`color-mix(in oklch, ${over.colour} ${share}%, ${colour})`),
      roof: token(`color-mix(in oklch, ${over.colour} ${share / 4}%, ${colour})`),
    };
  };
  return {
    void: token("var(--background-darker)"),
    asphalt: token("var(--background)"),
    floor: token("var(--background-light)"),
    garage: token("color-mix(in oklch, var(--background-darker) 65%, var(--background))"),
    ramp: token("var(--background-darker)"),
    pavement: token("var(--background-lighter)"),
    kerb: mix("foreground", 28),
    paint: mix("foreground", 78),
    faint: mix("foreground", 40),
    wall: mix("foreground", 50),
    wall_edge: mix("foreground", 70),
    pillar: solid("foreground", 62),
    shelf: mix("foreground", 30),
    water: solid("info", 34),
    water_edge: solid("info", 85),
    cars: [
      token("var(--secondary)"),
      token("var(--tertiary)"),
      solid("foreground", 70),
      solid("foreground", 38),
      token("var(--background-lightest)"),
    ].map(paint),
    player: paint(token("var(--primary)")),
    ink: ink.colour,
    edge: token(`color-mix(in oklch, ${ink.colour} 55%, transparent)`),
    shadow: token(`color-mix(in oklch, ${ink.colour} 30%, transparent)`),
    glow: glow.colour,
    glow_clear: token(`color-mix(in oklch, ${glow.colour} 0%, transparent)`),
    beams: dark_ground,
    tread: token(`color-mix(in oklch, ${glow.colour} 55%, transparent)`),
    brake: token("var(--error)"),
    brake_glow: mix("error", 35),
    target: token("var(--primary)"),
    target_fill: mix("primary", 14),
    free: mix("primary", 55),
    parked: token("var(--success)"),
    parked_fill: mix("success", 18),
    // Cottontail is a light tint on most themes; on a light ground the dashed guides take some foreground to show.
    guide: dark_ground ? token("var(--cottontail)") : token("color-mix(in oklch, var(--cottontail) 55%, var(--foreground))"),
    warning: token("var(--warning)"),
    warning_glow: mix("warning", 35),
    error: token("var(--error)"),
    info: token("var(--info)"),
    info_glow: mix("info", 35),
    success: token("var(--success)"),
    grass: solid("success", 10),
    hedge: solid("success", 20),
    hedge_edge: solid("success", 34),
    hedge_leaf: solid("success", 27),
    steel: solid("foreground", 55),
    beam: solid("warning", 80),
    upright: solid("info", 72),
    // Mixed in oklab: an oklch mix of an amber and a blue-grey ground turns green on the way round the hue circle.
    wood: token("color-mix(in oklab, var(--warning) 40%, var(--foreground))"),
    load: token("color-mix(in oklab, var(--warning) 68%, var(--background))"),
    load_edge: token(`color-mix(in oklab, var(--warning) 45%, ${ink.colour})`),
    stock: solid("foreground", 42),
    beacon: token("var(--warning)"),
    beacon_clear: mix("warning", 0),
  };
}
