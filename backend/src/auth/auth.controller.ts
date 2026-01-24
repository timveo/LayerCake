import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  HttpCode,
  HttpStatus,
  Req,
  Res,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { AuthGuard } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { AuthResponseDto } from './dto/auth-response.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { Public } from './decorators/public.decorator';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { RequestUser, UserProfile } from '../common/types/user.types';
import { type GitHubOAuthResult, isGitHubOAuthConfigured } from './strategies/github.strategy';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  private readonly isGitHubConfigured: boolean;

  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService,
  ) {
    this.isGitHubConfigured = isGitHubOAuthConfigured(configService);
  }

  private ensureGitHubConfigured(): void {
    if (!this.isGitHubConfigured) {
      throw new BadRequestException(
        'GitHub OAuth is not configured. Please set GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, and GITHUB_CALLBACK_URL environment variables.',
      );
    }
  }

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({
    status: 201,
    description: 'User successfully registered',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async register(@Body() registerDto: RegisterDto): Promise<AuthResponseDto> {
    return this.authService.register(registerDto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email and password' })
  @ApiResponse({
    status: 200,
    description: 'User successfully logged in',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto): Promise<AuthResponseDto> {
    return this.authService.login(loginDto);
  }

  @Public()
  @UseGuards(JwtRefreshGuard)
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({
    status: 200,
    description: 'Tokens successfully refreshed',
    type: AuthResponseDto,
  })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto): Promise<AuthResponseDto> {
    return this.authService.refreshTokens(refreshTokenDto.refreshToken);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getMe(@CurrentUser() user: RequestUser): Promise<UserProfile> {
    return this.authService.getMe(user.id);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout current session' })
  @ApiResponse({ status: 200, description: 'Successfully logged out' })
  async logout(
    @CurrentUser() user: RequestUser,
    @Body() body: { tokenId: string },
  ): Promise<{ message: string }> {
    await this.authService.logout(user.id, body.tokenId);
    return { message: 'Successfully logged out' };
  }

  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout all sessions' })
  @ApiResponse({ status: 200, description: 'Successfully logged out all sessions' })
  async logoutAll(@CurrentUser() user: RequestUser): Promise<{ message: string }> {
    await this.authService.logoutAll(user.id);
    return { message: 'Successfully logged out all sessions' };
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request password reset email' })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent if account exists',
  })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDto): Promise<{ message: string }> {
    return this.authService.forgotPassword(forgotPasswordDto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password using token' })
  @ApiResponse({ status: 200, description: 'Password successfully reset' })
  @ApiResponse({ status: 400, description: 'Invalid or expired reset token' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDto): Promise<{ message: string }> {
    return this.authService.resetPassword(resetPasswordDto);
  }

  // ============================================================================
  // GitHub OAuth
  // ============================================================================

  @Public()
  @Get('github')
  @ApiOperation({ summary: 'Initiate GitHub OAuth flow' })
  @ApiQuery({
    name: 'returnUrl',
    required: false,
    description: 'URL to return to after authentication',
  })
  @ApiResponse({ status: 302, description: 'Redirects to GitHub for authentication' })
  @ApiResponse({ status: 400, description: 'GitHub OAuth not configured' })
  githubAuth(@Query('returnUrl') returnUrl?: string, @Req() req?: Request, @Res() res?: Response) {
    // Check if GitHub OAuth is configured before proceeding
    this.ensureGitHubConfigured();

    // Store returnUrl in session if provided
    if (returnUrl && req && 'session' in req) {
      ((req as any).session as Record<string, string>).returnUrl = returnUrl;
    }

    // Manually redirect to GitHub OAuth
    const clientId = this.configService.get<string>('GITHUB_CLIENT_ID');
    const callbackUrl = this.configService.get<string>('GITHUB_CALLBACK_URL');
    const scope = encodeURIComponent('user:email read:user repo');
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(callbackUrl!)}&scope=${scope}`;

    res?.redirect(githubAuthUrl);
  }

  @Public()
  @Get('github/callback')
  @UseGuards(AuthGuard('github'))
  @ApiOperation({ summary: 'GitHub OAuth callback' })
  @ApiResponse({ status: 302, description: 'Redirects to frontend with tokens' })
  @ApiResponse({ status: 400, description: 'GitHub OAuth not configured' })
  async githubCallback(@Req() req: Request & { user: GitHubOAuthResult }, @Res() res: Response) {
    // Check if GitHub OAuth is configured
    this.ensureGitHubConfigured();

    const { profile, accessToken } = req.user;

    // Handle the OAuth result (connect to existing user or create new)
    const result = await this.authService.handleGitHubOAuth(profile, accessToken);

    // Get return URL from session or use default
    const returnUrl =
      ('session' in req ? ((req as any).session as Record<string, string>)?.returnUrl : null) ||
      '/';

    // Redirect to frontend with tokens as query params
    // In production, you'd want to use a more secure method
    const redirectUrl = new URL(returnUrl, process.env.FRONTEND_URL || 'http://localhost:5173');
    redirectUrl.searchParams.set('accessToken', result.accessToken);
    redirectUrl.searchParams.set('refreshToken', result.refreshToken);
    redirectUrl.searchParams.set('githubConnected', 'true');

    res.redirect(redirectUrl.toString());
  }

  @Public()
  @Get('github/available')
  @ApiOperation({ summary: 'Check if GitHub OAuth is configured' })
  @ApiResponse({ status: 200, description: 'GitHub OAuth availability status' })
  getGitHubAvailable(): { available: boolean } {
    return { available: this.isGitHubConfigured };
  }

  @Get('github/status')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Check GitHub connection status' })
  @ApiResponse({ status: 200, description: 'GitHub connection status' })
  async getGitHubStatus(@CurrentUser() user: RequestUser): Promise<{
    connected: boolean;
    username?: string;
    avatarUrl?: string;
    oauthAvailable: boolean;
  }> {
    const connectionStatus = await this.authService.getGitHubConnectionStatus(user.id);
    return {
      ...connectionStatus,
      oauthAvailable: this.isGitHubConfigured,
    };
  }

  @Post('github/disconnect')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Disconnect GitHub account' })
  @ApiResponse({ status: 200, description: 'GitHub account disconnected' })
  async disconnectGitHub(@CurrentUser() user: RequestUser): Promise<{ message: string }> {
    await this.authService.disconnectGitHub(user.id);
    return { message: 'GitHub account disconnected' };
  }
}
