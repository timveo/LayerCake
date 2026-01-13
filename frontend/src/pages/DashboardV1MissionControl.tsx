import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import {
  RocketLaunchIcon,
  ShieldCheckIcon,
  CpuChipIcon,
  SignalIcon,
  BoltIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  ClockIcon,
  SparklesIcon,
  CommandLineIcon,
  DocumentTextIcon,
  BeakerIcon
} from '@heroicons/react/24/outline';
import { useState, useEffect } from 'react';
import { projectsApi } from '../api/projects';
import { tasksApi } from '../api/tasks';
import { gatesApi } from '../api/gates';

// Mission Control Dashboard - NASA-inspired command center
// "Houston, we have liftoff" energy - confidence through control

interface SystemStatus {
  name: string;
  status: 'nominal' | 'warning' | 'critical' | 'standby';
  value: number;
  unit: string;
  icon: React.ElementType;
}

interface MissionEvent {
  id: string;
  time: string;
  event: string;
  type: 'success' | 'info' | 'warning' | 'decision';
  detail?: string;
}

const StatusIndicator = ({ status }: { status: 'nominal' | 'warning' | 'critical' | 'standby' }) => {
  const colors = {
    nominal: 'bg-emerald-500 shadow-emerald-500/50',
    warning: 'bg-amber-500 shadow-amber-500/50',
    critical: 'bg-red-500 shadow-red-500/50 animate-pulse',
    standby: 'bg-slate-500 shadow-slate-500/50'
  };

  return (
    <span className={`inline-block w-2.5 h-2.5 rounded-full ${colors[status]} shadow-lg`} />
  );
};

const SystemPanel = ({ system }: { system: SystemStatus }) => {
  const Icon = system.icon;
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      className="bg-dark-elevated/60 backdrop-blur border border-dark-border/50 rounded-lg p-4 hover:border-primary-500/30 transition-all"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4 text-primary-400" />
          <span className="text-xs font-mono uppercase tracking-wider text-dark-text-muted">{system.name}</span>
        </div>
        <StatusIndicator status={system.status} />
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-mono font-bold text-dark-text-primary">{system.value}</span>
        <span className="text-xs text-dark-text-muted">{system.unit}</span>
      </div>
    </motion.div>
  );
};

