import { Test, TestingModule } from '@nestjs/testing';
import { FileSystemService } from './filesystem.service';
import * as fs from 'fs-extra';
import * as path from 'path';

describe('FileSystemService', () => {
  let service: FileSystemService;
  const testProjectId = 'test-project-123';
  let testWorkspacePath: string;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [FileSystemService],
    }).compile();

    service = module.get<FileSystemService>(FileSystemService);
    testWorkspacePath = service.getProjectPath(testProjectId);
  });

  afterEach(async () => {
    // Clean up test workspace
    await fs.remove(testWorkspacePath);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('initializeWorkspace', () => {
    it('should create workspace directory', async () => {
      await service.initializeWorkspace(testProjectId, 'react-vite');

      const exists = await fs.pathExists(testWorkspacePath);
      expect(exists).toBe(true);
    });

    it('should create package.json for React project', async () => {
      await service.initializeWorkspace(testProjectId, 'react-vite');

      const packageJsonPath = path.join(testWorkspacePath, 'package.json');
      const exists = await fs.pathExists(packageJsonPath);
      expect(exists).toBe(true);

      const packageJson = await fs.readJson(packageJsonPath);
      expect(packageJson.name).toBeTruthy();
      expect(packageJson.dependencies).toBeDefined();
    });

    it('should not overwrite existing workspace', async () => {
      await service.initializeWorkspace(testProjectId, 'react-vite');

      // Try to initialize again
      await service.initializeWorkspace(testProjectId, 'react-vite');

      // Should not throw error
      const exists = await fs.pathExists(testWorkspacePath);
      expect(exists).toBe(true);
    });
  });

  describe('writeFile', () => {
    beforeEach(async () => {
      await service.initializeWorkspace(testProjectId, 'react-vite');
    });

    it('should write file to workspace', async () => {
      const filePath = 'src/index.ts';
      const content = 'console.log("Hello World");';

      await service.writeFile(testProjectId, filePath, content);

      const fullPath = path.join(testWorkspacePath, filePath);
      const exists = await fs.pathExists(fullPath);
      expect(exists).toBe(true);

      const fileContent = await fs.readFile(fullPath, 'utf-8');
      expect(fileContent).toBe(content);
    });

    it('should create nested directories', async () => {
      const filePath = 'src/components/ui/Button.tsx';
      const content = 'export const Button = () => <button />;';

      await service.writeFile(testProjectId, filePath, content);

      const fullPath = path.join(testWorkspacePath, filePath);
      const exists = await fs.pathExists(fullPath);
      expect(exists).toBe(true);
    });

    it('should prevent path traversal', async () => {
      const filePath = '../../../etc/passwd';
      const content = 'malicious';

      await expect(
        service.writeFile(testProjectId, filePath, content),
      ).rejects.toThrow('path traversal detected');
    });
  });

  describe('readFile', () => {
    beforeEach(async () => {
      await service.initializeWorkspace(testProjectId, 'react-vite');
    });

    it('should read file from workspace', async () => {
      const filePath = 'src/test.ts';
      const content = 'export const test = true;';

      await service.writeFile(testProjectId, filePath, content);

      const readContent = await service.readFile(testProjectId, filePath);
      expect(readContent).toBe(content);
    });

    it('should throw error for non-existent file', async () => {
      await expect(
        service.readFile(testProjectId, 'nonexistent.ts'),
      ).rejects.toThrow();
    });
  });

  describe('listFiles', () => {
    beforeEach(async () => {
      await service.initializeWorkspace(testProjectId, 'react-vite');
      await service.writeFile(testProjectId, 'src/index.ts', 'test');
      await service.writeFile(testProjectId, 'src/app.ts', 'test');
      await service.writeFile(testProjectId, 'src/utils/helper.ts', 'test');
    });

    it('should list files in directory', async () => {
      const files = await service.listFiles(testProjectId, 'src');

      expect(files.length).toBeGreaterThan(0);
      expect(files).toContain('src/index.ts');
      expect(files).toContain('src/app.ts');
    });

    it('should list files recursively', async () => {
      const files = await service.listFiles(testProjectId, 'src');

      expect(files).toContain('src/utils/helper.ts');
    });
  });

  describe('executeCommand', () => {
    beforeEach(async () => {
      await service.initializeWorkspace(testProjectId, 'react-vite');
    });

    it('should execute command in workspace', async () => {
      const result = await service.executeCommand(testProjectId, 'echo "test"');

      expect(result.success).toBe(true);
      expect(result.stdout).toContain('test');
    });

    it('should handle command errors', async () => {
      const result = await service.executeCommand(
        testProjectId,
        'nonexistent-command',
      );

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should respect timeout', async () => {
      const result = await service.executeCommand(
        testProjectId,
        'sleep 10',
        { timeout: 1000 },
      );

      expect(result.success).toBe(false);
      expect(result.error).toContain('timeout');
    }, 10000);

    it('should execute in correct directory', async () => {
      const result = await service.executeCommand(testProjectId, 'pwd');

      expect(result.stdout).toContain(testProjectId);
    });
  });

  describe('deleteWorkspace', () => {
    it('should delete workspace directory', async () => {
      await service.initializeWorkspace(testProjectId, 'react-vite');

      const existsBefore = await fs.pathExists(testWorkspacePath);
      expect(existsBefore).toBe(true);

      await service.deleteWorkspace(testProjectId);

      const existsAfter = await fs.pathExists(testWorkspacePath);
      expect(existsAfter).toBe(false);
    });
  });
});
