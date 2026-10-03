import { AppShell, I18nextProvider } from "@tarjuman/ui";
import "@tarjuman/ui/styles/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createAppServices } from "./composition-root";
import { Routes } from "./routes";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
const root = createRoot(container);

createAppServices()
  .then((services) => {
    root.render(
      <StrictMode>
        <I18nextProvider i18n={services.i18n}>
          <AppShell>
            <Routes />
          </AppShell>
        </I18nextProvider>
      </StrictMode>,
    );
  })
  .catch((error: unknown) => {
    // A localized boot-failure screen needs the i18n we just failed to create; it arrives with the
    // onboarding flow (T067). Until then the failure is at least visible in the console.
    console.error("Tarjuman failed to start", error);
  });
