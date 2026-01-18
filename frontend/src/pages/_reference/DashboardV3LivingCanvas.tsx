import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion';
import {
  CubeTransparentIcon,
  CodeBracketIcon,
  ShieldCheckIcon,
  EyeIcon,
  ArrowTrendingUpIcon,
  SunIcon,
  MoonIcon,
  SparklesIcon,
  BeakerIcon,
  BoltIcon
} from '@heroicons/react/24/outline';
import { useState, useEffect, useRef } from 'react';
import { projectsApi } from '../api/projects';
import { tasksApi } from '../api/tasks';
import { gatesApi } from '../api/gates';

// Living Canvas Dashboard - Organic, breathing visualization
// "Your project is alive" energy - data as a living ecosystem

interface OrganicNode {
  id: string;
  label: string;
  category: 'core' | 'feature' | 'infrastructure' | 'quality';
  health: number; // 0-100
  connections: string[];
  activity: 'dormant' | 'active' | 'thriving';
  size: 'sm' | 'md' | 'lg';
}

interface Particle {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
}

const BreathingOrb = ({
  node,
  position,
  onClick,
  isSelected
}: {
  node: OrganicNode;
  position: { x: number; y: number };
  onClick: () => void;
  isSelected: boolean;
}) => {
  const categoryColors = {
    core: { from: 'from-primary-400', to: 'to-cyan-500', glow: 'shadow-primary-500/40' },
    feature: { from: 'from-violet-400', to: 'to-purple-500', glow: 'shadow-violet-500/40' },
    infrastructure: { from: 'from-emerald-400', to: 'to-teal-500', glow: 'shadow-emerald-500/40' },
    quality: { from: 'from-amber-400', to: 'to-orange-500', glow: 'shadow-amber-500/40' }
  };

  const activityPulse = {
    dormant: { scale: [1, 1.02, 1], duration: 4 },
    active: { scale: [1, 1.08, 1], duration: 2 },
    thriving: { scale: [1, 1.15, 1], duration: 1.5 }
  };

  const sizes = {
    sm: 'w-16 h-16',
    md: 'w-24 h-24',
    lg: 'w-32 h-32'
  };

  const colors = categoryColors[node.category];
  const pulse = activityPulse[node.activity];

  return (
    <motion.div
      className="absolute cursor-pointer"
      style={{ left: position.x, top: position.y, transform: 'translate(-50%, -50%)' }}
      initial={{ opacity: 0, scale: 0 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.1 }}
      onClick={onClick}
    >
      {/* Glow effect */}
      <motion.div
        className={`absolute inset-0 rounded-full bg-gradient-to-br ${colors.from} ${colors.to} blur-xl opacity-30`}
        animate={{ scale: pulse.scale }}
        transition={{ duration: pulse.duration, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Main orb */}
      <motion.div
        className={`
          relative ${sizes[node.size]} rounded-full
          bg-gradient-to-br ${colors.from} ${colors.to}
          flex items-center justify-center
          shadow-lg ${colors.glow}
          ${isSelected ? 'ring-4 ring-white/30' : ''}
        `}
        animate={{ scale: pulse.scale }}
        transition={{ duration: pulse.duration, repeat: Infinity, ease: "easeInOut" }}
      >
        {/* Inner content */}
        <div className="text-center text-white">
          <div className="text-xs font-bold opacity-90">{node.health}%</div>
        </div>

        {/* Activity indicator */}
        {node.activity === 'thriving' && (
          <motion.div
            className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-400"
            animate={{ scale: [1, 1.3, 1], opacity: [1, 0.7, 1] }}
            transition={{ duration: 1, repeat: Infinity }}
          />
        )}
      </motion.div>

      {/* Label */}
      <div className="absolute -bottom-6 left-1/2 transform -translate-x-1/2 whitespace-nowrap">
        <span className="text-xs font-medium text-dark-text-secondary">{node.label}</span>
      </div>
    </motion.div>
  );
};

const ConnectionLine = ({
  from,
  to,
  active
}: {
  from: { x: number; y: number };
  to: { x: number; y: number };
  active: boolean;
}) => {
  const pathRef = useRef<SVGPathElement>(null);

  return (
    <svg className="absolute inset-0 pointer-events-none" style={{ overflow: 'visible' }}>
      <defs>
        <linearGradient id="lineGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="rgb(20, 184, 166)" stopOpacity="0.3" />
          <stop offset="50%" stopColor="rgb(20, 184, 166)" stopOpacity="0.6" />
          <stop offset="100%" stopColor="rgb(20, 184, 166)" stopOpacity="0.3" />
        </linearGradient>
      </defs>
      <motion.path
        ref={pathRef}
        d={`M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${(from.y + to.y) / 2 - 30} ${to.x} ${to.y}`}
        stroke={active ? "url(#lineGradient)" : "rgba(20, 184, 166, 0.15)"}
        strokeWidth={active ? 2 : 1}
        fill="none"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.5, ease: "easeOut" }}
      />
      {active && (
        <motion.circle
          r="3"
          fill="rgb(20, 184, 166)"
          animate={{
            offsetDistance: ["0%", "100%"],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          style={{ offsetPath: `path("M ${from.x} ${from.y} Q ${(from.x + to.x) / 2} ${(from.y + to.y) / 2 - 30} ${to.x} ${to.y}")` }}
        />
      )}
    </svg>
  );
};

const FloatingParticles = () => {
  const [particles, setParticles] = useState<Particle[]>([]);

  useEffect(() => {
    const createParticle = (): Particle => ({
      id: Math.random(),
      x: Math.random() * 100,
      y: Math.random() * 100,
      vx: (Math.random() - 0.5) * 0.1,
      vy: (Math.random() - 0.5) * 0.1,
      life: 1,
      color: ['#14b8a6', '#8b5cf6', '#10b981', '#f59e0b'][Math.floor(Math.random() * 4)]
    });

    setParticles(Array.from({ length: 30 }, createParticle));

    const interval = setInterval(() => {
      setParticles(prev => prev.map(p => ({
        ...p,
        x: (p.x + p.vx + 100) % 100,
        y: (p.y + p.vy + 100) % 100
      })));
    }, 50);

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {particles.map(p => (
        <motion.div
          key={p.id}
          className="absolute w-1 h-1 rounded-full"
          style={{
            left: `${p.x}%`,
            top: `${p.y}%`,
            backgroundColor: p.color,
            opacity: 0.4
          }}
          animate={{ opacity: [0.2, 0.5, 0.2] }}
          transition={{ duration: 3, repeat: Infinity }}
        />
      ))}
    </div>
  );
};

const HealthPulse = ({ value, label, icon: Icon }: { value: number; label: string; icon: React.ElementType }) => {
  const getHealthColor = (v: number) => {
    if (v >= 80) return { bg: 'bg-emerald-500/20', text: 'text-emerald-400', bar: 'bg-emerald-500' };
    if (v >= 60) return { bg: 'bg-primary-500/20', text: 'text-primary-400', bar: 'bg-primary-500' };
    if (v >= 40) return { bg: 'bg-amber-500/20', text: 'text-amber-400', bar: 'bg-amber-500' };
    return { bg: 'bg-red-500/20', text: 'text-red-400', bar: 'bg-red-500' };
  };

  const colors = getHealthColor(value);

  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      className={`${colors.bg} rounded-xl p-4 border border-dark-border/20`}
    >
      <div className="flex items-center gap-3 mb-3">
        <Icon className={`w-5 h-5 ${colors.text}`} />
        <span className="text-sm font-medium text-dark-text-primary">{label}</span>
      </div>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-2 bg-dark-border/30 rounded-full overflow-hidden">
          <motion.div
            className={`h-full ${colors.bar} rounded-full`}
            initial={{ width: 0 }}
            animate={{ width: `${value}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
        <span className={`text-sm font-mono font-bold ${colors.text}`}>{value}%</span>
      </div>
    </motion.div>
  );
};

const InsightCard = ({
  title,
  insight,
  type,
  expanded,
  onToggle
}: {
  title: string;
  insight: string;
  type: 'observation' | 'suggestion' | 'celebration';
  expanded: boolean;
  onToggle: () => void;
}) => {
  const styles = {
    observation: { icon: EyeIcon, accent: 'text-primary-400', bg: 'from-primary-500/10 to-primary-500/5' },
    suggestion: { icon: BoltIcon, accent: 'text-amber-400', bg: 'from-amber-500/10 to-amber-500/5' },
    celebration: { icon: SparklesIcon, accent: 'text-violet-400', bg: 'from-violet-500/10 to-violet-500/5' }
  };

  const style = styles[type];
  const Icon = style.icon;

  return (
    <motion.div
      layout
      className={`bg-gradient-to-br ${style.bg} rounded-xl border border-dark-border/20 overflow-hidden cursor-pointer`}
      onClick={onToggle}
    >
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <Icon className={`w-4 h-4 ${style.accent}`} />
          <span className={`text-sm font-semibold ${style.accent}`}>{title}</span>
        </div>
        <AnimatePresence>
          {expanded ? (
            <motion.p
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="text-sm text-dark-text-secondary leading-relaxed"
            >
              {insight}
            </motion.p>
          ) : (
            <p className="text-sm text-dark-text-muted truncate">{insight}</p>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

const TimeOfDayAmbiance = () => {
  const hour = new Date().getHours();
  const isDaytime = hour >= 6 && hour < 18;

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-dark-elevated/50 border border-dark-border/30">
      {isDaytime ? (
        <>
          <SunIcon className="w-4 h-4 text-amber-400" />
          <span className="text-xs text-dark-text-muted">Building in daylight</span>
        </>
      ) : (
        <>
          <MoonIcon className="w-4 h-4 text-violet-400" />
          <span className="text-xs text-dark-text-muted">Night owl mode</span>
        </>
      )}
    </div>
  );
};

const AnimatedCounter = ({ value, suffix = '' }: { value: number; suffix?: string }) => {
  const count = useMotionValue(0);
  const rounded = useTransform(count, Math.round);
  const [displayValue, setDisplayValue] = useState(0);

  useEffect(() => {
    const animation = animate(count, value, { duration: 2, ease: "easeOut" });
    return animation.stop;
  }, [count, value]);

  useEffect(() => {
    return rounded.on("change", (v) => setDisplayValue(v));
  }, [rounded]);

  return <span>{displayValue}{suffix}</span>;
};

export default function DashboardV3LivingCanvas() {
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [expandedInsight, setExpandedInsight] = useState<string | null>(null);

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

  // Organic nodes representing project components
  const nodes: OrganicNode[] = [
    { id: 'auth', label: 'Authentication', category: 'core', health: 95, connections: ['api', 'db'], activity: 'thriving', size: 'lg' },
    { id: 'api', label: 'API Layer', category: 'core', health: 88, connections: ['auth', 'db', 'features'], activity: 'active', size: 'lg' },
    { id: 'db', label: 'Database', category: 'infrastructure', health: 92, connections: ['api', 'auth'], activity: 'active', size: 'md' },
    { id: 'features', label: 'Features', category: 'feature', health: 76, connections: ['api', 'ui'], activity: 'active', size: 'md' },
    { id: 'ui', label: 'Interface', category: 'feature', health: 82, connections: ['features'], activity: 'active', size: 'md' },
    { id: 'tests', label: 'Test Suite', category: 'quality', health: 87, connections: ['api', 'features'], activity: 'thriving', size: 'sm' },
    { id: 'ci', label: 'CI/CD', category: 'infrastructure', health: 100, connections: ['tests'], activity: 'dormant', size: 'sm' },
  ];

  const nodePositions: Record<string, { x: number; y: number }> = {
    auth: { x: 200, y: 150 },
    api: { x: 400, y: 200 },
    db: { x: 300, y: 320 },
    features: { x: 550, y: 150 },
    ui: { x: 650, y: 280 },
    tests: { x: 500, y: 350 },
    ci: { x: 350, y: 420 },
  };

  const connections = nodes.flatMap(node =>
    node.connections.map(targetId => ({
      from: nodePositions[node.id],
      to: nodePositions[targetId],
      active: node.activity === 'active' || node.activity === 'thriving'
    }))
  );

  // Deduplicate connections
  const uniqueConnections = connections.filter((conn, index, self) =>
    index === self.findIndex(c =>
      (c.from.x === conn.from.x && c.from.y === conn.from.y && c.to.x === conn.to.x && c.to.y === conn.to.y) ||
      (c.from.x === conn.to.x && c.from.y === conn.to.y && c.to.x === conn.from.x && c.to.y === conn.from.y)
    )
  );

  const overallHealth = Math.round(nodes.reduce((acc, n) => acc + n.health, 0) / nodes.length);
  const projectCount = projects?.length || 0;
  const completionRate = taskStats?.completionRate || 0;

  const insights = [
    { id: '1', title: 'Pattern Detected', insight: 'Your authentication module has been exceptionally stable. The patterns you\'ve established here could be replicated in your API error handling.', type: 'observation' as const },
    { id: '2', title: 'Growth Opportunity', insight: 'Feature development velocity is increasing. Consider adding more integration tests to maintain quality as you scale.', type: 'suggestion' as const },
    { id: '3', title: 'Ecosystem Thriving', insight: 'Your test coverage has grown 15% this week! The codebase is becoming more resilient with every commit.', type: 'celebration' as const },
  ];

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text-primary relative overflow-hidden">
      {/* Ambient Background */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary-950/20 via-dark-bg to-violet-950/20" />
      <FloatingParticles />

      {/* Header */}
      <header className="relative border-b border-dark-border/20 bg-dark-surface/30 backdrop-blur-xl">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <motion.div
                animate={{ rotate: [0, 360] }}
                transition={{ duration: 30, repeat: Infinity, ease: "linear" }}
                className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-400/20 to-violet-400/20 border border-primary-500/30 flex items-center justify-center"
              >
                <CubeTransparentIcon className="w-5 h-5 text-primary-400" />
              </motion.div>
              <div>
                <h1 className="text-lg font-bold">Living Canvas</h1>
                <p className="text-xs text-dark-text-muted">Your project ecosystem</p>
              </div>
            </div>

            <div className="flex items-center gap-4">
              <TimeOfDayAmbiance />
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl bg-dark-elevated/50 border border-dark-border/30">
                <motion.div
                  className="w-2 h-2 rounded-full bg-emerald-400"
                  animate={{ scale: [1, 1.2, 1], opacity: [1, 0.7, 1] }}
                  transition={{ duration: 2, repeat: Infinity }}
                />
                <span className="text-sm font-medium text-dark-text-secondary">
                  Ecosystem Health: <span className="text-emerald-400 font-bold"><AnimatedCounter value={overallHealth} suffix="%" /></span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="relative max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-12 gap-6">
          {/* Main Canvas */}
          <div className="col-span-8">
            <div className="bg-dark-elevated/30 backdrop-blur border border-dark-border/20 rounded-2xl p-6 h-[550px] relative overflow-hidden">
              <div className="absolute top-4 left-4 z-10">
                <h2 className="text-lg font-semibold mb-1">Project Ecosystem</h2>
                <p className="text-xs text-dark-text-muted">Watch your components breathe and interact</p>
              </div>

              {/* Connection Lines */}
              {uniqueConnections.map((conn, i) => (
                <ConnectionLine key={i} from={conn.from} to={conn.to} active={conn.active} />
              ))}

              {/* Nodes */}
              {nodes.map(node => (
                <BreathingOrb
                  key={node.id}
                  node={node}
                  position={nodePositions[node.id]}
                  onClick={() => setSelectedNode(selectedNode === node.id ? null : node.id)}
                  isSelected={selectedNode === node.id}
                />
              ))}

              {/* Selected Node Detail */}
              <AnimatePresence>
                {selectedNode && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 20 }}
                    className="absolute bottom-4 left-4 right-4 bg-dark-bg/90 backdrop-blur-xl rounded-xl border border-dark-border/30 p-4"
                  >
                    {(() => {
                      const node = nodes.find(n => n.id === selectedNode);
                      if (!node) return null;
                      return (
                        <div className="flex items-center justify-between">
                          <div>
                            <h3 className="font-semibold text-dark-text-primary">{node.label}</h3>
                            <p className="text-sm text-dark-text-muted capitalize">{node.category} • {node.activity}</p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-center">
                              <div className="text-2xl font-bold text-primary-400">{node.health}%</div>
                              <div className="text-xs text-dark-text-muted">Health</div>
                            </div>
                            <div className="text-center">
                              <div className="text-2xl font-bold text-violet-400">{node.connections.length}</div>
                              <div className="text-xs text-dark-text-muted">Connections</div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          {/* Right Sidebar */}
          <div className="col-span-4 space-y-6">
            {/* Vital Signs */}
            <div className="bg-dark-elevated/30 backdrop-blur border border-dark-border/20 rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">Vital Signs</h2>
              <div className="space-y-4">
                <HealthPulse value={94} label="Code Quality" icon={CodeBracketIcon} />
                <HealthPulse value={87} label="Test Coverage" icon={BeakerIcon} />
                <HealthPulse value={100} label="Security" icon={ShieldCheckIcon} />
                <HealthPulse value={completionRate || 72} label="Progress" icon={ArrowTrendingUpIcon} />
              </div>
            </div>

            {/* Living Insights */}
            <div className="bg-dark-elevated/30 backdrop-blur border border-dark-border/20 rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">Living Insights</h2>
              <div className="space-y-3">
                {insights.map(insight => (
                  <InsightCard
                    key={insight.id}
                    title={insight.title}
                    insight={insight.insight}
                    type={insight.type}
                    expanded={expandedInsight === insight.id}
                    onToggle={() => setExpandedInsight(expandedInsight === insight.id ? null : insight.id)}
                  />
                ))}
              </div>
            </div>

            {/* Ecosystem Stats */}
            <div className="bg-dark-elevated/30 backdrop-blur border border-dark-border/20 rounded-2xl p-6">
              <h2 className="text-lg font-semibold mb-4">Ecosystem Stats</h2>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-center p-3 rounded-xl bg-dark-bg/50">
                  <div className="text-2xl font-bold text-primary-400">
                    <AnimatedCounter value={projectCount || 3} />
                  </div>
                  <div className="text-xs text-dark-text-muted">Active Projects</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-dark-bg/50">
                  <div className="text-2xl font-bold text-emerald-400">
                    <AnimatedCounter value={nodes.filter(n => n.activity === 'thriving').length} />
                  </div>
                  <div className="text-xs text-dark-text-muted">Thriving Modules</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-dark-bg/50">
                  <div className="text-2xl font-bold text-violet-400">
                    <AnimatedCounter value={uniqueConnections.length} />
                  </div>
                  <div className="text-xs text-dark-text-muted">Connections</div>
                </div>
                <div className="text-center p-3 rounded-xl bg-dark-bg/50">
                  <div className="text-2xl font-bold text-amber-400">
                    <AnimatedCounter value={gateStats?.approved || 4} />
                  </div>
                  <div className="text-xs text-dark-text-muted">Gates Passed</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
