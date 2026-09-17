import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../database/prisma.service';
import { readSession, SESSION_COOKIE, sessionSecret } from './session';

export type AuthRequest = Request & { userId: string };

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthRequest>();
    const userId = readSession(
      (request.cookies as Record<string, unknown> | undefined)?.[
        SESSION_COOKIE
      ],
      sessionSecret(),
    );
    if (
      !userId ||
      !(await this.prisma.user.findUnique({ where: { id: userId } }))
    )
      throw new UnauthorizedException('Please sign in to continue.');
    request.userId = userId;
    return true;
  }
}
