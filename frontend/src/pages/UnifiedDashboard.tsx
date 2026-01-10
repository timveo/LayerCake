import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CodeBracketIcon,
  ComputerDesktopIcon,
  PaperAirplaneIcon,
  StopIcon,
  SparklesIcon,
  CpuChipIcon,
  CheckCircleIcon,
  ClockIcon,
  BoltIcon,
  HeartIcon,
  FolderIcon,
  FolderOpenIcon,
  DocumentIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  FlagIcon,
  CheckIcon,
  XMarkIcon,
  SunIcon,
  MoonIcon,
} from '@heroicons/react/24/outline';
import { projectsApi } from '../api/projects';

// Types
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
}

interface ActivityEvent {
  id: string;
  type: 'agent_start' | 'agent_complete' | 'gate_ready' | 'task_complete' | 'agent_working';
  message: string;
  timestamp: Date;
  agent?: string;
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

// Gate names and descriptions
const GATE_INFO: Record<number, { name: string; description: string; deliverables: string[] }> = {
  0: { name: 'Idea Validation', description: 'Define problem and validate solution approach', deliverables: ['Problem statement', 'Target users defined', 'Initial concept validated'] },
  1: { name: 'PRD Complete', description: 'Product requirements fully documented', deliverables: ['PRD document', 'User stories', 'Success metrics', 'Feature prioritization'] },
  2: { name: 'Architecture Design', description: 'System architecture planned and reviewed', deliverables: ['System design doc', 'Tech stack decision', 'Database schema', 'API contracts'] },
  3: { name: 'Design Approved', description: 'UX/UI design completed and approved', deliverables: ['Wireframes', 'Design system', 'User flows', 'Prototype'] },
  4: { name: 'Core MVP', description: 'Minimum viable product functionality built', deliverables: ['Core features', 'Basic UI', 'Database setup', 'API endpoints'] },
  5: { name: 'Feature Complete', description: 'All planned features implemented', deliverables: ['All features built', 'Integration complete', 'Error handling', 'Edge cases covered'] },
  6: { name: 'Integration Done', description: 'All systems integrated and working together', deliverables: ['Third-party integrations', 'Service connections', 'Data pipelines', 'Authentication flow'] },
  7: { name: 'Testing Complete', description: 'Comprehensive testing passed', deliverables: ['Unit tests', 'Integration tests', 'E2E tests', 'Performance tests', 'Security audit'] },
  8: { name: 'Deploy Ready', description: 'Production environment prepared', deliverables: ['CI/CD pipeline', 'Monitoring setup', 'Logging configured', 'Backup strategy'] },
  9: { name: 'Launch', description: 'Product successfully launched', deliverables: ['Production deployment', 'User onboarding', 'Documentation', 'Support process'] },
};

// Costs (mock data) - now includes gate, phase, and total
const COST_DATA = {
  gate: '$0.45',
  plan: '$1.20',
  dev: '$0.80',
  ship: '$0.30',
  total: '$2.30',
};


// Mock data
const mockMessages: ChatMessage[] = [
  { id: '1', role: 'system', content: 'Agent Orchestrator online. Ready to coordinate your build.', timestamp: new Date(Date.now() - 300000) },
  { id: '2', role: 'user', content: 'What agents are currently active?', timestamp: new Date(Date.now() - 240000) },
  { id: '3', role: 'assistant', content: 'Currently running: Architect (designing system), Backend Dev (API scaffolding), and Orchestrator (coordinating). The Product Manager completed the PRD. Want me to activate more agents?', timestamp: new Date(Date.now() - 180000) },
];

const mockActivity: ActivityEvent[] = [
  { id: '1', type: 'agent_working', message: 'Architect designing microservices', timestamp: new Date(Date.now() - 30000), agent: 'Architect' },
  { id: '2', type: 'agent_complete', message: 'PRD document finalized', timestamp: new Date(Date.now() - 60000), agent: 'Product Manager' },
  { id: '3', type: 'gate_ready', message: 'G2 ready for review', timestamp: new Date(Date.now() - 120000) },
  { id: '4', type: 'agent_working', message: 'Backend scaffolding API routes', timestamp: new Date(Date.now() - 150000), agent: 'Backend Dev' },
  { id: '5', type: 'task_complete', message: 'Database schema validated', timestamp: new Date(Date.now() - 180000) },
  { id: '6', type: 'agent_start', message: 'Orchestrator initialized', timestamp: new Date(Date.now() - 200000), agent: 'Orchestrator' },
];

const mockTodos = [
  { id: '1', text: 'Review PRD document', done: true, priority: 'high' as const },
  { id: '2', text: 'Approve G2 Architecture gate', done: false, priority: 'high' as const },
  { id: '3', text: 'Select design variant', done: false, priority: 'medium' as const },
  { id: '4', text: 'Review API contracts', done: false, priority: 'low' as const },
  { id: '5', text: 'Configure CI/CD pipeline', done: false, priority: 'low' as const },
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

// Fuzzy Llama Logo - matches the uploaded icon (white llama with bow tie on teal)
const FuzzyLlamaLogo = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 100 100" fill="currentColor">
    {/* Body - fluffy cloud-like shape */}
    <ellipse cx="45" cy="65" rx="28" ry="25" />
    {/* Neck */}
    <ellipse cx="58" cy="45" rx="12" ry="20" />
    {/* Head */}
    <ellipse cx="62" cy="28" rx="14" ry="16" />
    {/* Left ear */}
    <ellipse cx="52" cy="14" rx="4" ry="10" />
    {/* Right ear */}
    <ellipse cx="72" cy="14" rx="4" ry="10" />
    {/* Snout */}
    <ellipse cx="72" cy="32" rx="8" ry="6" />
    {/* Eye */}
    <circle cx="65" cy="25" r="2" fill="#0d9488" />
    {/* Fluffy chest detail */}
    <ellipse cx="50" cy="55" rx="8" ry="10" opacity="0.3" />
    {/* Bow tie */}
    <path d="M 54 48 L 48 44 L 48 52 Z" fill="#0d9488" />
    <path d="M 58 48 L 64 44 L 64 52 Z" fill="#0d9488" />
    <circle cx="56" cy="48" r="3" fill="#0d9488" />
    {/* Legs */}
    <rect x="30" y="82" width="6" height="14" rx="3" />
    <rect x="42" y="82" width="6" height="14" rx="3" />
    <rect x="54" y="82" width="6" height="14" rx="3" />
    <rect x="66" y="80" width="6" height="12" rx="3" />
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
        : 'bg-teal-800/40 border-teal-700/30'
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
            <div className={`rounded-xl p-3 border-l-4 border-teal-500 ${isDark ? 'bg-teal-500/10' : 'bg-teal-600/20'}`}>
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
        {/* Logo */}
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="w-32 h-32 mx-auto mb-8 bg-teal-600 rounded-3xl flex items-center justify-center shadow-xl shadow-teal-500/30"
        >
          <FuzzyLlamaLogo className="w-24 h-24 text-white" />
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
          className="px-8 py-4 bg-teal-500 hover:bg-teal-400 text-white font-semibold rounded-full text-lg shadow-lg shadow-teal-500/30 transition-colors"
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
      {/* Header */}
      <div className={`flex items-center gap-3 p-3 border-b ${isDark ? 'border-slate-700/50' : 'border-teal-700/30'}`}>
        <div className="relative">
          <div className="w-9 h-9 rounded-xl bg-teal-500 flex items-center justify-center">
            <CpuChipIcon className="w-5 h-5 text-white" />
          </div>
          <motion.div
            className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border-2 border-slate-800"
            animate={{ scale: [1, 1.2, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
          />
        </div>
        <div className="flex-1">
          <span className="font-semibold text-sm text-white">Agent Orchestrator</span>
          <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-teal-300'}`}>Coordinating 14 AI agents</p>
        </div>
        <div className="flex items-center gap-1 bg-emerald-500/20 px-2 py-0.5 rounded-full">
          <BreathingOrb color="bg-emerald-400" size="sm" />
          <span className="text-[10px] text-emerald-400 font-medium">3 Active</span>
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
                ? 'bg-teal-500 text-white rounded-br-md'
                : msg.role === 'system'
                ? `${isDark ? 'bg-slate-700/50' : 'bg-teal-700/50'} text-teal-200 rounded-bl-md italic`
                : `${isDark ? 'bg-slate-700' : 'bg-teal-700/70'} text-white rounded-bl-md`
            }`}>
              {msg.content}
            </div>
          </motion.div>
        ))}
        {isStreaming && (
          <div className={`flex items-center gap-2 px-3 py-2 rounded-2xl rounded-bl-md max-w-[90%] ${isDark ? 'bg-slate-700/50' : 'bg-teal-700/50'}`}>
            <div className="flex gap-1">
              {[0, 1, 2].map((i) => (
                <motion.span
                  key={i}
                  className="w-1.5 h-1.5 bg-teal-400 rounded-full"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 0.5, delay: i * 0.1, repeat: Infinity }}
                />
              ))}
            </div>
            <span className="text-[10px] text-teal-300">Processing...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <div className={`p-3 border-t ${isDark ? 'border-slate-700/50' : 'border-teal-700/30'}`}>
        <div className={`flex items-center gap-2 rounded-full px-3 py-1.5 ${isDark ? 'bg-slate-700/50' : 'bg-teal-700/50'}`}>
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="Command your agents..."
            className="flex-1 bg-transparent text-xs text-white placeholder-teal-300/50 focus:outline-none"
          />
          {isStreaming ? (
            <button onClick={() => setIsStreaming(false)} className="w-7 h-7 rounded-full bg-red-500/20 text-red-400 flex items-center justify-center">
              <StopIcon className="w-3 h-3" />
            </button>
          ) : (
            <button onClick={handleSend} className="w-7 h-7 rounded-full bg-teal-500 text-white flex items-center justify-center">
              <PaperAirplaneIcon className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>
    </Panel>
  );
};

const ActivityPanel = ({ theme }: { theme: ThemeMode }) => {
  const isDark = theme === 'dark';

  const getEventStyle = (type: ActivityEvent['type']) => {
    switch (type) {
      case 'agent_complete': return { icon: CheckCircleIcon, color: 'text-emerald-400', bg: 'bg-emerald-500/20' };
      case 'agent_working': return { icon: BoltIcon, color: 'text-teal-400', bg: 'bg-teal-500/20' };
      case 'agent_start': return { icon: SparklesIcon, color: 'text-blue-400', bg: 'bg-blue-500/20' };
      case 'gate_ready': return { icon: FlagIcon, color: 'text-amber-400', bg: 'bg-amber-500/20' };
      case 'task_complete': return { icon: CheckCircleIcon, color: 'text-teal-400', bg: 'bg-teal-500/20' };
      default: return { icon: ClockIcon, color: 'text-slate-400', bg: 'bg-slate-500/20' };
    }
  };

  const formatTime = (date: Date) => {
    const diff = Date.now() - date.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'now';
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h`;
  };

  return (
    <Panel theme={theme} className="flex flex-col h-full">
      <div className={`flex items-center justify-between px-3 py-2 border-b ${isDark ? 'border-slate-700/50' : 'border-teal-700/30'}`}>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider flex items-center gap-1.5 text-teal-300">
          <HeartIcon className="w-3 h-3 text-pink-400" />
          Recent Activity
        </h3>
        <span className="text-[9px] text-teal-400">{mockActivity.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
        {mockActivity.map((event, i) => {
          const style = getEventStyle(event.type);
          const Icon = style.icon;
          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.05 }}
              className={`flex items-center gap-2 p-2 rounded-xl ${style.bg}`}
            >
              <div className={`w-5 h-5 rounded-lg ${style.bg} flex items-center justify-center`}>
                <Icon className={`w-3 h-3 ${style.color}`} />
              </div>
              <div className="flex-1 min-w-0">
                <span className="text-[10px] text-teal-100 block truncate">{event.message}</span>
              </div>
              <span className="text-[9px] text-teal-400">{formatTime(event.timestamp)}</span>
            </motion.div>
          );
        })}
      </div>
    </Panel>
  );
};

