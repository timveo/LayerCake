import { Injectable, Logger } from '@nestjs/common';
import { FileToWrite } from './filesystem.service';

export interface ParsedCodeBlock {
  language: string;
  filePath?: string;
  content: string;
  lineNumber: number;
}

export interface CodeExtractionResult {
  files: FileToWrite[];
  unparsedBlocks: ParsedCodeBlock[];
  totalBlocks: number;
}

/**
 * CodeParserService - Extract code from agent markdown output
 *
 * Purpose:
 * - Parse agent responses for code blocks
 * - Extract file paths from markdown fences
 * - Convert to FileToWrite objects
 * - Handle multiple code block formats
 *
 * Supported Formats:
 * 1. With file path: ```typescript:src/components/Button.tsx
 * 2. With comment: ```tsx\n// File: src/components/Button.tsx
 * 3. Just language: ```typescript
 *
 * Example Agent Output:
 * ```typescript:src/api/users.ts
 * export const getUsers = async () => {
 *   return fetch('/api/users');
 * };
 * ```
 */
@Injectable()
export class CodeParserService {
  private readonly logger = new Logger(CodeParserService.name);

  // Regex to match code blocks with optional file paths
  private readonly CODE_BLOCK_REGEX =
    /```(\w+)(?::([^\n]+))?\n([\s\S]*?)```/g;

  // Regex to find file path in comment at start of code block
  private readonly FILE_COMMENT_REGEX =
    /^\/\/\s*File:\s*([^\n]+)|^\/\*\s*File:\s*([^\n]+)\s*\*\/|^#\s*File:\s*([^\n]+)/m;

  /**
   * Extract all code blocks from agent output
   */
  parseAgentOutput(agentOutput: string): ParsedCodeBlock[] {
    const blocks: ParsedCodeBlock[] = [];
    let match: RegExpExecArray | null;

    // Reset regex state
    this.CODE_BLOCK_REGEX.lastIndex = 0;

    while ((match = this.CODE_BLOCK_REGEX.exec(agentOutput)) !== null) {
      const language = match[1];
      const pathFromFence = match[2];
      const content = match[3].trim();
      const lineNumber = agentOutput.substring(0, match.index).split('\n').length;

      // Try to extract file path from fence or from content comment
      let filePath = pathFromFence?.trim();

      if (!filePath) {
        const commentMatch = content.match(this.FILE_COMMENT_REGEX);
        if (commentMatch) {
          filePath = commentMatch[1] || commentMatch[2] || commentMatch[3];
          filePath = filePath?.trim();
        }
      }

      blocks.push({
        language,
        filePath,
        content,
        lineNumber,
      });
    }

    this.logger.debug(`Parsed ${blocks.length} code blocks from agent output`);
    return blocks;
  }

  /**
   * Extract files that can be written to disk
   */
  extractFiles(agentOutput: string): CodeExtractionResult {
    const blocks = this.parseAgentOutput(agentOutput);

    const files: FileToWrite[] = [];
    const unparsedBlocks: ParsedCodeBlock[] = [];

    for (const block of blocks) {
      if (block.filePath) {
        // Clean up file path
        const cleanPath = this.cleanFilePath(block.filePath);

        files.push({
          path: cleanPath,
          content: this.cleanCodeContent(block.content),
        });

        this.logger.debug(`Extracted file: ${cleanPath} (${block.content.length} bytes)`);
      } else {
        // Code block without file path
        unparsedBlocks.push(block);
        this.logger.warn(
          `Code block at line ${block.lineNumber} has no file path`,
        );
      }
    }

    return {
      files,
      unparsedBlocks,
      totalBlocks: blocks.length,
    };
  }

  /**
   * Extract files for a specific language/extension
   */
  extractFilesByLanguage(
    agentOutput: string,
    languages: string[],
  ): CodeExtractionResult {
    const allFiles = this.extractFiles(agentOutput);

    const filteredFiles = allFiles.files.filter((file) => {
      const ext = file.path.split('.').pop()?.toLowerCase();
      return languages.some((lang) => {
        const langExt = this.languageToExtension(lang);
        return ext === langExt;
      });
    });

    return {
      files: filteredFiles,
      unparsedBlocks: allFiles.unparsedBlocks,
      totalBlocks: allFiles.totalBlocks,
    };
  }

