import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import "./App.css";
import { OS } from "./components/os";
import { WindowsProvider } from "./contexts/windows";
import { VersionProvider } from "./contexts/version";

const queryClient = new QueryClient();

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <VersionProvider>
        <WindowsProvider>
          <OS />
        </WindowsProvider>
      </VersionProvider>
    </QueryClientProvider>
  );
}
