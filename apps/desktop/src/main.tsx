import { createRoot } from "react-dom/client";
import { Root } from "./App";
import "./styles.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Renderer root element is missing.");
}

createRoot(container).render(<Root />);
