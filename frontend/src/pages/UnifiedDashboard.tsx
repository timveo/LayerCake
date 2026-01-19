import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CodeBracketIcon,
  ComputerDesktopIcon,
  FolderIcon,
  FolderOpenIcon,
  DocumentIcon,
  ChevronRightIcon,
  ChevronDownIcon,
  CheckIcon,
  XMarkIcon,
} from '@heroicons/react/24/outline';
import { projectsApi } from '../api/projects';
import { metricsApi, type ProjectProgress, type WorkflowStatus, type ProjectCosts, type ProjectMetrics } from '../api/metrics';
import { gatesApi } from '../api/gates';
import { journeyApi } from '../api/journey';
import { workflowApi } from '../api/workflow';
import { documentsApi } from '../api/documents';
import type { Document } from '../types';
import { useThemeStore } from '../stores/theme';
import { useAuthStore } from '../stores/auth';
import { useProjectStore } from '../stores/project';
import { useWebSocket } from '../hooks/useWebSocket';
import FuzzyLlamaLogoSvg from '../assets/Llamalogo.png';
import FuzzyLlamaLogoTransparent from '../assets/Llamalogo-transparent.png';
import { SettingsModal } from '../components/SettingsModal';
import { OrchestratorChat } from '../components/chat/OrchestratorChat';
import { documentGitApi } from '../api/document-git';

// Types
interface FileTreeNode {
  name: string;
  type: 'file' | 'folder';
  path: string;
  children?: FileTreeNode[];
  content?: string;
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

// Gate names, descriptions, decisions (teaching moments), documents, and celebrations
// Based on Multi-Agent-Product-Creator framework: G1-G9 (no G0)
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
  1: {
    name: 'Scope Approved',
    narrative: 'Every great product starts with a clear "why"',
    description: 'Project scope approved through intake questionnaire.',
    deliverables: ['Project Intake document', 'Success criteria defined', 'Constraints identified'],
    summary: 'Established the project vision, goals, and constraints through the intake process.',
    decisions: [],
    documents: [
      { name: 'Project Intake', path: '/docs/intake.md', icon: '📄' },
      { name: 'G1 Summary', path: '/docs/g1-summary.md', icon: '✅' },
    ],
    celebration: '🎯 Scope Approved!'
  },
  2: {
    name: 'PRD Approved',
    narrative: 'From ideas to actionable specifications',
    description: 'Product requirements fully documented. Every feature has a purpose.',
    deliverables: ['PRD document', 'User stories', 'Success metrics', 'Feature prioritization'],
    summary: 'Translated the vision into concrete requirements with measurable success criteria.',
    decisions: [],
    documents: [
      { name: 'PRD.md', path: '/docs/PRD.md', icon: '📋' },
    ],
    celebration: '📋 PRD Complete!'
  },
  3: {
    name: 'Architecture Approved',
    narrative: 'The skeleton that supports everything',
    description: 'System architecture and tech stack approved.',
    deliverables: ['System design doc', 'Tech stack decision', 'Database schema', 'API contracts'],
    summary: 'Designed system architecture with appropriate technology choices.',
    decisions: [],
    documents: [
      { name: 'Architecture.md', path: '/docs/ARCHITECTURE.md', icon: '🏗️' },
      { name: 'API Contracts', path: '/docs/API.md', icon: '🔌' },
    ],
    celebration: '🏗️ Architecture Approved!'
  },
  4: {
    name: 'Design Approved',
    narrative: 'Where user experience meets visual craft',
    description: 'UX/UI design completed and approved.',
    deliverables: ['Wireframes', 'Design system', 'User flows', 'Prototype'],
    summary: 'Created design system with 3 options, user selected and refined.',
    decisions: [],
    documents: [
      { name: 'Design System', path: '/docs/design-system.md', icon: '🎨' },
    ],
    celebration: '🎨 Design Approved!'
  },
  5: {
    name: 'Feature Acceptance',
    narrative: 'Ideas become reality, one function at a time',
    description: 'Development complete. All features implemented.',
    deliverables: ['Core features', 'All user stories', 'Spec compliance', 'Technical debt documented'],
    summary: 'Built all planned features with spec compliance verified.',
    decisions: [],
    documents: [
      { name: 'Spec Compliance', path: '/docs/compliance.md', icon: '⚡' },
    ],
    celebration: '⚡ Development Complete!'
  },
  6: {
    name: 'Quality Sign-off',
    narrative: 'Confidence through comprehensive testing',
    description: 'QA testing passed. Quality metrics met.',
    deliverables: ['Test results summary', 'Coverage metrics', 'Performance tests', 'Accessibility audit'],
    summary: 'QA testing complete with coverage and accessibility requirements met.',
    decisions: [],
    documents: [
      { name: 'Test Results', path: '/docs/test-results.md', icon: '🧪' },
    ],
    celebration: '🧪 QA Passed!'
  },
  7: {
    name: 'Security Acceptance',
    narrative: 'Building trust through security',
    description: 'Security review complete. No critical vulnerabilities.',
    deliverables: ['Security scan results', 'Vulnerability summary', 'Threat model', 'Remediation plan'],
    summary: 'Security audit complete with no critical or high vulnerabilities.',
    decisions: [],
    documents: [
      { name: 'Security Audit', path: '/docs/security-audit.md', icon: '🔒' },
    ],
    celebration: '🔒 Security Approved!'
  },
  8: {
    name: 'Go/No-Go',
    narrative: 'The runway is clear',
    description: 'Pre-deployment review complete. Ready for production.',
    deliverables: ['Pre-deployment report', 'Deployment guide', 'Rollback plan', 'Lighthouse audits'],
    summary: 'All quality gates passed, deployment infrastructure ready.',
    decisions: [],
    documents: [
      { name: 'Pre-Deployment Report', path: '/docs/pre-deployment.md', icon: '🚀' },
    ],
    celebration: '🚀 Ready to Launch!'
  },
  9: {
    name: 'Production Acceptance',
    narrative: 'Your creation meets the world',
    description: 'Product deployed and stable in production.',
    deliverables: ['Smoke tests passed', 'Production metrics healthy', 'User acceptance'],
    summary: 'Production deployment verified with passing smoke tests.',
    decisions: [],
    documents: [
      { name: 'Launch Checklist', path: '/docs/launch-checklist.md', icon: '✅' },
    ],
    celebration: '🎉 You Shipped!'
  },
};

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

// GitHub Icon SVG Component
const GitHubIcon = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
);

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

