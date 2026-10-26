import type { WindowInstance, WindowSnapshot } from "../windows/type";
import { SESSION_FLAGS } from "./persistence";

export function snapshot_window(instance: WindowInstance): WindowSnapshot {
  return {
    app_id: instance.app.id,
    props: $state.snapshot(instance.app.props),
    bounds: { ...instance.bounds },
    flags: [...instance.flags].filter((flag) => SESSION_FLAGS.includes(flag)),
    snap_zone: instance.snap_zone,
    ...(Object.keys(instance.app.state).length > 0 && { state: $state.snapshot(instance.app.state) }),
  };
}
