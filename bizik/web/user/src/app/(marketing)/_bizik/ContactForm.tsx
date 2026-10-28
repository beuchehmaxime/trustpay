'use client';

import { useState } from 'react';

/** Public API base (baked at build time for the browser). */
const API = (process.env.NEXT_PUBLIC_API_URL || '/api/v1').replace(/\/+$/, '');

type Status = 'idle' | 'sending' | 'sent' | 'error';

/**
 * Every string the form renders.
 *
 * The form is a client component, so it cannot reach the server-side
 * translator itself. The page resolves the copy in the request's language and
 * hands it down, which keeps one translation source for the whole site.
 */
export interface ContactFormCopy {
  honeypot: string;
  name: string;
  phone: string;
  email: string;
  topic: string;
  message: string;
  consent: string;
  submit: string;
  sending: string;
  pinWarning: string;
  error: string;
  sentTitle: string;
  sentText: string;
  sentAgain: string;
  topics: string[];
}

/**
 * Contact form for the marketing site. Posts to the public `POST /contact`
 * endpoint, which stores the message and notifies the support team by email +
 * an admin-console notification. Includes a honeypot field for basic bot
 * defence; the button and messaging are handled client-side.
 */
export function ContactForm({ copy }: { copy: ContactFormCopy }) {
  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState('');

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === 'sending') return;
    const form = event.currentTarget;
    const data = new FormData(form);
    setStatus('sending');
    setError('');
    try {
      const response = await fetch(`${API}/contact`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: String(data.get('bizik_name') || ''),
          phone: String(data.get('bizik_phone') || ''),
          email: String(data.get('bizik_email') || ''),
          topic: String(data.get('bizik_topic') || ''),
          message: String(data.get('bizik_message') || ''),
          website: String(data.get('bizik_website') || ''),
        }),
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);
      form.reset();
      setStatus('sent');
    } catch {
      setError(copy.error);
      setStatus('error');
    }
  }

  if (status === 'sent') {
    return (
      <div className="q-card q-card--tint q-card--pad-lg" role="status">
        <h3 className="q-h5">{copy.sentTitle}</h3>
        <p className="q-body q-mt-8">{copy.sentText}</p>
        <button
          className="q-btn q-btn--outline q-btn--sm q-mt-16"
          type="button"
          onClick={() => setStatus('idle')}
        >
          {copy.sentAgain}
        </button>
      </div>
    );
  }

  return (
    <form className="q-stack q-gap-16" onSubmit={onSubmit} noValidate>
      <p className="q-hidden" aria-hidden="true">
        <label>
          {copy.honeypot} <input type="text" name="bizik_website" tabIndex={-1} autoComplete="off" />
        </label>
      </p>

      <div className="q-grid q-grid--2">
        <div className="q-field">
          <label className="q-label" htmlFor="q-c-name">{copy.name}</label>
          <input type="text" id="q-c-name" name="bizik_name" required autoComplete="name" />
        </div>
        <div className="q-field">
          <label className="q-label" htmlFor="q-c-phone">{copy.phone}</label>
          <input type="tel" id="q-c-phone" name="bizik_phone" autoComplete="tel" />
        </div>
      </div>

      <div className="q-field">
        <label className="q-label" htmlFor="q-c-email">{copy.email}</label>
        <input type="email" id="q-c-email" name="bizik_email" required autoComplete="email" />
      </div>

      <div className="q-field">
        <label className="q-label" htmlFor="q-c-topic">{copy.topic}</label>
        <select id="q-c-topic" name="bizik_topic" defaultValue={copy.topics[0]}>
          {copy.topics.map((topic) => (
            <option key={topic}>{topic}</option>
          ))}
        </select>
      </div>

      <div className="q-field">
        <label className="q-label" htmlFor="q-c-message">{copy.message}</label>
        <textarea id="q-c-message" name="bizik_message" required />
      </div>

      <label className="q-checkbox">
        <input type="checkbox" name="bizik_consent" required />
        <span>{copy.consent}</span>
      </label>

      {status === 'error' && <p className="q-error" role="alert">{error}</p>}

      <button className="q-btn q-btn--primary q-btn--block" type="submit" disabled={status === 'sending'}>
        {status === 'sending' ? copy.sending : copy.submit}
      </button>

      <p className="q-help-text">{copy.pinWarning}</p>
    </form>
  );
}
