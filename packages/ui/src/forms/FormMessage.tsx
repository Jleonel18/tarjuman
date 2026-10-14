import { CircleAlert, Info } from "lucide-react";
import type { ReactElement, ReactNode } from "react";

interface FormMessageProps {
  children: ReactNode;
  /** For `aria-describedby` on the field the message is about. */
  id?: string | undefined;
  /** `null` for a message that is not announced on its own. */
  role?: "alert" | "status" | null | undefined;
  className?: string | undefined;
}

/**
 * An error under a form or in a panel (FR-010): an icon and the words, so it never relies on color
 * alone. The icon is decorative; the text carries the meaning.
 */
export function FormError({ children, id, role = "alert", className }: FormMessageProps): ReactElement {
  return (
    <p id={id} role={role ?? undefined} className={className ? `form__error ${className}` : "form__error"}>
      <CircleAlert aria-hidden="true" className="icon" />
      <span>{children}</span>
    </p>
  );
}

/** A notice, such as "this browser can't save data": the notice style with an info icon. */
export function FormNotice({ children, id, role, className }: FormMessageProps): ReactElement {
  return (
    <p id={id} role={role ?? undefined} className={className ? `form__notice ${className}` : "form__notice"}>
      <Info aria-hidden="true" className="icon" />
      <span>{children}</span>
    </p>
  );
}
