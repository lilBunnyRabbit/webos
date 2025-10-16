import "./App.css";
import { OS } from "./components/os";
import { WindowsProvider } from "./contexts/windows";
import { UpdateNotification } from "./components/update-notification";

export default function App() {
  return (
    <WindowsProvider>
      <OS />
      <UpdateNotification />
    </WindowsProvider>
  );
}
