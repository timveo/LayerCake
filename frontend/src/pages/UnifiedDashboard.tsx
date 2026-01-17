import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CodeBracketIcon,
  ComputerDesktopIcon,
  PaperAirplaneIcon,
  StopIcon,
  CpuChipIcon,
  FolderIcon,
  FolderOpenIcon,
  DocumentIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CheckIcon,
  XMarkIcon,
  SunIcon,
  MoonIcon,
  ArrowsPointingOutIcon,
  ArrowsPointingInIcon,
} from '@heroicons/react/24/outline';
import { projectsApi } from '../api/projects';
import FuzzyLlamaLogoSvg from '../assets/Llamalogo.png';
import FuzzyLlamaLogoTransparent from '../assets/Llamalogo-transparent.png';

// Types
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}


interface FileTreeNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileTreeNode[];
  content?: string;
}

interface GateApprovalData {
  gateNumber: number;
  title: string;
  description: string;
  checklist: { item: string; completed: boolean }[];
  artifacts: string[];
  agentRecommendation: string;
}

type WorkspaceTab = 'ui' | 'docs' | 'code' | 'map';
type MainView = 'dashboard' | 'projects';
type Phase = 'plan' | 'dev' | 'ship';
type ThemeMode = 'dark' | 'light';

// All 14 agents from the system with phase assignments
const ALL_AGENTS = [
  { type: 'PRODUCT_MANAGER', name: 'Product Manager', icon: '📋', status: 'idle' as const, phase: 'plan' as Phase },
  { type: 'ARCHITECT', name: 'Architect', icon: '🏗️', status: 'working' as const, phase: 'plan' as Phase },
  { type: 'UX_UI_DESIGNER', name: 'UX/UI Designer', icon: '🎨', status: 'idle' as const, phase: 'plan' as Phase },
  { type: 'FRONTEND_DEVELOPER', name: 'Frontend Dev', icon: '⚛️', status: 'idle' as const, phase: 'dev' as Phase },
  { type: 'BACKEND_DEVELOPER', name: 'Backend Dev', icon: '⚙️', status: 'working' as const, phase: 'dev' as Phase },
  { type: 'ML_ENGINEER', name: 'ML Engineer', icon: '🤖', status: 'idle' as const, phase: 'dev' as Phase },
  { type: 'PROMPT_ENGINEER', name: 'Prompt Engineer', icon: '💬', status: 'idle' as const, phase: 'dev' as Phase },
  { type: 'MODEL_EVALUATOR', name: 'Model Evaluator', icon: '📊', status: 'idle' as const, phase: 'dev' as Phase },
  { type: 'DATA_ENGINEER', name: 'Data Engineer', icon: '📦', status: 'idle' as const, phase: 'dev' as Phase },
  { type: 'QA_ENGINEER', name: 'QA Engineer', icon: '🧪', status: 'idle' as const, phase: 'ship' as Phase },
  { type: 'SECURITY_ENGINEER', name: 'Security', icon: '🔒', status: 'idle' as const, phase: 'ship' as Phase },
  { type: 'DEVOPS_ENGINEER', name: 'DevOps', icon: '🚀', status: 'idle' as const, phase: 'ship' as Phase },
  { type: 'AIOPS_ENGINEER', name: 'AIOps', icon: '🔍', status: 'idle' as const, phase: 'ship' as Phase },
  { type: 'ORCHESTRATOR', name: 'Orchestrator', icon: '🎯', status: 'working' as const, phase: 'plan' as Phase },
];

// Gates organized by phase
const GATES_BY_PHASE: Record<Phase, number[]> = {
  plan: [0, 1, 2, 3],
  dev: [4, 5, 6],
  ship: [7, 8, 9],
};

// Gate names, descriptions, decisions (teaching moments), documents, and celebrations
const GATE_INFO: Record<number, {
  name: string;
  narrative: string;
  description: string;
  deliverables: string[];
  summary: string;  // What was accomplished in this gate
  decisions: { choice: string; reason: string }[];  // Key decisions and why
  documents: { name: string; path: string; icon: string }[];  // Docs created in this gate
  celebration: string;
}> = {
  0: {
    name: 'The Vision Takes Shape',
    narrative: 'Every great product starts with a clear "why"',
    description: 'You defined what you\'re building and why it matters. The foundation of every great product.',
    deliverables: ['Problem statement', 'Target users defined', 'Initial concept validated'],
    summary: 'Established the core problem space and validated that developers need AI-assisted tooling to manage complex multi-agent workflows.',
    decisions: [
      { choice: 'Developer productivity over enterprise features', reason: 'Indie devs need speed, not governance overhead' },
      { choice: 'AI-first approach over manual workflows', reason: 'Automating repetitive tasks compounds time savings' },
    ],
    documents: [
      { name: 'Vision Statement', path: '/docs/vision.md', icon: '📄' },
      { name: 'User Research', path: '/docs/user-research.md', icon: '👥' },
    ],
    celebration: '🎯 Vision Set!'
  },
  1: {
    name: 'Requirements Crystallize',
    narrative: 'From ideas to actionable specifications',
    description: 'Product requirements fully documented. Every feature has a purpose.',
    deliverables: ['PRD document', 'User stories', 'Success metrics', 'Feature prioritization'],
    summary: 'Translated the vision into concrete requirements with measurable success criteria and a prioritized feature backlog.',
    decisions: [
      { choice: 'Real-time agent visibility over async notifications', reason: 'Transparency builds trust with users' },
      { choice: 'Gate-based workflow over continuous deployment', reason: 'Quality checkpoints reduce costly production bugs' },
      { choice: 'MoSCoW prioritization framework', reason: 'Clear must-have vs nice-to-have prevents scope creep' },
    ],
    documents: [
      { name: 'PRD.md', path: '/docs/PRD.md', icon: '📋' },
      { name: 'User Stories', path: '/docs/user-stories.md', icon: '📝' },
      { name: 'Success Metrics', path: '/docs/metrics.md', icon: '📊' },
    ],
    celebration: '📋 PRD Complete!'
  },
  2: {
    name: 'Architecture Emerges',
    narrative: 'The skeleton that supports everything',
    description: 'The skeleton of your application took form. Decisions made here echo through every feature.',
    deliverables: ['System design doc', 'Tech stack decision', 'Database schema', 'API contracts'],
    summary: 'Designed a scalable microservices architecture with event-driven communication between agents and a robust data layer.',
    decisions: [
      { choice: 'Microservices over monolith', reason: 'Agents need independent scaling and deployment' },
      { choice: 'PostgreSQL over MongoDB', reason: 'ACID compliance critical for gate approval state management' },
      { choice: 'FastAPI for backend', reason: 'Native async support and auto-generated OpenAPI docs' },
      { choice: 'React + TypeScript for frontend', reason: 'Type safety catches bugs early, large ecosystem' },
    ],
    documents: [
      { name: 'Architecture.md', path: '/docs/ARCHITECTURE.md', icon: '🏗️' },
      { name: 'API Contracts', path: '/docs/API.md', icon: '🔌' },
      { name: 'Database Schema', path: '/docs/schema.md', icon: '🗄️' },
    ],
    celebration: '🏗️ Foundations Laid!'
  },
  3: {
    name: 'Design Takes Form',
    narrative: 'Where user experience meets visual craft',
    description: 'UX/UI design completed. Users will thank you for the attention to detail.',
    deliverables: ['Wireframes', 'Design system', 'User flows', 'Prototype'],
    summary: 'Created a cohesive design system with a three-panel layout optimized for developer workflows and extended coding sessions.',
    decisions: [
      { choice: 'Three-panel layout over tabbed interface', reason: 'Users need simultaneous context of agents, work, and progress' },
      { choice: 'Dark mode as default', reason: 'Developers work late; reducing eye strain improves productivity' },
      { choice: 'Teal accent color palette', reason: 'Professional yet distinctive, good contrast in both themes' },
    ],
    documents: [
      { name: 'Design System', path: '/docs/design-system.md', icon: '🎨' },
      { name: 'Wireframes', path: '/docs/wireframes.fig', icon: '📐' },
      { name: 'User Flows', path: '/docs/user-flows.md', icon: '🔀' },
    ],
    celebration: '🎨 Design Approved!'
  },
  4: {
    name: 'Core Features Alive',
    narrative: 'Ideas become reality, one function at a time',
    description: 'You\'re breathing life into essential functionality. This is where ideas become real.',
    deliverables: ['Core features', 'Basic UI', 'Database setup', 'API endpoints'],
    summary: 'Built the orchestrator engine and core agent framework, establishing the foundation for all 14 specialized agents.',
    decisions: [
      { choice: 'Orchestrator-first development', reason: 'Coordination logic is the hardest to retrofit later' },
      { choice: 'WebSocket over polling for updates', reason: 'Instant feedback transforms user experience' },
      { choice: 'Agent state machine pattern', reason: 'Predictable state transitions simplify debugging' },
    ],
    documents: [
      { name: 'MVP Spec', path: '/docs/mvp-spec.md', icon: '⚡' },
      { name: 'Agent Framework', path: '/docs/agent-framework.md', icon: '🤖' },
    ],
    celebration: '⚡ MVP Built!'
  },
  5: {
    name: 'Feature Complete',
    narrative: 'All the pieces come together',
    description: 'All planned features implemented. Your product is taking its full shape.',
    deliverables: ['All features built', 'Integration complete', 'Error handling', 'Edge cases covered'],
    summary: 'Completed all 14 specialized agents with full orchestration, gate approval workflows, and comprehensive error handling.',
    decisions: [
      { choice: 'Rollback capability at each gate', reason: 'Mistakes happen; recovery should be seamless' },
      { choice: '14 specialized agents over general-purpose', reason: 'Expertise beats flexibility for code quality' },
      { choice: 'Graceful degradation for AI failures', reason: 'Users should never be completely blocked' },
    ],
    documents: [
      { name: 'Feature Matrix', path: '/docs/features.md', icon: '✨' },
      { name: 'Error Handling', path: '/docs/error-handling.md', icon: '🚨' },
    ],
    celebration: '✨ Features Done!'
  },
  6: {
    name: 'Integration Harmony',
    narrative: 'Making all systems sing together',
    description: 'All systems integrated and working together seamlessly.',
    deliverables: ['Third-party integrations', 'Service connections', 'Data pipelines', 'Auth flow'],
    summary: 'Connected all services with secure authentication, established data pipelines, and integrated external AI providers.',
    decisions: [
      { choice: 'JWT tokens over session cookies', reason: 'Stateless auth simplifies horizontal scaling' },
      { choice: 'Redis for agent state caching', reason: 'Sub-millisecond reads keep UI responsive during heavy processing' },
      { choice: 'OpenAI + Anthropic multi-provider', reason: 'Redundancy prevents single point of failure' },
    ],
    documents: [
      { name: 'Integration Guide', path: '/docs/integrations.md', icon: '🔗' },
      { name: 'Auth Flow', path: '/docs/auth.md', icon: '🔐' },
    ],
    celebration: '🔗 All Connected!'
  },
  7: {
    name: 'Quality Assured',
    narrative: 'Confidence through comprehensive testing',
    description: 'Comprehensive testing passed. You can deploy with confidence.',
    deliverables: ['Unit tests', 'Integration tests', 'E2E tests', 'Performance tests', 'Security audit'],
    summary: 'Achieved 85% test coverage with comprehensive E2E tests, performance benchmarks, and completed security audit.',
    decisions: [
      { choice: '80% coverage threshold over 100%', reason: 'Diminishing returns; focus testing on critical paths' },
      { choice: 'Playwright over Cypress for E2E', reason: 'Better multi-browser support, lighter footprint' },
      { choice: 'Automated security scanning in CI', reason: 'Catch vulnerabilities before they reach production' },
    ],
    documents: [
      { name: 'Test Plan', path: '/docs/test-plan.md', icon: '🧪' },
      { name: 'Security Audit', path: '/docs/security-audit.md', icon: '🔒' },
      { name: 'Perf Benchmarks', path: '/docs/performance.md', icon: '📈' },
    ],
    celebration: '🧪 Tests Pass!'
  },
  8: {
    name: 'Deploy Ready',
    narrative: 'Production environment awaits',
    description: 'Production environment prepared. The runway is clear for launch.',
    deliverables: ['CI/CD pipeline', 'Monitoring setup', 'Logging configured', 'Backup strategy'],
    summary: 'Configured production infrastructure with automated deployments, comprehensive monitoring, and disaster recovery.',
    decisions: [
      { choice: 'Docker Compose over Kubernetes', reason: 'Right-sized complexity for current scale' },
      { choice: 'Structured JSON logging', reason: 'Queryable logs enable faster incident debugging' },
      { choice: 'Blue-green deployment strategy', reason: 'Zero-downtime deploys with instant rollback' },
    ],
    documents: [
      { name: 'Deploy Guide', path: '/docs/deployment.md', icon: '🚀' },
      { name: 'Runbook', path: '/docs/runbook.md', icon: '📖' },
      { name: 'Monitoring Setup', path: '/docs/monitoring.md', icon: '📡' },
    ],
    celebration: '🚀 Ready to Launch!'
  },
  9: {
    name: 'Live & Learning',
    narrative: 'Your creation meets the world',
    description: 'Product successfully launched! Real users, real feedback, real impact.',
    deliverables: ['Production deployment', 'User onboarding', 'Documentation', 'Support process'],
    summary: 'Successfully launched to beta users with onboarding flow, documentation portal, and feedback collection system.',
    decisions: [
      { choice: 'Soft launch to beta users first', reason: 'Controlled feedback loop catches UX issues early' },
      { choice: 'In-app feedback widget', reason: 'Friction-free input increases user engagement' },
      { choice: 'Weekly release cadence', reason: 'Predictable updates build user confidence' },
    ],
    documents: [
      { name: 'Launch Checklist', path: '/docs/launch-checklist.md', icon: '✅' },
      { name: 'User Guide', path: '/docs/user-guide.md', icon: '📚' },
      { name: 'Release Notes', path: '/docs/releases.md', icon: '📣' },
    ],
    celebration: '🎉 You Shipped!'
  },
};

