import {
  Controller,
  Get,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PrismaService } from '../database/prisma.service';
import { AuthGuard, type AuthRequest } from './auth.guard';
import {
  SESSION_COOKIE,
  SESSION_SECONDS,
  signSession,
  sessionSecret,
  realtimeSecret,
} from './session';

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}
  @Post('demo')
  async demo(@Res({ passthrough: true }) response: Response) {
    if (process.env.DEMO_AUTH_ENABLED !== 'true')
      throw new ServiceUnavailableException('Demo sign-in is disabled.');
    const user = await this.prisma.user.findUnique({
      where: { email: 'alex@forgeboard.demo' },
    });
    if (!user)
      throw new ServiceUnavailableException(
        'Demo data is missing. Run pnpm db:seed.',
      );
    response.cookie(SESSION_COOKIE, signSession(user.id, sessionSecret()), {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/api',
      maxAge: SESSION_SECONDS * 1000,
    });
    return { user };
  }
  @Get('session')
  @UseGuards(AuthGuard)
  async session(@Req() request: AuthRequest) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: request.userId },
    });
    const memberships = await this.prisma.workspaceMember.findMany({
      where: { userId: request.userId },
      include: { workspace: true },
      orderBy: { createdAt: 'asc' },
    });
    return {
      user,
      workspaces: memberships.map(({ workspace, role }) => ({
        ...workspace,
        role,
      })),
    };
  }
  // Cookie stays HttpOnly and same-origin. Only this short-lived, purpose-bound
  // ticket crosses to a separately hosted WebSocket server, in handshake auth.
  @Post('realtime')
  @UseGuards(AuthGuard)
  realtime(@Req() request: AuthRequest) {
    return {
      ticket: signSession(request.userId, realtimeSecret(), Date.now(), 60_000),
    };
  }
  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    response.clearCookie(SESSION_COOKIE, {
      path: '/api',
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return { success: true };
  }
}
