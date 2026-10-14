import { PanelLeftOpen, X } from "lucide-react";
import { useEffect, useId, useRef, useState, type ReactElement, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

/** Where the sidebar stops being a drawer. The same literal is in base.css; media queries cannot read tokens. */
const WIDE = "(min-width: 64rem)";

export interface WorkspaceProps {
  /**
   * Conversations, usage, and settings. Call `onNavigate` when the learner picks something there
   * (a conversation, a new one, settings), so the drawer closes on narrow screens.
   */
  sidebar: (helpers: { onNavigate: () => void }) => ReactNode;
  /** The chat: the reading column and its composer. */
  children: ReactNode;
}

/**
 * The chat screen's arrangement (FR-007, contracts/ui-shell.md): a persistent sidebar beside the
 * reading column on wide screens, and below 64rem a drawer that slides in from the inline-start
 * edge, so it opens from the right in right-to-left layouts. While it is open the content behind it
 * is inert; Escape, the close button, the backdrop, or choosing something in it closes it, and
 * focus goes back to the toggle.
 */
export function Workspace({ sidebar, children }: WorkspaceProps): ReactElement {
  const { t } = useTranslation();
  const sideId = useId();
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);
  const close = () => setOpen(false);

  useEffect(() => {
    if (open) closeRef.current?.focus();
    else if (wasOpen.current) toggleRef.current?.focus();
    wasOpen.current = open;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  // Growing past the breakpoint turns the drawer back into a sidebar, which is never "open".
  useEffect(() => {
    const wide = window.matchMedia(WIDE);
    const onChange = () => {
      if (wide.matches) setOpen(false);
    };
    wide.addEventListener("change", onChange);
    return () => wide.removeEventListener("change", onChange);
  }, []);

  return (
    <div className="workspace" data-drawer-open={open ? "" : undefined}>
      <div id={sideId} className="workspace__side">
        <div className="workspace__drawer-bar">
          <button ref={closeRef} type="button" className="button button--quiet" onClick={close}>
            <X aria-hidden="true" className="icon" />
            <span>{t("shell.sidebar.close")}</span>
          </button>
        </div>
        {sidebar({ onNavigate: close })}
      </div>
      {open ? <div className="workspace__backdrop" aria-hidden="true" onClick={close} /> : null}
      <div className="workspace__main" inert={open}>
        <div className="workspace__toolbar">
          <button
            ref={toggleRef}
            type="button"
            className="button button--secondary"
            aria-expanded={open}
            aria-controls={sideId}
            onClick={() => setOpen(true)}
          >
            <PanelLeftOpen aria-hidden="true" className="icon icon-directional" />
            <span>{t("shell.sidebar.open")}</span>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