// Mock data
const mockMessages: ChatMessage[] = [
  { id: '1', role: 'system', content: 'Agent Orchestrator online. Ready to coordinate your build.', timestamp: new Date(Date.now() - 300000) },
  { id: '2', role: 'user', content: 'What agents are currently active?', timestamp: new Date(Date.now() - 240000) },
  { id: '3', role: 'assistant', content: 'Currently running: Architect (designing system), Backend Dev (API scaffolding), and Orchestrator (coordinating). The Product Manager completed the PRD. Want me to activate more agents?', timestamp: new Date(Date.now() - 180000) },
];


// Mock file tree for Code tab
const mockFileTree: FileTreeNode[] = [
  {
    name: 'docs',
    type: 'folder',
    path: '/docs',
    children: [
      { name: 'README.md', type: 'file', path: '/docs/README.md', content: '# Project Documentation\n\nWelcome to the Fuzzy Llama project documentation.\n\n## Overview\n\nThis project uses a gated development process with 10 quality gates.\n\n## Getting Started\n\n1. Review the PRD\n2. Approve architecture decisions\n3. Begin development' },
      { name: 'PRD.md', type: 'file', path: '/docs/PRD.md', content: '# Product Requirements Document\n\n## Vision\n\nBuild a comprehensive AI-powered development platform.\n\n## Goals\n\n- Automate repetitive coding tasks\n- Ensure quality through gates\n- Provide transparency in decisions\n\n## User Stories\n\n### As a developer\n- I want to see agent progress in real-time\n- I want to approve decisions at each gate' },
      { name: 'ARCHITECTURE.md', type: 'file', path: '/docs/ARCHITECTURE.md', content: '# System Architecture\n\n## Overview\n\nMicroservices architecture with event-driven communication.\n\n## Components\n\n### Frontend\n- React with TypeScript\n- Tailwind CSS\n- Framer Motion\n\n### Backend\n- FastAPI (Python)\n- PostgreSQL\n- Redis for caching\n\n### AI Agents\n- 14 specialized agents\n- Orchestrator for coordination' },
      { name: 'API.md', type: 'file', path: '/docs/API.md', content: '# API Documentation\n\n## Endpoints\n\n### Projects\n\n`GET /api/projects` - List all projects\n\n`POST /api/projects` - Create new project\n\n`GET /api/projects/:id` - Get project details\n\n### Agents\n\n`POST /api/agents/execute` - Run an agent\n\n`GET /api/agents/status` - Get agent status' },
    ],
  },
  {
    name: 'src',
    type: 'folder',
    path: '/src',
    children: [
      {
        name: 'components',
        type: 'folder',
        path: '/src/components',
        children: [
          { name: 'README.md', type: 'file', path: '/src/components/README.md', content: '# Components\n\nReusable UI components for the application.\n\n## Structure\n\n- `ui/` - Base UI components (Button, Card, Input)\n- `layout/` - Layout components (MainLayout)\n- `gates/` - Gate-related components' },
        ],
      },
      {
        name: 'pages',
        type: 'folder',
        path: '/src/pages',
        children: [
          { name: 'README.md', type: 'file', path: '/src/pages/README.md', content: '# Pages\n\nApplication pages and routes.\n\n## Dashboard Variants\n\n1. **Mission Control** - NASA-inspired command center\n2. **Journey Map** - Story-driven progress\n3. **Living Canvas** - Organic ecosystem view\n4. **Unified Dashboard** - Combined experience' },
        ],
      },
    ],
  },
  { name: 'CHANGELOG.md', type: 'file', path: '/CHANGELOG.md', content: '# Changelog\n\n## v0.3.0\n\n- Added biomorphic dashboard design\n- Integrated all 14 AI agents\n- Implemented real-time agent streaming\n\n## v0.2.0\n\n- Added gate approval workflow\n- Created proof artifact viewer\n- Implemented WebSocket connections\n\n## v0.1.0\n\n- Initial project setup\n- Basic dashboard structure\n- Authentication system' },
  { name: 'CONTRIBUTING.md', type: 'file', path: '/CONTRIBUTING.md', content: '# Contributing Guide\n\n## Development Setup\n\n1. Clone the repository\n2. Install dependencies: `npm install`\n3. Start dev server: `npm run dev`\n\n## Code Style\n\n- Use TypeScript for all new code\n- Follow the existing patterns\n- Add tests for new features\n\n## Pull Requests\n\n- Create feature branches\n- Write clear commit messages\n- Request review from maintainers' },
];

// Mock gate approval data
const mockGateApproval: GateApprovalData = {
  gateNumber: 3,
  title: 'Architecture Review',
  description: 'The system architecture has been designed and is ready for approval. This gate ensures the technical foundation is solid before development begins.',
  checklist: [
    { item: 'Database schema reviewed', completed: true },
    { item: 'API contracts defined', completed: true },
    { item: 'Security considerations documented', completed: true },
    { item: 'Scalability plan approved', completed: false },
  ],
  artifacts: ['architecture-diagram.png', 'api-spec.yaml', 'database-schema.sql'],
  agentRecommendation: 'The Architect recommends approval. All critical components have been designed with scalability in mind. One minor item (scalability plan documentation) is pending but non-blocking.',
};

// GitHub Icon SVG Component
const GitHubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

