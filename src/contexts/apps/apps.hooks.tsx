import type { AppId, AppsConfig } from "@/apps";
import React from "react";
import { useWindowsActions } from "../windows";
import Apps from "@/apps";

export interface AppInstance<Id extends AppId = AppId> {
  id: Id;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  props: Parameters<AppsConfig[Id]["App"]>[0];
  $node: React.ReactNode;
}

export function useApps() {
  const dispatch = useWindowsActions();

  const open = React.useCallback(
    <T extends AppId>(appId: T, props?: Parameters<AppsConfig[T]["App"]>[0]) => {
      const config = Apps[appId];

      if (!config) {
        return console.error(`App ${appId} not found`);
      }

      dispatch({
        type: "CREATE_WINDOW",
        app: {
          id: appId,
          name: config.NAME,
          icon: config.ICON,
          props,
          // TODO: fix types
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          $node: React.createElement(config.App as React.FC<typeof props>, props as unknown as any),
        },
        defaults: "WINDOW_CONFIG" in config ? config.WINDOW_CONFIG : undefined,
      });
    },
    [dispatch]
  );

  return {
    open,
  };
}
