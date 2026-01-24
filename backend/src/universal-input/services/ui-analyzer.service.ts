import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Anthropic from '@anthropic-ai/sdk';
import { ExtractedAPIEndpoint } from '../dto/input-analysis.dto';

interface FileInfo {
  path: string;
  content?: string;
  size: number;
  mimeType?: string;
}

interface UIAnalysisResult {
  extractedEndpoints: ExtractedAPIEndpoint[];
  stateManagement?: 'redux' | 'zustand' | 'context' | 'mobx' | 'recoil' | 'jotai' | 'none';
  routingLibrary?: 'react-router' | 'next-router' | 'vue-router' | 'tanstack-router' | 'none';
  stylingApproach?:
    | 'tailwind'
    | 'css-modules'
    | 'styled-components'
    | 'emotion'
    | 'sass'
    | 'plain-css';
  componentCount: number;
  pageCount: number;
  dataFetchingPattern?:
    | 'tanstack-query'
    | 'swr'
    | 'rtk-query'
    | 'apollo'
    | 'fetch'
    | 'axios'
    | 'none';
  formLibrary?: 'react-hook-form' | 'formik' | 'none';
  inferredFeatures: string[];
  businessRules: string[];
}

@Injectable()
export class UIAnalyzerService {
  private readonly logger = new Logger(UIAnalyzerService.name);
  private readonly anthropic: Anthropic;

  constructor(private readonly configService: ConfigService) {
    this.anthropic = new Anthropic({
      apiKey: this.configService.get<string>('ANTHROPIC_API_KEY'),
    });
  }

  /**
   * AI-Native UI Analysis - Uses Claude to extract requirements from frontend code
   * Identifies API endpoints, state patterns, and inferred business rules
   */
  async analyzeUI(files: FileInfo[]): Promise<UIAnalysisResult> {
    this.logger.log(`Analyzing ${files.length} UI files using AI`);

    // Filter to UI-relevant files
    const uiFiles = files.filter((f) => this.isUIFile(f.path));

    if (uiFiles.length === 0) {
      return this.createEmptyResult();
    }

    // Prepare file contents for Claude
    const fileContents = this.prepareFileContents(uiFiles);

    // Run AI analysis
    const result = await this.runUIAnalysis(fileContents, uiFiles);

    this.logger.log(
      `UI analysis complete: ${result.extractedEndpoints.length} endpoints, ` +
        `${result.componentCount} components, ${result.pageCount} pages`,
    );

    return result;
  }

