import type { ReactElement, ReactNode } from "react";
import { useTranslation } from "react-i18next";

export interface InertLinkProps {
  /** The address the link opens. The OutputGuard only lets plain http(s) and mailto through. */
  destination: string;
  /** The same address as the OutputGuard reports it, always shown so the text cannot disguise it. */
  destinationDisplay: string;
  /** What the model wrote as the link text. */
  children: ReactNode;
}

/**
 * A link from model output (Principle V). It is inert until the learner acts: nothing is fetched
 * or prefetched, the real destination is always printed beside the text, and activating it opens
 * a new tab that cannot reach back to this page (`noopener`) and is told nothing about it
 * (`noreferrer`, no-referrer policy). This is the only element that carries a model-supplied address.
 */
export function InertLink({ destination, destinationDisplay, children }: InertLinkProps): ReactElement {
  const { t } = useTranslation();
  return (
    <span className="inert-link">
      <a href={destination} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">
        {children}
        <span className="visually-hidden"> {t("chat.link.new_tab")}</span>
      </a>{" "}
      <code className="inert-link__destination" dir="ltr">
        {destinationDisplay}
      </code>
    </span>
  );
}
