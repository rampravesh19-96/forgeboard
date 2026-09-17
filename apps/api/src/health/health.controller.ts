import { Controller, Get } from '@nestjs/common';
import type { HealthResponse } from '@forgeboard/types';

@Controller('health')
export class HealthController {
  @Get()
  getHealth(): HealthResponse {
    return { status: 'ok', service: 'forgeboard-api' };
  }
}