  /**
   * Validate extracted files
   */
  validateFiles(files: FileToWrite[]): {
    valid: boolean;
    errors: string[];
  } {
    const errors: string[] = [];

    for (const file of files) {
      // Check for empty content
      if (!file.content.trim()) {
        errors.push(`File ${file.path} has empty content`);
      }

      // Check for suspicious paths
      if (file.path.includes('..')) {
        errors.push(`File ${file.path} contains path traversal`);
      }

      if (file.path.startsWith('/')) {
        errors.push(`File ${file.path} is an absolute path`);
      }

      // Check for duplicate file paths
      const duplicates = files.filter((f) => f.path === file.path);
      if (duplicates.length > 1) {
        errors.push(`Duplicate file path: ${file.path}`);
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Merge duplicate files (concatenate or override)
   */
  mergeDuplicateFiles(
    files: FileToWrite[],
    strategy: 'concatenate' | 'last-wins' = 'last-wins',
  ): FileToWrite[] {
    if (strategy === 'last-wins') {
      // Keep only the last occurrence of each file
      const fileMap = new Map<string, FileToWrite>();

      for (const file of files) {
        fileMap.set(file.path, file);
      }

      return Array.from(fileMap.values());
    }

    // Concatenate strategy
    const fileMap = new Map<string, string[]>();

    for (const file of files) {
      if (!fileMap.has(file.path)) {
        fileMap.set(file.path, []);
      }
      fileMap.get(file.path)!.push(file.content);
    }

    return Array.from(fileMap.entries()).map(([path, contents]) => ({
      path,
      content: contents.join('\n\n'),
    }));
  }

  /**
   * Infer file path from code content (if not provided)
   */
  inferFilePath(
    code: string,
    language: string,
    context?: { agentType?: string; taskName?: string },
  ): string | null {
    // Try to extract from import statements
    const importMatch = code.match(/from\s+['"]\.\.?\/([^'"]+)['"]/);
    if (importMatch) {
      return importMatch[1];
    }

    // Try to extract class/component name
    const componentMatch = code.match(
      /(?:export\s+(?:default\s+)?)?(?:function|const|class)\s+(\w+)/,
    );
    if (componentMatch) {
      const name = componentMatch[1];
      const ext = this.languageToExtension(language);

      // Infer directory based on agent type
      let dir = 'src';
      if (context?.agentType === 'FRONTEND_DEVELOPER') {
        dir = 'src/components';
      } else if (context?.agentType === 'BACKEND_DEVELOPER') {
        dir = 'src/api';
      }

      return `${dir}/${name}.${ext}`;
    }

    return null;
  }

  // ==================== Private Helper Methods ====================

  private cleanFilePath(filePath: string): string {
    // Remove leading/trailing whitespace and quotes
    let cleaned = filePath.trim().replace(/^['"]|['"]$/g, '');

    // Remove "File:" prefix if present
    cleaned = cleaned.replace(/^File:\s*/i, '');

    // Normalize path separators
    cleaned = cleaned.replace(/\\/g, '/');

    // Remove leading slash
    cleaned = cleaned.replace(/^\//, '');

    return cleaned;
  }

  private cleanCodeContent(content: string): string {
    // Remove file path comment if present at start
    let cleaned = content.replace(this.FILE_COMMENT_REGEX, '').trim();

    return cleaned;
  }

  private languageToExtension(language: string): string {
    const mapping: Record<string, string> = {
      typescript: 'ts',
      tsx: 'tsx',
      javascript: 'js',
      jsx: 'jsx',
      python: 'py',
      java: 'java',
      go: 'go',
      rust: 'rs',
      css: 'css',
      scss: 'scss',
      html: 'html',
      json: 'json',
      yaml: 'yaml',
      yml: 'yml',
      markdown: 'md',
      sql: 'sql',
      shell: 'sh',
      bash: 'sh',
      dockerfile: 'Dockerfile',
    };

    return mapping[language.toLowerCase()] || language;
  }
}
