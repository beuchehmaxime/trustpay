import crypto from 'crypto';

import axios from 'axios';

import { config } from '../../../config/env';

/**
 * MTN SANDBOX one-time provisioning.
 *
 * On the MTN sandbox the developer portal only gives you a *subscription key*
 * per product. Before you can request a token you must create an "API User"
 * (a UUID you choose) and generate its "API Key" - this script does that for
 * whichever products have a subscription key set, and prints the .env lines to
 * paste. In PRODUCTION MTN issues the user/key for you, so this step is skipped.
 *
 * Run: docker compose exec backend node dist/payments/infrastructure/mtn/provision-sandbox.js
 * (with MTN_COLLECTION_SUBSCRIPTION_KEY / MTN_DISBURSEMENT_SUBSCRIPTION_KEY set).
 */
async function provisionProduct(
  baseUrl: string,
  subscriptionKey: string,
  callbackHost: string,
): Promise<{ userId: string; apiKey: string }> {
  // The API user id is a reference id WE choose.
  const userId = crypto.randomUUID();

  await axios.post(
    `${baseUrl}/v1_0/apiuser`,
    { providerCallbackHost: callbackHost },
    {
      headers: {
        'X-Reference-Id': userId,
        'Ocp-Apim-Subscription-Key': subscriptionKey,
        'Content-Type': 'application/json',
      },
      timeout: 15000,
    },
  );

  const { data } = await axios.post<{ apiKey: string }>(
    `${baseUrl}/v1_0/apiuser/${userId}/apikey`,
    {},
    { headers: { 'Ocp-Apim-Subscription-Key': subscriptionKey }, timeout: 15000 },
  );

  return { userId, apiKey: data.apiKey };
}

async function main(): Promise<void> {
  const mtn = config.payments.mtn;
  const baseUrl = mtn.baseUrl.replace(/\/+$/, '');
  // Any resolvable host is fine for the sandbox; use the configured callback host.
  const callbackHost =
    (config.payments.callbackBaseUrl || 'https://example.com').replace(/^https?:\/\//, '').split('/')[0] ||
    'example.com';

  console.log(`\n[mtn:provision] base=${baseUrl} callbackHost=${callbackHost}\n`);
  let provisionedAny = false;

  const products: { label: string; env: string; subscriptionKey: string }[] = [
    { label: 'Collection', env: 'MTN_COLLECTION', subscriptionKey: mtn.collection.subscriptionKey },
    { label: 'Disbursement', env: 'MTN_DISBURSEMENT', subscriptionKey: mtn.disbursement.subscriptionKey },
  ];

  for (const product of products) {
    if (!product.subscriptionKey) {
      console.log(`[mtn:provision] ${product.label}: no ${product.env}_SUBSCRIPTION_KEY set - skipped.`);
      continue;
    }
    try {
      const { userId, apiKey } = await provisionProduct(baseUrl, product.subscriptionKey, callbackHost);
      provisionedAny = true;
      console.log(`\n# ${product.label} - add these to your root .env:`);
      console.log(`${product.env}_USER_ID=${userId}`);
      console.log(`${product.env}_API_KEY=${apiKey}\n`);
    } catch (error) {
      const detail = axios.isAxiosError(error)
        ? `${error.response?.status} ${JSON.stringify(error.response?.data ?? error.message)}`
        : (error as Error).message;
      console.error(`[mtn:provision] ${product.label} FAILED: ${detail}`);
    }
  }

  if (!provisionedAny) {
    console.log('\n[mtn:provision] Nothing provisioned. Set at least MTN_COLLECTION_SUBSCRIPTION_KEY.\n');
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[mtn:provision] fatal:', (error as Error).message);
    process.exit(1);
  });
}

export { provisionProduct };
