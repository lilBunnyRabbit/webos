import { describe, expect, test } from "vitest";
import { compile } from "./compile";
import { decompile, read_craft } from "./craft";
import { Simulator } from "./simulator";

// Trimmed from a real SimplePlanes save (the owner's "Pigpen"): three setters on one variable and FT in part fields.
const PIGPEN = `<?xml version="1.0" encoding="utf-8"?>
<Aircraft name="Pigpen" url="SvcLDC" theme="Custom" xmlVersion="7" legacyJointIdentification="false">
  <Variables>
    <Setter variable="AoA" function="AngleOfAttack * clamp01(IAS*0.2 - 5)" priority="0" />
    <Setter variable="Canard" function="Acro ? Pitch*12 - AoA : Pitch*7 - PitchRate*0.07 - AoA*1.3" priority="0" />
    <Setter variable="Canard" function="abs(AoA) &gt; 110 ? deltaangle(AoA,180) : Canard" priority="0" />
    <Setter variable="Canard" function="(IAS &lt; 70) &amp; (AltitudeAgl &lt; 2.5) &amp; (Brake&gt;0) ? Brake*40 : Canard " priority="0" />
  </Variables>
  <Assembly>
    <Parts>
      <Part id="12" partType="Rotator-1" position="0,0,0">
        <InputController.State activationGroup="0" invert="false" min="-1" max="1" input="clamp(Canard/40 - Roll*0.3, -1.5, 1.5)" />
      </Part>
      <Part id="13" partType="Wing-3" position="0,0,0">
        <ControlSurface start="0" end="3" inputId="Roll" invert="true" maxDeflectionDegree="30" trim="off" />
      </Part>
      <Part id="14" partType="Gauge-1">
        <Gauge.State faceInput="Disabled" />
      </Part>
      <Part id="15" partType="Button-1">
        <Button.State inputId="Acro" style="Circular" tooltip="FBW &quot;Acro&quot; Mode" />
      </Part>
      <Part id="16" partType="HelicopterRotor-1">
        <VariableOutput id="RotorRPM" variable="RotorRPM" priority="10" />
      </Part>
    </Parts>
  </Assembly>
</Aircraft>`;

describe("read_craft", () => {
  test("lists setters, FT part inputs and part-set variables", () => {
    const craft = read_craft(PIGPEN);
    expect(craft.name).toBe("Pigpen");
    expect(craft.setters.map((setter) => setter.variable)).toEqual(["AoA", "Canard", "Canard", "Canard"]);
    expect(craft.setters[2].function).toBe("abs(AoA) > 110 ? deltaangle(AoA,180) : Canard");
    expect(craft.inputs).toEqual([
      { part_id: "12", part_type: "Rotator-1", element: "InputController.State", attribute: "input", value: "clamp(Canard/40 - Roll*0.3, -1.5, 1.5)" },
      { part_id: "13", part_type: "Wing-3", element: "ControlSurface", attribute: "inputId", value: "Roll" },
    ]);
    expect(craft.writers).toEqual([
      { variable: "Acro", part_id: "15", part_type: "Button-1" },
      { variable: "RotorRPM", part_id: "16", part_type: "HelicopterRotor-1" },
    ]);
  });

  test("rejects anything that isn't a craft", () => {
    expect(() => read_craft("<Variables />")).toThrow("SimplePlanes craft");
  });
});

describe("decompile", () => {
  test("turns repeated setters into a chain, reading earlier writes or @prev", () => {
    const { source, notes } = decompile(read_craft(PIGPEN));
    expect(source).toContain("var AoA = AngleOfAttack * clamp01(IAS * 0.2 - 5)");
    expect(source).toContain("var Canard_1 = Acro ? Pitch * 12 - AoA : Pitch * 7 - PitchRate * 0.07 - AoA * 1.3");
    expect(source).toContain("var Canard_2 = abs(AoA) > 110 ? deltaangle(AoA, 180) : Canard_1");
    expect(source).toContain("var Canard = (IAS < 70) & (AltitudeAgl < 2.5) & (Brake > 0) ? Brake * 40 : Canard_2");
    expect(source).toContain("output rotator_1_12 = clamp(Canard / 40 - Roll * 0.3, -1.5, 1.5)");
    expect(source).not.toContain("wing_3_13");
    expect(notes.some((note) => note.includes("Acro is set by part 15"))).toBe(true);
  });

  test("a read before the first write becomes @prev", () => {
    const xml = `<Aircraft name="t"><Variables><Setter variable="b" function="a + 1" priority="0" /><Setter variable="a" function="Throttle" priority="0" /></Variables></Aircraft>`;
    const { source } = decompile(read_craft(xml));
    expect(source).toContain("var b = @prev a + 1");
    const result = compile(source);
    expect(result.ok).toBe(true);
    expect(result.setters.map((setter) => setter.name)).toEqual(["b", "a"]);
  });

  test("the decompiled chain computes what the game's top-down setters would", () => {
    const craft = read_craft(PIGPEN.replace(/Acro \?/, "Activate1 ?"));
    const result = compile(decompile(craft).source);
    expect(result.ok).toBe(true);
    const sim = new Simulator(result.setters, result.outputs);
    const world = { AngleOfAttack: 4, IAS: 50, AltitudeAgl: 1, Brake: 1, Pitch: 0.5, PitchRate: 0, Activate1: -1, Roll: 0 };
    const values = sim.step(world, 1 / 60);
    expect(values.Canard).toBe(40);
    expect(values.Canard_1).toBeCloseTo(-1.7);
  });

  test("names the DSL can't use are renamed, with a note", () => {
    const xml = `<Aircraft name="t"><Variables><Setter variable="my var" function="1" priority="2" /></Variables></Aircraft>`;
    const { source, notes } = decompile(read_craft(xml));
    expect(source).toContain("var my_var = 1");
    expect(notes.join(" ")).toContain("priority 2");
  });

  test("unreadable setters are left out with a note", () => {
    const xml = `<Aircraft name="t"><Variables><Setter variable="a" function="v:x.y + 1" priority="0" /></Variables></Aircraft>`;
    const { notes } = decompile(read_craft(xml));
    expect(notes[0]).toContain("couldn't be read");
  });
});
