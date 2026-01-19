import { Test, TestingModule } from '@nestjs/testing';
import { CodeParserService } from './code-parser.service';

describe('CodeParserService', () => {
  let service: CodeParserService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [CodeParserService],
    }).compile();

    service = module.get<CodeParserService>(CodeParserService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('parseAgentOutput', () => {
    it('should extract code blocks with fence notation', () => {
      const output = `Here is the code:
\`\`\`typescript:src/utils/api.ts
export const api = {
  get: () => fetch('/api'),
};
\`\`\``;

      const blocks = service.parseAgentOutput(output);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].language).toBe('typescript');
      expect(blocks[0].filePath).toBe('src/utils/api.ts');
      expect(blocks[0].content).toContain('export const api');
    });

    it('should extract multiple code blocks', () => {
      const output = `\`\`\`typescript:src/components/Button.tsx
import React from 'react';
export const Button = () => <button>Click</button>;
\`\`\`

\`\`\`typescript:src/components/Input.tsx
import React from 'react';
export const Input = () => <input />;
\`\`\``;

      const blocks = service.parseAgentOutput(output);

      expect(blocks).toHaveLength(2);
      expect(blocks[0].filePath).toBe('src/components/Button.tsx');
      expect(blocks[1].filePath).toBe('src/components/Input.tsx');
    });

    it('should extract file path from comment', () => {
      const output = `\`\`\`typescript
// File: src/utils/helpers.ts
export const helper = () => {};
\`\`\``;

      const blocks = service.parseAgentOutput(output);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].filePath).toBe('src/utils/helpers.ts');
    });

    it('should handle code blocks without file paths', () => {
      const output = `\`\`\`typescript
export const noPath = true;
\`\`\``;

      const blocks = service.parseAgentOutput(output);

      expect(blocks).toHaveLength(1);
      expect(blocks[0].filePath).toBeUndefined();
    });
  });

  describe('extractFiles', () => {
    it('should extract files with paths', () => {
      const output = `\`\`\`typescript:src/index.ts
console.log('Hello World');
\`\`\`

\`\`\`json:package.json
{ "name": "test" }
\`\`\``;

      const result = service.extractFiles(output);

      expect(result.files).toHaveLength(2);
      expect(result.files[0].path).toBe('src/index.ts');
      expect(result.files[0].content).toContain('Hello World');
      expect(result.files[1].path).toBe('package.json');
    });

    it('should exclude blocks without paths', () => {
      const output = `\`\`\`typescript:src/index.ts
console.log('With path');
\`\`\`

\`\`\`typescript
console.log('No path');
\`\`\``;

      const result = service.extractFiles(output);

      expect(result.files).toHaveLength(1);
      expect(result.unparsedBlocks).toHaveLength(1);
      expect(result.totalBlocks).toBe(2);
    });

    it('should clean file paths', () => {
      const output = `\`\`\`typescript:./src/index.ts
console.log('test');
\`\`\``;

      const result = service.extractFiles(output);

      // Note: cleanFilePath removes leading / but not ./
      expect(result.files[0].path).toBe('./src/index.ts');
    });

    it('should return duplicate files separately (use mergeDuplicateFiles to merge)', () => {
      const output = `\`\`\`typescript:src/index.ts
const a = 1;
\`\`\`

\`\`\`typescript:src/index.ts
const b = 2;
\`\`\``;

      const result = service.extractFiles(output);

      // extractFiles returns duplicates separately
      expect(result.files).toHaveLength(2);

      // Use mergeDuplicateFiles to merge them
      const merged = service.mergeDuplicateFiles(result.files, 'concatenate');
      expect(merged).toHaveLength(1);
      expect(merged[0].content).toContain('const a = 1');
      expect(merged[0].content).toContain('const b = 2');
    });
  });

  describe('validateFiles', () => {
    it('should validate TypeScript files', () => {
      const files = [
        {
          path: 'src/index.ts',
          content: 'export const test = true;',
        },
      ];

      const result = service.validateFiles(files);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should detect empty content', () => {
      const files = [
        {
          path: 'src/index.ts',
          content: '   ',
        },
      ];

      const result = service.validateFiles(files);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should detect suspicious paths', () => {
      const files = [
        {
          path: '../../../etc/passwd',
          content: 'malicious',
        },
      ];

      const result = service.validateFiles(files);

      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('path traversal'))).toBe(true);
    });
  });
});
