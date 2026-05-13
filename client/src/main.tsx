import { createRoot } from "react-dom/client";
import { installConsoleRedaction } from "../../shared/logRedaction";
import "./index.css";

installConsoleRedaction();

void import("./App").then(({ default: App }) => {
  createRoot(document.getElementById("root")!).render(<App />);
});
