import { Test, TestingModule } from '@nestjs/testing';
import { TokenStorageService } from './token-storage.service';

describe('TokenStorageService', () => {
  let service: TokenStorageService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [TokenStorageService],
    }).compile();

    service = module.get<TokenStorageService>(TokenStorageService);
  });

  describe('storeRefreshToken', () => {
    it('should store refresh token', async () => {
      const userId = 'user-123';
      const tokenId = 'token-abc';
      const refreshToken = 'refresh.token.here';

      await service.storeRefreshToken(userId, tokenId, refreshToken);

      // Verify the token was stored by checking it validates
      const isValid = await service.validateRefreshToken(userId, tokenId);
      expect(isValid).toBe(true);
    });
  });

  describe('validateRefreshToken', () => {
    it('should return true for valid non-blacklisted token', async () => {
      const userId = 'user-123';
      const tokenId = 'token-abc';
      const refreshToken = 'refresh.token.here';

      await service.storeRefreshToken(userId, tokenId, refreshToken);

      const result = await service.validateRefreshToken(userId, tokenId);

      expect(result).toBe(true);
    });

    it('should return false if token does not exist', async () => {
      const userId = 'user-123';
      const tokenId = 'token-abc';

      const result = await service.validateRefreshToken(userId, tokenId);

      expect(result).toBe(false);
    });

    it('should return false if token is blacklisted', async () => {
      const userId = 'user-123';
      const tokenId = 'token-abc';
      const refreshToken = 'refresh.token.here';

      await service.storeRefreshToken(userId, tokenId, refreshToken);
      await service.invalidateRefreshToken(userId, tokenId);

      const result = await service.validateRefreshToken(userId, tokenId);

      expect(result).toBe(false);
    });
  });

  describe('invalidateRefreshToken', () => {
    it('should delete token and add to blacklist', async () => {
      const userId = 'user-123';
      const tokenId = 'token-abc';
      const refreshToken = 'refresh.token.here';

      await service.storeRefreshToken(userId, tokenId, refreshToken);
      await service.invalidateRefreshToken(userId, tokenId);

      const isValid = await service.validateRefreshToken(userId, tokenId);
      expect(isValid).toBe(false);
    });
  });

  describe('invalidateAllUserTokens', () => {
    it('should invalidate all tokens for a user', async () => {
      const userId = 'user-123';

      await service.storeRefreshToken(userId, 'token-1', 'refresh1');
      await service.storeRefreshToken(userId, 'token-2', 'refresh2');
      await service.storeRefreshToken(userId, 'token-3', 'refresh3');

      await service.invalidateAllUserTokens(userId);

      expect(await service.validateRefreshToken(userId, 'token-1')).toBe(false);
      expect(await service.validateRefreshToken(userId, 'token-2')).toBe(false);
      expect(await service.validateRefreshToken(userId, 'token-3')).toBe(false);
    });

    it('should not affect other users tokens', async () => {
      const userId1 = 'user-123';
      const userId2 = 'user-456';

      await service.storeRefreshToken(userId1, 'token-1', 'refresh1');
      await service.storeRefreshToken(userId2, 'token-2', 'refresh2');

      await service.invalidateAllUserTokens(userId1);

      expect(await service.validateRefreshToken(userId1, 'token-1')).toBe(false);
      expect(await service.validateRefreshToken(userId2, 'token-2')).toBe(true);
    });
  });

  describe('getUserTokens', () => {
    it('should return list of user tokens with metadata', async () => {
      const userId = 'user-123';

      await service.storeRefreshToken(userId, 'token-1', 'refresh1');
      await service.storeRefreshToken(userId, 'token-2', 'refresh2');

      const result = await service.getUserTokens(userId);

      expect(result).toHaveLength(2);
      expect(result.map((t) => t.tokenId).sort()).toEqual(['token-1', 'token-2']);
      expect(result[0]).toHaveProperty('ttl');
      expect(result[0]).toHaveProperty('createdAt');
    });

    it('should return empty array if user has no tokens', async () => {
      const result = await service.getUserTokens('nonexistent-user');
      expect(result).toHaveLength(0);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('should return 0 if no expired tokens', async () => {
      const userId = 'user-123';
      await service.storeRefreshToken(userId, 'token-1', 'refresh1');

      const deletedCount = await service.cleanupExpiredTokens();

      expect(deletedCount).toBe(0);
    });
  });
});
