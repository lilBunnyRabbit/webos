import { describe, expect, test } from "vitest";
import { compile, compile_watch, stdlib } from "./compile";
import { line_col, Severity } from "./diagnostics";
import { resolve } from "./resolve";

const of = (source: string, severity: string) => compile(source).diagnostics.filter((diagnostic) => diagnostic.severity === severity);
const errors = (source: string) => of(source, Severity.ERROR);
const warnings = (source: string) => of(source, Severity.WARNING);
const ft = (source: string, name: string) => {
  const result = compile(source);
  return [...result.setters, ...result.outputs].find((entry) => entry.name === name)?.ft;
};
const at = (source: string, span: { from: number; to: number } | undefined) => (span ? source.slice(span.from, span.to) : null);

describe("stdlib", () => {
  test("is clean on its own", () => {
    expect(resolve({ decls: [] }, stdlib()).diagnostics).toEqual([]);
  });
});

describe("ordering", () => {
  test("dependencies come first, whatever the authoring order", () => {
    const result = compile("var a = b + 1\nvar b = 2 * Pitch");
    expect(result.setters.map((setter) => setter.name)).toEqual(["b", "a"]);
  });

  test("a var read with @prev is set after its reader", () => {
    const result = compile("var b = Pitch\nvar a = @prev b + 1");
    expect(result.ok).toBe(true);
    expect(result.setters.map((setter) => setter.name)).toEqual(["a", "b"]);
  });

  test("@prev breaks a cycle", () => {
    const result = compile("var a = @prev b + 1\nvar b = a + 1");
    expect(result.ok).toBe(true);
    expect(result.setters.map((setter) => setter.name)).toEqual(["a", "b"]);
  });

  test("a hard cycle is an error at the first var's name", () => {
    const source = "var a = b + 1\nvar b = a + 1";
    const [error] = errors(source);
    expect(error.message).toContain("a → b → a");
    expect(at(source, error.span)).toBe("a");
  });

  test("reading a var now and through @prev can't be ordered", () => {
    expect(errors("var a = b + @prev b\nvar b = Pitch")[0].message).toContain("var last_b = @prev b");
  });

  test("a var reading itself asks for @prev", () => {
    expect(errors("var c = c + 1")[0].message).toContain("@prev c");
    expect(compile("var c = @prev c + 1").ok).toBe(true);
  });
});

describe("emit", () => {
  test("negative constants are bracketed", () => {
    expect(ft("const K = -3\nvar v = Pitch - K", "v")).toBe("Pitch-(-3)");
  });

  test("inlines stdlib fns with brackets", () => {
    expect(ft("output e = deadzone(Pitch, 0.05)", "e")).toBe("(abs(Pitch)>0.05)?Pitch:0");
  });

  test("consts fold and 1e6 is written out", () => {
    expect(ft("const G = 0.05 * 2\nvar v = Altitude * G", "v")).toBe("Altitude*0.1");
    expect(ft("var t = smooth(Altitude, clamp01(Pitch == 0) * 1e6)", "t")).toBe("smooth(Altitude,clamp01(Pitch=0)*1000000)");
  });

  test("never folds a division by zero", () => {
    expect(ft("var v = Pitch + 1 / 0", "v")).toBe("Pitch+(1/0)");
  });

  test("XML uses the real setter format", () => {
    expect(compile("var a = IAS < 50 & Altitude > 100").xml).toBe(
      '<Variables>\n  <Setter variable="a" function="(IAS&lt;50)&amp;(Altitude&gt;100)" priority="0" />\n</Variables>'
    );
  });

  test("errors emit nothing", () => {
    const result = compile("var a = clamp(Pitch, 0)\nvar b = Pitch");
    expect(result.ok).toBe(false);
    expect(result.setters).toEqual([]);
    expect(result.xml).toBe("");
  });
});

describe("arguments", () => {
  test("missing arguments are an error, not a silent 0", () => {
    const source = "fn f(x, y) = x + y\nvar a = f(1)";
    const [error] = errors(source);
    expect(error.message).toBe('"f" takes 2 arguments, got 1 (missing y)');
    expect(at(source, error.span)).toBe("f(1)");
  });

  test("extra arguments point at the extras", () => {
    const source = "var a = abs(Pitch, Roll, Yaw)";
    expect(at(source, errors(source)[0].span)).toBe("Roll, Yaw");
  });

  test("a built-in with too few arguments", () => {
    expect(errors("var a = PID(0, Pitch, 1)")[0].message).toBe('"PID" takes 5 arguments, got 3');
  });
});

