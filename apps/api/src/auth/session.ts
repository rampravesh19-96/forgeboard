import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_COOKIE = 'forgeboard_session';
export const SESSION_SECONDS = 60 * 60 * 8;

export function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (!secret || secret.length < 32 || secret.startsWith('replace-with-'))
    throw new Error(
      'SESSION_SECRET must be a random value of at least 32 characters. Set it in the root .env.',
    );
  return secret;
}

export function signSession(
  userId: string,
  secret: string,
  now = Date.now(),
  lifetime = SESSION_SECONDS * 1000,
) {
  const payload = Buffer.from(
    JSON.stringify({ userId, expires: now + lifetime }),
  ).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}

export function readSession(
  token: unknown,
  secret: string,
  now = Date.now(),
): string | null {
  return readSessionClaims(token, secret, now)?.userId ?? null;
}

export function realtimeSecret() {
  return createHmac('sha256', sessionSecret())
    .update('forgeboard:realtime:v1')
    .digest('hex');
}

export function readSessionClaims(
  token: unknown,
  secret: string,
  now = Date.now(),
): { userId: string; expires: number } | null {
  if (typeof token !== 'string' || token.length > 1024) return null;
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) return null;
  const expected = createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString()) as {
      userId?: unknown;
      expires?: unknown;
    };
    return typeof data.userId === 'string' &&
      typeof data.expires === 'number' &&
      data.expires > now
      ? { userId: data.userId, expires: data.expires }
      : null;
  } catch {
    return null;
  }
}
