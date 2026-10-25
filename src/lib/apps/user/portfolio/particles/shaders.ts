export const ATTRIBUTE = { POSITION: 0, VELOCITY: 1, COLOR: 2, TARGET: 3, SEED: 4 } as const;

export const PALETTE_SIZE = 5;

// u_from carries every particle with a resized or scrolled box in one step, so only a change of shape animates.
// The wobble fades near the target: at full strength it holds particles a few px off and blurs the logo's thin curls.
export const UPDATE_VERTEX = `#version 300 es
precision highp float;

layout(location = ${ATTRIBUTE.POSITION}) in vec2 a_position;
layout(location = ${ATTRIBUTE.VELOCITY}) in vec2 a_velocity;
layout(location = ${ATTRIBUTE.COLOR}) in vec3 a_color;
layout(location = ${ATTRIBUTE.TARGET}) in vec3 a_target;
layout(location = ${ATTRIBUTE.SEED}) in vec2 a_seed;

uniform vec4 u_box;
uniform vec4 u_from;
uniform float u_dt;
uniform float u_time;
uniform vec4 u_pointer;
uniform vec4 u_burst;
uniform vec3 u_palette[${PALETTE_SIZE}];

out vec2 v_position;
out vec2 v_velocity;
out vec3 v_color;

vec2 push(vec2 from, vec4 source) {
  vec2 away = from - source.xy;
  float dist = length(away);
  if (source.z <= 0.0 || dist >= source.w || dist < 0.001) return vec2(0.0);
  float falloff = 1.0 - dist / source.w;
  return away / dist * falloff * falloff * source.z;
}

void main() {
  vec2 position = a_position;
  if (u_from.z > 0.0) position = u_box.xy + (position - u_from.xy) / u_from.zw * u_box.zw;

  vec2 target = u_box.xy + a_target.xy * u_box.zw;
  float stiffness = mix(22.0, 38.0, a_seed.x);
  vec2 acceleration = (target - position) * stiffness;

  float away = smoothstep(1.5, 24.0, length(target - position));
  float phase = u_time * 0.7 + a_seed.y * 6.2831853;
  acceleration += vec2(sin(phase + position.y * 0.015), cos(phase * 1.3 + position.x * 0.015)) * 60.0 * mix(0.03, 1.0, away);

  acceleration += push(position, u_pointer);
  acceleration += push(position, u_burst);

  vec2 velocity = (a_velocity + acceleration * u_dt) * pow(0.87, u_dt * 60.0);
  v_velocity = velocity;
  v_position = position + velocity * u_dt;

  int tone = int(a_target.z + 0.5);
  v_color = mix(a_color, u_palette[tone], 1.0 - pow(0.93, u_dt * 60.0));
}
`;

export const UPDATE_FRAGMENT = `#version 300 es
precision mediump float;
out vec4 o_color;
void main() { o_color = vec4(0.0); }
`;

export const RENDER_VERTEX = `#version 300 es
precision highp float;

layout(location = ${ATTRIBUTE.POSITION}) in vec2 a_position;
layout(location = ${ATTRIBUTE.VELOCITY}) in vec2 a_velocity;
layout(location = ${ATTRIBUTE.COLOR}) in vec3 a_color;
layout(location = ${ATTRIBUTE.TARGET}) in vec3 a_target;
layout(location = ${ATTRIBUTE.SEED}) in vec2 a_seed;

uniform vec2 u_size;
uniform float u_scale;
uniform float u_point;
uniform float u_alpha;

out vec4 v_color;

void main() {
  vec2 clip = a_position / u_size * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  float dust = step(3.5, a_target.z);
  float speed = clamp(length(a_velocity) / 900.0, 0.0, 1.0);
  gl_PointSize = u_point * u_scale * mix(0.9, 1.1, a_seed.x) * mix(1.0, 0.7, dust) * (1.0 + speed * 0.4);
  // Dust thins out from the centre, so it reads as a glow around the figure and never as the outline of its box.
  float halo = 1.0 - smoothstep(0.3, 0.6, length(a_target.xy - 0.5));
  v_color = vec4(a_color, mix(u_alpha, 0.22 * halo, dust) * (1.0 - speed * 0.45));
}
`;

export const RENDER_FRAGMENT = `#version 300 es
precision mediump float;

in vec4 v_color;
out vec4 o_color;

void main() {
  float alpha = v_color.a * smoothstep(0.5, 0.18, length(gl_PointCoord - 0.5));
  o_color = vec4(v_color.rgb * alpha, alpha);
}
`;
