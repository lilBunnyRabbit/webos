export const Quantity = {
  LENGTH: "length",
  MASS: "mass",
  TEMPERATURE: "temperature",
  VOLUME: "volume",
  AREA: "area",
  SPEED: "speed",
  TIME: "time",
  DATA: "data",
  PRESSURE: "pressure",
  ENERGY: "energy",
  ANGLE: "angle",
} as const;
export type Quantity = (typeof Quantity)[keyof typeof Quantity];

export const QUANTITIES: Quantity[] = Object.values(Quantity);

// base = (value + offset) * factor, offset in the unit's own scale so Fahrenheit keeps exact constants (459.67, 5/9).
export interface Unit {
  id: string;
  name: string;
  symbol: string;
  factor: number;
  offset?: number;
  group?: string;
  note?: string;
}

export interface QuantityTable {
  id: Quantity;
  label: string;
  from: string;
  to: string;
  units: Unit[];
}

const METRIC = "Metric";
const US = "US customary";
const IMPERIAL = "Imperial";
const SI_DATA = "Decimal (SI, 1000)";
const BINARY_DATA = "Binary (IEC, 1024)";

const POUND = 0.45359237;
const INCH = 0.0254;
const FOOT = 0.3048;
const MILE = 1609.344;
const STANDARD_GRAVITY = 9.80665;

