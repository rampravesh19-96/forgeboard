import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { createClient } from 'redis';

@Injectable()
export class CacheService implements OnModuleDestroy {
  private readonly logger = new Logger(CacheService.name);
  private readonly client = process.env.REDIS_URL
    ? createClient({
        url: process.env.REDIS_URL,
        disableOfflineQueue: true,
        socket: { connectTimeout: 500, reconnectStrategy: false },
      })
    : null;
  private retryAfter = 0;
  private connecting = false;
  constructor() {
    this.client?.on('error', () => {
      this.retryAfter = Date.now() + 30_000;
    });
  }
  private async ready() {
    if (!this.client || this.connecting || Date.now() < this.retryAfter)
      return false;
    if (this.client.isReady) return true;
    this.connecting = true;
    try {
      if (!this.client.isOpen) await this.client.connect();
      return this.client.isReady;
    } catch {
      this.retryAfter = Date.now() + 30_000;
      this.logger.warn('Redis unavailable; serving fresh database data.');
      return false;
    } finally {
      this.connecting = false;
    }
  }
  async get<T>(key: string): Promise<T | null> {
    if (!(await this.ready())) return null;
    try {
      const raw = await this.client!.get(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  }
  async set(key: string, value: unknown) {
    if (!(await this.ready())) return;
    try {
      await this.client!.set(key, JSON.stringify(value), { EX: 20 });
    } catch {
      /* cache is optional */
    }
  }
  async invalidate(workspaceId: string) {
    if (!(await this.ready())) return;
    try {
      await this.client!.del(`dashboard:${workspaceId}`);
    } catch {
      /* at most 20 seconds stale */
    }
  }
  async onModuleDestroy() {
    if (this.client?.isOpen) this.client.destroy();
  }
}
