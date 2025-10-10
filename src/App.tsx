import "./App.css";
import { OS } from "./components/os";
import { WindowsProvider } from "./contexts/windows";

export default function App() {
  return (
    <WindowsProvider>
      <OS />
    </WindowsProvider>
  );
}
