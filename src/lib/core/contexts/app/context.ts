import { getContext, setContext } from "svelte";
import type { AppContext } from "./type";

const APP_CONTEXT_KEY = Symbol("app-context");

export function set_app_context(context: AppContext): void {
  setContext(APP_CONTEXT_KEY, context);
}

export function get_app_context(): AppContext {
  const context = getContext<AppContext | undefined>(APP_CONTEXT_KEY);
  if (!context) {
    throw new Error("get_app_context must be called during init of a component inside a window");
  }
  return context;
}
