import { useTranslation } from "@tarjuman/ui";
import type { ReactElement } from "react";
import { useAppStore, type RouteId } from "./store";

/** Placeholder screens; the real ones arrive with each user story. */
function Placeholder(): ReactElement {
  const { t } = useTranslation();
  return <p>{t("common.loading")}</p>;
}

const SCREENS: Record<RouteId, () => ReactElement> = {
  onboarding: Placeholder,
  key: Placeholder,
  chat: Placeholder,
  settings: Placeholder,
};

export function Routes(): ReactElement {
  const route = useAppStore((state) => state.route);
  const Screen = SCREENS[route];
  return <Screen />;
}
