import { Injectable } from '@nestjs/common';

/**
 * In-memory token storage service
 * Simple implementation for small apps - tokens are lost on restart
 * For production with multiple instances, use Redis or database storage
 */
@Injectable()
export class TokenStorageService {
  private readonly tokens = new Map<string, { token: string; expiresAt: number }>();
  private readonly blacklist = new Set<string>();
  private readonly TOKEN_TTL = 30 * 24 * 60 * 60 * 1000; // 30 days in ms

  /**
   * Store refresh token with user ID mapping
   */
  async storeRefreshToken(
    userId: string,
    tokenId: string,
    refreshToken: string,
  ): Promise<void> {
    const key = `${userId}:${tokenId}`;
    this.tokens.set(key, {
      token: refreshToken,
      expiresAt: Date.now() + this.TOKEN_TTL,
    });
  }

  /**
   * Validate that refresh token exists and is not blacklisted
   */
  async validateRefreshToken(userId: string, tokenId: string): Promise<boolean> {
    const key = `${userId}:${tokenId}`;
    const entry = this.tokens.get(key);

    if (!entry || entry.expiresAt < Date.now()) {
      this.tokens.delete(key);
      return false;
    }

    if (this.blacklist.has(tokenId)) {
      return false;
    }

    return true;
  }

  /**
   * Invalidate a specific refresh token (on logout)
   */
  async invalidateRefreshToken(userId: string, tokenId: string): Promise<void> {
    const key = `${userId}:${tokenId}`;
    this.tokens.delete(key);
    this.blacklist.add(tokenId);
  }

  /**
   * Invalidate all refresh tokens for a user (on password change)
   */
  async invalidateAllUserTokens(userId: string): Promise<void> {
    const prefix = `${userId}:`;
    for (const key of this.tokens.keys()) {
      if (key.startsWith(prefix)) {
        const tokenId = key.split(':')[1];
        this.blacklist.add(tokenId);
        this.tokens.delete(key);
      }
    }
  }

  /**
   * Get all active refresh tokens for a user
   */
  async getUserTokens(userId: string): Promise<
    Array<{
      tokenId: string;
      createdAt: number;
      ttl: number;
    }>
  > {
    const prefix = `${userId}:`;
    const result: Array<{ tokenId: string; createdAt: number; ttl: number }> = [];

    for (const [key, entry] of this.tokens.entries()) {
      if (key.startsWith(prefix) && entry.expiresAt > Date.now()) {
        const tokenId = key.split(':')[1];
        const ttl = Math.floor((entry.expiresAt - Date.now()) / 1000);
        const createdAt = entry.expiresAt - this.TOKEN_TTL;
        result.push({ tokenId, createdAt, ttl });
      }
    }

    return result;
  }

  /**
   * Cleanup expired tokens
   */
  async cleanupExpiredTokens(): Promise<number> {
    let count = 0;
    const now = Date.now();

    for (const [key, entry] of this.tokens.entries()) {
      if (entry.expiresAt < now) {
        this.tokens.delete(key);
        count++;
      }
    }

    return count;
  }
}
