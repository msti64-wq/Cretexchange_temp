import { createRoot } from "react-dom/client";
import { installConsoleRedaction } from "../../shared/logRedaction";
import App from "./App";
import "./index.css";

installConsoleRedaction();

createRoot(document.getElementById("root")!).render(<App />);
