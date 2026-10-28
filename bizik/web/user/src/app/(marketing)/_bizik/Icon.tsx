import type { CSSProperties } from 'react';

/**
 * Inline SVG icon set for the Bizik marketing site - the exact 24×24 stroke
 * icons the design uses, rendered with the shared `q-icon` class. Kept inline
 * (no icon library) so they ship with zero extra requests and inherit color.
 */
const PATHS: Record<string, string> = {
  whatsapp:
    '<path d="M12 3a9 9 0 00-7.7 13.6L3.2 21l4.5-1.1A9 9 0 1012 3z"/><path d="M9 9.5c0 3 2.5 5.5 5.5 5.5.6 0 1-.4 1-1v-.8l-1.9-.8-.8 1a5.6 5.6 0 01-2.2-2.2l1-.8-.8-1.9H10c-.6 0-1 .4-1 1z"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0"/><path d="M12 18v3"/>',
  lock: '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/>',
  send: '<path d="M21 3L10.5 13.5"/><path d="M21 3l-6.5 18-4-8-8-4z"/>',
  id: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><circle cx="9" cy="11" r="2"/><path d="M5.8 16.2a3.6 3.6 0 016.4 0"/><path d="M15 10h4M15 14h4"/>',
  dashboard: '<path d="M12 3l9 5-9 5-9-5z"/><path d="M3 13l9 5 9-5"/>',
  wallet: '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3 10h18"/><circle cx="17" cy="14" r="1.2"/>',
  plus: '<path d="M12 5v14"/><path d="M5 12h14"/>',
  withdraw: '<path d="M12 3v12"/><path d="M7.5 11L12 15.5 16.5 11"/><path d="M4 20h16"/>',
  convert: '<path d="M4 8h13l-3-3"/><path d="M20 16H7l3 3"/>',
  file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/>',
  briefcase:
    '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0110.5 4h3A1.5 1.5 0 0115 5.5V7"/><path d="M3 12h18"/>',
  scale: '<path d="M12 4v16"/><path d="M6 8h12"/><path d="M6 8l-3 6h6z"/><path d="M18 8l-3 6h6z"/>',
  refresh:
    '<path d="M4 12a8 8 0 0113.7-5.6L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 01-13.7 5.6L4 15"/><path d="M4 20v-5h5"/>',
  mobile: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  check: '<circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7.5V12l3 2"/>',
  shield: '<path d="M12 3l7 3v5c0 4.4-3 8.5-7 10-4-1.5-7-5.6-7-10V6z"/>',
  users: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19a5.5 5.5 0 0111 0"/><path d="M16 5.2a3.2 3.2 0 010 5.6"/><path d="M20.5 19a5.5 5.5 0 00-4-5.3"/>',
  handshake: '<path d="M3 12l4-4 5 4 5-4 4 4"/><path d="M12 12l2 2a1.5 1.5 0 002-2"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3a14 14 0 010 18 14 14 0 010-18z"/>',
  card: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 9h18"/>',
  bolt: '<path d="M13 2L4 14h7l-1 8 9-12h-7z"/>',
  message: '<path d="M4 5h16a1 1 0 011 1v9a1 1 0 01-1 1H8l-4 4z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  arrow: '<path d="M5 12h14"/><path d="M13 5l7 7-7 7"/>',
  'arrow-right': '<path d="M5 12h14"/><path d="M13 5l7 7-7 7"/>',
  phone: '<rect x="6" y="2.5" width="12" height="19" rx="2.5"/><path d="M10.5 18.5h3"/>',
  twitter:
    '<path d="M18 4l-5.5 7L19 20h-4l-4-5.2L6 20H3l6-7.5L4 4h4l3.5 4.7L15 4z"/>',
  linkedin:
    '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 10v7M7 7v.01M11 17v-4a2 2 0 014 0v4"/>',
  facebook: '<path d="M14 8h2V5h-2a3 3 0 00-3 3v2H9v3h2v6h3v-6h2l1-3h-3V8a1 1 0 011-1z"/>',
};

export function Icon({
  name,
  size = 18,
  className = '',
  style,
}: {
  name: keyof typeof PATHS | string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      className={`q-icon ${className}`.trim()}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={style}
      dangerouslySetInnerHTML={{ __html: PATHS[name] ?? '' }}
    />
  );
}