describe("diagnostics at the source", () => {
  test("an error in a fn is reported once, in the fn, even with many calls", () => {
    const source = "fn f(x) = x + Foo\nvar a = f(1)\nvar b = f(2)\nvar c = f(3)";
    const found = errors(source);
    expect(found).toHaveLength(1);
    expect(at(source, found[0].span)).toBe("Foo");
  });

  test("a fn nobody calls is still checked", () => {
    expect(errors("fn unused(x) = x + Nope\nvar a = Pitch")[0].message).toContain('"Nope"');
  });

  test("stdlib problems never point into the user's source", () => {
    const source = "var a = pidHold(0, PitchAngle, 1, 0, 0.1)\nvar b = pidHold(0, RollAngle, 1, 0, 0.1)";
    const [warning] = warnings(source);
    expect(warning.message).toContain("pidHold");
    expect(at(source, warning.span)).toBe("pidHold(0, RollAngle, 1, 0, 0.1)");
  });

  test("a stateful user fn used twice is flagged at its name", () => {
    const source = "fn hold(x) = smooth(x, 1)\nvar a = hold(Pitch)\nvar b = hold(Roll)";
    expect(at(source, warnings(source)[0].span)).toBe("hold");
  });

  test("unknown names suggest a near match", () => {
    expect(errors("var a = Altitud + 1")[0].message).toBe('Unknown name "Altitud". Did you mean "Altitude"?');
    expect(errors("var a = clmap(Pitch, 0, 1)")[0].message).toContain('Did you mean "clamp"?');
  });

  test("several errors in one go, each with its line", () => {
    const source = "var a = Foo\nvar b = Bar\nvar c = clamp(1)";
    const found = errors(source);
    expect(found.map((error) => line_col(source, error.span!.from).line)).toEqual([1, 2, 3]);
  });

  test("recursion is an error at the call", () => {
    const source = "fn f(x) = g(x)\nfn g(x) = f(x)\nvar a = f(1)";
    const found = errors(source);
    expect(found).toHaveLength(1);
    expect(found[0].message).toContain("Recursive");
  });

  test("const cycles are reported once", () => {
    expect(errors("const A = B\nconst B = A\nvar v = A").filter((error) => error.message.includes("cycle"))).toHaveLength(1);
  });

  test("a const can't read a var or a built-in variable", () => {
    expect(errors("var v = Pitch\nconst K = v * 2\nvar w = K")[0].message).toContain("can't read var");
    expect(errors("const K = Pitch\nvar w = K")[0].message).toContain("can't read Pitch");
  });

  test("collisions, duplicates and outputs", () => {
    expect(errors("var Pitch = 1")[0].message).toContain("built-in");
    expect(errors("fn clamp(x) = x\nvar a = 1")[0].message).toContain("built-in function");
    expect(errors("var a = 1\nvar a = 2")[0].message).toContain("already declared");
    expect(errors("output o = 1\nvar a = o")[0].message).toContain("can't be read");
  });

  test("@prev must name a var; in an output it warns", () => {
    expect(errors("var a = @prev Altitude")[0].message).toContain("needs a var");
    expect(warnings("var a = Pitch\noutput o = @prev a")[0].message).toContain("parts run after");
  });

  test("LandingGear is deprecated in favour of GearDown", () => {
    expect(warnings("output o = LandingGear")[0].message).toContain("GearDown");
    expect(warnings("output o = GearDown")).toEqual([]);
  });

  test("newer built-ins are known", () => {
    for (const name of ["GForce", "Latitude", "Longitude", "TargetHeading", "TargetElevation", "TargetDistance", "TargetSelected", "GearDown", "SelectedWeapon"]) {
      expect(errors(`output o = ${name}`)).toEqual([]);
    }
    expect(compile('output o = ammo(SelectedWeapon) > 0').ok).toBe(true);
  });
});

describe("watches", () => {
  test("see the program's names and inline them", () => {
    const { scope } = compile("const K = 2\nfn twice(x) = x * K\nvar a = Pitch");
    expect(compile_watch("twice(a)", scope)).toMatchObject({ ft: "a*2", error: null });
    expect(compile_watch("nope + 1", scope).error).toContain("Unknown");
    expect(compile_watch("1 +", scope).error).toBeTruthy();
  });
});

describe("end to end", () => {
  test("altitude and heading hold", () => {
    const result = compile(`
      const VS_GAIN = 0.1
      var TargetAlt = smooth(Altitude, clamp01(Pitch == 0) * 1e6)
      var TargetHdg = smooth(Heading, clamp01(Roll == 0) * 1e6)
      var desiredVS = clamp((TargetAlt - Altitude) * VS_GAIN, -20, 20)
      var pitchCmd = PID(desiredVS, VerticalSpeed, 0.05, 0.001, 0.02)
      var rollCmd = PID(0, -headingError(TargetHdg), 0.02, 0, 0.01)
      output elevator = clamp(pitchCmd + Pitch, -1, 1)
      output aileron = clamp(rollCmd + Roll, -1, 1)
    `);
    expect(result.ok).toBe(true);
    expect(result.outputs.map((output) => output.ft)).toEqual(["clamp(pitchCmd+Pitch,-1,1)", "clamp(rollCmd+Roll,-1,1)"]);
    expect(result.builtins).toEqual(expect.arrayContaining(["Altitude", "Pitch", "Heading", "Roll", "VerticalSpeed"]));
  });
});
