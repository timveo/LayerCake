import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { WINSTON_MODULE_PROVIDER } from 'nest-winston';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { TokenStorageService } from './token-storage.service';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: { user: { findUnique: jest.Mock; create: jest.Mock } };
  let jwtService: jest.Mocked<JwtService>;
  let tokenStorage: jest.Mocked<TokenStorageService>;

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    planTier: 'FREE',
    passwordHash: '$2b$10$hashedpassword',
  };

  beforeEach(async () => {
    const mockPrisma = {
      user: {
        findUnique: jest.fn(),
        create: jest.fn(),
      },
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: PrismaService,
          useValue: mockPrisma,
        },
        {
          provide: JwtService,
          useValue: {
            signAsync: jest.fn(),
            verify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string) => {
              const config: Record<string, string> = {
                JWT_SECRET: 'test-secret',
                JWT_EXPIRATION: '7d',
              };
              return config[key];
            }),
          },
        },
        {
          provide: TokenStorageService,
          useValue: {
            storeRefreshToken: jest.fn(),
            validateRefreshToken: jest.fn(),
            invalidateRefreshToken: jest.fn(),
            invalidateAllUserTokens: jest.fn(),
          },
        },
        {
          provide: WINSTON_MODULE_PROVIDER,
          useValue: {
            info: jest.fn(),
            warn: jest.fn(),
            error: jest.fn(),
            debug: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    prisma = module.get(PrismaService);
    jwtService = module.get(JwtService) as jest.Mocked<JwtService>;
    tokenStorage = module.get(TokenStorageService) as jest.Mocked<TokenStorageService>;

    jest.clearAllMocks();
  });

  describe('register', () => {
    it('should register a new user successfully', async () => {
      const registerDto = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      };

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'new-user-id',
        email: registerDto.email,
        name: registerDto.name,
        planTier: 'FREE',
      } as any);

      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      tokenStorage.storeRefreshToken.mockResolvedValue(undefined);

      const result = await service.register(registerDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: registerDto.email },
      });
      expect(prisma.user.create).toHaveBeenCalled();
      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'refresh-token');
      expect(result.user).toMatchObject({
        email: registerDto.email,
        name: registerDto.name,
      });
    });

    it('should throw ConflictException if user already exists', async () => {
      const registerDto = {
        email: 'existing@example.com',
        password: 'password123',
        name: 'Existing User',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser as any);

      await expect(service.register(registerDto)).rejects.toThrow(ConflictException);
      expect(prisma.user.create).not.toHaveBeenCalled();
    });

    it('should hash password with bcrypt', async () => {
      const registerDto = {
        email: 'newuser@example.com',
        password: 'password123',
        name: 'New User',
      };

      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockResolvedValue({
        id: 'new-user-id',
        email: registerDto.email,
        name: registerDto.name,
        planTier: 'FREE',
      } as any);

      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const bcryptHashSpy = jest.spyOn(bcrypt, 'hash').mockResolvedValue('hashed' as never);

      await service.register(registerDto);

      expect(bcryptHashSpy).toHaveBeenCalledWith(registerDto.password, 10);
    });
  });

  describe('login', () => {
    it('should login user with valid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(true as never);
      jwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const result = await service.login(loginDto);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { email: loginDto.email },
        select: {
          id: true,
          email: true,
          name: true,
          planTier: true,
          passwordHash: true,
        },
      });
      expect(result).toHaveProperty('accessToken', 'access-token');
      expect(result).toHaveProperty('refreshToken', 'refresh-token');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const loginDto = {
        email: 'notfound@example.com',
        password: 'password123',
      };

      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if password is invalid', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'wrongpassword',
      };

      prisma.user.findUnique.mockResolvedValue(mockUser as any);
      jest.spyOn(bcrypt, 'compare').mockResolvedValue(false as never);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if user has no password (OAuth user)', async () => {
      const loginDto = {
        email: 'oauth@example.com',
        password: 'password123',
      };

      prisma.user.findUnique.mockResolvedValue({
        ...mockUser,
        passwordHash: null,
      } as any);

      await expect(service.login(loginDto)).rejects.toThrow(UnauthorizedException);
      await expect(service.login(loginDto)).rejects.toThrow(
        'This account uses OAuth. Please sign in with GitHub.',
      );
    });
  });

  describe('refreshTokens', () => {
    it('should refresh tokens with valid refresh token', async () => {
      const refreshToken = 'valid.refresh.token';
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        type: 'refresh',
        jti: 'token-id-123',
      };

      jwtService.verify.mockReturnValue(payload as any);
      tokenStorage.validateRefreshToken.mockResolvedValue(true);
      prisma.user.findUnique.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        planTier: 'FREE',
      } as any);

      jwtService.signAsync
        .mockResolvedValueOnce('new-access-token')
        .mockResolvedValueOnce('new-refresh-token');

      const result = await service.refreshTokens(refreshToken);

      expect(jwtService.verify).toHaveBeenCalledWith(refreshToken, {
        secret: 'test-secret',
      });
      expect(tokenStorage.validateRefreshToken).toHaveBeenCalledWith('user-123', 'token-id-123');
      expect(tokenStorage.invalidateRefreshToken).toHaveBeenCalledWith('user-123', 'token-id-123');
      expect(result).toHaveProperty('accessToken', 'new-access-token');
      expect(result).toHaveProperty('refreshToken', 'new-refresh-token');
    });

    it('should throw UnauthorizedException if token is not refresh type', async () => {
      const refreshToken = 'invalid.token.type';
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        type: 'access', // Wrong type
        jti: 'token-id-123',
      };

      jwtService.verify.mockReturnValue(payload as any);

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });

    it('should throw UnauthorizedException if token is blacklisted', async () => {
      const refreshToken = 'blacklisted.token';
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        type: 'refresh',
        jti: 'token-id-123',
      };

      jwtService.verify.mockReturnValue(payload as any);
      tokenStorage.validateRefreshToken.mockResolvedValue(false);

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
      await expect(service.refreshTokens(refreshToken)).rejects.toThrow('Token has been revoked');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const refreshToken = 'valid.refresh.token';
      const payload = {
        sub: 'user-123',
        email: 'test@example.com',
        type: 'refresh',
        jti: 'token-id-123',
      };

      jwtService.verify.mockReturnValue(payload as any);
      tokenStorage.validateRefreshToken.mockResolvedValue(true);
      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.refreshTokens(refreshToken)).rejects.toThrow(UnauthorizedException);
    });
  });

  describe('logout', () => {
    it('should logout user by invalidating token', async () => {
      const userId = 'user-123';
      const tokenId = 'token-id-123';

      await service.logout(userId, tokenId);

      expect(tokenStorage.invalidateRefreshToken).toHaveBeenCalledWith(userId, tokenId);
    });
  });

  describe('logoutAll', () => {
    it('should logout all user sessions', async () => {
      const userId = 'user-123';

      await service.logoutAll(userId);

      expect(tokenStorage.invalidateAllUserTokens).toHaveBeenCalledWith(userId);
    });
  });

  describe('getMe', () => {
    it('should return user profile', async () => {
      const userId = 'user-123';
      const userProfile = {
        id: 'user-123',
        email: 'test@example.com',
        name: 'Test User',
        avatarUrl: null,
        planTier: 'FREE',
        emailVerified: true,
        monthlyAgentExecutions: 10,
        lastExecutionReset: new Date(),
        createdAt: new Date(),
      };

      prisma.user.findUnique.mockResolvedValue(userProfile as any);

      const result = await service.getMe(userId);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: userId },
        select: expect.any(Object),
      });
      expect(result).toEqual(userProfile);
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const userId = 'non-existent';

      prisma.user.findUnique.mockResolvedValue(null);

      await expect(service.getMe(userId)).rejects.toThrow(UnauthorizedException);
    });
  });
});
