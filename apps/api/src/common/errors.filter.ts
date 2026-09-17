import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Response } from 'express';

@Catch()
export class ErrorsFilter implements ExceptionFilter {
  private readonly logger = new Logger(ErrorsFilter.name);
  catch(error: unknown, host: ArgumentsHost) {
    let status = 500;
    let message: string | string[] = 'Something went wrong. Please try again.';
    if (error instanceof HttpException) {
      status = error.getStatus();
      const response = error.getResponse();
      message =
        typeof response === 'string'
          ? response
          : (response as { message: string | string[] }).message;
    } else if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2025') {
        status = 404;
        message = 'Record not found.';
      } else if (['P2002', 'P2003', 'P2034'].includes(error.code)) {
        status = 409;
        message =
          'This change conflicts with another update. Refresh and try again.';
      } else {
        this.logger.error(error.message);
      }
    } else if (error instanceof Prisma.PrismaClientInitializationError) {
      status = 503;
      message =
        'Database unavailable. Start PostgreSQL and run migrations and seed.';
    } else {
      this.logger.error(
        error instanceof Error ? error.stack : 'Unexpected error',
      );
    }
    host
      .switchToHttp()
      .getResponse<Response>()
      .status(status)
      .json({ statusCode: status, message });
  }
}
