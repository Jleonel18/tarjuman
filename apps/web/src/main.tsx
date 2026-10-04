import { AppShell, I18nextProvider, createI18n } from "@tarjuman/ui";
import "@tarjuman/ui/styles/base.css";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createAppServices } from "./composition-root";
import { AppController } from "./controller";
import { Routes } from "./routes";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root element");
const root = createRoot(container);

async function start(): Promise<void> {
  const services = await createAppServices();
  const controller = new AppController(services);
  await controller.boot();
  root.render(
    <StrictMode>
      <I18nextProvider i18n={services.i18n}>
        <AppShell>
          <Routes controller={controller} services={services} />
        </AppShell>
      </I18nextProvider>
    </StrictMode>,
  );
}

start().catch(async (error: unknown) => {
  console.error("Tarjuman failed to start", error);
  // A separate i18n instance, so the message still shows if the one in the services was the problem.
  const i18n = await createI18n();
  root.render(
    <StrictMode>
      <I18nextProvider i18n={i18n}>
        <AppShell>
          <p role="alert">{i18n.t("app.boot_failed")}</p>
        </AppShell>
      </I18nextProvider>
    </StrictMode>,
  );
});