// Breathing orb indicator
const BreathingOrb = ({ color, size = 'md' }: { color: string; size?: 'sm' | 'md' | 'lg' }) => {
  const sizes = { sm: 'w-2 h-2', md: 'w-3 h-3', lg: 'w-4 h-4' };
  return (
    <motion.div
      className={`${sizes[size]} rounded-full ${color}`}
      animate={{ scale: [1, 1.3, 1], opacity: [0.6, 1, 0.6] }}
      transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
};

// Panel wrapper component with consistent styling
const Panel = ({ children, className = '', theme }: { children: React.ReactNode; className?: string; theme?: ThemeMode }) => {
  const isDark = theme === 'dark';
  return (
    <div className={`backdrop-blur-sm rounded-2xl border ${
      isDark
        ? 'bg-slate-800/60 border-slate-700/50'
        : 'bg-teal-500/50 border-teal-600/40'
    } ${className}`}>
      {children}
    </div>
  );
};

// ============ GATE APPROVAL POPUP ============

const GateApprovalPopup = ({
  isOpen,
  onClose,
  onApprove,
  onDeny,
  gateData,
  theme
}: {
  isOpen: boolean;
  onClose: () => void;
  onApprove: () => void;
  onDeny: () => void;
  gateData: GateApprovalData;
  theme: ThemeMode;
}) => {
  const [denyReason, setDenyReason] = useState('');
  const [showDenyInput, setShowDenyInput] = useState(false);
  const isDark = theme === 'dark';

  if (!isOpen) return null;

  const completedCount = gateData.checklist.filter(c => c.completed).length;
  const totalCount = gateData.checklist.length;

  const handleDeny = () => {
    if (showDenyInput && denyReason.trim()) {
      onDeny();
      setShowDenyInput(false);
      setDenyReason('');
    } else {
      setShowDenyInput(true);
    }
  };

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden ${
            isDark ? 'bg-slate-800 border border-slate-700' : 'bg-teal-900 border border-teal-700'
          }`}
        >
          {/* Header */}
          <div className={`p-4 border-b ${isDark ? 'border-slate-700 bg-slate-800/80' : 'border-teal-700 bg-teal-800/80'}`}>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center text-white font-bold">
                  G{gateData.gateNumber}
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">{gateData.title}</h2>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-teal-300'}`}>Gate {gateData.gateNumber} Approval Required</p>
                </div>
              </div>
              <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
                <XMarkIcon className="w-6 h-6" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Description */}
            <p className={`text-sm leading-relaxed ${isDark ? 'text-slate-300' : 'text-teal-100'}`}>
              {gateData.description}
            </p>

            {/* Checklist */}
            <div className={`rounded-xl p-3 ${isDark ? 'bg-slate-700/50' : 'bg-teal-800/50'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-teal-300'}`}>
                  Checklist
                </span>
                <span className="text-xs text-emerald-400 font-medium">
                  {completedCount}/{totalCount} complete
                </span>
              </div>
              <div className="space-y-2">
                {gateData.checklist.map((item, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className={`w-4 h-4 rounded flex items-center justify-center ${
                      item.completed ? 'bg-emerald-500' : isDark ? 'bg-slate-600' : 'bg-teal-700'
                    }`}>
                      {item.completed && <CheckIcon className="w-3 h-3 text-white" />}
                    </div>
                    <span className={`text-sm ${item.completed ? 'text-emerald-400' : isDark ? 'text-slate-300' : 'text-teal-200'}`}>
                      {item.item}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Artifacts */}
            <div className={`rounded-xl p-3 ${isDark ? 'bg-slate-700/50' : 'bg-teal-800/50'}`}>
              <span className={`text-xs font-semibold uppercase ${isDark ? 'text-slate-400' : 'text-teal-300'}`}>
                Artifacts
              </span>
              <div className="flex flex-wrap gap-2 mt-2">
                {gateData.artifacts.map((artifact, i) => (
                  <span key={i} className={`text-xs px-2 py-1 rounded-full ${
                    isDark ? 'bg-slate-600 text-slate-300' : 'bg-teal-700 text-teal-200'
                  }`}>
                    {artifact}
                  </span>
                ))}
              </div>
            </div>

            {/* Agent Recommendation */}
            <div className={`rounded-xl p-3 border-l-4 border-teal-500 ${isDark ? 'bg-teal-950/10' : 'bg-teal-600/20'}`}>
              <div className="flex items-start gap-2">
                <span className="text-lg">🤖</span>
                <div>
                  <span className={`text-xs font-semibold ${isDark ? 'text-teal-400' : 'text-teal-300'}`}>Agent Recommendation</span>
                  <p className={`text-sm mt-1 ${isDark ? 'text-slate-300' : 'text-teal-100'}`}>
                    {gateData.agentRecommendation}
                  </p>
                </div>
              </div>
            </div>

            {/* Deny reason input */}
            {showDenyInput && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className={`rounded-xl p-3 ${isDark ? 'bg-red-500/10 border border-red-500/30' : 'bg-red-500/20 border border-red-400/30'}`}
              >
                <label className="text-xs font-semibold text-red-400 block mb-2">
                  Reason for denial (will be sent to Agent Orchestrator)
                </label>
                <textarea
                  value={denyReason}
                  onChange={(e) => setDenyReason(e.target.value)}
                  placeholder="Describe what needs to be addressed..."
                  className={`w-full h-20 rounded-lg p-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-red-500 ${
                    isDark ? 'bg-slate-700 text-white placeholder-slate-400' : 'bg-teal-800 text-white placeholder-teal-400'
                  }`}
                />
              </motion.div>
            )}
          </div>

          {/* Actions */}
          <div className={`p-4 border-t ${isDark ? 'border-slate-700 bg-slate-800/50' : 'border-teal-700 bg-teal-800/50'}`}>
            <div className="flex gap-3">
              <button
                onClick={handleDeny}
                className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
                  showDenyInput && !denyReason.trim()
                    ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                    : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                }`}
                disabled={showDenyInput && !denyReason.trim()}
              >
                {showDenyInput ? 'Submit Denial' : 'Deny'}
              </button>
              <button
                onClick={onApprove}
                className="flex-1 py-3 rounded-xl font-medium bg-emerald-500 text-white hover:bg-emerald-600 transition-colors"
              >
                Approve Gate
              </button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ============ SPLASH PAGE FOR NEW USERS ============

const SplashPage = ({ onGetStarted }: { onGetStarted: () => void }) => {
  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900 flex items-center justify-center p-8">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-4xl w-full text-center"
      >
        {/* Large White Llama */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', delay: 0.1 }}
          className="mb-8"
        >
          <img
            src={FuzzyLlamaLogoTransparent}
            alt="Fuzzy Llama"
            className="w-64 h-64 mx-auto"
          />
        </motion.div>

        {/* Logo */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="w-32 h-32 mx-auto mb-8 bg-teal-600 rounded-3xl flex items-center justify-center shadow-xl shadow-teal-500/30 overflow-hidden"
        >
          <img src={FuzzyLlamaLogoSvg} alt="Fuzzy Llama" className="w-24 h-24" />
        </motion.div>

        <motion.h1
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
          className="text-5xl font-bold text-white mb-4"
        >
          Welcome to Fuzzy Llama
        </motion.h1>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
          className="text-xl text-teal-100/80 mb-12 max-w-2xl mx-auto"
        >
          Your AI-powered development companion. Build software with confidence using 14 specialized AI agents and a transparent, gated workflow.
        </motion.p>

        {/* Features Grid */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
        >
          {[
            { icon: '🤖', title: '14 AI Agents', desc: 'Specialized agents for every phase of development' },
            { icon: '🚦', title: '10 Quality Gates', desc: 'Transparent checkpoints ensure quality at every step' },
            { icon: '👁️', title: 'Full Transparency', desc: 'See every decision, understand every choice' },
          ].map((feature, i) => (
            <motion.div
              key={feature.title}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 + i * 0.1 }}
              className="bg-teal-800/50 backdrop-blur-sm rounded-2xl p-6 border border-teal-700/50"
            >
              <div className="text-4xl mb-4">{feature.icon}</div>
              <h3 className="text-lg font-semibold text-white mb-2">{feature.title}</h3>
              <p className="text-sm text-teal-200/70">{feature.desc}</p>
            </motion.div>
          ))}
        </motion.div>

        {/* CTA Button */}
        <motion.button
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1 }}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onGetStarted}
          className="px-8 py-4 bg-teal-950 hover:bg-teal-400 text-white font-semibold rounded-full text-lg shadow-lg shadow-teal-500/30 transition-colors"
        >
          Get Started
        </motion.button>

        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.1 }}
          className="text-sm text-teal-300/50 mt-6"
        >
          No credit card required. Start building in minutes.
        </motion.p>
      </motion.div>
    </div>
  );
};

// ============ GITHUB POPUP ============

const GitHubPopup = ({ isOpen, onClose, theme }: { isOpen: boolean; onClose: () => void; theme: ThemeMode }) => {
  if (!isOpen) return null;
  const isDark = theme === 'dark';

  const actions = [
    { label: 'Run Workflow', desc: 'Trigger a GitHub Action' },
    { label: 'Sync Repository', desc: 'Pull latest changes' },
    { label: 'View Actions', desc: 'See workflow history' },
    { label: 'Deploy', desc: 'Deploy to production' },
  ];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-start justify-end p-4 pt-16"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          className={`rounded-2xl shadow-xl border w-72 overflow-hidden ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-teal-900 border-teal-700'
          }`}
        >
          <div className={`p-4 border-b flex items-center justify-between ${isDark ? 'border-slate-700' : 'border-teal-700'}`}>
            <div className="flex items-center gap-2">
              <GitHubIcon className="w-5 h-5 text-white" />
              <span className="font-semibold text-white">GitHub Actions</span>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="p-2">
            {actions.map((action) => (
              <button
                key={action.label}
                className={`w-full flex flex-col p-3 rounded-xl transition-colors text-left ${
                  isDark ? 'hover:bg-slate-700' : 'hover:bg-teal-800'
                }`}
              >
                <span className="text-sm font-medium text-white">{action.label}</span>
                <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-teal-300'}`}>{action.desc}</span>
              </button>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ============ SETTINGS POPUP ============

