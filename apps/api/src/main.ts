import { createApp } from './app';
import { runtimeConfig } from './config';

async function bootstrap() {
  const { port, host } = runtimeConfig();
  const app = await createApp();
  await app.listen(port, host);
}

void bootstrap().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
