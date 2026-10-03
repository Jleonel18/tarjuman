import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const root = document.getElementById("root");
if (!root) throw new Error("Missing #root element");

// Placeholder shell; the composition root and routing arrive in T039-T041.
createRoot(root).render(<StrictMode />);
