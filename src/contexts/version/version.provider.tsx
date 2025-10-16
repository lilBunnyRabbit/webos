import React from "react";
import axios from "axios";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { APP_VERSION } from "@/constants";
import { hardRefresh } from "@/lib/update";
import { VersionNotification } from "@/components/version-notification";
import type { VersionInfo } from "./version.type";
import { VersionContext } from "./version.context";

const VERSION_CHECK_INTERVAL = 5 * 60 * 1000; // 5 minutes
const VERSION_CHECK_QUERY_KEY = ["version-check"];

export const VersionProvider = ({ children }: React.PropsWithChildren) => {
  const queryClient = useQueryClient();

  const {
    data: newVersion,
    refetch: checkForUpdates,
    isFetching: isCheckingForUpdates,
  } = useQuery({
    queryKey: VERSION_CHECK_QUERY_KEY,
    queryFn: async () => {
      const response = await axios.get<VersionInfo>(`${import.meta.env.BASE_URL}version.json`, {
        params: {
          t: Date.now(),
        },
      });

      const remoteVersion = response.data;

      if (remoteVersion.buildTimestamp > APP_VERSION.buildTimestamp) {
        return remoteVersion;
      }

      return null;
    },
    enabled: !import.meta.env.DEV,
    refetchInterval: ({ state }) => {
      if (state.data) {
        return 0;
      }

      return VERSION_CHECK_INTERVAL;
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: "always",
    refetchOnReconnect: "always",
    refetchIntervalInBackground: false,
    initialData: null,
  });

  const { mutate: applyUpdate, isPending: isUpdating } = useMutation({
    mutationFn: () => {
      return hardRefresh();
    },
    onSuccess: () => {
      queryClient.invalidateQueries(
        { queryKey: VERSION_CHECK_QUERY_KEY, refetchType: "all" },
        {
          cancelRefetch: true,
        }
      );
    },
    onError: (error) => {
      console.error("[Version] Error applying update:", error);
    },
  });

  React.useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("[Version] Version checking disabled in development mode");
    } else {
      console.log(`[Version] Version check started (every ${VERSION_CHECK_INTERVAL / 1000}s)`);
    }
  }, []);

  return (
    <VersionContext.Provider value={{ newVersion, checkForUpdates, isCheckingForUpdates, isUpdating, applyUpdate }}>
      {children}

      {newVersion && (
        <VersionNotification
          key={newVersion.buildTimestamp}
          newVersion={newVersion}
          isUpdating={isUpdating}
          applyUpdate={applyUpdate}
        />
      )}
    </VersionContext.Provider>
  );
};

/**
 * Get formatted version string for display
 */
// getVersionString(): string {
//   const { version, commit, branch } = this.currentVersion;
//   return `v${version} (${commit}${branch !== 'master' && branch !== 'main' ? ` - ${branch}` : ''})`;
// }

/**
 * Get formatted build time for display
 */
// getBuildTimeString(): string {
//   const buildDate = new Date(this.currentVersion.buildTime);
//   return buildDate.toLocaleString();
// }
