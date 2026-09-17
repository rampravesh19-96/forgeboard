import { sessionSecret } from './auth/session';

export function runtimeConfig() {
  sessionSecret();
  const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4000);
  if (!Number.isInteger(port) || port < 1 || port > 65535)
    throw new Error('PORT/API_PORT must be an integer between 1 and 65535.');
  const origin = process.env.WEB_ORIGIN ?? 'http://localhost:3000';
  try {
    const url = new URL(origin);
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.origin !== origin ||
      (process.env.NODE_ENV === 'production' && url.protocol !== 'https:')
    )
      throw new Error();
  } catch {
    throw new Error(
      'WEB_ORIGIN must be an exact HTTP origin (HTTPS in production), without a trailing slash.',
    );
  }
  for (const [name, protocols, required] of [
    ['DATABASE_URL', ['postgres:', 'postgresql:'], true],
    ['REDIS_URL', ['redis:', 'rediss:'], false],
  ] as const) {
    const value = process.env[name];
    if (!value && !required) continue;
    try {
      if (
        !value ||
        !(protocols as readonly string[]).includes(new URL(value).protocol)
      )
        throw new Error();
    } catch {
      throw new Error(`${name} must be a valid connection URL.`);
    }
  }
  return {
    port,
    host:
      process.env.API_HOST ??
      (process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
  };
}
