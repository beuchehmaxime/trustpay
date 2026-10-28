import { describe, expect, it } from 'vitest';

import { stripEmoji, tidyMarkup } from './whatsapp-format';

describe('tidyMarkup', () => {
  it('collapses markdown bold onto the single asterisk WhatsApp understands', () => {
    expect(tidyMarkup('Send **5000 FCFA** now')).toBe('Send *5000 FCFA* now');
  });

  it('kills the run of three asterisks the user reported', () => {
    expect(tidyMarkup('***Deal created***')).toBe('*Deal created*');
  });

  it('leaves our own single-asterisk bold alone', () => {
    const ours = 'Reply *VERIFY* to start over.';
    expect(tidyMarkup(ours)).toBe(ours);
  });

  it('turns em dashes and double hyphens into commas', () => {
    expect(tidyMarkup('Payment received \u2014 5000 is in escrow')).toBe(
      'Payment received, 5000 is in escrow',
    );
    expect(tidyMarkup('Funded -- the money is safe')).toBe('Funded, the money is safe');
  });

  it('strips markdown headings and rewrites markdown bullets', () => {
    expect(tidyMarkup('## Your deals\n- one\n* two')).toBe('Your deals\n• one\n• two');
  });

  it('leaves an ordinary sentence untouched', () => {
    const plain = 'Your balance is 12,500 FCFA.';
    expect(tidyMarkup(plain)).toBe(plain);
  });
});

describe('stripEmoji', () => {
  it('removes emoji the model added, and the space it sat in', () => {
    expect(stripEmoji('👋 Hello! 🎉 Your deal is ready 🚀')).toBe('Hello! Your deal is ready');
  });

  it('removes an emoji that opens each line of a list', () => {
    expect(stripEmoji('Options:\n📝 create a deal\n💰 fund a deal')).toBe(
      'Options:\ncreate a deal\nfund a deal',
    );
  });

  it('keeps text that merely contains symbols we use', () => {
    const plain = 'Send it to @maxime.b (5,000 FCFA).';
    expect(stripEmoji(plain)).toBe(plain);
  });
});