const GitHubPopup = ({ isOpen, onClose, theme, projectId }: { isOpen: boolean; onClose: () => void; theme: ThemeMode; projectId: string | null }) => {
  const isDark = theme === 'dark';
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'status' | 'history'>('status');
  const [showCommitInput, setShowCommitInput] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  // Fetch git status
  const { data: gitStatus, isLoading: statusLoading } = useQuery({
    queryKey: ['git-status', projectId],
    queryFn: () => projectId ? documentGitApi.getStatus(projectId) : null,
    enabled: !!projectId && isOpen,
  });

  // Fetch commit history
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['git-history', projectId],
    queryFn: () => projectId ? documentGitApi.getHistory(projectId, 10) : null,
    enabled: !!projectId && isOpen && activeTab === 'history',
  });

  // Commit mutation
  const commitMutation = useMutation({
    mutationFn: (message: string) => projectId ? documentGitApi.commitAll(projectId, message) : Promise.reject('No project'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git-status', projectId] });
      queryClient.invalidateQueries({ queryKey: ['git-history', projectId] });
      setShowCommitInput(false);
      setCommitMessage('');
    },
  });

  // Sync mutation
  const syncMutation = useMutation({
    mutationFn: () => projectId ? documentGitApi.syncToFilesystem(projectId) : Promise.reject('No project'),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['git-status', projectId] });
      queryClient.invalidateQueries({ queryKey: ['git-history', projectId] });
    },
  });

  if (!isOpen) return null;

  const totalChanges = (gitStatus?.staged?.length || 0) + (gitStatus?.unstaged?.length || 0) + (gitStatus?.untracked?.length || 0);

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
          className={`rounded-2xl shadow-xl border w-80 overflow-hidden ${
            isDark ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
          }`}
        >
          {/* Header */}
          <div className={`p-3 border-b flex items-center justify-between ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
            <div className="flex items-center gap-2">
              <GitHubIcon className={`w-5 h-5 ${isDark ? 'text-white' : 'text-slate-700'}`} />
              <span className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-slate-700'}`}>Version Control</span>
            </div>
            <div className="flex items-center gap-2">
              {gitStatus && (
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                  {gitStatus.branch || 'main'}
                </span>
              )}
              <button onClick={onClose} className={`${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-400 hover:text-slate-700'}`}>
                <XMarkIcon className="w-5 h-5" />
              </button>
            </div>
          </div>

          {!projectId ? (
            <div className={`p-6 text-center ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              <p className="text-sm">Select a project to view version control</p>
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className={`flex border-b ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                {(['status', 'history'] as const).map((tab) => (
                  <button
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`flex-1 py-2 text-xs font-medium transition-colors ${
                      activeTab === tab
                        ? isDark ? 'text-teal-300 border-b-2 border-teal-400' : 'text-teal-600 border-b-2 border-teal-500'
                        : isDark ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700'
                    }`}
                  >
                    {tab === 'status' ? `Status${totalChanges > 0 ? ` (${totalChanges})` : ''}` : 'History'}
                  </button>
                ))}
              </div>

              {/* Content */}
              <div className="p-3 max-h-64 overflow-y-auto">
                {activeTab === 'status' ? (
                  statusLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : gitStatus?.isClean ? (
                    <div className={`text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <CheckIcon className="w-8 h-8 mx-auto mb-2 text-emerald-500" />
                      <p className="text-xs">All documents committed</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {gitStatus?.staged && gitStatus.staged.length > 0 && (
                        <div>
                          <h4 className={`text-[10px] font-semibold mb-1 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
                            Staged ({gitStatus.staged.length})
                          </h4>
                          {gitStatus.staged.map((file) => (
                            <div key={file} className={`text-[10px] py-0.5 px-2 rounded ${isDark ? 'bg-emerald-500/10 text-emerald-300' : 'bg-emerald-50 text-emerald-700'}`}>
                              {file.replace('docs/', '')}
                            </div>
                          ))}
                        </div>
                      )}
                      {gitStatus?.unstaged && gitStatus.unstaged.length > 0 && (
                        <div>
                          <h4 className={`text-[10px] font-semibold mb-1 ${isDark ? 'text-amber-400' : 'text-amber-600'}`}>
                            Modified ({gitStatus.unstaged.length})
                          </h4>
                          {gitStatus.unstaged.map((file) => (
                            <div key={file} className={`text-[10px] py-0.5 px-2 rounded ${isDark ? 'bg-amber-500/10 text-amber-300' : 'bg-amber-50 text-amber-700'}`}>
                              {file.replace('docs/', '')}
                            </div>
                          ))}
                        </div>
                      )}
                      {gitStatus?.untracked && gitStatus.untracked.length > 0 && (
                        <div>
                          <h4 className={`text-[10px] font-semibold mb-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                            New ({gitStatus.untracked.length})
                          </h4>
                          {gitStatus.untracked.map((file) => (
                            <div key={file} className={`text-[10px] py-0.5 px-2 rounded ${isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-600'}`}>
                              {file.replace('docs/', '')}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                ) : (
                  historyLoading ? (
                    <div className="flex items-center justify-center py-4">
                      <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                    </div>
                  ) : history && history.length > 0 ? (
                    <div className="space-y-1">
                      {history.map((commit) => (
                        <div key={commit.hash} className={`p-2 rounded-lg ${isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-50'}`}>
                          <p className={`text-[11px] font-medium truncate ${isDark ? 'text-white' : 'text-slate-700'}`}>
                            {commit.message}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              {commit.hash.substring(0, 7)}
                            </span>
                            <span className={`text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>•</span>
                            <span className={`text-[9px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                              {new Date(commit.date).toLocaleDateString()}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={`text-center py-4 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      <p className="text-xs">No commit history yet</p>
                    </div>
                  )
                )}
              </div>

              {/* Actions */}
              <div className={`p-3 border-t ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                {showCommitInput ? (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={commitMessage}
                      onChange={(e) => setCommitMessage(e.target.value)}
                      placeholder="Commit message..."
                      autoFocus
                      className={`w-full px-3 py-2 rounded-lg text-xs ${
                        isDark ? 'bg-slate-700 text-white placeholder-slate-400 border border-slate-600' : 'bg-white text-slate-700 placeholder-slate-400 border border-slate-200'
                      }`}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && commitMessage.trim()) commitMutation.mutate(commitMessage);
                        if (e.key === 'Escape') setShowCommitInput(false);
                      }}
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => setShowCommitInput(false)}
                        className={`flex-1 py-1.5 rounded-lg text-xs ${isDark ? 'text-slate-400 hover:text-white' : 'text-slate-500 hover:text-slate-700'}`}
                      >
                        Cancel
                      </button>
                      <button
                        onClick={() => commitMessage.trim() && commitMutation.mutate(commitMessage)}
                        disabled={!commitMessage.trim() || commitMutation.isPending}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-medium ${
                          commitMessage.trim() && !commitMutation.isPending
                            ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                            : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        {commitMutation.isPending ? 'Committing...' : 'Commit'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => syncMutation.mutate()}
                      disabled={syncMutation.isPending}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1 ${
                        isDark ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {syncMutation.isPending ? (
                        <div className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                      ) : (
                        'Sync'
                      )}
                    </button>
                    <button
                      onClick={() => setShowCommitInput(true)}
                      disabled={gitStatus?.isClean}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium ${
                        gitStatus?.isClean
                          ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          : 'bg-emerald-500 text-white hover:bg-emerald-600'
                      }`}
                    >
                      Commit All
                    </button>
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};


// ============ CENTER PANEL COMPONENTS ============

const WorkspacePanel = ({ activeTab, onTabChange, theme, projectId, autoSelectDocumentKey }: {
  activeTab: WorkspaceTab;
  onTabChange: (tab: WorkspaceTab) => void;
  theme: ThemeMode;
  projectId: string | null;
  autoSelectDocumentKey?: string | null;
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
        {/* Tab Bar */}
        <div className={`flex items-center justify-center pt-3 pb-2 px-3 ${isDark ? '' : 'bg-teal-50/50'}`}>
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
              {activeTab === 'docs' && <DocsContent theme={theme} projectId={projectId} autoSelectDocumentKey={autoSelectDocumentKey} />}
              {activeTab === 'code' && <CodeContent theme={theme} projectId={projectId} />}
              {activeTab === 'map' && <JourneyContent theme={theme} projectId={projectId} onViewDocument={() => onTabChange('docs')} />}
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
      <div className={`flex-1 rounded-2xl overflow-hidden ${isDark ? 'border bg-slate-900/50 border-slate-700/50' : 'border border-slate-200 bg-white'}`}>
        <div className={`flex items-center gap-3 px-4 py-3 ${isDark ? 'border-b bg-slate-800/50 border-slate-700/50' : 'border-b border-slate-200 bg-slate-50'}`}>
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
          </div>
          <div className={`flex-1 rounded-lg px-4 py-2 flex items-center justify-center ${isDark ? 'bg-slate-900/50' : 'bg-white border border-slate-200'}`}>
            <span className={`text-sm ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>localhost:3000/</span>
            <select
              value={selectedView}
              onChange={(e) => setSelectedView(e.target.value)}
              className={`text-sm font-medium bg-transparent border-none outline-none cursor-pointer ${isDark ? 'text-slate-300' : 'text-slate-600'}`}
            >
              {views.map((view) => (
                <option key={view} value={view} className={isDark ? 'bg-slate-800' : 'bg-white'}>
                  {view}
                </option>
              ))}
            </select>
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

const DocsContent = ({ theme, projectId, autoSelectDocumentKey }: { theme: ThemeMode; projectId: string | null; autoSelectDocumentKey?: string | null }) => {
  const isDark = theme === 'dark';
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);

  // Fetch real documents from API
  const { data: apiDocuments, isLoading } = useQuery({
    queryKey: ['documents', projectId],
    queryFn: () => projectId ? documentsApi.list(projectId) : Promise.resolve([]),
    enabled: !!projectId,
  });

  // Filter out internal/tracking documents that shouldn't be shown to users
  // These are created for internal tracking but not meant for user review
  const INTERNAL_DOC_TITLES = [
    'feedback log',
    'cost log',
    'project context',
    'change requests',
    'post launch',
    'orchestrator output',
    'orchestrator',  // Also match just "ORCHESTRATOR Output"
  ];

  const isInternalDocument = useCallback((doc: Document): boolean => {
    return INTERNAL_DOC_TITLES.some(title =>
      doc.title.toLowerCase().includes(title.toLowerCase())
    );
  }, []);

  // Filter to only show user-facing documents (gate summaries, PRD, Architecture, etc.)
  const userFacingDocuments = useMemo(() =>
    (apiDocuments || []).filter((d: Document) => !isInternalDocument(d)),
    [apiDocuments, isInternalDocument]
  );

  // Auto-select document when prop changes (from gate approval)
  useEffect(() => {
    if (autoSelectDocumentKey === 'intake' && userFacingDocuments?.length) {
      // For G1, prefer the G1 Summary doc, fallback to intake
      const g1SummaryDoc = userFacingDocuments.find((d: Document) =>
        d.title.includes('G1 Summary')
      );
      const intakeDoc = userFacingDocuments.find((d: Document) =>
        d.title === 'Project Intake'
      );
      const targetDoc = g1SummaryDoc || intakeDoc;
      if (targetDoc) {
        const timer = setTimeout(() => setSelectedDocId(targetDoc.id), 0);
        return () => clearTimeout(timer);
      }
    }
  }, [autoSelectDocumentKey, userFacingDocuments]);

  // Auto-select first document when loaded
  useEffect(() => {
    if (userFacingDocuments?.length && !selectedDocId) {
      const docId = userFacingDocuments[0].id;
      const timer = setTimeout(() => {
        setSelectedDocId(docId);
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [userFacingDocuments, selectedDocId]);

  const selectedDoc = userFacingDocuments?.find((d: Document) => d.id === selectedDocId);

  // Map document type to gate number
  const getGateForDoc = (doc: Document): number => {
    // G1 Summary documents
    if (doc.title.includes('G1 Summary')) return 1;
    if (doc.title === 'Project Intake') return 0;

    const typeToGate: Record<string, number> = {
      'REQUIREMENTS': 0,
      'PRD': 2,
      'ARCHITECTURE': 3,
      'DESIGN': 4,
      'TECHNICAL': 5,
      'TEST': 6,
      'SECURITY': 7,
      'DEPLOYMENT': 8,
      'OTHER': 0,
    };
    return typeToGate[doc.documentType] ?? 0;
  };

  // Group documents by gate
  const groupedDocs = userFacingDocuments.reduce((acc: Record<number, Document[]>, doc: Document) => {
    const gate = getGateForDoc(doc);
    if (!acc[gate]) acc[gate] = [];
    acc[gate].push(doc);
    return acc;
  }, {});

  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Select a project to view documents</p>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Loading...</span>
        </div>
      </div>
    );
  }

  if (!userFacingDocuments?.length) {
    return (
      <div className="h-full flex items-center justify-center">
        <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>No documents yet</p>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-3">
      {/* Document List - Simple & Clean */}
      <div className={`w-44 overflow-y-auto py-1 ${isDark ? '' : ''}`}>
        {Object.entries(groupedDocs)
          .sort(([a], [b]) => Number(a) - Number(b))
          .map(([gate, docs]) => (
          <div key={gate} className="mb-2">
            <div className={`text-[9px] font-semibold uppercase tracking-wider px-2 py-1 ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {gate === '0' ? 'Discovery' : `Gate ${gate}`}
            </div>
            {(docs as Document[]).map((doc) => (
              <button
                key={doc.id}
                onClick={() => setSelectedDocId(doc.id)}
                className={`w-full text-left px-2 py-1.5 text-xs transition-colors ${
                  selectedDocId === doc.id
                    ? isDark ? 'text-teal-300 bg-teal-500/10' : 'text-teal-700 bg-teal-50'
                    : isDark ? 'text-slate-300 hover:text-white hover:bg-slate-700/30' : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                }`}
              >
                {doc.title}
              </button>
            ))}
          </div>
        ))}
      </div>

      {/* Document Content */}
      <div className={`flex-1 rounded-xl p-4 overflow-auto ${isDark ? 'bg-slate-800/50' : 'bg-white border border-slate-200'}`}>
        {selectedDoc ? (
          <>
            <div className="mb-3">
              <h2 className={`text-base font-semibold ${isDark ? 'text-white' : 'text-slate-700'}`}>{selectedDoc.title}</h2>
              <p className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
                {selectedDoc.documentType} • v{selectedDoc.version || 1} • {new Date(selectedDoc.updatedAt).toLocaleDateString()}
              </p>
            </div>
            <div className={`text-xs leading-relaxed whitespace-pre-wrap ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              {selectedDoc.content || 'No content.'}
            </div>
          </>
        ) : (
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Select a document</p>
        )}
      </div>
    </div>
  );
};

const CodeContent = ({ theme, projectId }: { theme: ThemeMode; projectId: string | null }) => {
  const isDark = theme === 'dark';
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['/docs', '/src']));
  const [selectedFile, setSelectedFile] = useState<FileTreeNode | null>(null);

  // Fetch real documents from API
  const { data: apiDocuments, isLoading } = useQuery({
    queryKey: ['documents', projectId],
    queryFn: () => projectId ? documentsApi.list(projectId) : Promise.resolve([]),
    enabled: !!projectId,
  });

  // Filter out internal/tracking documents (same as Docs tab)
  const INTERNAL_DOC_TITLES = [
    'feedback log', 'cost log', 'project context', 'change requests',
    'post launch', 'orchestrator output', 'orchestrator',
  ];
  const userFacingDocuments = useMemo(() => {
    if (!apiDocuments) return [];
    return apiDocuments.filter((doc: Document) =>
      !INTERNAL_DOC_TITLES.some(title => doc.title.toLowerCase().includes(title))
    );
  }, [apiDocuments]);

  // Build file tree from documents
  const buildFileTree = useCallback((documents: Document[]): FileTreeNode[] => {
    const docsFolder: FileTreeNode = {
      name: 'docs',
      type: 'folder',
      path: '/docs',
      children: [],
    };

    // Group documents by type for organization
    const typeToFolder: Record<string, string> = {
      'REQUIREMENTS': 'discovery',
      'PRD': 'product',
      'ARCHITECTURE': 'architecture',
      'DESIGN': 'design',
      'TECHNICAL': 'technical',
      'TEST': 'testing',
      'SECURITY': 'security',
      'DEPLOYMENT': 'deployment',
      'OTHER': 'other',
    };

    // Create subfolders based on document types present
    const subfolders: Record<string, FileTreeNode> = {};

    documents.forEach((doc) => {
      const folderName = typeToFolder[doc.documentType] || 'other';
      const folderPath = `/docs/${folderName}`;

      if (!subfolders[folderName]) {
        subfolders[folderName] = {
          name: folderName,
          type: 'folder',
          path: folderPath,
          children: [],
        };
      }

      // Convert document title to filename
      const fileName = `${doc.title.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-')}.md`;
      const filePath = `${folderPath}/${fileName}`;

      subfolders[folderName].children!.push({
        name: fileName,
        type: 'file',
        path: filePath,
        content: doc.content || '',
      });
    });

    // Add subfolders to docs folder (sorted)
    docsFolder.children = Object.values(subfolders).sort((a, b) => a.name.localeCompare(b.name));

    // If no documents, return empty state with placeholder
    if (documents.length === 0) {
      return mockFileTree; // Fall back to mock tree when no real documents
    }

    // Merge with src folder from mock (for now, until we have real code files)
    const srcFolder = mockFileTree.find(n => n.name === 'src');
    const result: FileTreeNode[] = [docsFolder];
    if (srcFolder) result.push(srcFolder);

    return result;
  }, []);

  const fileTree = userFacingDocuments.length > 0 ? buildFileTree(userFacingDocuments) : mockFileTree;

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
            isSelected
              ? isDark ? 'bg-teal-950/20 text-teal-300' : 'bg-teal-100 text-teal-700'
              : isDark ? 'hover:bg-slate-700/30' : 'hover:bg-slate-100'
          }`}
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          {node.type === 'folder' ? (
            <>
              {isExpanded
                ? <ChevronDownIcon className={`w-3 h-3 ${isDark ? 'text-teal-400' : 'text-teal-500'}`} />
                : <ChevronRightIcon className={`w-3 h-3 ${isDark ? 'text-teal-400' : 'text-teal-500'}`} />}
              {isExpanded
                ? <FolderOpenIcon className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />
                : <FolderIcon className={`w-4 h-4 ${isDark ? 'text-amber-400' : 'text-amber-500'}`} />}
            </>
          ) : (
            <>
              <span className="w-3" />
              <DocumentIcon className={`w-4 h-4 ${isMarkdown ? (isDark ? 'text-blue-400' : 'text-blue-500') : (isDark ? 'text-teal-500' : 'text-teal-600')}`} />
            </>
          )}
          <span className={`text-xs ${
            isSelected
              ? isDark ? 'text-teal-300 font-medium' : 'text-teal-700 font-medium'
              : isMarkdown
                ? isDark ? 'text-teal-100' : 'text-slate-700'
                : isDark ? 'text-teal-400' : 'text-slate-500'
          }`}>
            {node.name}
          </span>
        </button>
        {node.type === 'folder' && isExpanded && node.children && (
          <div>{node.children.map(child => renderTreeNode(child, depth + 1))}</div>
        )}
      </div>
    );
  };

  if (!projectId) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="text-center">
          <CodeBracketIcon className={`w-12 h-12 mx-auto mb-3 ${isDark ? 'text-teal-600' : 'text-teal-400'}`} />
          <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Select a project to view files</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
          <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Loading files...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex gap-4">
      <div className={`w-56 rounded-2xl p-3 overflow-auto border ${isDark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-white border-slate-200'}`}>
        <div className={`flex items-center gap-2 px-2 py-1.5 mb-2 border-b ${isDark ? 'border-slate-700/50' : 'border-slate-200'}`}>
          <CodeBracketIcon className={`w-4 h-4 ${isDark ? 'text-teal-400' : 'text-teal-500'}`} />
          <span className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-700'}`}>Files</span>
        </div>
        <div className="space-y-0.5">{fileTree.map(node => renderTreeNode(node))}</div>
      </div>
      <div className={`flex-1 rounded-2xl overflow-hidden border ${isDark ? 'bg-slate-900/50 border-slate-700/50' : 'bg-white border-slate-200'}`}>
        {selectedFile ? (
          <>
            <div className={`flex items-center gap-2 px-4 py-2 border-b ${isDark ? 'bg-slate-800/50 border-slate-700/50' : 'bg-slate-50 border-slate-200'}`}>
              <DocumentIcon className={`w-4 h-4 ${isDark ? 'text-blue-400' : 'text-blue-500'}`} />
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
              <p className={`text-sm ${isDark ? 'text-teal-400' : 'text-slate-500'}`}>Select a file to view</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// Tasks accomplished at each gate
// Tasks for each gate (G1-G9)
const GATE_TASKS: Record<number, { task: string; status: 'done' | 'in-progress' | 'pending' }[]> = {
  1: [
    { task: 'Complete intake questionnaire', status: 'pending' },
    { task: 'Define project scope', status: 'pending' },
    { task: 'Identify constraints', status: 'pending' },
  ],
  2: [
    { task: 'Create PRD document', status: 'pending' },
    { task: 'Define user stories', status: 'pending' },
    { task: 'Set success metrics', status: 'pending' },
  ],
  3: [
    { task: 'Design system architecture', status: 'pending' },
    { task: 'Create database schema', status: 'pending' },
    { task: 'Define API contracts', status: 'pending' },
  ],
  4: [
    { task: 'Create 3 design options', status: 'pending' },
    { task: 'User selects direction', status: 'pending' },
    { task: 'Refine and finalize design', status: 'pending' },
  ],
  5: [
    { task: 'Implement all features', status: 'pending' },
    { task: 'Verify spec compliance', status: 'pending' },
    { task: 'Document technical debt', status: 'pending' },
  ],
  6: [
    { task: 'Run test suite', status: 'pending' },
    { task: 'Check coverage metrics', status: 'pending' },
    { task: 'Complete accessibility audit', status: 'pending' },
  ],
  7: [
    { task: 'Run security scans', status: 'pending' },
    { task: 'Review vulnerabilities', status: 'pending' },
    { task: 'Create remediation plan', status: 'pending' },
  ],
  8: [
    { task: 'Run Lighthouse audits', status: 'pending' },
    { task: 'Prepare deployment guide', status: 'pending' },
    { task: 'Create rollback plan', status: 'pending' },
  ],
  9: [
    { task: 'Run smoke tests', status: 'pending' },
    { task: 'Verify production metrics', status: 'pending' },
    { task: 'Confirm user acceptance', status: 'pending' },
  ],
};

const JourneyContent = ({ theme, projectId, onViewDocument }: { theme: ThemeMode; projectId: string | null; onViewDocument?: (documentId: string, documentName: string) => void }) => {
  const isDark = theme === 'dark';

  // Fetch journey data from API
  const { data: journeyData } = useQuery({
    queryKey: ['journey', projectId],
    queryFn: () => projectId ? journeyApi.get(projectId) : null,
    enabled: !!projectId,
    refetchOnMount: true, // Ensure fresh data when tab is opened
  });

  // Use API data or fall back to mock data
  // When journeyData exists, completedGates is computed from gates with 'completed' status
  const currentGate = journeyData?.currentGate ?? 1; // Default to G1 if not loaded
  const completedGates = journeyData?.completedGates ?? (journeyData?.gates?.filter(g => g.status === 'completed').length ?? 0);
  const progress = journeyData?.progressPercentage ?? Math.round((completedGates / 10) * 100);

  // Helper to get gate data - prefer API data, fall back to mock
  const getGateData = (gateNum: number) => {
    const apiGate = journeyData?.gates?.find(g => g.gateNumber === gateNum);
    const mockGateInfo = GATE_INFO[gateNum];
    const mockTasks = GATE_TASKS[gateNum] || [];

    if (apiGate) {
      // Map API tasks to display format
      const tasks = apiGate.tasks.map(t => ({
        task: t.name,
        status: t.status === 'complete' ? 'done' as const : t.status === 'in_progress' ? 'in-progress' as const : 'pending' as const,
      }));

      // Map API decisions to display format - prefer keyDecisions from API
      const decisions = apiGate.keyDecisions?.map(d => ({
        choice: d.title,
        reason: d.description,
      })) || apiGate.decisions.map(d => ({
        choice: d.choice,
        reason: d.reason,
      }));

      // Map API documents to display format with icons
      const documents = apiGate.documents.map(d => ({
        id: d.id,
        name: d.name,
        path: d.path,
        type: d.type,
        icon: getDocumentIcon(d.type),
      }));

      return {
        name: apiGate.metadata.name,
        narrative: apiGate.metadata.narrative,
        // Use project-specific summary if available, otherwise fall back to metadata description
        description: apiGate.projectSummary || apiGate.metadata.description,
        celebration: apiGate.metadata.celebration,
        // Use project-specific summary for the summary field too
        summary: apiGate.projectSummary || mockGateInfo.summary,
        decisions: decisions.length > 0 ? decisions : mockGateInfo.decisions,
        documents: documents.length > 0 ? documents : mockGateInfo.documents,
        tasks: tasks.length > 0 ? tasks : mockTasks,
        // Include gate status from API
        status: apiGate.status,
      };
    }

    // Fall back to mock data - determine status from currentGate
    const status = gateNum < currentGate ? 'completed' : gateNum === currentGate ? 'current' : 'upcoming';
    return {
      name: mockGateInfo.name,
      narrative: mockGateInfo.narrative,
      description: mockGateInfo.description,
      celebration: mockGateInfo.celebration,
      summary: mockGateInfo.summary,
      decisions: mockGateInfo.decisions,
      documents: mockGateInfo.documents,
      tasks: mockTasks,
      status,
    };
  };

  // Helper to get document icon based on type
  const getDocumentIcon = (type: string): string => {
    const iconMap: Record<string, string> = {
      'PRD': '📋',
      'ARCHITECTURE': '🏗️',
      'API_SPEC': '🔌',
      'DESIGN': '🎨',
      'TEST_PLAN': '🧪',
      'DEPLOYMENT': '🚀',
      'USER_GUIDE': '📚',
      'default': '📄',
    };
    return iconMap[type] || iconMap['default'];
  };

  return (
    <div className="h-full overflow-auto">
      {/* Header */}
      <div className="text-center mb-6 px-4">
        <h3 className={`text-2xl font-bold ${isDark ? 'bg-gradient-to-r from-amber-300 via-cyan-400 to-orange-300 bg-clip-text text-transparent' : 'text-teal-700'}`}>
          Your Building Journey
        </h3>
        <p className={`text-sm mt-2 italic ${isDark ? 'text-slate-400' : 'text-teal-600'}`}>"Every line of code is a step forward"</p>
        <div className="flex items-center justify-center gap-4 mt-3">
          <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-teal-600'}`}>{completedGates} gates complete</span>
          <span className={`text-sm ${isDark ? 'text-slate-500' : 'text-teal-400'}`}>•</span>
          <span className="text-sm text-emerald-500">{progress}% to launch</span>
        </div>
      </div>

      {/* Alternating Timeline */}
      <div className="relative px-2 pb-8">
        {/* Central vertical line - stops before Launch card */}
        <div className={`absolute left-1/2 top-0 w-0.5 transform -translate-x-1/2 ${isDark ? 'bg-slate-700/50' : 'bg-teal-200'}`} style={{ bottom: '80px' }} />

        {/* Progress overlay on central line */}
        <div
          className="absolute left-1/2 top-0 w-0.5 transform -translate-x-1/2 bg-gradient-to-b from-amber-500 via-cyan-500 to-transparent transition-all duration-500"
          style={{ height: `${Math.min(95, (currentGate / 9) * 100)}%` }}
        />

        {/* Alternating Gate Cards */}
        <div className="space-y-6">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((gateNum) => {
            const gateData = getGateData(gateNum);
            // Use status from API/gateData instead of calculating from currentGate
            const isCompleted = gateData.status === 'completed';
            const isCurrent = gateData.status === 'current';
            const isUpcoming = gateData.status === 'upcoming';
            const isLeft = gateNum % 2 === 0;

            return (
              <div key={gateNum} className="relative flex items-start">
                {/* Center Node with Gate Number - absolutely positioned on timeline */}
                <div className="absolute left-1/2 transform -translate-x-1/2 z-10">
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={isCurrent ? {
                      scale: [1, 1.15, 1],
                      transition: { duration: 1.5, repeat: Infinity, ease: 'easeInOut' }
                    } : { scale: 1 }}
                    transition={{ delay: gateNum * 0.05, type: 'spring' }}
                    className={`
                      w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold border-2 transition-all
                      ${isCompleted
                        ? 'bg-emerald-500 border-emerald-400/50 text-white shadow-md shadow-emerald-500/30'
                        : isCurrent
                          ? isDark
                            ? 'bg-gradient-to-br from-amber-400 to-orange-500 border-amber-300 text-white ring-4 ring-amber-400/50 shadow-xl shadow-amber-500/50'
                            : 'bg-gradient-to-br from-amber-500 to-orange-600 border-amber-300 text-white ring-4 ring-amber-400/60 shadow-xl shadow-amber-400/60'
                          : isDark
                            ? 'bg-slate-800 border-slate-600 text-slate-500'
                            : 'bg-slate-100 border-slate-300 text-slate-400'
                      }
                    `}
                  >
                    G{gateNum}
                  </motion.div>
                </div>

                {/* Content Side */}
                <motion.div
                  initial={{ opacity: 0, x: isLeft ? -20 : 20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: gateNum * 0.05 }}
                  className={`w-1/2 ${isLeft ? 'pr-8' : 'pl-8 ml-auto'}`}
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
                          ? 'bg-gradient-to-br from-amber-500/20 to-orange-500/10 border-amber-500/40 shadow-lg shadow-amber-500/30'
                          : 'bg-gradient-to-br from-amber-50 to-orange-50 border-amber-300 shadow-lg shadow-amber-200/50'
                        : isDark
                          ? `bg-slate-800/30 border-slate-700/30 ${isUpcoming ? 'opacity-50' : ''}`
                          : `bg-white/50 border-slate-200 ${isUpcoming ? 'opacity-50' : ''}`
                    }
                  `}>
                    <div className="p-4">
                      {/* Header row */}
                      <div className={`flex items-start gap-2 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
                        <div className={`flex-1 ${isLeft ? 'text-right' : 'text-left'}`}>
                          {/* Celebration badge */}
                          {isCompleted && (
                            <span className={`inline-block text-xs px-2 py-1 rounded-full font-medium mb-2 ${isDark ? 'bg-emerald-500/20 text-emerald-400' : 'bg-emerald-100 text-emerald-700'}`}>
                              {gateData.celebration}
                            </span>
                          )}
                          <h4 className={`text-base font-bold ${
                            isCompleted ? 'text-emerald-500' : isCurrent ? isDark ? 'text-amber-400' : 'text-amber-700' : isDark ? 'text-slate-400' : 'text-slate-500'
                          }`}>
                            {gateData.name}
                          </h4>
                          <p className={`text-sm italic mt-1 ${isUpcoming ? isDark ? 'text-slate-600' : 'text-slate-400' : isDark ? 'text-slate-500' : 'text-slate-500'}`}>
                            {gateData.narrative}
                          </p>
                        </div>
                      </div>

                      {/* Description */}
                      <p className={`text-sm mt-2 leading-relaxed ${isUpcoming ? isDark ? 'text-slate-600' : 'text-slate-400' : isDark ? 'text-slate-400' : 'text-slate-600'} ${isLeft ? 'text-right' : 'text-left'}`}>
                        {gateData.description}
                      </p>

                      {/* Tasks for completed/current gates */}
                      {(isCompleted || isCurrent) && (
                        <div className={`mt-3 space-y-1 ${isLeft ? 'text-right' : 'text-left'}`}>
                          {gateData.tasks.slice(0, 3).map((task: { task: string; status: 'done' | 'in-progress' | 'pending' }, i: number) => (
                            <div key={i} className={`flex items-center gap-1.5 text-xs ${isLeft ? 'flex-row-reverse' : ''}`}>
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
                    <div className={`mt-3 flex ${isLeft ? 'justify-start' : 'justify-end'}`}>
                      <motion.div
                        initial={{ opacity: 0, y: 5 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: gateNum * 0.05 + 0.1 }}
                        className={`w-2/3 p-4 rounded-lg border ${
                          isDark ? 'bg-teal-950/5 border-teal-500/20' : 'bg-teal-100/50 border-teal-200'
                        }`}
                      >
                        <div className={`${isLeft ? 'text-right' : 'text-left'}`}>
                          {/* Summary paragraph */}
                          <p className={`text-sm leading-relaxed mb-3 ${isDark ? 'text-teal-200/80' : 'text-teal-800'}`}>
                            {gateData.summary}
                          </p>

                          {/* Key Decisions - bulletized */}
                          {gateData.decisions.length > 0 && (
                            <div className="mb-3">
                              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isDark ? 'text-teal-400' : 'text-teal-700'}`}>
                                Key Decisions
                              </p>
                              <ul className={`space-y-1.5 ${isLeft ? 'text-right' : 'text-left'}`}>
                                {gateData.decisions.map((decision: { choice: string; reason: string }, i: number) => (
                                  <li key={i} className={`flex items-start gap-1.5 text-xs ${isLeft ? 'flex-row-reverse' : ''}`}>
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
                          {gateData.documents.length > 0 && (
                            <div>
                              <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${isDark ? 'text-teal-400' : 'text-teal-700'}`}>
                                Documents
                              </p>
                              <div className={`flex flex-wrap gap-1.5 ${isLeft ? 'justify-end' : 'justify-start'}`}>
                                {gateData.documents.map((doc: { id?: string; name: string; path: string; icon: string; type?: string }, i: number) => (
                                  <button
                                    key={doc.id || i}
                                    onClick={() => {
                                      if (doc.id && onViewDocument) {
                                        onViewDocument(doc.id, doc.name);
                                      }
                                    }}
                                    className={`flex items-center gap-1 px-2 py-1 rounded text-xs transition-colors cursor-pointer ${
                                      isDark ? 'bg-teal-950/10 hover:bg-teal-950/20 border border-teal-500/20 text-teal-300' : 'bg-teal-200 hover:bg-teal-300 border border-teal-300 text-teal-700'
                                    }`}
                                    title={doc.path || doc.name}
                                  >
                                    <span>{doc.icon}</span>
                                    <span>{doc.name}</span>
                                  </button>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </motion.div>
                    </div>
                  )}
                </motion.div>
              </div>
            );
          })}
        </div>

        {/* Launch destination at bottom */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
          className="flex flex-col items-center mt-8 pb-6"
        >
          {/* Connecting line from timeline to card */}
          <div className={`w-0.5 h-6 ${isDark ? 'bg-slate-700/50' : 'bg-teal-200'}`} />

          <div className={`flex items-center gap-3 px-6 py-4 rounded-2xl border ${isDark ? 'bg-gradient-to-r from-orange-500/20 to-amber-500/20 border-orange-500/30' : 'bg-gradient-to-r from-teal-100 to-cyan-100 border-teal-300'}`}>
            <motion.span
              animate={{ y: [0, -4, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              className="text-3xl"
            >
              🚀
            </motion.span>
            <div>
              <span className={`text-base font-bold block ${isDark ? 'text-orange-300' : 'text-teal-700'}`}>Launch Awaits!</span>
              <span className={`text-sm ${isDark ? 'text-orange-400/70' : 'text-teal-600'}`}>{10 - completedGates} gates remaining</span>
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


// ============ FLOATING METRICS CARD ============
type MetricType = 'team' | 'gate' | 'tokens' | 'momentum' | 'loc';

// Shared state for LOC tracking across carousel rotations
const locTotalAccumulator = { total: 0, added: 0, removed: 0 };

// Custom hook for fetching all metrics data
const useMetricsData = (projectId: string | null) => {
  // Fetch project progress
  const { data: progress, isLoading: progressLoading } = useQuery({
    queryKey: ['projectProgress', projectId],
    queryFn: () => projectId ? metricsApi.getProjectProgress(projectId) : null,
    enabled: !!projectId,
    refetchInterval: 5000, // Refetch every 5 seconds for real-time updates
  });

  // Fetch workflow status (active agents)
  const { data: workflowStatus, isLoading: workflowLoading } = useQuery({
    queryKey: ['workflowStatus', projectId],
    queryFn: () => projectId ? metricsApi.getWorkflowStatus(projectId) : null,
    enabled: !!projectId,
    refetchInterval: 3000,
  });

  // Fetch project costs
  const { data: costs, isLoading: costsLoading } = useQuery({
    queryKey: ['projectCosts', projectId],
    queryFn: () => projectId ? metricsApi.getProjectCosts(projectId) : null,
    enabled: !!projectId,
    refetchInterval: 10000,
  });

  // Fetch gate stats (available for future use)
  const { isLoading: gateStatsLoading } = useQuery({
    queryKey: ['gateStats', projectId],
    queryFn: () => projectId ? gatesApi.getStats(projectId) : null,
    enabled: !!projectId,
    refetchInterval: 10000,
  });

  // Fetch project metrics (stories, bugs, etc.)
  const { data: projectMetrics, isLoading: metricsLoading } = useQuery({
    queryKey: ['projectMetrics', projectId],
    queryFn: () => projectId ? metricsApi.getProjectMetrics(projectId) : null,
    enabled: !!projectId,
    refetchInterval: 10000,
  });

  // Fetch code directory tree for LOC stats (available for future use)
  const { isLoading: codeTreeLoading } = useQuery({
    queryKey: ['codeTree', projectId],
    queryFn: () => projectId ? metricsApi.getDirectoryTree(projectId) : null,
    enabled: !!projectId,
    refetchInterval: 15000,
  });

  return {
    progress,
    workflowStatus,
    costs,
    projectMetrics,
    isLoading: progressLoading || workflowLoading || costsLoading || gateStatsLoading || metricsLoading || codeTreeLoading,
  };
};

const FloatingMetricsCard = ({
  theme,
  projectId,
}: {
  theme: ThemeMode;
  projectId: string | null;
}) => {
  const isDark = theme === 'dark';
  const [currentMetric, setCurrentMetric] = useState<MetricType>('gate');
  const [isHovered, setIsHovered] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<HTMLDivElement>(null);
  const dragStartRef = useRef({ x: 0, y: 0, posX: 0, posY: 0 });

  // Fetch real metrics data
  const metricsData = useMetricsData(projectId);

  // Parse gate number from string like "G1_PENDING" or just use the number
  const parseGateNumber = (gate: string | number | undefined): number => {
    if (typeof gate === 'number') return gate;
    if (!gate) return 1;
    const match = String(gate).match(/G?(\d+)/i);
    return match ? parseInt(match[1], 10) : 1;
  };

  // Map phase strings to our Phase type
  const mapPhase = (phase: string | undefined): Phase => {
    if (!phase) return 'plan';
    const p = phase.toLowerCase();
    if (p.includes('dev') || p.includes('architecture') || p.includes('design')) return 'dev';
    if (p.includes('ship') || p.includes('deploy') || p.includes('test') || p.includes('security') || p.includes('production')) return 'ship';
    return 'plan';
  };

  // Derive current gate and phase from API data
  const currentGate = parseGateNumber(metricsData.progress?.currentGate);
  const selectedPhase = mapPhase(metricsData.progress?.currentPhase);

  const metrics: MetricType[] = ['team', 'gate', 'tokens', 'momentum', 'loc'];
  const metricLabels: Record<MetricType, string> = {
    team: 'Team',
    gate: 'Gate Progress',
    tokens: 'Token Usage',
    momentum: 'Momentum',
    loc: 'Lines of Code',
  };

  // Track when LOC card rotates away to accumulate deltas
  const prevMetricRef = useRef<MetricType>(currentMetric);
  useEffect(() => {
    if (prevMetricRef.current === 'loc' && currentMetric !== 'loc') {
      // LOC card just rotated away - accumulate will happen in the component
    }
    prevMetricRef.current = currentMetric;
  }, [currentMetric]);

  // Auto-cycle through metrics every 6 seconds (when not hovered)
  useEffect(() => {
    if (isHovered || isMinimized) return;

    const interval = setInterval(() => {
      setCurrentMetric(prev => {
        const currentIndex = metrics.indexOf(prev);
        return metrics[(currentIndex + 1) % metrics.length];
      });
    }, 6000);

    return () => clearInterval(interval);
  }, [isHovered, isMinimized]);

  const nextMetric = () => {
    const currentIndex = metrics.indexOf(currentMetric);
    setCurrentMetric(metrics[(currentIndex + 1) % metrics.length]);
  };

  const prevMetric = () => {
    const currentIndex = metrics.indexOf(currentMetric);
    setCurrentMetric(metrics[(currentIndex - 1 + metrics.length) % metrics.length]);
  };

  // Drag handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button')) return; // Don't drag when clicking buttons
    setIsDragging(true);
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      posX: position.x,
      posY: position.y,
    };
  };

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      const deltaX = e.clientX - dragStartRef.current.x;
      const deltaY = e.clientY - dragStartRef.current.y;
      setPosition({
        x: dragStartRef.current.posX + deltaX,
        y: dragStartRef.current.posY + deltaY,
      });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  const renderMetricContent = () => {
    switch (currentMetric) {
      case 'team':
        return <FloatingTeamContent phase={selectedPhase} theme={theme} currentGate={currentGate} workflowStatus={metricsData.workflowStatus} />;
      case 'gate':
        return <FloatingGateContent currentGate={currentGate} selectedPhase={selectedPhase} theme={theme} progress={metricsData.progress} />;
      case 'tokens':
        return <FloatingTokenContent selectedPhase={selectedPhase} theme={theme} currentGate={currentGate} costs={metricsData.costs} />;
      case 'momentum':
        return <FloatingMomentumContent theme={theme} projectMetrics={metricsData.projectMetrics} progress={metricsData.progress} />;
      case 'loc':
        return <FloatingLOCContent theme={theme} isActive={currentMetric === 'loc'} />;
    }
  };

  if (isMinimized) {
    return (
      <motion.div
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        style={{
          position: 'fixed',
          bottom: 16 - position.y,
          right: 16 - position.x,
        }}
        className="z-50"
      >
        <button
          onClick={() => setIsMinimized(false)}
          className={`w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-110 ${
            isDark
              ? 'bg-slate-800 border border-teal-500/50 text-teal-400 hover:bg-slate-700'
              : 'bg-white border border-teal-300 text-teal-600 hover:bg-teal-50'
          }`}
        >
          <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
        </button>
      </motion.div>
    );
  }

  return (
    <motion.div
      ref={dragRef}
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      style={{
        position: 'fixed',
        bottom: 16 - position.y,
        right: 16 - position.x,
        cursor: isDragging ? 'grabbing' : 'grab',
      }}
      className="z-50"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { setIsHovered(false); setIsDragging(false); }}
      onMouseDown={handleMouseDown}
    >
      <div className={`w-96 rounded-2xl shadow-2xl border backdrop-blur-md overflow-hidden ${
        isDark
          ? 'bg-slate-800/95 border-slate-700/50'
          : 'bg-white/95 border-slate-200'
      }`}>
        {/* Header with navigation */}
        <div className={`flex items-center justify-between px-4 py-2.5 border-b ${
          isDark ? 'border-slate-700/50 bg-slate-900/50' : 'border-slate-100 bg-slate-50/50'
        }`}>
          <div className="flex items-center gap-3">
            <button
              onClick={prevMetric}
              className={`p-1.5 rounded hover:bg-slate-700/30 transition-colors ${isDark ? 'text-slate-400 hover:text-teal-400' : 'text-slate-500 hover:text-teal-600'}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <span className={`text-xs font-semibold uppercase tracking-wider ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>
              {metricLabels[currentMetric]}
            </span>
            <button
              onClick={nextMetric}
              className={`p-1.5 rounded hover:bg-slate-700/30 transition-colors ${isDark ? 'text-slate-400 hover:text-teal-400' : 'text-slate-500 hover:text-teal-600'}`}
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          {/* Dot indicators */}
          <div className="flex items-center gap-1.5">
            {metrics.map((m) => (
              <button
                key={m}
                onClick={() => setCurrentMetric(m)}
                className={`w-2 h-2 rounded-full transition-all ${
                  m === currentMetric
                    ? 'bg-teal-500 w-4'
                    : isDark ? 'bg-slate-600 hover:bg-slate-500' : 'bg-slate-300 hover:bg-slate-400'
                }`}
              />
            ))}
          </div>

          <button
            onClick={() => setIsMinimized(true)}
            className={`p-1.5 rounded hover:bg-slate-700/30 transition-colors ${isDark ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-600'}`}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>

        {/* Content area with animation - fixed height */}
        <div className="p-4 h-48 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentMetric}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="h-full"
            >
              {renderMetricContent()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Auto-cycle indicator */}
        {!isHovered && (
          <div className={`h-1 ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
            <motion.div
              className="h-full bg-teal-500"
              initial={{ width: '0%' }}
              animate={{ width: '100%' }}
              transition={{ duration: 6, ease: 'linear', repeat: Infinity }}
            />
          </div>
        )}
      </div>
    </motion.div>
  );
};

// Floating content components
const FloatingTeamContent = ({ phase, theme, currentGate, workflowStatus }: {
  phase: Phase;
  theme: ThemeMode;
  currentGate: number;
  workflowStatus?: WorkflowStatus | null;
}) => {
  const isDark = theme === 'dark';

  // Use real workflow data if available, otherwise fall back to static data
  const agents = workflowStatus?.activeAgents?.length
    ? workflowStatus.activeAgents.map(a => ({
        type: a.agentType,
        name: a.name,
        status: a.status,
        phase: a.phase,
      }))
    : ALL_AGENTS.filter(a => a.phase === phase);

  const activeAgents = agents.filter(a => a.status === 'working');

  const phaseLabels: Record<Phase, string> = {
    plan: 'Planning Phase',
    dev: 'Development Phase',
    ship: 'Deployment Phase',
  };

  const phaseColors: Record<Phase, string> = {
    plan: '#f59e0b',
    dev: '#06b6d4',
    ship: '#f97316',
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-700'}`}>{phaseLabels[phase]}</span>
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white"
            style={{ backgroundColor: phaseColors[phase] }}
          >
            G{currentGate}
          </div>
        </div>
        <div className={`px-2 py-0.5 rounded-full ${isDark ? 'bg-teal-500/20' : 'bg-teal-100'}`}>
          <span className={`text-sm font-bold ${isDark ? 'text-teal-300' : 'text-teal-600'}`}>{activeAgents.length}</span>
          <span className={`text-xs ${isDark ? 'text-teal-400' : 'text-teal-500'}`}>/{agents.length} active</span>
        </div>
      </div>
      <div className="flex-1 overflow-y-auto space-y-1 pr-1">
        {agents.map((agent) => (
          <div
            key={agent.type}
            className={`flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all ${
              agent.status === 'working'
                ? isDark ? 'bg-teal-500/15 border border-teal-500/30' : 'bg-teal-50 border border-teal-200'
                : isDark ? 'bg-slate-700/30' : 'bg-slate-100'
            }`}
          >
            <div className="relative flex-shrink-0">
              {agent.status === 'working' ? (
                <motion.div
                  className="w-2.5 h-2.5 rounded-full bg-emerald-500"
                  animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                />
              ) : (
                <div className={`w-2.5 h-2.5 rounded-full ${isDark ? 'bg-slate-600' : 'bg-slate-300'}`} />
              )}
            </div>
            <span className={`text-xs flex-1 ${
              agent.status === 'working'
                ? isDark ? 'text-white font-medium' : 'text-teal-700 font-medium'
                : isDark ? 'text-slate-400' : 'text-slate-600'
            }`}>
              {agent.name}
            </span>
            <span className={`text-[10px] ${
              agent.status === 'working'
                ? isDark ? 'text-emerald-400' : 'text-emerald-600'
                : isDark ? 'text-slate-500' : 'text-slate-400'
            }`}>
              {agent.status === 'working' ? 'Active' : 'Idle'}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

const FloatingGateContent = ({ currentGate, selectedPhase, theme, progress: progressData }: {
  currentGate: number;
  selectedPhase: Phase;
  theme: ThemeMode;
  progress?: ProjectProgress | null;
}) => {
  const isDark = theme === 'dark';
  const totalGates = 10;
  // Use API data if available, otherwise calculate from currentGate
  const percentComplete = progressData?.percentComplete ?? (currentGate / totalGates) * 100;

  const phaseColors: Record<Phase, string> = {
    plan: '#f59e0b',
    dev: '#06b6d4',
    ship: '#f97316',
  };

  const phaseLabels: Record<Phase, string> = {
    plan: 'Plan',
    dev: 'Develop',
    ship: 'Deploy',
  };

  return (
    <div className="h-full flex items-center gap-4">
      {/* Circular progress */}
      <div className="relative w-24 h-24 flex-shrink-0">
        <svg className="w-24 h-24 transform -rotate-90">
          <circle cx="48" cy="48" r="42" stroke={isDark ? '#334155' : '#e2e8f0'} strokeWidth="5" fill="none" />
          <motion.circle
            cx="48" cy="48" r="42"
            stroke={phaseColors[selectedPhase]}
            strokeWidth="5"
            fill="none"
            strokeLinecap="round"
            strokeDasharray={2 * Math.PI * 42}
            initial={{ strokeDashoffset: 2 * Math.PI * 42 }}
            animate={{ strokeDashoffset: 2 * Math.PI * 42 - (percentComplete / 100) * 2 * Math.PI * 42 }}
            transition={{ duration: 1.5, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-700'}`}>{Math.round(percentComplete)}%</span>
        </div>
      </div>

      {/* Gate info */}
      <div className="flex-1 flex flex-col justify-center">
        <div
          className="inline-block self-start px-2.5 py-0.5 rounded-full text-[10px] font-semibold text-white mb-2"
          style={{ backgroundColor: phaseColors[selectedPhase] }}
        >
          {phaseLabels[selectedPhase]} Phase
        </div>

        <div className="flex items-center gap-2 mb-3">
          <div
            className="w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold text-white shadow-lg"
            style={{ backgroundColor: phaseColors[selectedPhase] }}
          >
            G{currentGate}
          </div>
          <div>
            <p className={`text-sm font-semibold leading-tight ${isDark ? 'text-white' : 'text-slate-700'}`}>
              {GATE_INFO[currentGate]?.name || `Gate ${currentGate}`}
            </p>
            <p className={`text-[10px] ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Gate {currentGate} of {totalGates}</p>
          </div>
        </div>

      </div>
    </div>
  );
};

const FloatingTokenContent = ({ selectedPhase, theme, currentGate, costs }: {
  selectedPhase: Phase;
  theme: ThemeMode;
  currentGate: number;
  costs?: ProjectCosts | null;
}) => {
  const isDark = theme === 'dark';

  // Use real costs data if available
  const totalTokens = costs ? costs.totalInputTokens + costs.totalOutputTokens : 23000;

  // For gate/phase breakdown, we'd need per-gate costs API
  // For now, estimate based on total
  const gateTokens = Math.round(totalTokens * 0.2); // ~20% for current gate
  const phaseTokens = Math.round(totalTokens * 0.5); // ~50% for current phase

  const animatedProject = useAnimatedCounter(totalTokens, 800);
  const animatedGate = useAnimatedCounter(gateTokens, 800);
  const animatedPhase = useAnimatedCounter(phaseTokens, 800);

  const formatTokens = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(1)}k` : n.toString();

  const phaseLabels: Record<Phase, string> = {
    plan: 'Plan',
    dev: 'Develop',
    ship: 'Deploy',
  };

  // Calculate costs from tokens (rough estimate: $0.01 per 1000 tokens)
  const tokenToCost = (tokens: number) => (tokens * 0.00001).toFixed(2);

  return (
    <div className="h-full flex flex-col justify-between">
      {/* Total - prominently displayed */}
      <div className={`p-2.5 rounded-lg ${isDark ? 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20' : 'bg-gradient-to-r from-emerald-100 to-teal-100'}`}>
        <div className="flex items-center justify-between">
          <div>
            <span className={`text-[10px] block ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>Total Project</span>
            <span className={`text-xl font-bold font-mono ${isDark ? 'text-white' : 'text-slate-800'}`}>{formatTokens(animatedProject)}</span>
            <span className={`text-[10px] ml-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>tokens</span>
          </div>
          <div className="text-right">
            <span className={`text-xl font-bold ${isDark ? 'text-emerald-300' : 'text-emerald-600'}`}>${costs?.totalCost?.toFixed(2) ?? tokenToCost(animatedProject)}</span>
            <div className={`flex items-center justify-end gap-1 mt-0.5 ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
              <motion.div className="w-1.5 h-1.5 rounded-full bg-emerald-500" animate={{ opacity: [1, 0.4, 1] }} transition={{ duration: 1, repeat: Infinity }} />
              <span className="text-[10px] font-mono">{costs?.totalAgentExecutions ?? 0} runs</span>
            </div>
          </div>
        </div>
      </div>

      {/* Gate and Phase breakdown */}
      <div className="grid grid-cols-2 gap-2">
        <div className={`p-2.5 rounded-lg ${isDark ? 'bg-slate-700/40' : 'bg-slate-100'}`}>
          <span className={`text-[10px] block ${isDark ? 'text-teal-400' : 'text-slate-500'}`}>Gate {currentGate}</span>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className={`text-base font-bold font-mono ${isDark ? 'text-white' : 'text-slate-700'}`}>{formatTokens(animatedGate)}</span>
            <span className={`text-sm font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>${tokenToCost(animatedGate)}</span>
          </div>
        </div>
        <div className={`p-2.5 rounded-lg ${isDark ? 'bg-slate-700/40' : 'bg-slate-100'}`}>
          <span className={`text-[10px] block ${isDark ? 'text-teal-400' : 'text-slate-500'}`}>{phaseLabels[selectedPhase]} Phase</span>
          <div className="flex items-baseline justify-between mt-0.5">
            <span className={`text-base font-bold font-mono ${isDark ? 'text-white' : 'text-slate-700'}`}>{formatTokens(animatedPhase)}</span>
            <span className={`text-sm font-semibold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>${tokenToCost(animatedPhase)}</span>
          </div>
        </div>
      </div>
    </div>
  );
};

const FloatingMomentumContent = ({ theme, projectMetrics, progress }: {
  theme: ThemeMode;
  projectMetrics?: ProjectMetrics | null;
  progress?: ProjectProgress | null;
}) => {
  const isDark = theme === 'dark';

  // Use real data if available
  const completedTasks = progress?.completedTasks ?? 8;
  const storiesCompleted = projectMetrics?.storiesCompleted ?? 5;

  // Calculate velocity change
  const todayTasks = completedTasks;
  const yesterdayTasks = Math.max(1, completedTasks - 2); // Estimate

  const velocityChange = yesterdayTasks > 0 ? ((todayTasks - yesterdayTasks) / yesterdayTasks) * 100 : 0;
  const isPositive = velocityChange >= 0;

  return (
    <div className="h-full flex flex-col justify-between">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${isDark ? 'bg-amber-500/20' : 'bg-amber-100'}`}>
            <span className="text-xl">⚡</span>
          </div>
          <div>
            <span className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-700'}`}>{completedTasks}</span>
            <span className={`text-xs ml-1 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>completed</span>
          </div>
        </div>
        <div className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full ${isDark ? 'bg-orange-500/20' : 'bg-orange-100'}`}>
          <span className="text-lg">🔥</span>
          <span className={`text-base font-bold ${isDark ? 'text-orange-400' : 'text-orange-600'}`}>{storiesCompleted}</span>
          <span className={`text-[10px] ${isDark ? 'text-orange-400/70' : 'text-orange-500'}`}>stories</span>
        </div>
      </div>

      <div className={`p-2.5 rounded-lg ${isDark ? 'bg-slate-700/30' : 'bg-slate-100'}`}>
        <div className="flex items-center justify-between mb-2">
          <span className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Progress</span>
          <div className="flex items-center gap-1.5">
            <span className="text-base">{isPositive ? '📈' : '📉'}</span>
            <span className={`text-lg font-bold ${isPositive ? 'text-emerald-500' : 'text-red-500'}`}>
              {isPositive ? '+' : ''}{Math.round(velocityChange)}%
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>Tasks</span>
          <div className="flex-1 flex gap-0.5">
            {Array.from({ length: 12 }).map((_, i) => (
              <div key={i} className={`flex-1 h-1.5 rounded-sm ${i < todayTasks ? 'bg-gradient-to-t from-teal-500 to-emerald-400' : isDark ? 'bg-slate-700/50' : 'bg-slate-200'}`} />
            ))}
          </div>
          <span className={`text-xs font-semibold ${isDark ? 'text-white' : 'text-slate-700'}`}>{todayTasks}</span>
        </div>
      </div>
    </div>
  );
};

const FloatingLOCContent = ({ theme, isActive }: { theme: ThemeMode; isActive: boolean }) => {
  const isDark = theme === 'dark';
  const [deltaData, setDeltaData] = useState({
    added: 0,
    removed: 0,
  });
  const [totals, setTotals] = useState({
    total: locTotalAccumulator.total,
    sessionAdded: locTotalAccumulator.added,
    sessionRemoved: locTotalAccumulator.removed,
  });

  const byLanguage = [
    { lang: 'TypeScript', color: 'bg-blue-500', percent: 50 },
    { lang: 'Python', color: 'bg-yellow-500', percent: 33 },
    { lang: 'CSS', color: 'bg-pink-500', percent: 12 },
    { lang: 'Other', color: 'bg-slate-500', percent: 5 },
  ];

  // Simulate code changes while this card is active
  useEffect(() => {
    if (!isActive) {
      // When becoming inactive, accumulate the delta to totals
      locTotalAccumulator.total += deltaData.added - deltaData.removed;
      locTotalAccumulator.added += deltaData.added;
      locTotalAccumulator.removed += deltaData.removed;
      return;
    }

    // Reset delta when becoming active - use setTimeout to avoid synchronous setState in effect
    const resetTimer = setTimeout(() => {
      setDeltaData({ added: 0, removed: 0 });
      setTotals({
        total: locTotalAccumulator.total,
        sessionAdded: locTotalAccumulator.added,
        sessionRemoved: locTotalAccumulator.removed,
      });
    }, 0);

    const interval = setInterval(() => {
      const newAdded = Math.floor(Math.random() * 15) + 5;
      const newRemoved = Math.floor(Math.random() * 5);
      setDeltaData(prev => ({
        added: prev.added + newAdded,
        removed: prev.removed + newRemoved,
      }));
    }, 1500);

    return () => {
      clearTimeout(resetTimer);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isActive]);

  const currentTotal = totals.total + deltaData.added - deltaData.removed;
  const animatedTotal = useAnimatedCounter(currentTotal, 800);

  return (
    <div className="h-full flex flex-col justify-between">
      {/* Total lines */}
      <div className="flex items-center justify-between">
        <div>
          <span className={`text-[10px] block ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Total Lines</span>
          <span className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-700'}`}>{animatedTotal.toLocaleString()}</span>
        </div>
        <div className={`px-2.5 py-1 rounded-lg ${isDark ? 'bg-emerald-500/20' : 'bg-emerald-100'}`}>
          <span className={`text-[10px] block ${isDark ? 'text-emerald-400/70' : 'text-emerald-500'}`}>Session</span>
          <span className={`text-base font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>
            +{(totals.sessionAdded + deltaData.added).toLocaleString()}
          </span>
        </div>
      </div>

      {/* Delta since last rotation */}
      <div className={`p-2 rounded-lg ${isDark ? 'bg-slate-700/40' : 'bg-slate-100'}`}>
        <span className={`text-[10px] block mb-1.5 ${isDark ? 'text-teal-400' : 'text-slate-500'}`}>Changes This View</span>
        <div className="grid grid-cols-2 gap-2">
          <div className={`p-1.5 rounded text-center ${isDark ? 'bg-emerald-500/15' : 'bg-emerald-100'}`}>
            <span className={`text-lg font-bold ${isDark ? 'text-emerald-400' : 'text-emerald-600'}`}>+{deltaData.added}</span>
            <span className={`text-[10px] block ${isDark ? 'text-emerald-400/70' : 'text-emerald-500'}`}>added</span>
          </div>
          <div className={`p-1.5 rounded text-center ${isDark ? 'bg-red-500/15' : 'bg-red-100'}`}>
            <span className={`text-lg font-bold ${isDark ? 'text-red-400' : 'text-red-600'}`}>-{deltaData.removed}</span>
            <span className={`text-[10px] block ${isDark ? 'text-red-400/70' : 'text-red-500'}`}>removed</span>
          </div>
        </div>
      </div>

      {/* Language breakdown */}
      <div>
        <div className="flex h-1.5 rounded-full overflow-hidden gap-0.5">
          {byLanguage.map((lang) => (
            <div key={lang.lang} className={`${lang.color} rounded-sm`} style={{ width: `${lang.percent}%` }} title={`${lang.lang}: ${lang.percent}%`} />
          ))}
        </div>
        <div className="flex justify-between mt-1">
          {byLanguage.slice(0, 3).map((lang) => (
            <span key={lang.lang} className={`text-[10px] ${isDark ? 'text-slate-500' : 'text-slate-400'}`}>
              {lang.lang} {lang.percent}%
            </span>
          ))}
        </div>
      </div>
    </div>
  );
};

// ============ PROJECTS VIEW ============

// Helper to extract gate number from gate type string
const extractGateNumber = (gateType: string | undefined): number => {
  if (!gateType) return 1;
  const match = gateType.match(/G(\d+)/i);
  return match ? parseInt(match[1], 10) : 1;
};

// Helper to calculate progress from gate number
const calculateProgress = (gateNumber: number): number => {
  return Math.round((gateNumber / 9) * 100);
};

// Helper to format time ago
const formatTimeAgo = (date: Date | string): string => {
  const now = new Date();
  const then = new Date(date);
  const diffMs = now.getTime() - then.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffDays > 0) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  if (diffHours > 0) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffMins > 0) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  return 'Just now';
};

const ProjectsView = ({ theme, onSelectProject }: { theme: ThemeMode; onSelectProject: (id: string, name: string) => void }) => {
  const isDark = theme === 'dark';
  const [selectedProject, setSelectedProject] = useState<string | null>(null);

  // Fetch real projects from API
  const { data: apiProjects, isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  // Transform API projects to the format expected by the UI
  const projects = useMemo(() => {
    if (!apiProjects) return [];

    return apiProjects.map(project => {
      const gateNumber = extractGateNumber(project.state?.currentGate);
      const progress = project.state?.percentComplete ?? calculateProgress(gateNumber);
      const isCompleted = gateNumber >= 9 || project.state?.currentGate === 'PROJECT_COMPLETE';

      return {
        id: project.id,
        name: project.name,
        status: isCompleted ? 'completed' : 'active',
        gate: gateNumber,
        progress,
        description: `${project.type || 'traditional'} project`, // Project type as description fallback
        tech: [], // Could be extracted from architecture document later
        lastUpdated: formatTimeAgo(project.updatedAt),
        agents: 0, // Could be calculated from active tasks
        filesGenerated: 0, // Could be calculated from documents
        linesOfCode: 0, // Could be calculated from code analysis
      };
    });
  }, [apiProjects]);

  // Auto-select first project when loaded (using useMemo to derive initial value)
  const effectiveSelectedProject = selectedProject || (projects.length > 0 ? projects[0].id : null);

  // Sync the state if we're using a derived value
  useEffect(() => {
    if (effectiveSelectedProject && !selectedProject) {
      // Defer state update to avoid cascading renders
      const timeoutId = setTimeout(() => {
        setSelectedProject(effectiveSelectedProject);
      }, 0);
      return () => clearTimeout(timeoutId);
    }
  }, [effectiveSelectedProject, selectedProject]);

  // User lifetime stats
  const userData = {
    level: 12,
    title: 'Senior Builder',
    xp: 8450,
    xpToNext: 10000,
    totalProjects: 7,
    projectsCompleted: 4,
    totalLOC: 89420,
    totalGatesPassed: 38,
  };

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

  const xpProgress = (userData.xp / userData.xpToNext) * 100;
  const unlockedCount = achievements.filter(a => a.unlocked).length;
  const selectedProjectData = projects.find(p => p.id === selectedProject);

  const getLevelInfo = (level: number) => {
    if (level >= 20) return { title: 'Legendary', color: 'text-amber-400', bg: 'from-amber-500/20 to-orange-500/20' };
    if (level >= 15) return { title: 'Master Builder', color: 'text-amber-400', bg: 'from-amber-500/20 to-orange-500/20' };
    if (level >= 10) return { title: 'Senior Builder', color: 'text-cyan-400', bg: 'from-cyan-500/20 to-teal-500/20' };
    if (level >= 5) return { title: 'Builder', color: 'text-emerald-400', bg: 'from-emerald-500/20 to-green-500/20' };
    return { title: 'Apprentice', color: 'text-slate-400', bg: 'from-slate-500/20 to-slate-600/20' };
  };

  const levelInfo = getLevelInfo(userData.level);

  const handleProjectSelect = (projectId: string) => {
    setSelectedProject(projectId);
    const project = projects.find(p => p.id === projectId);
    if (project) {
      onSelectProject(project.id, project.name);
    }
  };

  return (
    <div className="h-full flex flex-col p-4 gap-4">
      {/* Top Section - Lifetime Metrics & Achievements */}
      <div className={`rounded-xl border p-4 ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200 shadow-sm'}`}>
        <div className="flex items-center gap-6">
          {/* Level & XP */}
          <div className={`flex items-center gap-3 px-4 py-2 rounded-xl bg-gradient-to-r ${levelInfo.bg}`}>
            <div className="w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg border-2 bg-gradient-to-br from-teal-500 to-cyan-600 border-teal-400/50">
              {userData.level}
            </div>
            <div className="min-w-[120px]">
              <p className={`text-sm font-bold ${levelInfo.color}`}>{levelInfo.title}</p>
              <div className="flex items-center gap-2">
                <div className={`flex-1 h-2 rounded-full overflow-hidden ${isDark ? 'bg-slate-700/50' : 'bg-slate-200'}`}>
                  <motion.div
                    className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${xpProgress}%` }}
                    transition={{ duration: 1, delay: 0.3 }}
                  />
                </div>
                <span className={`text-xs ${isDark ? 'text-teal-300' : 'text-teal-700'}`}>{userData.xp.toLocaleString()}/{userData.xpToNext.toLocaleString()} XP</span>
              </div>
            </div>
          </div>

          {/* Lifetime Stats */}
          <div className="flex items-center gap-4">
            <div className={`px-4 py-2 rounded-lg text-center ${isDark ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
              <div className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{userData.totalProjects}</div>
              <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Projects</div>
            </div>
            <div className={`px-4 py-2 rounded-lg text-center ${isDark ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
              <div className={`text-xl font-bold ${isDark ? 'text-emerald-500' : 'text-emerald-600'}`}>{userData.projectsCompleted}</div>
              <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Shipped</div>
            </div>
            <div className={`px-4 py-2 rounded-lg text-center ${isDark ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
              <div className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{(userData.totalLOC / 1000).toFixed(0)}k</div>
              <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Lines of Code</div>
            </div>
            <div className={`px-4 py-2 rounded-lg text-center ${isDark ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
              <div className={`text-xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>{userData.totalGatesPassed}</div>
              <div className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Gates Passed</div>
            </div>
          </div>

          {/* Achievements */}
          <div className="flex-1">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Achievements</span>
              <span className="text-xs text-amber-300">{unlockedCount}/{achievements.length}</span>
            </div>
            <div className="flex gap-1">
              {achievements.map((achievement) => (
                <motion.div
                  key={achievement.id}
                  whileHover={{ scale: 1.15 }}
                  className={`w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-all ${
                    achievement.unlocked
                      ? 'bg-gradient-to-br from-amber-500/30 to-yellow-500/30'
                      : `${isDark ? 'bg-slate-800/50' : 'bg-slate-400/40'} opacity-40`
                  }`}
                  title={`${achievement.name}: ${achievement.desc}`}
                >
                  <span className={`text-lg ${achievement.unlocked ? '' : 'grayscale'}`}>
                    {achievement.icon}
                  </span>
                </motion.div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Project List + Description */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left - Project List */}
        <div className={`w-80 flex-shrink-0 rounded-xl border ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200 shadow-sm'} flex flex-col`}>
          <div className={`p-4 border-b flex items-center justify-between ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
            <h2 className={`text-lg font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>Projects</h2>
            <button className="px-3 py-1.5 text-white rounded-lg text-sm font-medium transition-colors bg-teal-600 hover:bg-teal-500">
              + New
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin" />
                <span className={`ml-2 text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>Loading projects...</span>
              </div>
            ) : projects.length === 0 ? (
              <div className={`text-center py-8 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <p className="text-sm">No projects yet</p>
                <p className="text-xs mt-1">Click "+ New" to create your first project</p>
              </div>
            ) : projects.map((project) => (
              <motion.div
                key={project.id}
                whileHover={{ scale: 1.01 }}
                onClick={() => handleProjectSelect(project.id)}
                className={`p-3 rounded-lg mb-2 cursor-pointer transition-all ${
                  selectedProject === project.id
                    ? isDark ? 'bg-teal-900/50 border border-teal-500/50' : 'bg-teal-50 border border-teal-300'
                    : isDark ? 'hover:bg-slate-700/50' : 'hover:bg-slate-100'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <h3 className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-slate-900'}`}>{project.name}</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    project.status === 'completed'
                      ? 'bg-emerald-500/30 text-emerald-300'
                      : 'bg-teal-500/30 text-teal-200'
                  }`}>
                    {project.status === 'completed' ? 'Shipped' : `Gate ${project.gate}/9`}
                  </span>
                </div>
                <div className={`h-1.5 rounded-full overflow-hidden ${isDark ? 'bg-slate-700' : 'bg-slate-200'}`}>
                  <div
                    className={`h-full rounded-full transition-all ${
                      project.status === 'completed' ? 'bg-emerald-500' : 'bg-teal-500'
                    }`}
                    style={{ width: `${project.progress}%` }}
                  />
                </div>
                <div className={`text-xs mt-1.5 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                  Updated {project.lastUpdated}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Right - Project Description */}
        <div className={`flex-1 rounded-xl border ${isDark ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200 shadow-sm'} flex flex-col`}>
          {selectedProjectData ? (
            <>
              <div className={`p-6 border-b ${isDark ? 'border-slate-700' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className={`text-2xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
                      {selectedProjectData.name}
                    </h2>
                    <div className="flex items-center gap-3">
                      <span className={`text-sm px-3 py-1 rounded-full ${
                        selectedProjectData.status === 'completed'
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-teal-500/20 text-teal-300'
                      }`}>
                        {selectedProjectData.status === 'completed' ? '✓ Shipped' : `Gate ${selectedProjectData.gate} of 9`}
                      </span>
                      <span className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                        Updated {selectedProjectData.lastUpdated}
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onSelectProject(selectedProjectData.id, selectedProjectData.name)}
                    className="px-4 py-2 rounded-lg font-medium transition-colors bg-teal-600 hover:bg-teal-500 text-white"
                  >
                    Open Workspace
                  </button>
                </div>
              </div>

              <div className="flex-1 p-6 overflow-y-auto">
                {/* Description */}
                <div className="mb-6">
                  <h3 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Description
                  </h3>
                  <p className={`text-base leading-relaxed ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
                    {selectedProjectData.description}
                  </p>
                </div>

                {/* Tech Stack */}
                <div className="mb-6">
                  <h3 className={`text-sm font-semibold uppercase tracking-wider mb-2 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Tech Stack
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {selectedProjectData.tech.map((tech) => (
                      <span
                        key={tech}
                        className={`px-3 py-1 rounded-full text-sm ${
                          isDark ? 'bg-slate-700 text-slate-300' : 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {tech}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Project Stats */}
                <div className="mb-6">
                  <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Project Stats
                  </h3>
                  <div className="grid grid-cols-3 gap-4">
                    <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                      <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {selectedProjectData.agents}
                      </div>
                      <div className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Active Agents</div>
                    </div>
                    <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                      <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {selectedProjectData.filesGenerated}
                      </div>
                      <div className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Files Generated</div>
                    </div>
                    <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                      <div className={`text-2xl font-bold ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        {selectedProjectData.linesOfCode.toLocaleString()}
                      </div>
                      <div className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>Lines of Code</div>
                    </div>
                  </div>
                </div>

                {/* Progress */}
                <div>
                  <h3 className={`text-sm font-semibold uppercase tracking-wider mb-3 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                    Progress
                  </h3>
                  <div className={`p-4 rounded-xl ${isDark ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
                    <div className="flex items-center justify-between mb-2">
                      <span className={`text-sm font-medium ${isDark ? 'text-white' : 'text-slate-900'}`}>
                        Overall Completion
                      </span>
                      <span className={`text-sm font-bold ${isDark ? 'text-teal-400' : 'text-teal-600'}`}>
                        {selectedProjectData.progress}%
                      </span>
                    </div>
                    <div className={`h-3 rounded-full overflow-hidden ${isDark ? 'bg-slate-600' : 'bg-slate-200'}`}>
                      <motion.div
                        className={`h-full rounded-full ${
                          selectedProjectData.status === 'completed' ? 'bg-emerald-500' : 'bg-teal-500'
                        }`}
                        initial={{ width: 0 }}
                        animate={{ width: `${selectedProjectData.progress}%` }}
                        transition={{ duration: 0.8 }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <p className={`text-lg ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
                Select a project to view details
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ============ MAIN DASHBOARD ============

export default function UnifiedDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const [showSplash, setShowSplash] = useState(false);
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('docs');
  const [mainView, setMainView] = useState<MainView>('dashboard');
  const themeFromStore = useThemeStore((state) => state.theme);
  const user = useAuthStore((state) => state.user);
  const { activeProject, setActiveProject, updateProjectState, clearActiveProject } = useProjectStore();
  const theme: ThemeMode = themeFromStore === 'dark' ? 'dark' : 'light';
  const [showGitHub, setShowGitHub] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [autoSelectDocumentKey, setAutoSelectDocumentKey] = useState<string | null>(null);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [currentProjectName, setCurrentProjectName] = useState<string | null>(null);
  const [isNewProject, setIsNewProject] = useState(false);
  const [showResumePrompt, setShowResumePrompt] = useState(false);
  const isDark = theme === 'dark';

  // Agent streaming state
  const [activeAgent, setActiveAgent] = useState<{ agentType: string; taskDescription?: string } | null>(null);
  const [streamingChunks, setStreamingChunks] = useState<string[]>([]);
  const [isAgentWorking, setIsAgentWorking] = useState(false);
  const [isStreamingDocument, setIsStreamingDocument] = useState(false);

  // Document-producing agents that work in background (don't stream reasoning to chat)
  // These agents create documents that appear in the Docs tab for review
  const BACKGROUND_AGENTS = [
    'PRODUCT_MANAGER',
    'ARCHITECT',
    'UX_UI_DESIGNER',
    'FRONTEND_DEVELOPER',
    'BACKEND_DEVELOPER',
    'DATABASE_SPECIALIST',
    'DEVOPS_ENGINEER',
    'QA_ENGINEER',
    'SECURITY_SPECIALIST',
    'TECHNICAL_WRITER',
    'ML_ENGINEER',
    'DATA_ENGINEER',
    'ORCHESTRATOR',
  ];

  // Check if an agent works in background (produces documents, doesn't stream to chat)
  const isBackgroundAgent = useCallback((agentType: string): boolean => {
    return BACKGROUND_AGENTS.includes(agentType);
  }, []);

  // WebSocket event handlers
  const handleAgentStarted = useCallback((event: { agentType?: string; taskDescription?: string }) => {
    console.log('Agent started:', event);
    setActiveAgent({
      agentType: event.agentType || 'UNKNOWN',
      taskDescription: event.taskDescription,
    });
    setStreamingChunks([]);
    setIsStreamingDocument(false); // Reset document detection for new agent
    setIsAgentWorking(true);
  }, []);

  const handleAgentChunk = useCallback((event: { chunk?: string; agentType?: string }) => {
    // Only accumulate chunks for conversational agents (like PM_ONBOARDING)
    // Background/document agents work silently and save to Docs tab
    if (event.chunk && activeAgent && !isBackgroundAgent(activeAgent.agentType)) {
      // Check if this chunk starts a document (intake, PRD, etc.)
      // Documents start with markdown headers like "# Project Intake:" or code fences
      const combinedContent = streamingChunks.join('') + event.chunk;
      const isDocumentContent =
        combinedContent.includes('# Project Intake') ||
        combinedContent.includes('```markdown\n# Project Intake') ||
        combinedContent.includes('## Discovery Answers') ||
        (combinedContent.includes('## Project Description') && combinedContent.includes('### Existing Code'));

      if (isDocumentContent) {
        // Stop streaming - document will appear in Docs tab
        setIsStreamingDocument(true);
        setStreamingChunks([]); // Clear any accumulated chunks
        return;
      }

      // Don't accumulate if we've already detected document content
      if (!isStreamingDocument) {
        setStreamingChunks(prev => [...prev, event.chunk!]);
      }
    }
  }, [activeAgent, isBackgroundAgent, streamingChunks, isStreamingDocument]);

  const handleAgentCompleted = useCallback((event: { agentType?: string; result?: unknown }) => {
    console.log('Agent completed:', event);
    setIsAgentWorking(false);

    // Refresh documents when an agent completes (it may have created documents)
    const projectId = currentProjectId || searchParams.get('project');
    if (projectId) {
      console.log('Agent completed - refreshing documents for project:', projectId);
      queryClient.invalidateQueries({ queryKey: ['documents', projectId] });
    }

    // Keep the agent visible briefly to show completion
    setTimeout(() => {
      setActiveAgent(null);
      setStreamingChunks([]);
      setIsStreamingDocument(false);
      // Gate approvals happen via chat conversation, not modal popup
    }, 2000);
  }, [currentProjectId, searchParams, queryClient]);

  const handleAgentFailed = useCallback((event: { error?: string }) => {
    console.error('Agent failed:', event);
    setIsAgentWorking(false);
    setActiveAgent(null);
    setStreamingChunks([]);
    setIsStreamingDocument(false);
  }, []);

  const handleGateReady = useCallback((event: {
    gateId: string;
    gateType: string;
    artifacts: Array<{ type: string; id?: string; title: string; content?: string }>;
    timestamp: string;
  }) => {
    console.log('Gate ready for approval:', event);

    // Extract gate number from type (e.g., "G1_PENDING" -> 1)
    const gateNumber = parseInt(event.gateType.replace(/[^\d]/g, '')) || 1;

    // Auto-switch to docs tab and select relevant document
    setActiveTab('docs');
    setAutoSelectDocumentKey(getDocumentKeyForGate(gateNumber));
  }, []);

  const handleDocumentCreated = useCallback((event: { document?: { id: string; title?: string } }) => {
    console.log('Document created event received:', event, 'currentProjectId:', currentProjectId);
    // Invalidate documents and journey queries to refetch
    // Use both currentProjectId and urlProjectId to ensure we catch it
    const projectId = currentProjectId || searchParams.get('project');
    if (projectId) {
      console.log('Invalidating documents and journey queries for project:', projectId);
      queryClient.invalidateQueries({ queryKey: ['documents', projectId] });
      queryClient.invalidateQueries({ queryKey: ['journey', projectId] });
    }
  }, [currentProjectId, queryClient, searchParams]);

  // Connect to WebSocket when we have a project
  useWebSocket(currentProjectId || undefined, {
    onAgentStarted: handleAgentStarted,
    onAgentChunk: handleAgentChunk,
    onAgentCompleted: handleAgentCompleted,
    onAgentFailed: handleAgentFailed,
    onGateReady: handleGateReady,
    onDocumentCreated: handleDocumentCreated,
  });

  // Handle URL parameters for project selection
  const urlProjectId = searchParams.get('project');
  const urlIsNew = searchParams.get('new') === 'true';

  // Fetch the specific project when we have a projectId
  const { data: currentProject } = useQuery({
    queryKey: ['project', urlProjectId],
    queryFn: () => urlProjectId ? projectsApi.get(urlProjectId) : null,
    enabled: !!urlProjectId,
  });

  // Effect to handle URL-based project selection and resume prompt
  useEffect(() => {
    if (urlProjectId && urlProjectId !== currentProjectId) {
      // URL has a project - use it
      const timer = setTimeout(() => {
        setCurrentProjectId(urlProjectId);
        setIsNewProject(urlIsNew);
        setShowResumePrompt(false);

        // Clear the URL params after reading them
        if (urlIsNew) {
          setSearchParams({}, { replace: true });
        }
      }, 0);
      return () => clearTimeout(timer);
    } else if (!urlProjectId && !currentProjectId && activeProject) {
      // No URL project, no current project, but we have a saved one - show resume prompt
      setShowResumePrompt(true);
    }
  }, [urlProjectId, urlIsNew, currentProjectId, activeProject, setSearchParams]);

  // Update project name when project data loads and save to project store
  useEffect(() => {
    if (currentProject?.name && currentProjectId) {
      // Use setTimeout to avoid synchronous setState in effect
      const timer = setTimeout(() => {
        setCurrentProjectName(currentProject.name);
        // Save active project to store for resume functionality
        setActiveProject({
          id: currentProjectId,
          name: currentProject.name,
          type: currentProject.type,
          state: currentProject.state ? {
            currentPhase: currentProject.state.currentPhase,
            currentGate: currentProject.state.currentGate,
            percentComplete: currentProject.state.percentComplete,
          } : undefined,
          lastAccessedAt: new Date().toISOString(),
          createdAt: currentProject.createdAt ? new Date(currentProject.createdAt).toISOString() : undefined,
        });
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [currentProject, currentProjectId, setActiveProject]);

  // Sync project progress updates to the store
  const { data: projectProgress } = useQuery({
    queryKey: ['projectProgress', currentProjectId],
    queryFn: () => currentProjectId ? metricsApi.getProjectProgress(currentProjectId) : null,
    enabled: !!currentProjectId,
    refetchInterval: 10000, // Refetch every 10 seconds
  });

  useEffect(() => {
    if (projectProgress && currentProjectId) {
      updateProjectState({
        currentPhase: projectProgress.currentPhase,
        currentGate: String(projectProgress.currentGate),
        percentComplete: projectProgress.percentComplete,
      });
    }
  }, [projectProgress, currentProjectId, updateProjectState]);

  // Handlers for resume prompt
  const [isResuming, setIsResuming] = useState(false);
  const [resumeError, setResumeError] = useState<string | null>(null);

  const handleResumeProject = async () => {
    if (!activeProject) return;

    setIsResuming(true);
    setResumeError(null);

    try {
      // Verify project still exists in backend
      const project = await projectsApi.get(activeProject.id);
      if (project) {
        setCurrentProjectId(activeProject.id);
        setCurrentProjectName(project.name);
        setShowResumePrompt(false);
        // Update store with fresh data
        setActiveProject({
          ...activeProject,
          name: project.name,
          type: project.type,
          state: project.state ? {
            currentPhase: project.state.currentPhase,
            currentGate: project.state.currentGate,
            percentComplete: project.state.percentComplete,
          } : activeProject.state,
          lastAccessedAt: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Failed to resume project:', error);
      setResumeError('Project not found. It may have been deleted.');
      // Clear invalid project from store
      clearActiveProject();
    } finally {
      setIsResuming(false);
    }
  };

  const handleStartFresh = () => {
    clearActiveProject();
    setShowResumePrompt(false);
    // Navigate to home to start a new project
    window.location.href = '/home';
  };

  if (showSplash) {
    return <SplashPage onGetStarted={() => setShowSplash(false)} />;
  }

  // Show resume prompt when returning to workspace without a project in URL
  if (showResumePrompt && activeProject) {
    return (
      <div className={`min-h-screen flex items-center justify-center ${isDark ? 'bg-slate-900' : 'bg-slate-50'}`}>
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className={`max-w-md w-full mx-4 p-6 rounded-2xl shadow-xl ${isDark ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'}`}
        >
          <div className="text-center mb-6">
            <div className={`w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center ${isDark ? 'bg-teal-500/20' : 'bg-teal-100'}`}>
              <FolderIcon className={`w-8 h-8 ${isDark ? 'text-teal-400' : 'text-teal-600'}`} />
            </div>
            <h2 className={`text-xl font-bold mb-2 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              Welcome Back!
            </h2>
            <p className={`text-sm ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Would you like to continue working on your project?
            </p>
          </div>

          <div className={`p-4 rounded-xl mb-6 ${isDark ? 'bg-slate-700/50' : 'bg-slate-100'}`}>
            <p className={`text-sm font-medium mb-2 ${isDark ? 'text-slate-300' : 'text-slate-700'}`}>
              {activeProject.name}
            </p>
            {activeProject.state && (
              <div className={`flex items-center gap-3 text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                <span className="flex items-center gap-1">
                  <span className={`w-2 h-2 rounded-full ${
                    activeProject.state.currentPhase === 'ship' ? 'bg-emerald-500' :
                    activeProject.state.currentPhase === 'dev' ? 'bg-amber-500' : 'bg-cyan-500'
                  }`} />
                  {activeProject.state.currentPhase === 'ship' ? 'Ship' :
                   activeProject.state.currentPhase === 'dev' ? 'Development' : 'Planning'}
                </span>
                <span>•</span>
                <span>Gate {activeProject.state.currentGate?.replace(/[^\d]/g, '') || '0'}</span>
                <span>•</span>
                <span>{activeProject.state.percentComplete || 0}% complete</span>
              </div>
            )}
          </div>

          {resumeError && (
            <div className={`p-3 rounded-lg mb-4 text-sm ${isDark ? 'bg-red-500/20 text-red-300' : 'bg-red-100 text-red-700'}`}>
              {resumeError}
            </div>
          )}

          <div className="flex gap-3">
            <button
              onClick={handleStartFresh}
              disabled={isResuming}
              className={`flex-1 px-4 py-3 rounded-xl text-sm font-medium transition-colors ${
                isDark
                  ? 'bg-slate-700 hover:bg-slate-600 text-slate-300 disabled:opacity-50'
                  : 'bg-slate-200 hover:bg-slate-300 text-slate-700 disabled:opacity-50'
              }`}
            >
              Start New Project
            </button>
            <button
              onClick={handleResumeProject}
              disabled={isResuming}
              className="flex-1 px-4 py-3 rounded-xl text-sm font-medium bg-teal-500 hover:bg-teal-600 text-white transition-colors disabled:opacity-50"
            >
              {isResuming ? 'Loading...' : 'Resume Project'}
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  const handleGateApprove = async () => {
    if (!currentProjectId) return;

    try {
      // Get current gate and approve it
      const currentGate = await gatesApi.getCurrent(currentProjectId);
      if (currentGate) {
        // 1. Approve the gate via gates API
        await gatesApi.approve(currentGate.id, { approved: true });

        // 2. Trigger workflow coordinator to handle post-approval tasks
        // This decomposes tasks (for G1), creates documents, and starts next agent
        try {
          const gateApprovedResult = await fetch(`/api/agents/workflow/gate-approved/${currentProjectId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ gateType: currentGate.gateType }),
          });
          const result = await gateApprovedResult.json();
          console.log('Gate approval processed:', result);
        } catch (workflowError) {
          console.log('Workflow continuation error:', workflowError);
          // Fallback to execute-next if gate-approved fails
          await fetch(`/api/agents/workflow/execute-next/${currentProjectId}`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${localStorage.getItem('accessToken')}`,
              'Content-Type': 'application/json',
            },
          });
        }
      }
      // Invalidate journey data to reflect gate completion
      queryClient.invalidateQueries({ queryKey: ['journey', currentProjectId] });
      queryClient.invalidateQueries({ queryKey: ['documents', currentProjectId] });
    } catch (error) {
      console.error('Failed to approve gate:', error);
    }
  };

  // Helper to get document key for a gate number
  const getDocumentKeyForGate = (gateNumber: number): string => {
    // G1 = intake document
    if (gateNumber <= 1) return 'intake';
    // Other gates use first document from that gate
    return `g${gateNumber}-0`;
  };

  const handleSelectProject = (id: string, name: string) => {
    setCurrentProjectId(id);
    setCurrentProjectName(name);
    setMainView('dashboard');
  };

  return (
    <div className={`h-screen flex flex-col overflow-hidden ${
      isDark
        ? 'bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 text-white'
        : 'bg-slate-100 text-slate-900'
    }`}>
      {/* Popups */}
      <GitHubPopup isOpen={showGitHub} onClose={() => setShowGitHub(false)} theme={theme} projectId={currentProjectId} />
      <SettingsModal isOpen={showSettings} onClose={() => setShowSettings(false)} />

      {/* Header */}
      <header className={`relative h-14 border-b flex items-center px-4 z-10 ${
        isDark ? 'border-slate-700/50 bg-slate-900/80' : 'border-teal-700 bg-teal-600'
      } backdrop-blur-xl`}>
        {/* Left Section - Logo & Navigation */}
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-xl flex items-center justify-center overflow-hidden ${isDark ? 'bg-teal-950' : 'bg-white/20'}`}>
              <img src={FuzzyLlamaLogoSvg} alt="Fuzzy Llama" className="w-7 h-7" />
            </div>
            <span className="font-bold text-sm text-white">Fuzzy Llama</span>
          </div>

          {/* Main Navigation */}
          <div className={`flex items-center gap-1 p-1 rounded-full ${isDark ? 'bg-slate-800/50' : 'bg-teal-700/50'}`}>
            <button
              onClick={() => setMainView('dashboard')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                mainView === 'dashboard'
                  ? isDark ? 'bg-teal-950 text-white' : 'bg-white text-teal-700'
                  : isDark ? 'text-teal-300 hover:text-white' : 'text-teal-100 hover:text-white'
              }`}
            >
              Dashboard
            </button>
            <button
              onClick={() => setMainView('projects')}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                mainView === 'projects'
                  ? isDark ? 'bg-teal-950 text-white' : 'bg-white text-teal-700'
                  : isDark ? 'text-teal-300 hover:text-white' : 'text-teal-100 hover:text-white'
              }`}
            >
              Projects
            </button>
          </div>
        </div>

        {/* Center Section - Project Name */}
        <div className="flex-1 flex justify-center">
          {mainView === 'dashboard' && (currentProjectName || activeProject?.name) && (
            <div className="flex items-center gap-2">
              <span className={`text-xs font-medium ${isDark ? 'text-teal-400' : 'text-teal-200'}`}>Project:</span>
              <span className="text-sm font-semibold text-white">{currentProjectName || activeProject?.name}</span>
            </div>
          )}
        </div>

        {/* Right Section - Actions */}
        <div className="flex items-center gap-2">
          {/* GitHub Button */}
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
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white ${isDark ? 'bg-teal-950' : 'bg-teal-700'}`}
          >
            {user?.name?.charAt(0).toUpperCase() || 'U'}
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
            <OrchestratorChat
              theme={theme}
              isNewProject={isNewProject}
              projectName={currentProjectName || undefined}
              projectId={currentProjectId}
              activeAgent={activeAgent}
              streamingChunks={streamingChunks}
              isAgentWorking={isAgentWorking}
              onApproveGate={handleGateApprove}
              onViewDocument={() => {
                setActiveTab('docs');
              }}
              onIntakeComplete={async (answers) => {
                console.log('Intake complete:', answers);
                setIsNewProject(false);

                // Submit intake answers to backend
                if (currentProjectId) {
                  try {
                    const intakeAnswers = Object.entries(answers).map(([questionId, answer]) => ({
                      questionId,
                      answer,
                    }));
                    const result = await workflowApi.submitIntake({
                      projectId: currentProjectId,
                      answers: intakeAnswers,
                    });
                    console.log('Intake submitted successfully:', result);
                  } catch (error) {
                    console.error('Failed to submit intake:', error);
                  }
                }
              }}
            />
          </div>

          {/* Center Panel - Now takes full remaining width */}
          <div className="flex-1 min-w-[380px]">
            <WorkspacePanel
              activeTab={activeTab}
              onTabChange={setActiveTab}
              theme={theme}
              projectId={currentProjectId}
              autoSelectDocumentKey={autoSelectDocumentKey}
            />
          </div>

          {/* Floating Metrics Card */}
          <FloatingMetricsCard
            theme={theme}
            projectId={currentProjectId}
          />
        </div>
      )}
    </div>
  );
}