  /**
   * AI-Native comprehensive UI analysis
   */
  private async runUIAnalysis(fileContents: string, files: FileInfo[]): Promise<UIAnalysisResult> {
    const filePaths = files.map((f) => f.path).join(', ');
    this.logger.debug(`Analyzing UI from files: ${filePaths}`);

    const systemPrompt = `You are an expert frontend code analyst. Your job is to analyze UI code and extract:

1. ALL API ENDPOINTS - Find every fetch, axios, API call, query hook usage. Extract:
   - HTTP method (GET, POST, PUT, PATCH, DELETE)
   - URL path (extract the actual path, not variables)
   - Source file and line number
   - Inferred request/response types from TypeScript or usage
   - Whether the endpoint requires authentication (look for token headers, auth context)

2. STATE MANAGEMENT - Identify what's used:
   - Redux (createSlice, useSelector, useDispatch)
   - Zustand (create, useStore)
   - Context (createContext, useContext)
   - MobX (@observable, observer)
   - Recoil (atom, selector)
   - Jotai (atom, useAtom)
   - Or plain useState/useReducer

3. ROUTING - Identify the routing library and extract pages:
   - React Router (BrowserRouter, Routes, Route, useNavigate)
   - Next.js (pages/ or app/ directory, Link, useRouter)
   - TanStack Router
   - Vue Router

4. STYLING APPROACH:
   - Tailwind CSS (className with utility classes)
   - CSS Modules (*.module.css imports)
   - Styled Components (styled.div, css tagged template)
   - Emotion (@emotion/styled)
   - Sass/SCSS
   - Plain CSS

5. DATA FETCHING PATTERN:
   - TanStack Query (useQuery, useMutation)
   - SWR (useSWR)
   - RTK Query (createApi)
   - Apollo Client (useQuery, useMutation from @apollo/client)
   - Plain fetch/axios

6. COMPONENT & PAGE COUNT:
   - Count distinct components (React functional/class components, Vue SFCs)
   - Count pages (route-level components)

7. INFERRED FEATURES - What features does this UI implement?
   - User authentication (login, register, logout)
   - CRUD operations (list, create, edit, delete)
   - Search/filtering
   - Pagination
   - File uploads
   - Real-time updates
   - etc.

8. BUSINESS RULES - Infer business logic from UI conditionals:
   - Role-based access (admin, user, guest)
   - Status-based visibility
   - Validation rules
   - Workflow states

Be thorough and extract every endpoint you find. Return ONLY valid JSON, no markdown code blocks.`;

    const userPrompt = `Analyze this UI/frontend code and extract all API requirements, patterns, and inferred business rules:

${fileContents}

Return a JSON object with this structure:
{
  "extractedEndpoints": [
    {
      "method": "GET|POST|PUT|PATCH|DELETE",
      "path": "/api/users",
      "sourceFile": "src/components/UserList.tsx",
      "sourceLine": 15,
      "inferredRequestType": "{ name: string, email: string } or null",
      "inferredResponseType": "User[] or null",
      "isAuthenticated": true/false
    }
  ],
  "stateManagement": "redux|zustand|context|mobx|recoil|jotai|none",
  "routingLibrary": "react-router|next-router|vue-router|tanstack-router|none",
  "stylingApproach": "tailwind|css-modules|styled-components|emotion|sass|plain-css",
  "dataFetchingPattern": "tanstack-query|swr|rtk-query|apollo|fetch|axios|none",
  "formLibrary": "react-hook-form|formik|none",
  "componentCount": number,
  "pageCount": number,
  "inferredFeatures": [
    "User authentication",
    "Product listing with search",
    "Shopping cart",
    "Checkout flow"
  ],
  "businessRules": [
    "Only admins can access /admin routes",
    "Users must be logged in to add to cart",
    "Orders can only be cancelled if status is 'pending'"
  ]
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 8000,
        messages: [{ role: 'user', content: userPrompt }],
        system: systemPrompt,
      });

      const textBlock = response.content.find((block) => block.type === 'text');
      if (!textBlock || textBlock.type !== 'text') {
        throw new Error('No text response from Claude');
      }

      const result = JSON.parse(textBlock.text.trim());

      return {
        extractedEndpoints: result.extractedEndpoints || [],
        stateManagement: result.stateManagement || 'none',
        routingLibrary: result.routingLibrary || 'none',
        stylingApproach: result.stylingApproach || 'plain-css',
        dataFetchingPattern: result.dataFetchingPattern || 'none',
        formLibrary: result.formLibrary || 'none',
        componentCount: result.componentCount || 0,
        pageCount: result.pageCount || 0,
        inferredFeatures: result.inferredFeatures || [],
        businessRules: result.businessRules || [],
      };
    } catch (error) {
      this.logger.error('UI analysis failed', error);
      return this.createEmptyResult();
    }
  }

  /**
   * Prepare file contents for Claude, respecting token limits
   */
  private prepareFileContents(files: FileInfo[]): string {
    let contents = '';
    const maxTotalLength = 80000;
    let currentLength = 0;

    // Prioritize files likely to contain API calls
    const priorityOrder = [
      'api',
      'service',
      'hook',
      'query',
      'mutation',
      'store',
      'slice',
      'context',
      'page',
      'container',
      'component',
    ];

    const sortedFiles = [...files].sort((a, b) => {
      const aScore = priorityOrder.findIndex((p) => a.path.toLowerCase().includes(p));
      const bScore = priorityOrder.findIndex((p) => b.path.toLowerCase().includes(p));
      return (aScore === -1 ? 999 : aScore) - (bScore === -1 ? 999 : bScore);
    });

    for (const file of sortedFiles) {
      if (!file.content) continue;

      const fileSection = `\n=== ${file.path} ===\n${file.content}\n`;
      if (currentLength + fileSection.length > maxTotalLength) {
        const remaining = maxTotalLength - currentLength;
        if (remaining > 500) {
          contents += `\n=== ${file.path} (truncated) ===\n${file.content.substring(0, remaining - 100)}\n... (truncated)\n`;
        }
        break;
      }

      contents += fileSection;
      currentLength += fileSection.length;
    }

    return contents;
  }

  /**
   * Check if file is UI-related
   */
  private isUIFile(path: string): boolean {
    const lowerPath = path.toLowerCase();

    // Include patterns
    const includePatterns = [
      '.tsx',
      '.jsx',
      '.vue',
      '.svelte',
      '/components/',
      '/pages/',
      '/app/',
      '/views/',
      '/screens/',
      '/hooks/',
      '/store/',
      '/context/',
      '/api/',
    ];

    // Exclude patterns (backend/config files)
    const excludePatterns = [
      '.controller.ts',
      '.service.ts',
      '.module.ts',
      '.entity.ts',
      '.dto.ts',
      '/migrations/',
      'prisma/',
      '.test.',
      '.spec.',
      '__tests__',
    ];

    const isIncluded = includePatterns.some((p) => lowerPath.includes(p));
    const isExcluded = excludePatterns.some((p) => lowerPath.includes(p));

    return isIncluded && !isExcluded;
  }

  private createEmptyResult(): UIAnalysisResult {
    return {
      extractedEndpoints: [],
      componentCount: 0,
      pageCount: 0,
      inferredFeatures: [],
      businessRules: [],
    };
  }
}