const SettingsPopup = ({ isOpen, onClose, theme, onToggleTheme }: {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeMode;
  onToggleTheme: () => void;
}) => {
  if (!isOpen) return null;
  const isDark = theme === 'dark';

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/50 z-50 flex items-start justify-end p-4 pt-16"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: -10, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -10, scale: 0.95 }}
          onClick={(e) => e.stopPropagation()}
          className={`rounded-2xl shadow-xl border w-64 overflow-hidden ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-teal-900 border-teal-700'
          }`}
        >
          <div className={`p-4 border-b flex items-center justify-between ${isDark ? 'border-slate-700' : 'border-teal-700'}`}>
            <span className="font-semibold text-white">Settings</span>
            <button onClick={onClose} className="text-slate-400 hover:text-white">
              <XMarkIcon className="w-5 h-5" />
            </button>
          </div>
          <div className="p-2">
            <button
              onClick={onToggleTheme}
              className={`w-full flex items-center gap-3 p-3 rounded-xl transition-colors ${
                isDark ? 'hover:bg-slate-700' : 'hover:bg-teal-800'
              }`}
            >
              {isDark ? (
                <SunIcon className="w-5 h-5 text-amber-400" />
              ) : (
                <MoonIcon className="w-5 h-5 text-teal-300" />
              )}
              <span className="text-sm text-white">
                {isDark ? 'Light Mode' : 'Dark Mode'}
              </span>
            </button>
            <button className={`w-full flex flex-col p-3 rounded-xl transition-colors text-left ${
              isDark ? 'hover:bg-slate-700' : 'hover:bg-teal-800'
            }`}>
              <span className="text-sm text-white">Profile</span>
            </button>
            <button className={`w-full flex flex-col p-3 rounded-xl transition-colors text-left ${
              isDark ? 'hover:bg-slate-700' : 'hover:bg-teal-800'
            }`}>
              <span className="text-sm text-white">Preferences</span>
            </button>
            <div className={`border-t my-2 ${isDark ? 'border-slate-700' : 'border-teal-700'}`} />
            <button className={`w-full flex flex-col p-3 rounded-xl transition-colors text-left ${
              isDark ? 'hover:bg-red-500/20' : 'hover:bg-red-500/20'
            }`}>
              <span className="text-sm text-red-400">Sign Out</span>
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

// ============ LEFT PANEL COMPONENTS ============

const AgentOrchestratorPanel = ({ theme }: { theme: ThemeMode }) => {
  const [messages, setMessages] = useState<ChatMessage[]>(mockMessages);
  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const isDark = theme === 'dark';

  const handleSend = () => {
    if (!input.trim()) return;
    const newMessage: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };
    setMessages([...messages, newMessage]);
    setInput('');
    setIsStreaming(true);

    setTimeout(() => {
      setMessages(prev => [...prev, {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Acknowledged. Coordinating agents to handle your request.',
        timestamp: new Date(),
      }]);
      setIsStreaming(false);
    }, 1500);
  };

  return (
    <Panel theme={theme} className="flex flex-col h-full">
      {/* Header - compact */}
      <div className={`flex items-center gap-2 px-3 py-1.5 border-b ${isDark ? 'border-slate-700/50' : 'border-teal-200'}`}>
        <div className="relative">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${isDark ? 'bg-teal-950' : 'bg-teal-600'}`}>
            <CpuChipIcon className="w-4 h-4 text-white" />
          </div>
          <motion.div
            className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full bg-emerald-400 ${isDark ? 'border border-slate-800' : 'border border-teal-50'}`}
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
        <span className={`font-semibold text-xs flex-1 ${isDark ? 'text-white' : 'text-teal-800'}`}>Product Orchestrator</span>
        <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-100'}`}>
          <BreathingOrb color="bg-emerald-400" size="sm" />
          <span className={`text-[9px] font-medium ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>3</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-0">
        {messages.map((msg, i) => (
          <motion.div
            key={msg.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[90%] px-3 py-2 text-xs leading-relaxed rounded-2xl ${
              msg.role === 'user'
                ? isDark ? 'bg-teal-950 text-white rounded-br-md' : 'bg-teal-600 text-white rounded-br-md'
                : msg.role === 'system'
                ? isDark ? 'bg-slate-700/50 text-teal-200 rounded-bl-md italic' : 'bg-teal-200/50 text-teal-800 rounded-bl-md italic'
                : isDark ? 'bg-slate-700 text-white rounded-bl-md' : 'bg-white text-teal-900 rounded-bl-md border border-teal-100'
            }`}>
              {msg.content}
            </div>
          </motion.div>
        ))}
        {isStreaming && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl rounded-bl-md max-w-[90%] ${isDark ? 'bg-slate-700/50' : 'bg-teal-200/50'}`}>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className={`w-1.5 h-1.5 rounded-full ${isDark ? 'bg-teal-950' : 'bg-teal-600'}`}
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity }}
                />
              ))}
            </div>
            <span className={`text-[10px] ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>Processing...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className={`p-3 border-t ${isDark ? 'border-slate-700/50' : 'border-teal-200'}`}>
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${isDark ? 'bg-slate-700/50' : 'bg-white border border-teal-200'}`}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Command your agents..."
            className={`flex-1 bg-transparent text-xs focus:outline-none ${isDark ? 'text-white placeholder-teal-300/50' : 'text-teal-900 placeholder-teal-400'}`}
          />
          {isStreaming ? (
            <button onClick={() => setIsStreaming(false)} className="w-7 h-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
              <StopIcon className="w-3 h-3" />
            </button>
          ) : (
            <button onClick={handleSend} className={`w-7 h-7 rounded-full text-white flex items-center justify-center ${isDark ? 'bg-teal-950' : 'bg-teal-600'}`}>
              <PaperAirplaneIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
};


// ============ CENTER PANEL COMPONENTS ============

const WorkspacePanel = ({ activeTab, onTabChange, theme, isExpanded, onToggleExpand }: {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  theme: ThemeMode;
  isExpanded: boolean;
  onToggleExpand: () => void;
}) => {
  const isDark = theme === 'dark';
  const tabs: { id: WorkspaceTab; label: string }[] = [
    { id: 'ui', label: 'Preview' },
    { id: 'docs', label: 'Docs' },
    { id: 'code', label: 'Code' },
    { id: 'map', label: 'Journey' },
  ];

  return (
    <div className={`flex flex-col h-full p-1.5 rounded-2xl ${isDark ? '' : ''}`}>
      <div className={`flex-1 flex flex-col overflow-hidden rounded-xl ${isDark ? 'bg-slate-800/60' : 'bg-white border border-teal-200 shadow-sm'}`}>
        {/* Tab Bar with expand button */}
        <div className={`flex items-center justify-between pt-3 pb-2 px-3 ${isDark ? '' : 'bg-teal-50/50'}`}>
          {/* Spacer for centering */}
          <div className="w-8" />

          {/* Centered tabs */}
          <div className={`flex items-center gap-0.5 p-0.5 rounded-full ${isDark ? 'bg-slate-800/60' : 'bg-teal-100'}`}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-teal-600 text-white shadow-md'
                    : isDark ? 'text-teal-300 hover:text-white' : 'text-teal-700 hover:text-teal-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Expand/Collapse button */}
          <motion.button
            onClick={onToggleExpand}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
              isExpanded
                ? 'bg-teal-600 text-white'
                : isDark ? 'bg-slate-700/50 hover:bg-slate-700 text-teal-300' : 'bg-teal-100 hover:bg-teal-200 text-teal-700'
            }`}
            title={isExpanded ? 'Collapse panel' : 'Expand panel'}
          >
            {isExpanded ? (
              <ArrowsPointingInIcon className="w-4 h-4" />
            ) : (
              <ArrowsPointingOutIcon className="w-4 h-4" />
            )}
          </motion.button>
        </div>

        {/* Content Area */}
        <div className={`flex-1 p-4 overflow-auto ${isDark ? '' : 'bg-white rounded-b-xl'}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full"
            >
              {activeTab === 'ui' && <UIPreviewContent theme={theme} />}
              {activeTab === 'docs' && <DocsContent theme={theme} />}
              {activeTab === 'code' && <CodeContent theme={theme} />}
              {activeTab === 'map' && <JourneyContent theme={theme} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

const UIPreviewContent = ({ theme }: { theme: ThemeMode }) => {
  const [selectedView, setSelectedView] = useState('dashboard');
  const views = ['dashboard', 'login', 'settings', 'profile'];
  const isDark = theme === 'dark';

  return (
    <div className="h-full flex flex-col">
      <div className="flex gap-2 mb-4">
        {views.map((view) => (
          <button
            key={view}
            onClick={() => setSelectedView(view)}
            className={`px-4 py-2 rounded-full text-xs font-medium capitalize transition-all ${
              selectedView === view
                ? 'bg-teal-600 text-white'
                : isDark ? 'bg-slate-700/50 text-teal-300 hover:text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {view}
          </button>
        ))}
      </div>
      <div className={`flex-1 rounded-2xl overflow-hidden ${isDark ? 'border bg-slate-900/50 border-slate-700/50' : 'border border-slate-200 bg-white'}`}>
        <div className={`flex items-center gap-2 px-4 py-2 ${isDark ? 'border-b bg-slate-800/50 border-slate-700/50' : 'border-b border-slate-200 bg-slate-50'}`}>
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className={`flex-1 rounded-full px-3 py-1 text-[10px] text-center ${isDark ? 'bg-slate-900/50 text-slate-400' : 'bg-white text-slate-500'}`}>
            localhost:3000/{selectedView}
          </div>
        </div>
        <div className={`h-full flex items-center justify-center p-8 ${isDark ? '' : 'bg-white'}`}>
          <div className="text-center">
            <div className={`w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center ${isDark ? 'bg-teal-500/20' : 'bg-teal-100'}`}>
              <ComputerDesktopIcon className={`w-10 h-10 ${isDark ? 'text-teal-400' : 'text-teal-500'}`} />
            </div>
            <h3 className={`text-lg font-semibold mb-2 capitalize ${isDark ? 'text-white' : 'text-slate-700'}`}>{selectedView} Preview</h3>
            <p className={`text-sm ${isDark ? 'text-teal-300' : 'text-slate-500'}`}>Live UI preview appears here after G4.</p>
          </div>
        </div>
      </div>
    </div>
  );
};

