import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { OS } from "./components/os";
import { VersionProvider } from "./contexts/version";
import { WindowManagerProvider } from "./contexts/window-manager";

const queryClient = new QueryClient();

export default function WebOS() {
  return (
    <QueryClientProvider client={queryClient}>
      <VersionProvider>
        <WindowManagerProvider>
          <OS />
        </WindowManagerProvider>
      </VersionProvider>
    </QueryClientProvider>
  );
}