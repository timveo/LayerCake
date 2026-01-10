import { Module, Global } from '@nestjs/common';
import { StorageService } from './storage.service';

/**
 * StorageModule - Global File Storage
 *
 * Provides Cloudflare R2 storage access across the application.
 * Marked as @Global() so all modules can inject StorageService.
 */
@Global()
@Module({
  providers: [StorageService],
  exports: [StorageService],
})
export class StorageModule {}
