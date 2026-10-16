/**
 * The OS asks for reduced motion, or Settings › Appearance › Motion is off. CSS animations and transitions are cut in
 * `app.css`; script-driven motion (View Transitions, Svelte transitions, which run on the Web Animations API and
 * ignore that rule) checks this when it starts.
 */
export function motion_reduced(): boolean {
  return document.documentElement.dataset.motion === "off" || matchMedia("(prefers-reduced-motion: reduce)").matches;
}