export const TABLES: Record<Quantity, QuantityTable> = {
  length: {
    id: "length",
    label: "Length",
    from: "m",
    to: "ft",
    units: [
      { id: "nm", name: "Nanometre", symbol: "nm", factor: 1e-9 },
      { id: "um", name: "Micrometre", symbol: "µm", factor: 1e-6 },
      { id: "mm", name: "Millimetre", symbol: "mm", factor: 1e-3 },
      { id: "cm", name: "Centimetre", symbol: "cm", factor: 1e-2 },
      { id: "m", name: "Metre", symbol: "m", factor: 1 },
      { id: "km", name: "Kilometre", symbol: "km", factor: 1e3 },
      { id: "in", name: "Inch", symbol: "in", factor: INCH },
      { id: "ft", name: "Foot", symbol: "ft", factor: FOOT },
      { id: "yd", name: "Yard", symbol: "yd", factor: 0.9144 },
      { id: "mi", name: "Mile", symbol: "mi", factor: MILE },
      { id: "nmi", name: "Nautical mile", symbol: "nmi", factor: 1852 },
      { id: "au", name: "Astronomical unit", symbol: "au", factor: 149_597_870_700 },
      { id: "ly", name: "Light-year", symbol: "ly", factor: 9_460_730_472_580_800 },
    ],
  },
  mass: {
    id: "mass",
    label: "Mass",
    from: "kg",
    to: "lb",
    units: [
      { id: "ug", name: "Microgram", symbol: "µg", factor: 1e-9 },
      { id: "mg", name: "Milligram", symbol: "mg", factor: 1e-6 },
      { id: "g", name: "Gram", symbol: "g", factor: 1e-3 },
      { id: "kg", name: "Kilogram", symbol: "kg", factor: 1 },
      { id: "t", name: "Tonne", symbol: "t", factor: 1e3, note: "Metric ton, 1000 kg" },
      { id: "ct", name: "Carat", symbol: "ct", factor: 2e-4 },
      { id: "oz", name: "Ounce", symbol: "oz", factor: POUND / 16 },
      { id: "lb", name: "Pound", symbol: "lb", factor: POUND },
      { id: "st", name: "Stone", symbol: "st", factor: POUND * 14 },
      { id: "ton_us", name: "Short ton", symbol: "ton", factor: POUND * 2000, note: "US ton, 2000 lb" },
      { id: "ton_uk", name: "Long ton", symbol: "LT", factor: POUND * 2240, note: "Imperial ton, 2240 lb" },
    ],
  },
  temperature: {
    id: "temperature",
    label: "Temperature",
    from: "c",
    to: "f",
    units: [
      { id: "c", name: "Celsius", symbol: "°C", factor: 1, offset: 273.15 },
      { id: "f", name: "Fahrenheit", symbol: "°F", factor: 5 / 9, offset: 459.67 },
      { id: "k", name: "Kelvin", symbol: "K", factor: 1 },
      { id: "r", name: "Rankine", symbol: "°R", factor: 5 / 9 },
    ],
  },
  volume: {
    id: "volume",
    label: "Volume",
    from: "l",
    to: "gal_us",
    units: [
      { id: "ml", name: "Millilitre", symbol: "mL", factor: 1e-6, group: METRIC },
      { id: "l", name: "Litre", symbol: "L", factor: 1e-3, group: METRIC },
      { id: "cm3", name: "Cubic centimetre", symbol: "cm³", factor: 1e-6, group: METRIC },
      { id: "m3", name: "Cubic metre", symbol: "m³", factor: 1, group: METRIC },
      { id: "tsp_us", name: "Teaspoon", symbol: "tsp", factor: 4.92892159375e-6, group: US },
      { id: "tbsp_us", name: "Tablespoon", symbol: "tbsp", factor: 1.478676478125e-5, group: US },
      { id: "floz_us", name: "Fluid ounce", symbol: "fl oz", factor: 2.95735295625e-5, group: US },
      { id: "cup_us", name: "Cup", symbol: "cup", factor: 2.365882365e-4, group: US },
      { id: "pt_us", name: "Pint", symbol: "pt", factor: 4.73176473e-4, group: US },
      { id: "qt_us", name: "Quart", symbol: "qt", factor: 9.46352946e-4, group: US },
      { id: "gal_us", name: "Gallon", symbol: "gal", factor: 3.785411784e-3, group: US },
      { id: "in3", name: "Cubic inch", symbol: "in³", factor: INCH ** 3, group: US },
      { id: "ft3", name: "Cubic foot", symbol: "ft³", factor: FOOT ** 3, group: US },
      { id: "floz_uk", name: "Fluid ounce", symbol: "fl oz", factor: 2.84130625e-5, group: IMPERIAL },
      { id: "pt_uk", name: "Pint", symbol: "pt", factor: 5.6826125e-4, group: IMPERIAL },
      { id: "gal_uk", name: "Gallon", symbol: "gal", factor: 4.54609e-3, group: IMPERIAL },
    ],
  },
  area: {
    id: "area",
    label: "Area",
    from: "m2",
    to: "ft2",
    units: [
      { id: "mm2", name: "Square millimetre", symbol: "mm²", factor: 1e-6 },
      { id: "cm2", name: "Square centimetre", symbol: "cm²", factor: 1e-4 },
      { id: "m2", name: "Square metre", symbol: "m²", factor: 1 },
      { id: "ha", name: "Hectare", symbol: "ha", factor: 1e4 },
      { id: "km2", name: "Square kilometre", symbol: "km²", factor: 1e6 },
      { id: "in2", name: "Square inch", symbol: "in²", factor: INCH ** 2 },
      { id: "ft2", name: "Square foot", symbol: "ft²", factor: FOOT ** 2 },
      { id: "yd2", name: "Square yard", symbol: "yd²", factor: 0.9144 ** 2 },
      { id: "ac", name: "Acre", symbol: "ac", factor: 4046.8564224 },
      { id: "mi2", name: "Square mile", symbol: "mi²", factor: MILE ** 2 },
    ],
  },
  speed: {
    id: "speed",
    label: "Speed",
    from: "kmh",
    to: "mph",
    units: [
      { id: "ms", name: "Metre per second", symbol: "m/s", factor: 1 },
      { id: "kmh", name: "Kilometre per hour", symbol: "km/h", factor: 1 / 3.6 },
      { id: "mph", name: "Mile per hour", symbol: "mph", factor: MILE / 3600 },
      { id: "fts", name: "Foot per second", symbol: "ft/s", factor: FOOT },
      { id: "kn", name: "Knot", symbol: "kn", factor: 1852 / 3600 },
      { id: "c", name: "Speed of light", symbol: "c", factor: 299_792_458 },
    ],
  },
  time: {
    id: "time",
    label: "Time",
    from: "h",
    to: "min",
    units: [
      { id: "ns", name: "Nanosecond", symbol: "ns", factor: 1e-9 },
      { id: "us", name: "Microsecond", symbol: "µs", factor: 1e-6 },
      { id: "ms", name: "Millisecond", symbol: "ms", factor: 1e-3 },
      { id: "s", name: "Second", symbol: "s", factor: 1 },
      { id: "min", name: "Minute", symbol: "min", factor: 60 },
      { id: "h", name: "Hour", symbol: "h", factor: 3600 },
      { id: "d", name: "Day", symbol: "d", factor: 86_400 },
      { id: "wk", name: "Week", symbol: "wk", factor: 604_800 },
      { id: "mo", name: "Month", symbol: "mo", factor: 2_629_746, note: "Average Gregorian month, 30.44 days" },
      { id: "yr", name: "Year", symbol: "yr", factor: 31_556_952, note: "Average Gregorian year, 365.2425 days" },
      { id: "dec", name: "Decade", symbol: "dec", factor: 315_569_520 },
      { id: "cen", name: "Century", symbol: "cen", factor: 3_155_695_200 },
    ],
  },
  data: {
    id: "data",
    label: "Data size",
    from: "gb",
    to: "gib",
    units: [
      { id: "bit", name: "Bit", symbol: "bit", factor: 1 / 8, group: "Base" },
      { id: "byte", name: "Byte", symbol: "B", factor: 1, group: "Base", note: "8 bits" },
      { id: "kbit", name: "Kilobit", symbol: "kbit", factor: 125, group: SI_DATA, note: "1000 bits" },
      { id: "mbit", name: "Megabit", symbol: "Mbit", factor: 125e3, group: SI_DATA, note: "1000² bits" },
      { id: "gbit", name: "Gigabit", symbol: "Gbit", factor: 125e6, group: SI_DATA, note: "1000³ bits" },
      { id: "kb", name: "Kilobyte", symbol: "kB", factor: 1e3, group: SI_DATA, note: "1000 bytes" },
      { id: "mb", name: "Megabyte", symbol: "MB", factor: 1e6, group: SI_DATA, note: "1000² bytes" },
      { id: "gb", name: "Gigabyte", symbol: "GB", factor: 1e9, group: SI_DATA, note: "1000³ bytes" },
      { id: "tb", name: "Terabyte", symbol: "TB", factor: 1e12, group: SI_DATA, note: "1000⁴ bytes" },
      { id: "pb", name: "Petabyte", symbol: "PB", factor: 1e15, group: SI_DATA, note: "1000⁵ bytes" },
      { id: "kib", name: "Kibibyte", symbol: "KiB", factor: 1024, group: BINARY_DATA, note: "1024 bytes" },
      { id: "mib", name: "Mebibyte", symbol: "MiB", factor: 1024 ** 2, group: BINARY_DATA, note: "1024² bytes" },
      { id: "gib", name: "Gibibyte", symbol: "GiB", factor: 1024 ** 3, group: BINARY_DATA, note: "1024³ bytes" },
      { id: "tib", name: "Tebibyte", symbol: "TiB", factor: 1024 ** 4, group: BINARY_DATA, note: "1024⁴ bytes" },
      { id: "pib", name: "Pebibyte", symbol: "PiB", factor: 1024 ** 5, group: BINARY_DATA, note: "1024⁵ bytes" },
    ],
  },
  pressure: {
    id: "pressure",
    label: "Pressure",
    from: "bar",
    to: "psi",
    units: [
      { id: "pa", name: "Pascal", symbol: "Pa", factor: 1 },
      { id: "hpa", name: "Hectopascal", symbol: "hPa", factor: 100 },
      { id: "kpa", name: "Kilopascal", symbol: "kPa", factor: 1e3 },
      { id: "mpa", name: "Megapascal", symbol: "MPa", factor: 1e6 },
      { id: "mbar", name: "Millibar", symbol: "mbar", factor: 100 },
      { id: "bar", name: "Bar", symbol: "bar", factor: 1e5 },
      { id: "atm", name: "Standard atmosphere", symbol: "atm", factor: 101_325 },
      { id: "psi", name: "Pound per square inch", symbol: "psi", factor: (POUND * STANDARD_GRAVITY) / INCH ** 2 },
      { id: "torr", name: "Torr", symbol: "Torr", factor: 101_325 / 760 },
      { id: "mmhg", name: "Millimetre of mercury", symbol: "mmHg", factor: 133.322387415 },
      { id: "inhg", name: "Inch of mercury", symbol: "inHg", factor: 3386.389 },
    ],
  },
  energy: {
    id: "energy",
    label: "Energy",
    from: "kcal",
    to: "kj",
    units: [
      { id: "ev", name: "Electronvolt", symbol: "eV", factor: 1.602176634e-19 },
      { id: "j", name: "Joule", symbol: "J", factor: 1 },
      { id: "kj", name: "Kilojoule", symbol: "kJ", factor: 1e3 },
      { id: "mj", name: "Megajoule", symbol: "MJ", factor: 1e6 },
      { id: "cal", name: "Calorie", symbol: "cal", factor: 4.184, note: "Thermochemical calorie" },
      { id: "kcal", name: "Kilocalorie", symbol: "kcal", factor: 4184, note: "Food calorie" },
      { id: "wh", name: "Watt-hour", symbol: "Wh", factor: 3600 },
      { id: "kwh", name: "Kilowatt-hour", symbol: "kWh", factor: 3.6e6 },
      { id: "btu", name: "British thermal unit", symbol: "BTU", factor: 1055.05585262, note: "International table BTU" },
      { id: "ftlbf", name: "Foot-pound", symbol: "ft·lbf", factor: FOOT * POUND * STANDARD_GRAVITY },
    ],
  },
  angle: {
    id: "angle",
    label: "Angle",
    from: "deg",
    to: "rad",
    units: [
      { id: "deg", name: "Degree", symbol: "°", factor: 1 },
      { id: "rad", name: "Radian", symbol: "rad", factor: 180 / Math.PI },
      { id: "mrad", name: "Milliradian", symbol: "mrad", factor: 0.18 / Math.PI },
      { id: "grad", name: "Gradian", symbol: "gon", factor: 0.9 },
      { id: "arcmin", name: "Arcminute", symbol: "′", factor: 1 / 60 },
      { id: "arcsec", name: "Arcsecond", symbol: "″", factor: 1 / 3600 },
      { id: "turn", name: "Turn", symbol: "tr", factor: 360 },
    ],
  },
};
