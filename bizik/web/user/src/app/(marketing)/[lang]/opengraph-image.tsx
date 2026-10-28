import { ImageResponse } from 'next/og';

/**
 * The card every share of the site renders - WhatsApp, X, LinkedIn, Slack.
 *
 * Generated rather than shipped as a file so the wording stays in one place and
 * cannot drift from the site. Sitting at the app root means every route without
 * its own card inherits this one, so no page shares as a bare link.
 *
 * Satori (which renders this) is not a browser: every element with more than
 * one child must declare `display` explicitly, and there is no `<br/>`. Each
 * line below is therefore its own flex child.
 */
export const alt = 'Bizik - escrow for Mobile Money deals in Cameroon';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '72px 80px',
          background: 'linear-gradient(135deg, #0B2A4A 0%, #123A5E 55%, #1D4FD8 100%)',
          color: '#fff',
          fontFamily: 'sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 56,
              height: 56,
              borderRadius: 14,
              marginRight: 18,
              background: '#2563EB',
              fontSize: 34,
              fontWeight: 800,
            }}
          >
            B
          </div>
          <div style={{ display: 'flex', fontSize: 34, fontWeight: 800 }}>BIZIK</div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'flex', fontSize: 66, fontWeight: 800, lineHeight: 1.08 }}>
            The seller gets paid
          </div>
          <div style={{ display: 'flex', fontSize: 66, fontWeight: 800, lineHeight: 1.08 }}>
            after you confirm it arrived.
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 24,
              fontSize: 30,
              color: '#A9C6E8',
              lineHeight: 1.35,
            }}
          >
            Escrow for MTN MoMo and Orange Money deals. Start one on WhatsApp.
          </div>
        </div>

        <div style={{ display: 'flex', fontSize: 24, color: '#7FB3E8' }}>
          <div style={{ display: 'flex', marginRight: 24 }}>bizik.cm</div>
          <div style={{ display: 'flex' }}>Built for Cameroon</div>
        </div>
      </div>
    ),
    size,
  );
}