const TasksPanel = ({ theme }: { theme: ThemeMode }) => {
  const [todos, setTodos] = useState(mockTodos);
  const isDark = theme === 'dark';

  const toggleTodo = (id: string) => {
    setTodos(todos.map(t => t.id === id ? { ...t, done: !t.done } : t));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'bg-red-400';
      case 'medium': return 'bg-amber-400';
      case 'low': return 'bg-emerald-400';
      default: return 'bg-slate-400';
    }
  };

  return (
    <Panel theme={theme} className="flex flex-col h-full">
      <div className={`flex items-center justify-between px-3 py-2 border-b ${isDark ? 'border-slate-700/50' : 'border-teal-700/30'}`}>
        <h3 className="text-[10px] font-semibold uppercase tracking-wider text-teal-300">Your Tasks</h3>
        <span className="text-[9px] text-emerald-400">{todos.filter(t => t.done).length}/{todos.length}</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-0">
        {todos.map((todo, i) => (
          <motion.label
            key={todo.id}
            initial={{ opacity: 0, x: -5 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
            className={`flex items-center gap-2 p-2 rounded-xl cursor-pointer transition-all ${
              todo.done
                ? 'bg-emerald-500/10'
                : isDark ? 'bg-slate-700/30 hover:bg-slate-700/50' : 'bg-teal-700/30 hover:bg-teal-700/50'
            }`}
          >
            <div
              onClick={() => toggleTodo(todo.id)}
              className={`w-4 h-4 rounded-md border-2 flex items-center justify-center transition-colors ${
                todo.done ? 'bg-emerald-500 border-emerald-500' : 'border-teal-500'
              }`}
            >
              {todo.done && <CheckIcon className="w-3 h-3 text-white" />}
            </div>
            <span className={`text-[11px] flex-1 ${todo.done ? 'line-through text-teal-500' : 'text-teal-100'}`}>
              {todo.text}
            </span>
            <div className={`w-1.5 h-1.5 rounded-full ${getPriorityColor(todo.priority)}`} />
          </motion.label>
        ))}
      </div>
    </Panel>
  );
};

// ============ CENTER PANEL COMPONENTS ============

const WorkspacePanel = ({ activeTab, onTabChange, theme }: { activeTab: WorkspaceTab; onTabChange: (tab: WorkspaceTab) => void; theme: ThemeMode }) => {
  const isDark = theme === 'dark';
  const tabs: { id: WorkspaceTab; label: string }[] = [
    { id: 'ui', label: 'Preview' },
    { id: 'docs', label: 'Docs' },
    { id: 'code', label: 'Code' },
    { id: 'map', label: 'Journey' },
  ];

  return (
    <div className="flex flex-col h-full p-3">
      <Panel theme={theme} className="flex-1 flex flex-col overflow-hidden">
        {/* Tab Bar inside panel - smaller */}
        <div className="flex justify-center pt-3 pb-2">
          <div className={`flex items-center gap-0.5 p-0.5 rounded-full ${isDark ? 'bg-slate-800/60' : 'bg-teal-800/40'}`}>
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => onTabChange(tab.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-teal-500 text-white shadow-md'
                    : 'text-teal-300 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 p-4 overflow-auto">
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
      </Panel>
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
                ? 'bg-teal-500 text-white'
                : isDark ? 'bg-slate-700/50 text-teal-300 hover:text-white' : 'bg-teal-700/50 text-teal-200 hover:text-white'
            }`}
          >
            {view}
          </button>
        ))}
      </div>
      <div className={`flex-1 rounded-2xl overflow-hidden border ${isDark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-teal-900/50 border-teal-700/50'}`}>
        <div className={`flex items-center gap-2 px-4 py-2 border-b ${isDark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-teal-800/50 border-teal-700/50'}`}>
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          </div>
          <div className={`flex-1 rounded-full px-3 py-1 text-[10px] text-center ${isDark ? 'bg-slate-900/50 text-slate-400' : 'bg-teal-900/50 text-teal-300'}`}>
            localhost:3000/{selectedView}
          </div>
        </div>
        <div className="h-full flex items-center justify-center p-8">
          <div className="text-center">
            <div className="w-20 h-20 mx-auto mb-4 rounded-2xl bg-teal-500/20 flex items-center justify-center">
              <ComputerDesktopIcon className="w-10 h-10 text-teal-400" />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2 capitalize">{selectedView} Preview</h3>
            <p className="text-sm text-teal-300">Live UI preview appears here after G4.</p>
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
    switch (status) {
      case 'complete': return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Done</span>;
      case 'in-progress': return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-teal-500/20 text-teal-400">WIP</span>;
      default: return <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-slate-500/20 text-slate-400">Pending</span>;
    }
  };

  return (
    <div className="h-full flex gap-4">
      <div className="w-48 space-y-1">
        <div className="text-[10px] font-semibold uppercase tracking-wider px-2 mb-2 text-teal-400">Documents</div>
        {docTypes.map((doc) => (
          <button
            key={doc.id}
            onClick={() => setSelectedDoc(doc.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 rounded-xl text-left transition-all ${
              selectedDoc === doc.id
                ? 'bg-teal-500/20 border border-teal-500/30'
                : isDark ? 'hover:bg-slate-700/50' : 'hover:bg-teal-700/50'
            }`}
          >
            <span className={`text-xs flex-1 ${selectedDoc === doc.id ? 'text-white font-medium' : 'text-teal-200'}`}>
              {doc.name}
            </span>
            {getStatusBadge(doc.status)}
          </button>
        ))}
      </div>
      <div className={`flex-1 rounded-2xl p-5 overflow-auto ${isDark ? 'bg-slate-900/50' : 'bg-teal-900/50'}`}>
        <div className="flex items-center gap-3 mb-4">
          <h2 className="text-xl font-bold text-white">{docTypes.find(d => d.id === selectedDoc)?.name}</h2>
        </div>
        <p className="text-sm leading-relaxed text-teal-200">
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
            isSelected ? 'bg-teal-500/20 text-teal-300' : 'hover:bg-slate-700/30'
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
      <div className={`w-56 rounded-2xl p-3 overflow-auto border ${isDark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-teal-900/50 border-teal-700/50'}`}>
        <div className={`flex items-center gap-2 px-2 py-1.5 mb-2 border-b ${isDark ? 'border-slate-700/50' : 'border-teal-700/50'}`}>
          <CodeBracketIcon className="w-4 h-4 text-teal-400" />
          <span className="text-xs font-semibold text-white">Files</span>
        </div>
        <div className="space-y-0.5">{mockFileTree.map(node => renderTreeNode(node))}</div>
      </div>
      <div className={`flex-1 rounded-2xl overflow-hidden border ${isDark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-teal-900/50 border-teal-700/50'}`}>
        {selectedFile ? (
          <>
            <div className={`flex items-center gap-2 px-4 py-2 border-b ${isDark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-teal-800/50 border-teal-700/50'}`}>
              <DocumentIcon className="w-4 h-4 text-blue-400" />
              <span className="text-xs font-mono text-white">{selectedFile.path}</span>
            </div>
            <div className="p-5 overflow-auto h-full">
              <pre className="whitespace-pre-wrap text-sm leading-relaxed font-mono text-teal-200">
                {selectedFile.content}
              </pre>
            </div>
          </>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <DocumentIcon className="w-12 h-12 mx-auto mb-3 text-teal-600" />
              <p className="text-sm text-teal-400">Select a .md file</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const JourneyContent = ({ theme }: { theme: ThemeMode }) => {
  const isDark = theme === 'dark';
  const currentGate = 3;

  // Phase colors for timeline
  const phaseColors: Record<Phase, { bg: string; border: string; text: string; glow: string }> = {
    plan: { bg: 'bg-violet-500', border: 'border-violet-500/30', text: 'text-violet-300', glow: 'shadow-violet-500/20' },
    dev: { bg: 'bg-cyan-500', border: 'border-cyan-500/30', text: 'text-cyan-300', glow: 'shadow-cyan-500/20' },
    ship: { bg: 'bg-orange-500', border: 'border-orange-500/30', text: 'text-orange-300', glow: 'shadow-orange-500/20' },
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
      <div className="text-center mb-6">
        <h3 className="text-lg font-bold bg-gradient-to-r from-violet-300 via-cyan-400 to-orange-300 bg-clip-text text-transparent">
          Your Building Journey
        </h3>
        <p className="text-[10px] text-slate-400 mt-1">{progress}% Complete • Gate {currentGate} of 9</p>
      </div>

      {/* Alternating Timeline */}
      <div className="relative px-2">
        {/* Central vertical line */}
        <div className={`absolute left-1/2 top-0 bottom-0 w-0.5 transform -translate-x-1/2 ${isDark ? 'bg-slate-700/50' : 'bg-teal-700/30'}`} />

        {/* Progress overlay on central line */}
        <div
          className="absolute left-1/2 top-0 w-0.5 transform -translate-x-1/2 bg-gradient-to-b from-violet-500 via-cyan-500 to-transparent transition-all duration-500"
          style={{ height: `${Math.min(95, (currentGate / 9) * 100)}%` }}
        />

        {/* Milestone nodes - alternating left/right */}
        <div className="space-y-3">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((gateNum) => {
            const gateInfo = GATE_INFO[gateNum];
            const phase = getPhaseForGate(gateNum);
            const colors = phaseColors[phase];
            const isCompleted = gateNum < currentGate;
            const isCurrent = gateNum === currentGate;
            const isUpcoming = gateNum > currentGate;
            const isLeft = gateNum % 2 === 0;

            return (
              <div key={gateNum} className={`flex items-center gap-2 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
                {/* Content Card */}
                <motion.div
                  initial={{ opacity: 0, x: isLeft ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: gateNum * 0.05 }}
                  className={`flex-1 ${isLeft ? 'text-right' : 'text-left'}`}
                >
                  <div className={`
                    p-3 rounded-xl border transition-all
                    ${isCompleted
                      ? `bg-gradient-to-br ${isLeft ? 'from-emerald-500/10 to-transparent' : 'from-transparent to-emerald-500/10'} border-emerald-500/30`
                      : isCurrent
                        ? `bg-gradient-to-br ${isLeft ? `from-${phase === 'plan' ? 'violet' : phase === 'dev' ? 'cyan' : 'orange'}-500/20 to-transparent` : `from-transparent to-${phase === 'plan' ? 'violet' : phase === 'dev' ? 'cyan' : 'orange'}-500/20`} ${colors.border} shadow-lg ${colors.glow}`
                        : `${isDark ? 'bg-slate-800/20' : 'bg-teal-900/20'} border-slate-700/20 opacity-50`
                    }
                  `}>
                    {isCompleted && (
                      <div className={`flex items-center gap-1 mb-1 ${isLeft ? 'justify-end' : 'justify-start'}`}>
                        <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                          ✓ Complete
                        </span>
                      </div>
                    )}
                    <h4 className={`text-xs font-bold mb-0.5 ${
                      isCompleted ? 'text-emerald-400' : isCurrent ? colors.text : 'text-slate-500'
                    }`}>
                      {gateInfo.name}
                    </h4>
                    <p className={`text-[9px] leading-relaxed ${isUpcoming ? 'text-slate-600' : 'text-slate-400'}`}>
                      {gateInfo.description}
                    </p>
                    {(isCompleted || isCurrent) && gateInfo.deliverables.length > 0 && (
                      <div className={`flex flex-wrap gap-1 mt-1.5 ${isLeft ? 'justify-end' : 'justify-start'}`}>
                        {gateInfo.deliverables.slice(0, 2).map((item, i) => (
                          <span
                            key={i}
                            className={`text-[7px] px-1 py-0.5 rounded ${
                              isCompleted ? 'bg-emerald-500/20 text-emerald-400' : 'bg-white/10 text-slate-300'
                            }`}
                          >
                            {item}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </motion.div>

                {/* Center Node */}
                <div className="relative flex flex-col items-center z-10">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: gateNum * 0.05, type: 'spring' }}
                    className={`
                      w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border-2
                      ${isCompleted
                        ? 'bg-emerald-500 border-emerald-400/50 text-white'
                        : isCurrent
                          ? `${colors.bg} border-white/30 text-white ring-2 ring-offset-1 ring-offset-slate-900 ring-${phase === 'plan' ? 'violet' : phase === 'dev' ? 'cyan' : 'orange'}-500/50`
                          : `${isDark ? 'bg-slate-800' : 'bg-teal-900'} border-slate-600 text-slate-500`
                      }
                    `}
                  >
                    {isCompleted ? <CheckIcon className="w-3.5 h-3.5" /> : `G${gateNum}`}
                  </motion.div>
                </div>

                {/* Spacer for alternating layout */}
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
          className="flex justify-center mt-4"
        >
          <div className="flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-orange-500/20 to-amber-500/20 border border-orange-500/30">
            <span className="text-lg">🚀</span>
            <span className="text-xs font-bold text-orange-300">Launch!</span>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

// ============ RIGHT PANEL COMPONENTS ============

// Phase colors for right panel components
const PHASE_COLORS: Record<Phase, { bg: string; bgHover: string; text: string; accent: string; border: string }> = {
  plan: { bg: 'bg-violet-500', bgHover: 'hover:bg-violet-500/40', text: 'text-violet-300', accent: 'bg-violet-500/20', border: 'border-violet-500/30' },
  dev: { bg: 'bg-cyan-500', bgHover: 'hover:bg-cyan-500/40', text: 'text-cyan-300', accent: 'bg-cyan-500/20', border: 'border-cyan-500/30' },
  ship: { bg: 'bg-orange-500', bgHover: 'hover:bg-orange-500/40', text: 'text-orange-300', accent: 'bg-orange-500/20', border: 'border-orange-500/30' },
};

// Phase selector - updates the displayed phase in right panel (no popup)
const PhaseSelector = ({ currentPhase, selectedPhase, onPhaseSelect, theme }: {
  currentPhase: Phase;
  selectedPhase: Phase;
  onPhaseSelect: (phase: Phase) => void;
  theme: ThemeMode
}) => {
  const phases: { id: Phase; label: string }[] = [
    { id: 'plan', label: 'Plan' },
    { id: 'dev', label: 'Build' },
    { id: 'ship', label: 'Ship' },
  ];

  return (
    <Panel theme={theme} className="p-3">
      <h3 className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-1 text-slate-400">Phase</h3>
      <div className="flex gap-1.5">
        {phases.map((p) => {
          const colors = PHASE_COLORS[p.id];
          return (
            <button
              key={p.id}
              onClick={() => onPhaseSelect(p.id)}
              className={`flex-1 text-center py-2 px-2 rounded-xl transition-all cursor-pointer ${
                selectedPhase === p.id
                  ? `${colors.bg} shadow-md`
                  : currentPhase === p.id
                    ? `${colors.accent} ring-1 ${colors.border}`
                    : `bg-slate-700/30 ${colors.bgHover}`
              }`}
            >
              <div className={`text-xs font-medium ${selectedPhase === p.id ? 'text-white' : colors.text}`}>{p.label}</div>
            </button>
          );
        })}
      </div>
      {selectedPhase !== currentPhase && (
        <p className={`text-[9px] ${PHASE_COLORS[selectedPhase].text} mt-2 text-center`}>Viewing {selectedPhase} phase</p>
      )}
    </Panel>
  );
};

// Team panel - no icons, just names with status indicator
const TeamPanel = ({ phase, theme: _theme }: { phase: Phase; theme: ThemeMode }) => {
  const phaseAgents = ALL_AGENTS.filter(a => a.phase === phase);
  const activeCount = phaseAgents.filter(a => a.status === 'working').length;
  const colors = PHASE_COLORS[phase];

  return (
    <div className="px-3 py-2">
      <div className="flex items-center justify-between mb-2">
        <h3 className={`text-[10px] font-semibold uppercase tracking-wider ${colors.text}`}>
          Team
        </h3>
        <span className={`text-[9px] ${colors.bg} text-white px-2 py-0.5 rounded-full`}>{activeCount} active</span>
      </div>
      <div className="space-y-1">
        {phaseAgents.map((agent) => (
          <div
            key={agent.type}
            className={`flex items-center gap-2 p-1.5 rounded-lg ${
              agent.status === 'working' ? colors.accent : 'bg-slate-700/20'
            }`}
          >
            <span className={`text-[10px] flex-1 ${agent.status === 'working' ? 'text-white' : colors.text}`}>
              {agent.name}
            </span>
            {agent.status === 'working' && <BreathingOrb color={colors.bg} size="sm" />}
          </div>
        ))}
      </div>
    </div>
  );
};

// Gates panel - vertical layout with gate name on right
const GatesPanel = ({ currentGate, selectedPhase, theme: _theme, onGateClick }: {
  currentGate: number;
  selectedPhase: Phase;
  theme: ThemeMode;
  onGateClick: (gate: number) => void
}) => {
  const phaseGates = GATES_BY_PHASE[selectedPhase];
  const colors = PHASE_COLORS[selectedPhase];

  return (
    <div className="px-3 py-2">
      <h3 className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${colors.text}`}>
        Gates
      </h3>
      <div className="space-y-1.5">
        {phaseGates.map((gateNum) => {
          const isCompleted = gateNum < currentGate;
          const isCurrent = gateNum === currentGate;
          const gateInfo = GATE_INFO[gateNum];
          return (
            <button
              key={gateNum}
              onClick={() => isCurrent && onGateClick(gateNum)}
              className={`w-full flex items-center gap-2 p-2 rounded-xl transition-all ${
                isCompleted
                  ? 'bg-emerald-500/20 border border-emerald-500/30'
                  : isCurrent
                    ? `${colors.accent} border ${colors.border} cursor-pointer ${colors.bgHover}`
                    : 'bg-slate-700/20 border border-transparent'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                isCompleted ? 'bg-emerald-500 text-white' :
                isCurrent ? `${colors.bg} text-white` :
                `bg-slate-700/50 ${colors.text}`
              }`}>
                G{gateNum}
              </div>
              <div className="flex-1 text-left">
                <div className={`text-[10px] font-medium ${
                  isCompleted ? 'text-emerald-400' : isCurrent ? colors.text : 'text-slate-500'
                }`}>
                  {gateInfo.name}
                </div>
              </div>
              {isCompleted && <CheckIcon className="w-4 h-4 text-emerald-400" />}
              {isCurrent && <span className={`text-[8px] ${colors.text}`}>Review</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
};

// Costs panel - vertical layout with gate, phase, and total
const CostsPanel = ({ selectedPhase, theme: _theme }: { selectedPhase: Phase; theme: ThemeMode }) => {
  const colors = PHASE_COLORS[selectedPhase];
  const phaseLabel = selectedPhase === 'dev' ? 'Build' : selectedPhase.charAt(0).toUpperCase() + selectedPhase.slice(1);

  return (
    <div className="px-3 py-2">
      <h3 className={`text-[10px] font-semibold uppercase tracking-wider mb-2 ${colors.text}`}>
        Token Costs
      </h3>
      <div className="space-y-1.5">
        <div className={`flex items-center justify-between p-2 rounded-xl ${colors.accent}`}>
          <span className={`text-[10px] ${colors.text}`}>Current Gate</span>
          <span className={`text-sm font-bold ${colors.text}`}>{COST_DATA.gate}</span>
        </div>
        <div className={`flex items-center justify-between p-2 rounded-xl ${colors.accent}`}>
          <span className={`text-[10px] ${colors.text}`}>{phaseLabel} Phase</span>
          <span className={`text-sm font-bold ${colors.text}`}>{COST_DATA[selectedPhase]}</span>
        </div>
        <div className="flex items-center justify-between p-2 rounded-xl bg-emerald-500/10">
          <span className="text-[10px] text-emerald-400">Project Total</span>
          <span className="text-sm font-bold text-emerald-400">{COST_DATA.total}</span>
        </div>
      </div>
    </div>
  );
};

// ============ PROJECTS VIEW ============

const ProjectsView = ({ theme, onSelectProject }: { theme: ThemeMode; onSelectProject: (name: string) => void }) => {
  const projects = [
    { id: '1', name: 'E-Commerce Platform', status: 'active', gate: 4, progress: 40 },
    { id: '2', name: 'Mobile App Backend', status: 'active', gate: 2, progress: 20 },
    { id: '3', name: 'Analytics Dashboard', status: 'completed', gate: 9, progress: 100 },
  ];

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold text-white">Projects</h2>
        <button className="px-4 py-2 bg-teal-500 text-white rounded-full text-sm font-medium hover:bg-teal-400 transition-colors">
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
              <h3 className="font-semibold text-white mb-2">{project.name}</h3>
              <div className="flex items-center gap-2 mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-full ${project.status === 'completed' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-teal-500/20 text-teal-300'}`}>
                  {project.status === 'completed' ? 'Completed' : `Gate ${project.gate}`}
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden bg-slate-700/50">
                <div className="h-full bg-teal-500 rounded-full" style={{ width: `${project.progress}%` }} />
              </div>
              <div className="text-xs mt-2 text-teal-400">{project.progress}% complete</div>
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
  const currentGate = 3;

  const getPhase = (gate: number): Phase => {
    if (gate <= 3) return 'plan';
    if (gate <= 6) return 'dev';
    return 'ship';
  };

  const currentPhase = getPhase(currentGate);
  const isDark = theme === 'dark';

  const { data: projects } = useQuery({
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
        ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800'
        : 'bg-gradient-to-br from-teal-900 via-teal-800 to-slate-900'
    } text-white`}>
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
      <header className={`relative h-14 border-b flex items-center px-4 gap-3 z-10 ${
        isDark ? 'border-slate-700/50 bg-slate-900/80' : 'border-teal-700/50 bg-teal-900/80'
      } backdrop-blur-xl`}>
        {/* Logo */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-teal-500 flex items-center justify-center">
            <FuzzyLlamaLogo className="w-6 h-6 text-white" />
          </div>
          <span className="font-bold text-sm text-white">Fuzzy Llama</span>
        </div>

        {/* Main Navigation - no icons */}
        <div className={`flex items-center gap-1 p-1 rounded-full ml-4 ${isDark ? 'bg-slate-800/50' : 'bg-teal-800/50'}`}>
          <button
            onClick={() => setMainView('dashboard')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              mainView === 'dashboard' ? 'bg-teal-500 text-white' : 'text-teal-300 hover:text-white'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setMainView('projects')}
            className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
              mainView === 'projects' ? 'bg-teal-500 text-white' : 'text-teal-300 hover:text-white'
            }`}
          >
            Projects
          </button>
        </div>

        {/* Current Project Name - just text, no dropdown */}
        {mainView === 'dashboard' && (
          <span className="text-sm text-teal-300 ml-2">
            {currentProjectName}
          </span>
        )}

        <div className="flex-1" />

        {/* GitHub Button - no icon inside, just the github mark */}
        <button
          onClick={() => setShowGitHub(true)}
          className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${
            isDark ? 'bg-slate-700/50 hover:bg-slate-700 text-white' : 'bg-teal-700/50 hover:bg-teal-700 text-white'
          }`}
        >
          <GitHubIcon className="w-4 h-4" />
        </button>

        {/* Profile Avatar */}
        <button
          onClick={() => setShowSettings(true)}
          className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center text-xs font-bold text-white"
        >
          JD
        </button>
      </header>

      {/* Main Content */}
      {mainView === 'projects' ? (
        <div className="flex-1 overflow-auto">
          <ProjectsView theme={theme} onSelectProject={handleSelectProject} />
        </div>
      ) : (
        <div className="flex-1 flex overflow-hidden relative z-10">
          {/* Left Panel */}
          <div className={`w-[300px] min-w-[280px] p-3 flex flex-col gap-3 ${isDark ? 'bg-slate-900/30' : 'bg-teal-900/30'}`}>
            <div className="flex-[3] min-h-0">
              <AgentOrchestratorPanel theme={theme} />
            </div>
            <div className="flex-1 min-h-[120px]">
              <ActivityPanel theme={theme} />
            </div>
            <div className="flex-1 min-h-[120px]">
              <TasksPanel theme={theme} />
            </div>
          </div>

          {/* Center Panel */}
          <div className="flex-1 min-w-[400px]">
            <WorkspacePanel activeTab={activeTab} onTabChange={setActiveTab} theme={theme} />
          </div>

          {/* Right Panel */}
          <div className={`w-[260px] min-w-[220px] p-3 flex flex-col gap-3 ${isDark ? 'bg-slate-900/30' : 'bg-teal-900/30'}`}>
            <PhaseSelector
              currentPhase={currentPhase}
              selectedPhase={selectedPhase}
              onPhaseSelect={setSelectedPhase}
              theme={theme}
            />
            <Panel theme={theme} className="flex-1 overflow-auto">
              <TeamPanel phase={selectedPhase} theme={theme} />
              <div className={`border-t mx-3 ${isDark ? 'border-slate-700/30' : 'border-teal-700/30'}`} />
              <GatesPanel
                currentGate={currentGate}
                selectedPhase={selectedPhase}
                theme={theme}
                onGateClick={() => setShowGateApproval(true)}
              />
              <div className={`border-t mx-3 ${isDark ? 'border-slate-700/30' : 'border-teal-700/30'}`} />
              <CostsPanel selectedPhase={selectedPhase} theme={theme} />
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
