import { config, missingConfig } from './config/env';
import { createApp } from './app';

const app = createApp();

app.listen(config.port, () => {
  console.log(`[trustpay] listening on ${config.port} (${config.env})`);
  // Said on every boot, on purpose. The rule that matters most here is the
  // easiest one to forget at 2am on the night before a submission, and a
  // banner costs nothing.
  if (config.tier !== 'standard') {
    console.warn(
      '[trustpay] DISCOUNTED TIER - Meta may use inputs and outputs to train. ' +
        'SYNTHETIC EVIDENCE ONLY. Real dispute data must not be sent: ' +
        'Cameroon Law 2024/017 restricts transfer abroad without authorisation.',
    );
  }

  const gaps = missingConfig();
  if (gaps.length) {
    // Loud on purpose. The service starts anyway so the stack comes up and
    // the scrubber can be exercised, but it must never look ready when the
    // pipeline cannot actually run.
    console.warn(`[trustpay] NOT READY - missing: ${gaps.join(', ')}`);
  }
});
