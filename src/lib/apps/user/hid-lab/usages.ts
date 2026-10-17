const PAGES: Record<number, string> = {
  0x01: "Generic Desktop",
  0x02: "Simulation Controls",
  0x03: "VR Controls",
  0x04: "Sport Controls",
  0x05: "Game Controls",
  0x06: "Generic Device Controls",
  0x07: "Keyboard/Keypad",
  0x08: "LED",
  0x09: "Button",
  0x0a: "Ordinal",
  0x0b: "Telephony",
  0x0c: "Consumer",
  0x0d: "Digitizers",
  0x0e: "Haptics",
  0x0f: "Physical Input Device",
  0x10: "Unicode",
  0x12: "Eye and Head Trackers",
  0x14: "Auxiliary Display",
  0x20: "Sensors",
  0x40: "Medical Instrument",
  0x41: "Braille Display",
  0x59: "Lighting and Illumination",
  0x80: "Monitor",
  0x84: "Power",
  0x85: "Battery System",
  0x8c: "Barcode Scanner",
  0x8d: "Scales",
  0x8e: "Magnetic Stripe Reader",
  0x90: "Camera Control",
  0x91: "Arcade",
  0xf1d0: "FIDO Alliance",
};

const GENERIC_DESKTOP: Record<number, string> = {
  0x01: "Pointer",
  0x02: "Mouse",
  0x04: "Joystick",
  0x05: "Gamepad",
  0x06: "Keyboard",
  0x07: "Keypad",
  0x08: "Multi-axis Controller",
  0x09: "Tablet PC System Controls",
  0x0e: "System Multi-Axis Controller",
  0x30: "X",
  0x31: "Y",
  0x32: "Z",
  0x33: "Rx",
  0x34: "Ry",
  0x35: "Rz",
  0x36: "Slider",
  0x37: "Dial",
  0x38: "Wheel",
  0x39: "Hat Switch",
  0x3a: "Counted Buffer",
  0x3b: "Byte Count",
  0x3c: "Motion Wakeup",
  0x3d: "Start",
  0x3e: "Select",
  0x40: "Vx",
  0x41: "Vy",
  0x42: "Vz",
  0x80: "System Control",
  0x81: "System Power Down",
  0x82: "System Sleep",
  0x83: "System Wake Up",
  0x84: "System Context Menu",
  0x85: "System Main Menu",
  0x86: "System App Menu",
  0x90: "D-pad Up",
  0x91: "D-pad Down",
  0x92: "D-pad Right",
  0x93: "D-pad Left",
};

const KEYBOARD_NAMED: Record<number, string> = {
  0x00: "None",
  0x01: "ErrorRollOver",
  0x02: "POSTFail",
  0x03: "ErrorUndefined",
  0x28: "Enter",
  0x29: "Escape",
  0x2a: "Backspace",
  0x2b: "Tab",
  0x2c: "Space",
  0x2d: "-",
  0x2e: "=",
  0x2f: "[",
  0x30: "]",
  0x31: "\\",
  0x32: "Non-US #",
  0x33: ";",
  0x34: "'",
  0x35: "`",
  0x36: ",",
  0x37: ".",
  0x38: "/",
  0x39: "Caps Lock",
  0x46: "Print Screen",
  0x47: "Scroll Lock",
  0x48: "Pause",
  0x49: "Insert",
  0x4a: "Home",
  0x4b: "Page Up",
  0x4c: "Delete",
  0x4d: "End",
  0x4e: "Page Down",
  0x4f: "Right Arrow",
  0x50: "Left Arrow",
  0x51: "Down Arrow",
  0x52: "Up Arrow",
  0x53: "Num Lock",
  0x54: "Keypad /",
  0x55: "Keypad *",
  0x56: "Keypad -",
  0x57: "Keypad +",
  0x58: "Keypad Enter",
  0x63: "Keypad .",
  0x64: "Non-US \\",
  0x65: "Application",
  0xe0: "Left Control",
  0xe1: "Left Shift",
  0xe2: "Left Alt",
  0xe3: "Left GUI",
  0xe4: "Right Control",
  0xe5: "Right Shift",
  0xe6: "Right Alt",
  0xe7: "Right GUI",
};

