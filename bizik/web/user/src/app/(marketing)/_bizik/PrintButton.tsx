'use client';

/** Print the current legal document. Client-only (uses window.print). */
export function PrintButton() {
  return (
    <button className="q-btn q-btn--ghost-light q-btn--sm" type="button" onClick={() => window.print()}>
      Print
    </button>
  );
}
