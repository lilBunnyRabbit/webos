import "./App.css";
import { Desktop } from "./components/desktop";
import { WindowsProvider } from "./contexts/windows";

export default function App() {
  return (
    <WindowsProvider>
      <Desktop />
    </WindowsProvider>
  );
}