function keyboard(id: number): string | undefined {
  if (id >= 0x04 && id <= 0x1d) return String.fromCharCode(0x41 + id - 0x04);
  if (id >= 0x1e && id <= 0x26) return String(id - 0x1d);
  if (id === 0x27) return "0";
  if (id >= 0x3a && id <= 0x45) return `F${id - 0x39}`;
  if (id >= 0x68 && id <= 0x73) return `F${id - 0x68 + 13}`;
  if (id >= 0x59 && id <= 0x61) return `Keypad ${id - 0x58}`;
  if (id === 0x62) return "Keypad 0";
  return KEYBOARD_NAMED[id];
}

const LED: Record<number, string> = {
  0x01: "Num Lock",
  0x02: "Caps Lock",
  0x03: "Scroll Lock",
  0x04: "Compose",
  0x05: "Kana",
  0x4b: "Generic Indicator",
};

const CONSUMER: Record<number, string> = {
  0x01: "Consumer Control",
  0x02: "Numeric Key Pad",
  0x30: "Power",
  0x40: "Menu",
  0x6f: "Brightness Up",
  0x70: "Brightness Down",
  0xb0: "Play",
  0xb1: "Pause",
  0xb2: "Record",
  0xb3: "Fast Forward",
  0xb4: "Rewind",
  0xb5: "Next Track",
  0xb6: "Previous Track",
  0xb7: "Stop",
  0xb8: "Eject",
  0xcd: "Play/Pause",
  0xe0: "Volume",
  0xe2: "Mute",
  0xe9: "Volume Up",
  0xea: "Volume Down",
  0x183: "AL Consumer Control Config",
  0x18a: "AL Email Reader",
  0x192: "AL Calculator",
  0x194: "AL Local Machine Browser",
  0x196: "AL Internet Browser",
  0x221: "AC Search",
  0x223: "AC Home",
  0x224: "AC Back",
  0x225: "AC Forward",
  0x226: "AC Stop",
  0x227: "AC Refresh",
  0x22a: "AC Bookmarks",
  0x238: "AC Pan",
};

const DIGITIZERS: Record<number, string> = {
  0x01: "Digitizer",
  0x02: "Pen",
  0x04: "Touch Screen",
  0x05: "Touch Pad",
  0x0e: "Device Configuration",
  0x20: "Stylus",
  0x22: "Finger",
  0x30: "Tip Pressure",
  0x32: "In Range",
  0x33: "Touch",
  0x3c: "Invert",
  0x3d: "X Tilt",
  0x3e: "Y Tilt",
  0x42: "Tip Switch",
  0x44: "Barrel Switch",
  0x45: "Eraser",
  0x47: "Confidence",
  0x48: "Width",
  0x49: "Height",
  0x51: "Contact Identifier",
  0x52: "Device Mode",
  0x54: "Contact Count",
  0x55: "Contact Count Maximum",
  0x56: "Scan Time",
};

const COLLECTIONS = ["Physical", "Application", "Logical", "Report", "Named Array", "Usage Switch", "Usage Modifier"];

export function hex(value: number, digits = 2): string {
  return `0x${value.toString(16).toUpperCase().padStart(digits, "0")}`;
}

export function is_vendor_page(page: number): boolean {
  return page >= 0xff00;
}

export function page_name(page: number): string {
  if (is_vendor_page(page)) return `Vendor-defined ${hex(page, 4)}`;
  return PAGES[page] ?? `Page ${hex(page, 2)}`;
}

/** `usage` is 16 bits here; split an extended (32-bit) usage with `split_usage` first. */
export function usage_name(page: number, usage: number): string {
  const named =
    page === 0x01
      ? GENERIC_DESKTOP[usage]
      : page === 0x07
        ? keyboard(usage)
        : page === 0x08
          ? LED[usage]
          : page === 0x09
            ? usage === 0 ? "No Button" : `Button ${usage}`
            : page === 0x0a
              ? `Instance ${usage}`
              : page === 0x0c
                ? CONSUMER[usage]
                : page === 0x0d
                  ? DIGITIZERS[usage]
                  : undefined;
  return named ?? `Usage ${hex(usage, usage > 0xff ? 4 : 2)}`;
}

export function split_usage(extended: number): { page: number; usage: number } {
  return { page: Math.floor(extended / 0x10000), usage: extended & 0xffff };
}

export function extended_usage(page: number, usage: number): number {
  return page * 0x10000 + (usage & 0xffff);
}

export function extended_name(extended: number): string {
  const { page, usage } = split_usage(extended);
  return usage_name(page, usage);
}

export function collection_name(type: number): string {
  return COLLECTIONS[type] ?? (type >= 0x80 ? `Vendor ${hex(type)}` : `Reserved ${hex(type)}`);
}
