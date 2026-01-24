import { Injectable, Logger } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, Profile } from 'passport-github2';
import { ConfigService } from '@nestjs/config';

export interface GitHubProfile {
  id: string;
  username: string;
  displayName: string;
  emails: Array<{ value: string; primary?: boolean; verified?: boolean }>;
  photos: Array<{ value: string }>;
  _json: {
    login: string;
    avatar_url: string;
    email: string | null;
  };
}

export interface GitHubOAuthResult {
  profile: GitHubProfile;
  accessToken: string;
  refreshToken?: string;
}

/**
 * Check if GitHub OAuth is configured
 */
export function isGitHubOAuthConfigured(configService: ConfigService): boolean {
  const clientId = configService.get<string>('GITHUB_CLIENT_ID');
  const clientSecret = configService.get<string>('GITHUB_CLIENT_SECRET');
  const callbackUrl = configService.get<string>('GITHUB_CALLBACK_URL');
  return !!(clientId && clientSecret && callbackUrl);
}

@Injectable()
export class GitHubStrategy extends PassportStrategy(Strategy, 'github') {
  private readonly logger = new Logger(GitHubStrategy.name);

  constructor(private readonly configService: ConfigService) {
    const clientId = configService.get<string>('GITHUB_CLIENT_ID') || 'placeholder';
    const clientSecret = configService.get<string>('GITHUB_CLIENT_SECRET') || 'placeholder';
    const callbackUrl =
      configService.get<string>('GITHUB_CALLBACK_URL') ||
      'http://localhost:3000/auth/github/callback';

    super({
      clientID: clientId,
      clientSecret: clientSecret,
      callbackURL: callbackUrl,
      scope: ['user:email', 'read:user', 'repo'],
    });

    if (clientId === 'placeholder' || clientSecret === 'placeholder') {
      this.logger.warn(
        'GitHub OAuth strategy initialized with placeholder values - OAuth will not work until GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_CALLBACK_URL are configured',
      );
    } else {
      this.logger.log('GitHub OAuth strategy initialized');
    }
  }

  async validate(
    accessToken: string,
    refreshToken: string,
    profile: Profile,
    done: (error: Error | null, user?: GitHubOAuthResult | false) => void,
  ): Promise<void> {
    try {
      this.logger.log(`GitHub OAuth validation for user: ${profile.username}`);

      // Transform the profile to our expected format
      const profileJson = (profile as any)._json;
      const githubProfile: GitHubProfile = {
        id: profile.id,
        username: profile.username || profileJson?.login || '',
        displayName: profile.displayName || profile.username || '',
        emails: profile.emails || [],
        photos: profile.photos || [],
        _json: profileJson as GitHubProfile['_json'],
      };

      done(null, {
        profile: githubProfile,
        accessToken,
        refreshToken,
      });
    } catch (error) {
      this.logger.error(`GitHub OAuth validation error: ${error.message}`);
      done(error as Error, false);
    }
  }
}
