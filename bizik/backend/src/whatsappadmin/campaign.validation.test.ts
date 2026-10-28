import { describe, expect, it } from 'vitest';

import { sendCampaignSchema } from './campaign.validation';

/**
 * A campaign is the one place where a single bad field costs thousands of failed
 * sends: Meta rejects the whole message when a template name or a variable is
 * malformed, and it does so per recipient. These checks exist to turn that into
 * one error at compose time.
 */
const valid = {
  name: 'September - nudge unverified signups',
  segment: 'unverified',
  template: 'finish_your_verification',
};

describe('campaign validation', () => {
  it('accepts a well-formed campaign', () => {
    expect(sendCampaignSchema.parse(valid).template).toBe('finish_your_verification');
  });

  it('rejects template names Meta could not have approved', () => {
    // Meta template names are lowercase letters, digits and underscores.
    for (const template of ['Finish Verification', 'finish-verification', 'FINISH_V', 'finish.v']) {
      expect(sendCampaignSchema.safeParse({ ...valid, template }).success).toBe(false);
    }
  });

  it('allows an EMPTY template, because not every rail has templates', () => {
    // This used to be rejected here, when Meta was the only rail and a template
    // name was always required. WasenderAPI has no templates at all and sends
    // the message text instead, so "is a template required?" is now a question
    // about the live rail rather than about the shape of the request.
    //
    // The requirement did not disappear - it moved to missingForProvider(),
    // where it can answer differently per rail. campaign-pacing.test.ts pins
    // that the Meta rail still refuses a campaign with no template.
    expect(sendCampaignSchema.safeParse({ ...valid, template: '' }).success).toBe(true);
  });

  it('accepts a message body, for the rail that sends prose', () => {
    const result = sendCampaignSchema.safeParse({
      ...valid,
      template: '',
      body: 'Hi, it is Bizik. You have not finished verifying yet.',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a variable containing a line break, which the Cloud API refuses', () => {
    const result = sendCampaignSchema.safeParse({
      ...valid,
      variables: ['fine', 'two\nlines'],
    });
    expect(result.success).toBe(false);
  });

  it('accepts variables without line breaks', () => {
    const parsed = sendCampaignSchema.parse({ ...valid, variables: ['BiZik', '5 minutes'] });
    expect(parsed.variables).toEqual(['BiZik', '5 minutes']);
  });

  it('requires a name long enough to recognise later', () => {
    expect(sendCampaignSchema.safeParse({ ...valid, name: 'ab' }).success).toBe(false);
  });

  it('caps the number of variables, since no approved template needs dozens', () => {
    const tooMany = Array.from({ length: 11 }, (_unused, index) => `value ${index}`);
    expect(sendCampaignSchema.safeParse({ ...valid, variables: tooMany }).success).toBe(false);
  });
});
