/**
 * Send push notifications through Expo's push service directly over HTTP (no SDK
 * dependency). Best-effort and fire-and-forget: a push failure must never break
 * the request that produced the notification.
 */
const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound?: 'default';
}

function isExpoToken(token: string): boolean {
  return token.startsWith('ExponentPushToken[') || token.startsWith('ExpoPushToken[');
}

export async function sendExpoPush(messages: ExpoPushMessage[]): Promise<void> {
  const deliverable = messages.filter((message) => isExpoToken(message.to));
  if (deliverable.length === 0) return;
  try {
    const response = await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(deliverable),
    });
    if (!response.ok) {
      console.error(`[push] Expo push rejected: ${response.status}`);
    }
  } catch (error) {
    console.error('[push] Expo push error:', (error as Error).message);
  }
}
