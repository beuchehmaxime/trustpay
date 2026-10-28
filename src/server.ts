import { config, missingConfig } from './config/env';
import { createApp } from './app';

const app = createApp();

app.listen(config.port, () => {
  console.log(`[trustpay] listening on ${config.port} (${config.env})`);
  const gaps = missingConfig();
  if (gaps.length) {
    // Loud on purpose. The service starts anyway so the stack comes up and
    // the scrubber can be exercised, but it must never look ready when the
    // pipeline cannot actually run.
    console.warn(`[trustpay] NOT READY - missing: ${gaps.join(', ')}`);
  }
});
