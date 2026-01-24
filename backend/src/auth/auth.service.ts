import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { JwtService, TokenExpiredError, JsonWebTokenError } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import { Logger } from 'winston';
import * as bcrypt from 'bcrypt';
import { randomBytes, createCipheriv, createDecipheriv, scryptSync } from 'crypto';
import { PrismaService } from '../common/prisma/prisma.service';
import { TokenStorageService } from './token-storage.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { UserProfile } from '../common/types/user.types';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';

export interface GitHubProfile {
  id: string;
  username: string;
  displayName: string;
  emails?: { value: string }[];
  photos?: { value: string }[];
}

export interface GitHubConnectionStatus {
  connected: boolean;
  username?: string;
  avatarUrl?: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly tokenStorage: TokenStorageService,
    @Inject(WINSTON_MODULE_PROVIDER) private readonly logger: Logger,
  ) {}

  async register(registerDto: RegisterDto): Promise<AuthResponseDto> {
    const { email, password, name } = registerDto;

    // Check if user already exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    // Hash password
    const passwordHash = await bcrypt.hash(password, 10);

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        passwordHash,
        name,
        planTier: 'FREE',
        monthlyAgentExecutions: 0,
      },
      select: {
        id: true,
        email: true,
        name: true,
        planTier: true,
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        planTier: user.planTier,
      },
    };
  }

  async login(loginDto: LoginDto): Promise<AuthResponseDto> {
    const { email, password } = loginDto;

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        email: true,
        name: true,
        planTier: true,
        passwordHash: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Check if user used OAuth (no password)
    if (!user.passwordHash) {
      throw new UnauthorizedException('This account uses OAuth. Please sign in with GitHub.');
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.passwordHash);

    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        planTier: user.planTier,
      },
    };
  }

  async refreshTokens(refreshToken: string): Promise<AuthResponseDto> {
    try {
      const payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });

      if (payload.type !== 'refresh') {
        throw new UnauthorizedException('Invalid token type');
      }

      // Validate token exists in Redis and is not blacklisted
      const isValid = await this.tokenStorage.validateRefreshToken(payload.sub, payload.jti);

      if (!isValid) {
        throw new UnauthorizedException('Token has been revoked');
      }

      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          name: true,
          planTier: true,
        },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Invalidate old refresh token (token rotation)
      await this.tokenStorage.invalidateRefreshToken(payload.sub, payload.jti);

      // Generate new tokens
      const tokens = await this.generateTokens(user.id, user.email);

      return {
        ...tokens,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          planTier: user.planTier,
        },
      };
    } catch (error) {
      // Distinguish between JWT errors and other errors for debugging
      if (error instanceof TokenExpiredError) {
        throw new UnauthorizedException('Refresh token has expired');
      }
      if (error instanceof JsonWebTokenError) {
        throw new UnauthorizedException('Invalid refresh token');
      }
      if (error instanceof UnauthorizedException) {
        throw error; // Re-throw our own auth errors
      }
      // Log unexpected errors for debugging (e.g., database errors)
      this.logger.error('Unexpected error during token refresh', {
        context: 'AuthService',
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
      });
      throw new UnauthorizedException('Unable to refresh token');
    }
  }

  async getMe(userId: string): Promise<UserProfile> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        avatarUrl: true,
        planTier: true,
        emailVerified: true,
        monthlyAgentExecutions: true,
        lastExecutionReset: true,
        teachingLevel: true,
        onboardedAt: true,
        createdAt: true,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    return user;
  }

  async logout(userId: string, tokenId: string): Promise<void> {
    await this.tokenStorage.invalidateRefreshToken(userId, tokenId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.tokenStorage.invalidateAllUserTokens(userId);
  }

  async forgotPassword(forgotPasswordDto: ForgotPasswordDto): Promise<{ message: string }> {
    const { email } = forgotPasswordDto;

    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // Always return success to prevent email enumeration
    if (!user) {
      return {
        message: 'If an account with that email exists, a password reset link has been sent.',
      };
    }

    // Generate reset token
    const resetToken = randomBytes(32).toString('hex');
    const resetTokenExpiry = new Date(Date.now() + 3600000); // 1 hour

    // Store reset token in database
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        resetToken,
        resetTokenExpiry,
      },
    });

    // TODO: In production, send email with reset link
    // Example: await this.emailService.sendPasswordReset(email, resetToken);

    return {
      message: 'If an account with that email exists, a password reset link has been sent.',
    };
  }

  async resetPassword(resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    const { token, newPassword } = resetPasswordDto;

    const user = await this.prisma.user.findFirst({
      where: {
        resetToken: token,
        resetTokenExpiry: {
          gt: new Date(),
        },
      },
    });

    if (!user) {
      throw new BadRequestException('Invalid or expired reset token');
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, 10);

    // Update password and clear reset token
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        resetToken: null,
        resetTokenExpiry: null,
      },
    });

    // Invalidate all existing sessions
    await this.tokenStorage.invalidateAllUserTokens(user.id);

    return { message: 'Password has been reset successfully' };
  }

  private async generateTokens(userId: string, email: string) {
    // Generate unique token ID for refresh token
    const tokenId = randomBytes(16).toString('hex');

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, type: 'access' },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: this.configService.get<string>('JWT_EXPIRATION') || '7d',
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email, type: 'refresh', jti: tokenId },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: '30d',
        },
      ),
    ]);

    // Store refresh token in Redis
    await this.tokenStorage.storeRefreshToken(userId, tokenId, refreshToken);

    return { accessToken, refreshToken };
  }

  // ==================== GitHub OAuth Methods ====================

  /**
   * Handle GitHub OAuth callback - create or link user account
   */
  async handleGitHubOAuth(profile: GitHubProfile, accessToken: string): Promise<AuthResponseDto> {
    const email = profile.emails?.[0]?.value;
    const avatarUrl = profile.photos?.[0]?.value;

    // Check if user already exists by GitHub ID
    let user = await this.prisma.user.findUnique({
      where: { githubId: profile.id },
      select: {
        id: true,
        email: true,
        name: true,
        planTier: true,
      },
    });

    if (!user && email) {
      // Check if user exists by email (link accounts)
      user = await this.prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          name: true,
          planTier: true,
        },
      });

      if (user) {
        // Link existing account to GitHub
        await this.prisma.user.update({
          where: { id: user.id },
          data: {
            githubId: profile.id,
            githubUsername: profile.username,
            githubAccessToken: this.encryptToken(accessToken),
            avatarUrl: avatarUrl || undefined,
          },
        });
      }
    }

    if (!user) {
      // Create new user
      if (!email) {
        throw new BadRequestException('GitHub account must have a public email address');
      }

      user = await this.prisma.user.create({
        data: {
          email,
          name: profile.displayName || profile.username,
          avatarUrl,
          githubId: profile.id,
          githubUsername: profile.username,
          githubAccessToken: this.encryptToken(accessToken),
          planTier: 'FREE',
          monthlyAgentExecutions: 0,
        },
        select: {
          id: true,
          email: true,
          name: true,
          planTier: true,
        },
      });
    } else {
      // Update GitHub token for existing user
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          githubAccessToken: this.encryptToken(accessToken),
          githubUsername: profile.username,
        },
      });
    }

    // Generate tokens
    const tokens = await this.generateTokens(user.id, user.email);

    return {
      ...tokens,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        planTier: user.planTier,
      },
    };
  }

  /**
   * Store GitHub access token (encrypted) for an existing user
   */
  async storeGitHubToken(userId: string, accessToken: string): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        githubAccessToken: this.encryptToken(accessToken),
      },
    });
  }

  /**
   * Get decrypted GitHub access token for a user
   */
  async getGitHubToken(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { githubAccessToken: true },
    });

    if (!user?.githubAccessToken) {
      return null;
    }

    return this.decryptToken(user.githubAccessToken);
  }

  /**
   * Disconnect GitHub account from user
   */
  async disconnectGitHub(userId: string): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, githubId: true },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    // Don't allow disconnect if user has no password (OAuth-only account)
    if (!user.passwordHash && user.githubId) {
      throw new BadRequestException(
        'Cannot disconnect GitHub from OAuth-only account. Set a password first.',
      );
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        githubId: null,
        githubAccessToken: null,
        githubUsername: null,
        githubTokenExpiry: null,
      },
    });
  }

  /**
   * Get GitHub connection status for a user
   */
  async getGitHubConnectionStatus(userId: string): Promise<GitHubConnectionStatus> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        githubId: true,
        githubUsername: true,
        avatarUrl: true,
      },
    });

    if (!user || !user.githubId) {
      return { connected: false };
    }

    return {
      connected: true,
      username: user.githubUsername || undefined,
      avatarUrl: user.avatarUrl || undefined,
    };
  }

  // ==================== Token Encryption Helpers ====================

  private getEncryptionKey(): Buffer {
    const secret = this.configService.get<string>('JWT_SECRET') || 'default-secret';
    return scryptSync(secret, 'salt', 32);
  }

  private encryptToken(token: string): string {
    const iv = randomBytes(16);
    const key = this.getEncryptionKey();
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(token, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  private decryptToken(encryptedToken: string): string {
    const [ivHex, encrypted] = encryptedToken.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const key = this.getEncryptionKey();
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }
}