const MissionEventLog = ({ events }: { events: MissionEvent[] }) => {
  const typeStyles = {
    success: 'border-l-emerald-500 bg-emerald-500/5',
    info: 'border-l-primary-500 bg-primary-500/5',
    warning: 'border-l-amber-500 bg-amber-500/5',
    decision: 'border-l-violet-500 bg-violet-500/5'
  };

  const typeIcons = {
    success: CheckCircleIcon,
    info: CommandLineIcon,
    warning: ExclamationTriangleIcon,
    decision: SparklesIcon
  };

  return (
    <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin">
      <AnimatePresence mode="popLayout">
        {events.map((event, index) => {
          const Icon = typeIcons[event.type];
          return (
            <motion.div
              key={event.id}
              initial={{ opacity: 0, x: -20, height: 0 }}
              animate={{ opacity: 1, x: 0, height: 'auto' }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ delay: index * 0.05 }}
              className={`border-l-2 ${typeStyles[event.type]} rounded-r-lg p-3`}
            >
              <div className="flex items-start gap-3">
                <Icon className="w-4 h-4 mt-0.5 text-dark-text-muted flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-mono text-xs text-dark-text-muted">{event.time}</span>
                  </div>
                  <p className="text-sm text-dark-text-primary">{event.event}</p>
                  {event.detail && (
                    <p className="text-xs text-dark-text-muted mt-1 font-mono">{event.detail}</p>
                  )}
                </div>
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
};

const GatePipeline = ({ gates, currentGate }: { gates: string[]; currentGate: number }) => {
  return (
    <div className="flex items-center gap-1 overflow-x-auto pb-2">
      {gates.map((gate, index) => {
        const isPast = index < currentGate;
        const isCurrent = index === currentGate;
        const isFuture = index > currentGate;

        return (
          <div key={gate} className="flex items-center">
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: index * 0.1 }}
              className={`
                relative flex items-center justify-center w-10 h-10 rounded-lg font-mono text-xs font-bold
                transition-all duration-300
                ${isPast ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' : ''}
                ${isCurrent ? 'bg-primary-500/30 text-primary-300 border-2 border-primary-400 shadow-lg shadow-primary-500/20 scale-110' : ''}
                ${isFuture ? 'bg-dark-border/30 text-dark-text-muted border border-dark-border/50' : ''}
              `}
            >
              {isPast && <CheckCircleIcon className="w-5 h-5" />}
              {!isPast && gate}
              {isCurrent && (
                <motion.div
                  className="absolute inset-0 rounded-lg border-2 border-primary-400"
                  animate={{ opacity: [0.5, 1, 0.5] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
              )}
            </motion.div>
            {index < gates.length - 1 && (
              <div className={`w-4 h-0.5 ${isPast ? 'bg-emerald-500/50' : 'bg-dark-border/30'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
};

const ConfidenceGauge = ({ value, label }: { value: number; label: string }) => {
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (value / 100) * circumference;

  const getColor = (v: number) => {
    if (v >= 80) return { stroke: '#10b981', text: 'text-emerald-400', glow: 'drop-shadow-[0_0_10px_rgba(16,185,129,0.5)]' };
    if (v >= 60) return { stroke: '#14b8a6', text: 'text-primary-400', glow: 'drop-shadow-[0_0_10px_rgba(20,184,166,0.5)]' };
    if (v >= 40) return { stroke: '#f59e0b', text: 'text-amber-400', glow: 'drop-shadow-[0_0_10px_rgba(245,158,11,0.5)]' };
    return { stroke: '#ef4444', text: 'text-red-400', glow: 'drop-shadow-[0_0_10px_rgba(239,68,68,0.5)]' };
  };

  const colors = getColor(value);

  return (
    <div className="flex flex-col items-center">
      <div className={`relative ${colors.glow}`}>
        <svg className="w-28 h-28 transform -rotate-90">
          <circle
            cx="56"
            cy="56"
            r="45"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-dark-border/30"
          />
          <motion.circle
            cx="56"
            cy="56"
            r="45"
            fill="none"
            stroke={colors.stroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 1.5, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className={`text-2xl font-mono font-bold ${colors.text}`}>{value}%</span>
        </div>
      </div>
      <span className="text-xs text-dark-text-muted mt-2 uppercase tracking-wider">{label}</span>
    </div>
  );
};

const TeachingMoment = ({ title, content, type }: { title: string; content: string; type: 'tip' | 'why' | 'learn' }) => {
  const styles = {
    tip: { icon: BoltIcon, bg: 'bg-amber-500/10', border: 'border-amber-500/30', accent: 'text-amber-400' },
    why: { icon: SparklesIcon, bg: 'bg-violet-500/10', border: 'border-violet-500/30', accent: 'text-violet-400' },
    learn: { icon: BeakerIcon, bg: 'bg-primary-500/10', border: 'border-primary-500/30', accent: 'text-primary-400' }
  };

  const style = styles[type];
  const Icon = style.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`${style.bg} border ${style.border} rounded-lg p-4`}
    >
      <div className="flex items-start gap-3">
        <Icon className={`w-5 h-5 ${style.accent} flex-shrink-0 mt-0.5`} />
        <div>
          <h4 className={`text-sm font-semibold ${style.accent} mb-1`}>{title}</h4>
          <p className="text-sm text-dark-text-secondary leading-relaxed">{content}</p>
        </div>
      </div>
    </motion.div>
  );
};

export default function DashboardV1MissionControl() {
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const { data: projects } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list()
  });

  // Get first project ID for stats queries
  const projectId = projects?.[0]?.id;

  const { data: taskStats } = useQuery({
    queryKey: ['taskStats', projectId],
    queryFn: () => tasksApi.getStats(projectId!),
    enabled: !!projectId
  });

  const { data: gateStats } = useQuery({
    queryKey: ['gateStats', projectId],
    queryFn: () => gatesApi.getStats(projectId!),
    enabled: !!projectId
  });

  // Mock data for demonstration - would come from real API
  const systems: SystemStatus[] = [
    { name: 'Code Quality', status: 'nominal', value: 94, unit: 'score', icon: ShieldCheckIcon },
    { name: 'Test Coverage', status: 'nominal', value: 87, unit: '%', icon: BeakerIcon },
    { name: 'Build Health', status: 'nominal', value: 100, unit: '%', icon: CpuChipIcon },
    { name: 'API Latency', status: 'warning', value: 245, unit: 'ms', icon: SignalIcon },
  ];

  const missionEvents: MissionEvent[] = [
    { id: '1', time: 'T+02:34:12', event: 'Authentication module tests passing', type: 'success', detail: '24/24 tests green' },
    { id: '2', time: 'T+02:31:45', event: 'Chose JWT over session tokens', type: 'decision', detail: 'Better for microservices scalability' },
    { id: '3', time: 'T+02:28:03', event: 'API rate limiting implemented', type: 'info' },
    { id: '4', time: 'T+02:15:22', event: 'Database connection pool optimized', type: 'success' },
    { id: '5', time: 'T+02:10:00', event: 'High memory usage detected in dev', type: 'warning', detail: 'Investigating React re-renders' },
    { id: '6', time: 'T+01:45:33', event: 'WebSocket integration complete', type: 'success' },
  ];

  const gates = ['G0', 'G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'G9'];
  const currentGate = 3;

  const projectCount = projects?.length || 0;
  const completionRate = taskStats?.completionRate || 0;
  const gatesApproved = gateStats?.approved || 0;

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text-primary">
      {/* Mission Header */}
      <header className="border-b border-dark-border/50 bg-dark-surface/80 backdrop-blur sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3">
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
                  className="w-10 h-10 rounded-full bg-gradient-to-br from-primary-400 to-primary-600 flex items-center justify-center"
                >
                  <RocketLaunchIcon className="w-5 h-5 text-white" />
                </motion.div>
                <div>
                  <h1 className="text-lg font-bold tracking-tight">MISSION CONTROL</h1>
                  <p className="text-xs text-dark-text-muted font-mono">LayerCake Command Center</p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <div className="font-mono text-lg text-primary-400">
                  {currentTime.toLocaleTimeString('en-US', { hour12: false })}
                </div>
                <div className="text-xs text-dark-text-muted">
                  {currentTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                </div>
              </div>
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30">
                <StatusIndicator status="nominal" />
                <span className="text-xs font-mono text-emerald-400">ALL SYSTEMS NOMINAL</span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        {/* Mission Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          {systems.map((system) => (
            <SystemPanel key={system.name} system={system} />
          ))}
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-12 gap-6">
          {/* Left Column - Mission Progress */}
          <div className="col-span-8 space-y-6">
            {/* Gate Pipeline */}
            <div className="bg-dark-elevated/60 backdrop-blur border border-dark-border/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Mission Progress</h2>
                  <p className="text-sm text-dark-text-muted">Gate-by-gate journey to deployment</p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-mono font-bold text-primary-400">G{currentGate}</div>
                  <div className="text-xs text-dark-text-muted">Current Gate</div>
                </div>
              </div>
              <GatePipeline gates={gates} currentGate={currentGate} />

              {/* Current Phase Detail */}
              <div className="mt-6 p-4 bg-dark-bg/50 rounded-lg border border-primary-500/20">
                <div className="flex items-center gap-2 mb-2">
                  <DocumentTextIcon className="w-4 h-4 text-primary-400" />
                  <span className="text-sm font-semibold text-primary-400">G3: Architecture Review</span>
                </div>
                <p className="text-sm text-dark-text-secondary mb-3">
                  Validating system architecture decisions, reviewing component boundaries, and ensuring scalability patterns are in place.
                </p>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <CheckCircleIcon className="w-4 h-4 text-emerald-400" />
                    <span className="text-xs text-dark-text-muted">3 criteria passed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ClockIcon className="w-4 h-4 text-amber-400" />
                    <span className="text-xs text-dark-text-muted">2 pending review</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Mission Log */}
            <div className="bg-dark-elevated/60 backdrop-blur border border-dark-border/50 rounded-xl p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-semibold mb-1">Mission Log</h2>
                  <p className="text-sm text-dark-text-muted">Real-time events and decisions</p>
                </div>
                <button className="text-xs text-primary-400 hover:text-primary-300 font-mono">
                  VIEW FULL LOG →
                </button>
              </div>
              <MissionEventLog events={missionEvents} />
            </div>
          </div>

          {/* Right Column - Confidence & Teaching */}
          <div className="col-span-4 space-y-6">
            {/* Confidence Dashboard */}
            <div className="bg-dark-elevated/60 backdrop-blur border border-dark-border/50 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-6 text-center">Confidence Indicators</h2>
              <div className="grid grid-cols-2 gap-6">
                <ConfidenceGauge value={87} label="Ship Ready" />
                <ConfidenceGauge value={completionRate || 72} label="Progress" />
                <ConfidenceGauge value={94} label="Quality" />
                <ConfidenceGauge value={100} label="Security" />
              </div>
            </div>

            {/* Teaching Moments */}
            <div className="bg-dark-elevated/60 backdrop-blur border border-dark-border/50 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Learning Moments</h2>
              <div className="space-y-4">
                <TeachingMoment
                  type="why"
                  title="Why JWT over Sessions?"
                  content="For your microservices architecture, stateless JWT tokens reduce database lookups and simplify horizontal scaling."
                />
                <TeachingMoment
                  type="tip"
                  title="Pro Tip"
                  content="Consider implementing token refresh before expiry to prevent user interruption during long sessions."
                />
                <TeachingMoment
                  type="learn"
                  title="Deep Dive Available"
                  content="Your rate limiting uses a sliding window. Learn why this prevents burst attacks better than fixed windows."
                />
              </div>
            </div>

            {/* Quick Stats */}
            <div className="bg-dark-elevated/60 backdrop-blur border border-dark-border/50 rounded-xl p-6">
              <h2 className="text-lg font-semibold mb-4">Mission Stats</h2>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-sm text-dark-text-muted">Active Projects</span>
                  <span className="font-mono font-bold">{projectCount}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-dark-text-muted">Gates Approved</span>
                  <span className="font-mono font-bold text-emerald-400">{gatesApproved}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-dark-text-muted">Tasks Completed</span>
                  <span className="font-mono font-bold">{taskStats?.completed || 0}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-sm text-dark-text-muted">Agent Runs Today</span>
                  <span className="font-mono font-bold">24</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