const DocsContent = ({ theme }: { theme: ThemeMode }) => {
  const isDark = theme === 'dark';
  const docTypes = [
    { id: 'prd', name: 'PRD', status: 'complete' },
    { id: 'architecture', name: 'Architecture', status: 'complete' },
    { id: 'tech-stack', name: 'Tech Stack', status: 'complete' },
    { id: 'api', name: 'API Docs', status: 'in-progress' },
    { id: 'design', name: 'Design System', status: 'pending' },
    { id: 'testing', name: 'Test Plan', status: 'pending' },
    { id: 'deployment', name: 'Deployment', status: 'pending' },
  ];
  const [selectedDoc, setSelectedDoc] = useState('prd');

  const getStatusBadge = (status: string) => {
    const baseClasses = "text-[8px] w-12 text-center py-0.5 rounded-full font-medium";
    switch (status) {
      case 'complete': return <span className={`${baseClasses} ${isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>Done</span>;
      case 'in-progress': return <span className={`${baseClasses} ${isDark ? 'bg-amber-500/20 text-amber-400' : 'bg-amber-100 text-amber-700'}`}>WIP</span>;
      default: return <span className={`${baseClasses} ${isDark ? 'bg-slate-500/20 text-slate-400' : 'bg-slate-100 text-slate-500'}`}>Pending</span>;
    }
  };

  return (
    <div className="h-full flex gap-3">
      <div className="w-36 space-y-0.5">
        <div className={`text-[9px] font-semibold uppercase tracking-wider px-2 mb-1.5 ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>Documents</div>
        {docTypes.map((doc) => (
          <button
            key={doc.id}
            onClick={() => setSelectedDoc(doc.id)}
            className={`w-full flex items-center justify-between gap-1.5 px-2 py-1.5 rounded-lg text-left transition-all ${
              selectedDoc === doc.id
                ? isDark ? 'bg-teal-500/20 border border-teal-500/30' : 'bg-teal-50 border border-teal-200'
                : isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'
            }`}
          >
            <span className={`text-[10px] truncate ${selectedDoc === doc.id ? (isDark ? 'text-white font-medium' : 'text-teal-700 font-medium') : (isDark ? 'text-teal-200' : 'text-slate-600')}`}>
              {doc.name}
            </span>
            {getStatusBadge(doc.status)}
          </button>
        ))}
      </div>
      <div className={`flex-1 rounded-2xl p-5 overflow-auto ${isDark ? 'bg-slate-900/50' : 'bg-white border border-slate-200'}`}>
        <div className="flex items-center gap-3 mb-4">
          <h2 className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-700'}`}>{docTypes.find(d => d.id === selectedDoc)?.name}</h2>
        </div>
        <p className={`text-sm leading-relaxed ${isDark ? 'text-teal-200' : 'text-slate-600'}`}>
          Document content for {docTypes.find(d => d.id === selectedDoc)?.name} will appear here.
        </p>
      </div>
    </div>
  );
};

const CodeContent = ({ theme }: { theme: ThemeMode }) => {
  const isDark = theme === 'dark';
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/docs', '/src']));
  const [selectedFile, setSelectedFile] = useState<FileTreeNode | null>(null);

  const toggleFolder = (path: string) => {
    const newExpanded = new Set(expandedFolders);
    if (newExpanded.has(path)) newExpanded.delete(path);
    else newExpanded.add(path);
    setExpandedFolders(newExpanded);
  };

  const renderTreeNode = (node: FileTreeNode, depth: number = 0) => {
    const isExpanded = expandedFolders.has(node.path);
    const isMarkdown = node.name.endsWith('.md');
    const isSelected = selectedFile?.path === node.path;

    return (
      <div key={node.path}>
        <button
          onClick={() => {
            if (node.type === 'folder') toggleFolder(node.path);
            else if (isMarkdown) setSelectedFile(node);
          }}
          className={`w-full flex items-center gap-1.5 py-1 px-2 rounded-lg text-left transition-all ${
            isSelected ? 'bg-teal-950/20 text-teal-300' : 'hover:bg-slate-700/30'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {node.type === 'folder' ? (
            <>
              {isExpanded ? <ChevronDownIcon className="w-3 h-3 text-teal-400" /> : <ChevronRightIcon className="w-3 h-3 text-teal-400" />}
              {isExpanded ? <FolderOpenIcon className="w-4 h-4 text-amber-400" /> : <FolderIcon className="w-4 h-4 text-amber-400" />}
            </>
          ) : (
            <>
              <span className="w-3" />
              <DocumentIcon className={`w-4 h-4 ${isMarkdown ? 'text-blue-400' : 'text-teal-500'}`} />
            </>
          )}
          <span className={`text-xs ${isSelected ? 'text-teal-300 font-medium' : isMarkdown ? 'text-teal-100' : 'text-teal-400'}`}>
            {node.name}
          </span>
        </button>
        {node.type === 'folder' && isExpanded && node.children && (
          <div>{node.children.map(child => renderTreeNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  return (
    <div className="h-full flex gap-4">
      <div className={`w-56 rounded-2xl p-3 overflow-auto border ${isDark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-white border-slate-200'}`}>
        <div className={`flex items-center gap-2 px-2 py-1.5 mb-2 border-b ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
          <CodeBracketIcon className={`w-4 h-4 ${isDark ? 'text-teal-400' : 'text-teal-500'}`} />
          <span className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-700'}`}>Files</span>
        </div>
        <div className="space-y-0.5">{mockFileTree.map(node => renderTreeNode(node))}</div>
      </div>
      <div className={`flex-1 rounded-2xl overflow-hidden border ${isDark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-white border-slate-200'}`}>
        {selectedFile ? (
          <>
            <div className={`flex items-center gap-2 px-4 py-2 border-b ${isDark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
              <DocumentIcon className="w-4 h-4 text-blue-400" />
              <span className={`text-xs font-mono ${isDark ? 'text-white' : 'text-slate-700'}`}>{selectedFile.path}</span>
            </div>
            <div className={`p-5 overflow-auto h-full ${isDark ? '' : 'bg-white'}`}>
              <pre className={`whitespace-pre-wrap text-sm leading-relaxed font-mono ${isDark ? 'text-teal-200' : 'text-slate-600'}`}>
                {selectedFile.content}
              </pre>
            </div>
          </>
        ) : (
          <div className={`h-full flex items-center justify-center ${isDark ? '' : 'bg-white'}`}>
            <div className="text-center">
              <DocumentIcon className={`w-12 h-12 mx-auto mb-3 ${isDark ? 'text-teal-600' : 'text-teal-400'}`} />
              <p className={`text-sm ${isDark ? 'text-teal-400' : 'text-slate-500'}`}>Select a .md file</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Tasks accomplished at each gate
const GATE_TASKS: Record<number, { task: string; status: 'done' | 'in-progress' | 'pending' }[]> = {
  0: [
    { task: 'Identified target user personas', status: 'done' },
    { task: 'Documented core problem statement', status: 'done' },
    { task: 'Validated concept with stakeholders', status: 'done' },
  ],
  1: [
    { task: 'Wrote comprehensive PRD', status: 'done' },
    { task: 'Created user story map', status: 'done' },
    { task: 'Defined success metrics & KPIs', status: 'done' },
    { task: 'Prioritized MVP features', status: 'done' },
  ],
  2: [
    { task: 'Designed system architecture', status: 'done' },
    { task: 'Selected technology stack', status: 'done' },
    { task: 'Created database schema', status: 'done' },
    { task: 'Defined API contracts', status: 'done' },
  ],
  3: [
    { task: 'Created wireframes for all screens', status: 'in-progress' },
    { task: 'Built design system components', status: 'in-progress' },
    { task: 'Mapped user flows', status: 'done' },
    { task: 'Created interactive prototype', status: 'pending' },
  ],
  4: [
    { task: 'Build authentication system', status: 'pending' },
    { task: 'Create core UI components', status: 'pending' },
    { task: 'Set up database', status: 'pending' },
    { task: 'Implement basic API', status: 'pending' },
  ],
  5: [
    { task: 'Complete all planned features', status: 'pending' },
    { task: 'Handle edge cases', status: 'pending' },
    { task: 'Add error handling', status: 'pending' },
  ],
  6: [
    { task: 'Integrate third-party services', status: 'pending' },
    { task: 'Set up OAuth providers', status: 'pending' },
    { task: 'Connect data pipelines', status: 'pending' },
  ],
  7: [
    { task: 'Write unit tests (80% coverage)', status: 'pending' },
    { task: 'Create integration tests', status: 'pending' },
    { task: 'Run E2E test suite', status: 'pending' },
    { task: 'Complete security audit', status: 'pending' },
  ],
  8: [
    { task: 'Configure CI/CD pipeline', status: 'pending' },
    { task: 'Set up monitoring & alerts', status: 'pending' },
    { task: 'Configure logging', status: 'pending' },
    { task: 'Create backup strategy', status: 'pending' },
  ],
  9: [
    { task: 'Deploy to production', status: 'pending' },
    { task: 'Set up user onboarding', status: 'pending' },
    { task: 'Publish documentation', status: 'pending' },
    { task: 'Establish support process', status: 'pending' },
  ],
};

const JourneyContent = ({ theme }: { theme: ThemeMode }) => {
  const isDark = theme === 'dark';
  const currentGate = 3;

  // Phase colors for timeline
  const phaseColors: Record<Phase, { bg: string; border: string; text: string; glow: string; gradient: string; light: string }> = {
    plan: { bg: 'bg-amber-500', border: 'border-amber-500/40', text: 'text-amber-300', glow: 'shadow-amber-500/30', gradient: 'from-amber-500/20 to-yellow-500/10', light: 'bg-amber-500/10' },
    dev: { bg: 'bg-cyan-500', border: 'border-cyan-500/40', text: 'text-cyan-300', glow: 'shadow-cyan-500/30', gradient: 'from-cyan-500/20 to-blue-500/10', light: 'bg-cyan-500/10' },
    ship: { bg: 'bg-orange-500', border: 'border-orange-500/40', text: 'text-orange-300', glow: 'shadow-orange-500/30', gradient: 'from-orange-500/20 to-amber-500/10', light: 'bg-orange-500/10' },
  };

  const getPhaseForGate = (gate: number): Phase => {
    if (gate <= 3) return 'plan';
    if (gate <= 6) return 'dev';
    return 'ship';
  };

  const completedGates = currentGate;
  const progress = Math.round((completedGates / 10) * 100);

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="text-center mb-4 px-4">
        <h3 className={`text-lg font-bold ${isDark ? 'bg-gradient-to-r from-amber-300 via-cyan-400 to-orange-300 bg-clip-text text-transparent' : 'text-teal-700'}`}>
          Your Building Journey
        </h3>
        <p className={`text-[10px] mt-1 italic ${isDark ? 'text-slate-400' : 'text-teal-600'}`}>"Every line of code is a step forward"</p>
        <div className="flex items-center justify-center gap-4 mt-2">
          <span className={`text-[9px] ${isDark ? 'text-slate-400' : 'text-teal-600'}`}>{currentGate} gates complete</span>
          <span className={`text-[9px] ${isDark ? 'text-slate-500' : 'text-teal-400'}`}>•</span>
          <span className="text-[9px] text-emerald-500">{progress}% to launch</span>
        </div>
      </div>

      {/* Alternating Timeline */}
      <div className="relative px-2">
        {/* Central vertical line */}
        <div className={`absolute left-1/2 top-0 bottom-0 w-0.5 transform -translate-x-1/2 ${isDark ? 'bg-slate-700/50' : 'bg-teal-200'}`} />

        {/* Progress overlay on central line */}
        <div
          className="absolute left-1/2 top-0 w-0.5 transform -translate-x-1/2 bg-gradient-to-b from-amber-500 via-cyan-500 to-transparent transition-all duration-500"
          style={{ height: `${Math.min(95, (currentGate / 9) * 100)}%` }}
        />

        {/* Alternating Gate Cards */}
        <div className="space-y-4">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((gateNum) => {
            const gateInfo = GATE_INFO[gateNum];
            const phase = getPhaseForGate(gateNum);
            const colors = phaseColors[phase];
            const isCompleted = gateNum < currentGate;
            const isCurrent = gateNum === currentGate;
            const isUpcoming = gateNum > currentGate;
            const isLeft = gateNum % 2 === 0;
            const tasks = GATE_TASKS[gateNum] || [];

            return (
              <div key={gateNum} className={`flex items-start gap-2 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
                {/* Content Side */}
                <motion.div
                  initial={{ opacity: 0, x: isLeft ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: gateNum * 0.05 }}
                  className={`flex-1 ${isLeft ? 'pr-2' : 'pl-2'}`}
                >
                  {/* Main Gate Card */}
                  <div className={`
                    rounded-xl border overflow-hidden transition-all
                    ${isCompleted
                      ? isDark
                        ? `bg-gradient-to-br ${isLeft ? 'from-emerald-500/15 to-transparent' : 'from-transparent to-emerald-500/15'} border-emerald-500/30`
                        : `bg-gradient-to-br ${isLeft ? 'from-emerald-50 to-white' : 'from-white to-emerald-50'} border-emerald-300`
                      : isCurrent
                        ? isDark
                          ? `bg-gradient-to-br ${colors.gradient} ${colors.border} shadow-lg ${colors.glow}`
                          : `bg-white border-teal-300 shadow-lg shadow-teal-200/50`
                        : isDark
                          ? `bg-slate-800/30 border-slate-700/30 ${isUpcoming ? 'opacity-50' : ''}`
                          : `bg-white/50 border-slate-200 ${isUpcoming ? 'opacity-50' : ''}`
                    }
                  `}>
                    <div className="p-2.5">
                      {/* Header row */}
                      <div className={`flex items-start gap-2 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
                        <div className={`flex-1 ${isLeft ? 'text-right' : 'text-left'}`}>
                          {/* Celebration badge */}
                          {isCompleted && (
                            <span className={`inline-block text-[8px] px-1.5 py-0.5 rounded-full font-medium mb-1 ${isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                              {gateInfo.celebration}
                            </span>
                          )}
                          <h4 className={`text-[11px] font-bold ${
                            isCompleted ? 'text-emerald-500' : isCurrent ? isDark ? colors.text : 'text-teal-700' : isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}>
                            {gateInfo.name}
                          </h4>
                          <p className={`text-[9px] italic ${isUpcoming ? isDark ? 'text-slate-600' : 'text-slate-400' : isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            {gateInfo.narrative}
                          </p>
                        </div>
                      </div>

                      {/* Description */}
                      <p className={`text-[9px] mt-1.5 leading-relaxed ${isUpcoming ? isDark ? 'text-slate-600' : 'text-slate-400' : isDark ? 'text-slate-400' : 'text-slate-600'} ${isLeft ? 'text-right' : 'text-left'}`}>
                        {gateInfo.description}
                      </p>

                      {/* Tasks for completed/current gates */}
                      {(isCompleted || isCurrent) && (
                        <div className={`mt-2 space-y-0.5 ${isLeft ? 'text-right' : 'text-left'}`}>
                          {tasks.slice(0, 3).map((task, i) => (
                            <div key={i} className={`flex items-center gap-1 text-[8px] ${isLeft ? 'flex-row-reverse' : ''}`}>
                              <span className={task.status === 'done' ? 'text-emerald-500' : task.status === 'in-progress' ? 'text-cyan-500' : isDark ? 'text-slate-500' : 'text-slate-400'}>
                                {task.status === 'done' ? '✓' : task.status === 'in-progress' ? '●' : '○'}
                              </span>
                              <span className={task.status === 'done' ? isDark ? 'text-emerald-400/70' : 'text-emerald-600' : isDark ? 'text-slate-500' : 'text-slate-500'}>{task.task}</span>
                            </div>
                          ))}
                        </div>
                      )}

                    </div>
                  </div>

                  {/* Teaching Moment Panel - 2/3 width, justified to outer edge */}
                  {(isCompleted || isCurrent) && (
                    <div className={`mt-1.5 flex ${isLeft ? 'justify-start' : 'justify-end'}`}>
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: gateNum * 0.05 + 0.1 }}
                        className={`w-2/3 p-2.5 rounded-lg border ${
                          isDark ? 'bg-teal-950/5 border-teal-500/20' : 'bg-teal-100/50 border-teal-200'
                        }`}
                      >
                        <div className={`${isLeft ? 'text-right' : 'text-left'}`}>
                          {/* Summary paragraph */}
                          <p className={`text-[9px] leading-relaxed mb-2 ${isDark ? 'text-teal-200/80' : 'text-teal-800'}`}>
                            {gateInfo.summary}
                          </p>

                          {/* Key Decisions - bulletized */}
                          {gateInfo.decisions.length > 0 && (
                            <div className="mb-2">
                              <p className={`text-[8px] font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-teal-400' : 'text-teal-700'}`}>
                                Key Decisions
                              </p>
                              <ul className={`space-y-1 ${isLeft ? 'text-right' : 'text-left'}`}>
                                {gateInfo.decisions.map((decision, i) => (
                                  <li key={i} className={`flex items-start gap-1.5 text-[8px] ${isLeft ? 'flex-row-reverse' : ''}`}>
                                    <span className={`flex-shrink-0 mt-0.5 ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>•</span>
                                    <span className={isDark ? 'text-teal-200/70' : 'text-teal-700'}>
                                      <span className="font-medium">{decision.choice}</span>
                                      <span className="opacity-70"> — {decision.reason}</span>
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Documents created in this gate */}
                          {gateInfo.documents.length > 0 && (
                            <div>
                              <p className={`text-[8px] font-semibold uppercase tracking-wide mb-1 ${isDark ? 'text-teal-400' : 'text-teal-700'}`}>
                                Documents
                              </p>
                              <div className={`flex flex-wrap gap-1 ${isLeft ? 'justify-end' : 'justify-start'}`}>
                                {gateInfo.documents.map((doc, i) => (
                                  <a
                                    key={i}
                                    href={doc.path}
                                    className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[8px] transition-colors ${
                                      isDark ? 'bg-teal-950/10 hover:bg-teal-950/20 border border-teal-500/20 text-teal-300' : 'bg-teal-200 hover:bg-teal-300 border border-teal-300 text-teal-700'
                                    }`}
                                  >
                                    <span>{doc.icon}</span>
                                    <span>{doc.name}</span>
                                  </a>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    </div>
                  )}
                </motion.div>

                {/* Center Node with Gate Number */}
                <div className="relative flex flex-col items-center z-10 pt-1">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: gateNum * 0.05, type: 'spring' }}
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center text-[11px] font-bold border-2 transition-all
                      ${isCompleted
                        ? 'bg-emerald-500 border-emerald-400/50 text-white shadow-md shadow-emerald-500/30'
                        : isCurrent
                          ? isDark
                            ? `${colors.bg} border-white/30 text-white ring-2 ring-offset-1 ring-offset-slate-900 ring-white/20 shadow-lg ${colors.glow}`
                            : `bg-teal-950 border-teal-400 text-white ring-2 ring-offset-1 ring-offset-white ring-teal-300 shadow-lg shadow-teal-300/50`
                          : isDark
                            ? 'bg-slate-800 border-slate-600 text-slate-500'
                            : 'bg-slate-100 border-slate-300 text-slate-400'
                      }
                    `}
                  >
                    G{gateNum}
                  </motion.div>
                </div>

                {/* Empty Side (for alternating layout) */}
                <div className="flex-1" />
              </div>
            );
          })}
        </div>

        {/* Launch destination at bottom */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex justify-center mt-6 pb-4"
        >
          <div className={`flex items-center gap-2 px-5 py-3 rounded-2xl border ${isDark ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/20 border-orange-500/30' : 'bg-gradient-to-r from-teal-100 to-cyan-100 border-teal-300'}`}>
            <motion.span
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-2xl"
            >
              🚀
            </motion.span>
            <div>
              <span className={`text-sm font-bold block ${isDark ? 'text-orange-300' : 'text-teal-700'}`}>Launch Awaits!</span>
              <span className={`text-[10px] ${isDark ? 'text-orange-400/70' : 'text-teal-600'}`}>{10 - currentGate} gates remaining</span>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

// ============ RIGHT PANEL WIDGETS ============

// Animated counter hook for smooth number transitions
const useAnimatedCounter = (target: number, duration: number = 1000) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const startTime = Date.now();
    const startValue = count;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setCount(Math.round(startValue + (target - startValue) * eased));

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };

    requestAnimationFrame(animate);
  }, [target]);

  return count;
};

// ============ 1. TEAM WIDGET - Animated agent status ============
const TeamWidget = ({ phase, theme }: { phase: Phase; theme: ThemeMode }) => {
  const phaseAgents = ALL_AGENTS.filter(a => a.phase === phase);
  const activeAgents = phaseAgents.filter(a => a.status === 'working');
  const isDark = theme === 'dark';

  return (
    <Panel theme={theme} className="p-1.5">
      <div className="flex items-center justify-between mb-1">
        <h3 className={`text-[8px] font-semibold uppercase tracking-wider ${isDark ? 'text-teal-400' : 'text-teal-700'}`}>Team</h3>
        <span className={`text-[8px] font-bold ${isDark ? 'text-teal-300' : 'text-teal-600'}`}>{activeAgents.length}/{phaseAgents.length}</span>
      </div>

      <div className="grid grid-cols-2 gap-0.5">
        {phaseAgents.map((agent) => (
          <div
            key={agent.type}
            className={`relative flex items-center gap-1 p-0.5 rounded transition-all ${
              agent.status === 'working'
                ? isDark ? 'bg-gradient-to-r from-teal-500/30 to-transparent' : 'bg-gradient-to-r from-teal-300/50 to-transparent'
                : isDark ? 'bg-slate-700/20' : 'bg-white/60'
            }`}
          >
            <span className="text-[9px]">{agent.icon}</span>
            <span className={`text-[7px] truncate flex-1 ${agent.status === 'working' ? isDark ? 'text-white font-medium' : 'text-teal-800 font-medium' : isDark ? 'text-teal-400' : 'text-teal-700'}`}>
              {agent.name}
            </span>
            {agent.status === 'working' && (
              <motion.div className="w-1 h-1 rounded-full bg-emerald-500" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1, repeat: Infinity }} />
            )}
          </div>
        ))}
      </div>
    </Panel>
  );
};

// ============ 2. GATE PROGRESS RING - Circular progress ============
const GateProgressRing = ({ currentGate, selectedPhase, theme, onGateClick }: {
  currentGate: number;
  selectedPhase: Phase;
  theme: ThemeMode;
  onGateClick: (gate: number) => void;
}) => {
  const isDark = theme === 'dark';
  const totalGates = 10;
  const progress = (currentGate / totalGates) * 100;
  const circumference = 2 * Math.PI * 40; // radius = 40
  const strokeDashoffset = circumference - (progress / 100) * circumference;

  const phaseGates = GATES_BY_PHASE[selectedPhase];
  const phaseProgress = phaseGates.filter(g => g < currentGate).length;
  const phaseTotal = phaseGates.length;

  // Phase colors
  const phaseColors: Record<Phase, string> = {
    plan: '#f59e0b', // amber
    dev: '#06b6d4',  // cyan
    ship: '#f97316', // orange
  };

  return (
    <Panel theme={theme} className="p-1.5">
      <div className="flex items-center gap-2">
        {/* Circular Progress - smaller */}
        <div className="relative w-12 h-12 flex-shrink-0">
          <svg className="w-12 h-12 transform -rotate-90">
            <circle cx="24" cy="24" r="20" stroke={isDark ? '#334155' : '#99f6e4'} strokeWidth="3" fill="none" />
            <motion.circle
              cx="24" cy="24" r="20"
              stroke="url(#progressGradient)"
              strokeWidth="3"
              fill="none"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset }}
              transition={{ duration: 1.5, ease: 'easeOut' }}
            />
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor={isDark ? '#8b5cf6' : '#0d9488'} />
                <stop offset="50%" stopColor="#06b6d4" />
                <stop offset="100%" stopColor="#10b981" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-xs font-bold ${isDark ? 'text-white' : 'text-teal-700'}`}>{Math.round(progress)}%</span>
          </div>
        </div>

        {/* Gate Info - compact */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <div
              className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold text-white flex-shrink-0"
              style={{ backgroundColor: phaseColors[selectedPhase] }}
            >
              G{currentGate}
            </div>
            <p className={`text-[8px] font-semibold truncate ${isDark ? 'text-white' : 'text-teal-800'}`}>{GATE_INFO[currentGate]?.name}</p>
          </div>
          <div className="flex items-center gap-1 mb-0.5">
            <span className={`text-[7px] capitalize ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>{selectedPhase}</span>
            <div className={`flex-1 h-1 rounded-full overflow-hidden ${isDark ? 'bg-slate-700/50' : 'bg-teal-100'}`}>
              <motion.div
                className="h-full rounded-full"
                style={{ backgroundColor: phaseColors[selectedPhase] }}
                initial={{ width: 0 }}
                animate={{ width: `${(phaseProgress / phaseTotal) * 100}%` }}
              />
            </div>
            <span className={`text-[7px] ${isDark ? 'text-teal-300' : 'text-teal-600'}`}>{phaseProgress}/{phaseTotal}</span>
          </div>
          <button
            onClick={() => onGateClick(currentGate)}
            className={`w-full py-0.5 rounded text-[8px] font-medium transition-colors ${isDark ? 'bg-teal-950/20 hover:bg-teal-950/30 text-teal-300' : 'bg-white/60 hover:bg-white text-teal-700'}`}
          >
            Review →
          </button>
        </div>
      </div>
    </Panel>
  );
};

// ============ 3. ANIMATED TOKEN COUNTER - Flowing tokens ============
const TokenCounterWidget = ({ selectedPhase, theme }: { selectedPhase: Phase; theme: ThemeMode }) => {
  const isDark = theme === 'dark';

  // Simulated live token data (in real app, this would come from API)
  const [tokenData, setTokenData] = useState({
    gate: 4520,
    phase: 12450,
    project: 23000,
    rate: 45, // tokens per second
  });

  // Simulate token flow
  useEffect(() => {
    const interval = setInterval(() => {
      setTokenData(prev => ({
        ...prev,
        gate: prev.gate + Math.floor(Math.random() * 10),
        phase: prev.phase + Math.floor(Math.random() * 15),
        project: prev.project + Math.floor(Math.random() * 20),
        rate: 40 + Math.floor(Math.random() * 20),
      }));
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const animatedGate = useAnimatedCounter(tokenData.gate, 800);
  const animatedPhase = useAnimatedCounter(tokenData.phase, 800);
  const animatedProject = useAnimatedCounter(tokenData.project, 800);

  const formatTokens = (n: number) => {
    if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
    return n.toString();
  };

  const toCost = (tokens: number) => `$${(tokens * 0.0001).toFixed(2)}`;

  return (
    <Panel theme={theme} className="p-1.5">
      <div className="flex items-center justify-between mb-1">
        <h3 className={`text-[8px] font-semibold uppercase tracking-wider ${isDark ? 'text-teal-400' : 'text-teal-700'}`}>Tokens</h3>
        <div className={`flex items-center gap-0.5 px-1 py-0.5 rounded-full ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-100'}`}>
          <motion.div className="w-1 h-1 rounded-full bg-emerald-500" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1, repeat: Infinity }} />
          <span className={`text-[7px] font-mono ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>{tokenData.rate}/s</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-1">
        <div className={`p-1 rounded ${isDark ? 'bg-slate-700/30' : 'bg-white/60'}`}>
          <span className={`text-[6px] block ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>Gate</span>
          <span className={`text-xs font-bold font-mono ${isDark ? 'text-white' : 'text-teal-900'}`}>{formatTokens(animatedGate)}</span>
          <span className={`text-[6px] block ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>{toCost(animatedGate)}</span>
        </div>
        <div className={`p-1 rounded ${isDark ? 'bg-slate-700/30' : 'bg-white/60'}`}>
          <span className={`text-[6px] block capitalize ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>{selectedPhase}</span>
          <span className={`text-xs font-bold font-mono ${isDark ? 'text-white' : 'text-teal-900'}`}>{formatTokens(animatedPhase)}</span>
          <span className={`text-[6px] block ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>{toCost(animatedPhase)}</span>
        </div>
        <div className={`p-1 rounded ${isDark ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20' : 'bg-teal-100'}`}>
          <span className={`text-[6px] block ${isDark ? 'text-emerald-400' : 'text-teal-700'}`}>Total</span>
          <span className={`text-xs font-bold font-mono ${isDark ? 'text-emerald-300' : 'text-teal-800'}`}>{formatTokens(animatedProject)}</span>
          <span className={`text-[6px] block ${isDark ? 'text-emerald-300' : 'text-teal-600'}`}>{toCost(animatedProject)}</span>
        </div>
      </div>
    </Panel>
  );
};

// ============ 4. PROGRESS MOMENTUM - Velocity metrics ============
const MomentumWidget = ({ theme }: { theme: ThemeMode }) => {
  const isDark = theme === 'dark';

  // Simulated momentum data
  const [momentum] = useState({
    velocity: 12, // tasks per hour
    streak: 5,    // consecutive gates without rejection
    todayTasks: 8,
    yesterdayTasks: 6,
  });

  const velocityChange = ((momentum.todayTasks - momentum.yesterdayTasks) / momentum.yesterdayTasks) * 100;
  const isPositive = velocityChange >= 0;

  return (
    <Panel theme={theme} className="p-1.5">
      <div className="flex items-center justify-between mb-1">
        <h3 className={`text-[8px] font-semibold uppercase tracking-wider ${isDark ? 'text-teal-400' : 'text-teal-700'}`}>Momentum</h3>
        <div className={`flex items-center gap-0.5 px-1 py-0.5 rounded-full ${isDark ? 'bg-orange-500/20' : 'bg-orange-50'}`}>
          <span className="text-[8px]">🔥</span>
          <span className={`text-[7px] font-bold ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>{momentum.streak}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-1">
        <div className={`flex-1 p-1 rounded ${isDark ? 'bg-slate-700/30' : 'bg-white/60'}`}>
          <div className="flex items-center gap-0.5">
            <span className="text-[9px]">⚡</span>
            <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-teal-900'}`}>{momentum.velocity}</span>
            <span className={`text-[6px] ${isDark ? 'text-teal-500' : 'text-teal-600'}`}>/hr</span>
          </div>
        </div>
        <div className={`flex-1 p-1 rounded ${isDark ? 'bg-slate-700/30' : 'bg-white/60'}`}>
          <div className="flex items-center gap-0.5">
            <span className="text-[9px]">{isPositive ? '📈' : '📉'}</span>
            <span className={`text-sm font-bold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
              {isPositive ? '+' : ''}{Math.round(velocityChange)}%
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1">
        <span className={`text-[6px] ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>Today</span>
        <div className="flex-1 flex gap-0.5">
          {Array.from({ length: 12 }).map((_, i) => (
            <div key={i} className={`flex-1 h-1 rounded-sm ${i < momentum.todayTasks ? 'bg-gradient-to-t from-teal-500 to-emerald-400' : isDark ? 'bg-slate-700/50' : 'bg-teal-100'}`} />
          ))}
        </div>
        <span className={`text-[7px] font-semibold ${isDark ? 'text-white' : 'text-teal-800'}`}>{momentum.todayTasks}</span>
      </div>
    </Panel>
  );
};

// ============ 5. LINES OF CODE - Code output metrics ============
const LinesOfCodeWidget = ({ theme }: { theme: ThemeMode }) => {
  const isDark = theme === 'dark';

  // Simulated LOC data
  const [locData] = useState({
    total: 12847,
    today: 342,
    added: 287,
    removed: 45,
    modified: 156,
    byLanguage: [
      { lang: 'TypeScript', lines: 6420, color: 'bg-blue-500', percent: 50 },
      { lang: 'Python', lines: 4210, color: 'bg-yellow-500', percent: 33 },
      { lang: 'CSS', lines: 1580, color: 'bg-pink-500', percent: 12 },
      { lang: 'Other', lines: 637, color: 'bg-slate-500', percent: 5 },
    ],
  });

  const animatedTotal = useAnimatedCounter(locData.total, 1500);
  const animatedToday = useAnimatedCounter(locData.today, 1000);

  return (
    <Panel theme={theme} className="p-1.5">
      <div className="flex items-center justify-between mb-0.5">
        <h3 className={`text-[8px] font-semibold uppercase tracking-wider ${isDark ? 'text-teal-400' : 'text-teal-700'}`}>Lines of Code</h3>
        <div className="flex items-baseline gap-1">
          <span className={`text-sm font-bold ${isDark ? 'text-white' : 'text-teal-900'}`}>{animatedTotal.toLocaleString()}</span>
          <span className={`text-[6px] ${isDark ? 'text-teal-500' : 'text-teal-600'}`}>total</span>
        </div>
      </div>

      <div className="flex items-center gap-1 mb-1">
        <div className={`flex-1 p-0.5 rounded text-center ${isDark ? 'bg-emerald-500/10' : 'bg-emerald-50'}`}>
          <span className={`text-[10px] font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>+{animatedToday}</span>
          <span className={`text-[6px] ml-0.5 ${isDark ? 'text-emerald-500/70' : 'text-emerald-600/70'}`}>today</span>
        </div>
        <div className={`flex-1 p-0.5 rounded text-center ${isDark ? 'bg-blue-500/10' : 'bg-blue-50'}`}>
          <span className={`text-[10px] font-bold ${isDark ? 'text-blue-400' : 'text-blue-600'}`}>+{locData.added}</span>
          <span className={`text-[6px] ml-0.5 ${isDark ? 'text-blue-500/70' : 'text-blue-600/70'}`}>add</span>
        </div>
        <div className={`flex-1 p-0.5 rounded text-center ${isDark ? 'bg-red-500/10' : 'bg-red-50'}`}>
          <span className={`text-[10px] font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>-{locData.removed}</span>
          <span className={`text-[6px] ml-0.5 ${isDark ? 'text-red-500/70' : 'text-red-600/70'}`}>del</span>
        </div>
      </div>

      <div className="flex h-1 rounded-full overflow-hidden gap-0.5">
        {locData.byLanguage.map((lang) => (
          <div key={lang.lang} className={`${lang.color} rounded-sm`} style={{ width: `${lang.percent}%` }} title={`${lang.lang}: ${lang.percent}%`} />
        ))}
      </div>
    </Panel>
  );
};

// ============ 6. USER STATS - XP, Level, Lifetime metrics ============
const UserStatsWidget = ({ theme }: { theme: ThemeMode }) => {
  const isDark = theme === 'dark';

  // Simulated user data
  const [userData] = useState({
    level: 12,
    title: 'Senior Builder',
    xp: 8450,
    xpToNext: 10000,
    totalProjects: 7,
    projectsCompleted: 4,
    totalLOC: 89420,
    totalGatesPassed: 38,
    joinDate: 'Mar 2024',
  });

  const xpProgress = (userData.xp / userData.xpToNext) * 100;
  const animatedXP = useAnimatedCounter(userData.xp, 1200);
  const animatedLOC = useAnimatedCounter(userData.totalLOC, 1500);

  // Level titles
  const getLevelInfo = (level: number) => {
    if (level >= 20) return { title: 'Legendary', color: 'text-amber-400', bg: 'from-amber-500/20 to-orange-500/20' };
    if (level >= 15) return { title: 'Master Builder', color: 'text-amber-400', bg: 'from-amber-500/20 to-orange-500/20' };
    if (level >= 10) return { title: 'Senior Builder', color: 'text-cyan-400', bg: 'from-cyan-500/20 to-teal-500/20' };
    if (level >= 5) return { title: 'Builder', color: 'text-emerald-400', bg: 'from-emerald-500/20 to-green-500/20' };
    return { title: 'Apprentice', color: 'text-slate-400', bg: 'from-slate-500/20 to-slate-600/20' };
  };

  const levelInfo = getLevelInfo(userData.level);

  return (
    <Panel theme={theme} className="p-1.5">
      {/* Level & XP Header - Compact inline */}
      <div className={`flex items-center gap-2 p-1 rounded-lg bg-gradient-to-r ${isDark ? levelInfo.bg : 'from-teal-100 to-cyan-100'} mb-1`}>
        <div className="relative">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-xs border-2 ${isDark ? 'bg-gradient-to-br from-teal-500 to-cyan-600 border-teal-400/50' : 'bg-gradient-to-br from-teal-500 to-cyan-500 border-teal-400/50'}`}>
            {userData.level}
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className={`text-[9px] font-bold ${isDark ? levelInfo.color : 'text-teal-700'}`}>{levelInfo.title}</p>
          <div className="flex items-center gap-1">
            <div className={`flex-1 h-1 rounded-full overflow-hidden ${isDark ? 'bg-slate-700/50' : 'bg-teal-200'}`}>
              <motion.div
                className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400"
                initial={{ width: 0 }}
                animate={{ width: `${xpProgress}%` }}
                transition={{ duration: 1, delay: 0.3 }}
              />
            </div>
            <span className={`text-[7px] ${isDark ? 'text-teal-300' : 'text-teal-600'}`}>{animatedXP.toLocaleString()}/{userData.xpToNext.toLocaleString()}</span>
          </div>
        </div>
      </div>

      {/* Lifetime Stats Grid - 4 columns inline */}
      <div className="grid grid-cols-4 gap-1">
        <div className={`p-1 rounded text-center ${isDark ? 'bg-slate-700/30' : 'bg-white/60'}`}>
          <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-teal-900'}`}>{userData.totalProjects}</div>
          <div className={`text-[6px] ${isDark ? 'text-slate-400' : 'text-teal-600'}`}>Projects</div>
        </div>
        <div className={`p-1 rounded text-center ${isDark ? 'bg-slate-700/30' : 'bg-white/60'}`}>
          <div className="text-sm font-bold text-emerald-500">{userData.projectsCompleted}</div>
          <div className={`text-[6px] ${isDark ? 'text-slate-400' : 'text-teal-600'}`}>Shipped</div>
        </div>
        <div className={`p-1 rounded text-center ${isDark ? 'bg-slate-700/30' : 'bg-white/60'}`}>
          <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-teal-900'}`}>{(animatedLOC / 1000).toFixed(0)}k</div>
          <div className={`text-[6px] ${isDark ? 'text-slate-400' : 'text-teal-600'}`}>LOC</div>
        </div>
        <div className={`p-1 rounded text-center ${isDark ? 'bg-slate-700/30' : 'bg-white/60'}`}>
          <div className={`text-sm font-bold ${isDark ? 'text-white' : 'text-teal-900'}`}>{userData.totalGatesPassed}</div>
          <div className={`text-[6px] ${isDark ? 'text-slate-400' : 'text-teal-600'}`}>Gates</div>
        </div>
      </div>
    </Panel>
  );
};

// ============ 7. ACHIEVEMENTS - Badge collection ============
const AchievementsWidget = ({ theme }: { theme: ThemeMode }) => {
  const isDark = theme === 'dark';

  const achievements = [
    { id: 'first-gate', name: 'First Steps', icon: '🚀', desc: 'Pass your first gate', unlocked: true },
    { id: 'speed-demon', name: 'Speed Demon', icon: '⚡', desc: 'Complete a gate in under 1 hour', unlocked: true },
    { id: 'clean-code', name: 'Clean Code', icon: '✨', desc: '5 gates without rejection', unlocked: true },
    { id: 'night-owl', name: 'Night Owl', icon: '🦉', desc: 'Code after midnight', unlocked: true },
    { id: 'shipper', name: 'Shipper', icon: '📦', desc: 'Ship your first project', unlocked: true },
    { id: 'prolific', name: 'Prolific', icon: '📚', desc: 'Write 10k lines of code', unlocked: true },
    { id: 'architect', name: 'Architect', icon: '🏗️', desc: 'Complete 10 architecture gates', unlocked: false },
    { id: 'legend', name: 'Legend', icon: '👑', desc: 'Reach level 20', unlocked: false },
  ];

  const unlockedCount = achievements.filter(a => a.unlocked).length;

  return (
    <Panel theme={theme} className="p-1.5">
      <div className="flex items-center justify-between mb-1">
        <h3 className={`text-[8px] font-semibold uppercase tracking-wider ${isDark ? 'text-amber-400' : 'text-teal-700'}`}>Achievements</h3>
        <span className={`text-[7px] ${isDark ? 'text-amber-300' : 'text-teal-600'}`}>{unlockedCount}/{achievements.length}</span>
      </div>

      <div className="grid grid-cols-8 gap-0.5">
        {achievements.map((achievement) => (
          <motion.div
            key={achievement.id}
            whileHover={{ scale: 1.1 }}
            className={`relative aspect-square rounded flex items-center justify-center cursor-pointer transition-all ${
              achievement.unlocked
                ? isDark ? 'bg-gradient-to-br from-amber-500/30 to-yellow-500/30' : 'bg-gradient-to-br from-amber-100 to-yellow-100'
                : `${isDark ? 'bg-slate-800/50' : 'bg-white/40'} opacity-40`
            }`}
            title={`${achievement.name}: ${achievement.desc}`}
          >
            <span className={`text-sm ${achievement.unlocked ? '' : 'grayscale'}`}>
              {achievement.icon}
            </span>
          </motion.div>
        ))}
      </div>
    </Panel>
  );
};

// Phase selector - updates the displayed phase in right panel (no popup)
const PhaseSelector = ({ currentPhase, selectedPhase, onPhaseSelect, theme }: {
  currentPhase: Phase;
  selectedPhase: Phase;
  onPhaseSelect: (phase: Phase) => void;
  theme: ThemeMode
}) => {
  const isDark = theme === 'dark';
  const phases: { id: Phase; label: string }[] = [
    { id: 'plan', label: 'Plan' },
    { id: 'dev', label: 'Build' },
    { id: 'ship', label: 'Ship' },
  ];

  return (
    <Panel theme={theme} className="p-1">
      <div className="flex gap-0.5">
        {phases.map((p) => (
          <button
            key={p.id}
            onClick={() => onPhaseSelect(p.id)}
            className={`flex-1 text-center py-0.5 px-1 rounded transition-all cursor-pointer ${
              selectedPhase === p.id
                ? 'bg-teal-600 shadow-md'
                : currentPhase === p.id
                  ? isDark ? 'bg-teal-950/30 ring-1 ring-teal-500/50' : 'bg-teal-100 ring-1 ring-teal-300'
                  : `${isDark ? 'bg-slate-700/30 hover:bg-slate-700/50' : 'bg-white/60 hover:bg-white'}`
            }`}
          >
            <div className={`text-[9px] font-medium ${selectedPhase === p.id ? 'text-white' : isDark ? 'text-teal-300' : 'text-teal-700'}`}>{p.label}</div>
          </button>
        ))}
      </div>
    </Panel>
  );
};

// ============ PROJECTS VIEW ============

const ProjectsView = ({ theme, onSelectProject }: { theme: ThemeMode; onSelectProject: (name: string) => void }) => {
  const isDark = theme === 'dark';
  const projects = [
    { id: '1', name: 'E-Commerce Platform', status: 'active', gate: 4, progress: 40 },
    { id: '2', name: 'Mobile App Backend', status: 'active', gate: 2, progress: 20 },
    { id: '3', name: 'Analytics Dashboard', status: 'completed', gate: 9, progress: 100 },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-teal-800'}`}>Projects</h2>
        <button className={`px-4 py-2 text-white rounded-full text-sm font-medium transition-colors ${isDark ? 'bg-teal-950 hover:bg-teal-400' : 'bg-teal-600 hover:bg-teal-700'}`}>
          + New Project
        </button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {projects.map((project) => (
          <Panel
            key={project.id}
            theme={theme}
            className="p-4 cursor-pointer hover:border-teal-500/50 transition-colors"
          >
            <div onClick={() => onSelectProject(project.name)}>
              <h3 className={`font-semibold mb-2 ${isDark ? 'text-white' : 'text-teal-800'}`}>{project.name}</h3>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${project.status === 'completed' ? isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700' : isDark ? 'bg-teal-950/20 text-teal-300' : 'bg-teal-50 text-teal-700'}`}>
                  {project.status === 'completed' ? 'Completed' : `Gate ${project.gate}`}
                </span>
              </div>
              <div className={`h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                <div className={`h-full rounded-full ${isDark ? 'bg-teal-950' : 'bg-teal-500'}`} style={{ width: `${project.progress}%` }} />
              </div>
              <div className={`text-xs mt-2 ${isDark ? 'text-teal-400' : 'text-slate-500'}`}>{project.progress}% complete</div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
};

// ============ MAIN DASHBOARD ============

export default function UnifiedDashboard() {
  const [showSplash, setShowSplash] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('docs');
  const [mainView, setMainView] = useState<MainView>('dashboard');
  const [theme, setTheme] = useState<ThemeMode>('dark');
  const [showGitHub, setShowGitHub] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showGateApproval, setShowGateApproval] = useState(false);
  const [selectedPhase, setSelectedPhase] = useState<Phase>('plan');
  const [currentProjectName, setCurrentProjectName] = useState('E-Commerce Platform');
  const [isCenterExpanded, setIsCenterExpanded] = useState(false);
  const currentGate = 3;

  const getPhase = (gate: number): Phase => {
    if (gate <= 3) return 'plan';
    if (gate <= 6) return 'dev';
    return 'ship';
  };

  const currentPhase = getPhase(currentGate);
  const isDark = theme === 'dark';

  // Prefetch projects for future use
  useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  if (showSplash) {
    return <SplashPage onGetStarted={() => setShowSplash(false)} />;
  }

  const handleGateApprove = () => {
    setShowGateApproval(false);
    // Handle approval logic
  };

  const handleGateDeny = () => {
    setShowGateApproval(false);
    // Handle denial - would send message to orchestrator
  };

  const handleSelectProject = (name: string) => {
    setCurrentProjectName(name);
    setMainView('dashboard');
  };

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${
      isDark
        ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white'
        : 'bg-teal-100 text-slate-800'
    }`}>
      {/* Popups */}
      <GitHubPopup isOpen={showGitHub} onClose={() => setShowGitHub(false)} theme={theme} />
      <SettingsPopup isOpen={showSettings} onClose={() => setShowSettings(false)} theme={theme} onToggleTheme={() => setTheme(t => t === 'dark' ? 'light' : 'dark')} />
      <GateApprovalPopup
        isOpen={showGateApproval}
        onClose={() => setShowGateApproval(false)}
        onApprove={handleGateApprove}
        onDeny={handleGateDeny}
        gateData={mockGateApproval}
        theme={theme}
      />

      {/* Header */}
      <header className={`relative h-14 border-b flex items-center px-4 z-10 ${
        isDark ? 'border-slate-700/50 bg-slate-900/80' : 'border-teal-900 bg-teal-800'
      } backdrop-blur-xl`}>
        {/* Left Section - Logo & Navigation */}
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden ${isDark ? 'bg-teal-950' : 'bg-teal-600'}`}>
              <img src={FuzzyLlamaLogoSvg} alt="Fuzzy Llama" className="w-7 h-7" />
            </div>
            <span className={`font-bold text-sm ${isDark ? 'text-white' : 'text-white'}`}>Fuzzy Llama</span>
          </div>

          {/* Main Navigation */}
          <div className={`flex items-center gap-1 p-1 rounded-full ${isDark ? 'bg-slate-800/50' : 'bg-teal-900/50'}`}>
            <button
              onClick={() => setMainView('dashboard')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                mainView === 'dashboard'
                  ? isDark ? 'bg-teal-950 text-white' : 'bg-white text-teal-800'
                  : isDark ? 'text-teal-300 hover:text-white' : 'text-teal-200 hover:text-white'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setMainView('projects')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                mainView === 'projects'
                  ? isDark ? 'bg-teal-950 text-white' : 'bg-white text-teal-800'
                  : isDark ? 'text-teal-300 hover:text-white' : 'text-teal-200 hover:text-white'
              }`}
            >
              Projects
            </button>
          </div>
        </div>

        {/* Center Section - Project Name */}
        <div className="flex-1 flex justify-center">
          {mainView === 'dashboard' && (
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${isDark ? 'text-teal-400' : 'text-teal-300'}`}>Project:</span>
              <span className={`text-sm font-semibold ${isDark ? 'text-white' : 'text-white'}`}>{currentProjectName}</span>
            </div>
          )}
        </div>

        {/* Right Section - Actions */}
        <div className="flex items-center gap-2">
          {/* GitHub Button */}
          <button
            onClick={() => setShowGitHub(true)}
            className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
              isDark ? 'bg-slate-700/50 hover:bg-slate-700 text-white' : 'bg-teal-900/50 hover:bg-teal-900 text-white'
            }`}
          >
            <GitHubIcon className="w-4 h-4" />
          </button>

          {/* Profile Avatar */}
          <button
            onClick={() => setShowSettings(true)}
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${isDark ? 'bg-teal-950' : 'bg-teal-600'}`}
          >
            JD
          </button>
        </div>
      </header>

      {/* Main Content */}
      {mainView === 'projects' ? (
        <div className="flex-1 overflow-auto">
          <ProjectsView theme={theme} onSelectProject={handleSelectProject} />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden relative z-10 gap-0 p-1.5">
          {/* Left Panel - Product Orchestrator (Always visible) */}
          <div className={`w-[340px] min-w-[320px] pr-1 ${isDark ? 'bg-slate-900/30' : ''}`}>
            <AgentOrchestratorPanel theme={theme} />
          </div>

          {/* Center Panel - Expands into right panel when isCenterExpanded is true */}
          <motion.div
            className="flex-1 min-w-[380px]"
            layout
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            <WorkspacePanel
              activeTab={activeTab}
              onTabChange={setActiveTab}
              theme={theme}
              isExpanded={isCenterExpanded}
              onToggleExpand={() => setIsCenterExpanded(!isCenterExpanded)}
            />
          </motion.div>

          {/* Right Panel - Metrics Widgets (Hidden when expanded) */}
          <AnimatePresence>
            {!isCenterExpanded && (
              <motion.div
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: 340, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.3, ease: 'easeInOut' }}
                className={`w-[340px] min-w-[320px] pl-1 h-full flex flex-col justify-between p-2 ${isDark ? 'bg-slate-900/30' : ''}`}
              >
                {/* ===== PROJECT METRICS SECTION ===== */}
                <div className="flex flex-col gap-1">
                  <div className={`px-2 py-1 rounded ${isDark ? 'bg-teal-500/10' : 'bg-teal-800'}`}>
                    <h4 className={`text-[8px] font-bold uppercase tracking-widest text-center ${isDark ? 'text-teal-400' : 'text-white'}`}>Project Metrics</h4>
                  </div>
                  <PhaseSelector
                    currentPhase={currentPhase}
                    selectedPhase={selectedPhase}
                    onPhaseSelect={setSelectedPhase}
                    theme={theme}
                  />
                  <TeamWidget phase={selectedPhase} theme={theme} />
                  <GateProgressRing
                    currentGate={currentGate}
                    selectedPhase={selectedPhase}
                    theme={theme}
                    onGateClick={() => setShowGateApproval(true)}
                  />
                  <TokenCounterWidget selectedPhase={selectedPhase} theme={theme} />
                  <MomentumWidget theme={theme} />
                  <LinesOfCodeWidget theme={theme} />
                </div>

                {/* ===== USER METRICS SECTION ===== */}
                <div className="flex flex-col gap-1">
                  <div className={`px-2 py-1 rounded ${isDark ? 'bg-amber-500/10' : 'bg-teal-800'}`}>
                    <h4 className={`text-[8px] font-bold uppercase tracking-widest text-center ${isDark ? 'text-amber-400' : 'text-white'}`}>Lifetime Stats</h4>
                  </div>
                  <UserStatsWidget theme={theme} />
                  <AchievementsWidget theme={theme} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
