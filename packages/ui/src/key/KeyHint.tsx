import type { ReactNode } from "react";

/**
 * A translated sentence with the masked key hint inside it shown in the monospace face, so the
 * hint reads as a code and the sentence still comes whole from the catalog. Only the hint, never
 * the key, is ever passed here (FR-015).
 */
export function withKeyHint(sentence: string, hint: string): ReactNode {
  const at = hint === "" ? -1 : sentence.indexOf(hint);
  if (at < 0) return sentence;
  return (
    <>
      {sentence.slice(0, at)}
      <code className="key-hint" dir="ltr">
        {hint}
      </code>
      {sentence.slice(at + hint.length)}
    </>
  );
}
