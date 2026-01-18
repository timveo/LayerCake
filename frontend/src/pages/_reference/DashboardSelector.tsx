import { motion } from 'framer-motion';
import { Link } from 'react-router-dom';
import {
  RocketLaunchIcon,
  MapIcon,
  CubeTransparentIcon,
  SparklesIcon,
  ArrowRightIcon
} from '@heroicons/react/24/outline';

interface DashboardOption {
  id: string;
  path: string;
  title: string;
  tagline: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  accent: string;
  features: string[];
}

const dashboards: DashboardOption[] = [
  {
    id: 'mission-control',
    path: '/dashboard/mission-control',
    title: 'Mission Control',
    tagline: 'Houston, we have liftoff',
    description: 'NASA-inspired command center with real-time system status, gate pipelines, and confidence gauges. For those who want complete control and visibility.',
    icon: RocketLaunchIcon,
    gradient: 'from-primary-500 via-cyan-500 to-blue-500',
    accent: 'primary',
    features: ['Real-time system status', 'Gate pipeline visualization', 'Mission event log', 'Confidence indicators', 'Teaching moments panel']
  },
  {
    id: 'journey-map',
    path: '/dashboard/journey-map',
    title: 'Journey Map',
    tagline: 'Your story of building',
    description: 'Story-driven progress narrative that celebrates milestones and captures learnings. Building software should feel like an adventure.',
    icon: MapIcon,
    gradient: 'from-violet-500 via-purple-500 to-pink-500',
    accent: 'violet',
    features: ['Milestone timeline', 'Story chapters', 'Achievement tracking', 'Recent wins celebration', 'Inspirational quotes']
  },
  {
    id: 'living-canvas',
    path: '/dashboard/living-canvas',
    title: 'Living Canvas',
    tagline: 'Your project breathes',
    description: 'Organic visualization where your codebase is a living ecosystem. Watch components pulse with activity and connections flow with data.',
    icon: CubeTransparentIcon,
    gradient: 'from-emerald-500 via-teal-500 to-cyan-500',
    accent: 'emerald',
    features: ['Interactive node ecosystem', 'Real-time health vitals', 'Living insights', 'Ambient particles', 'Connection visualization']
  }
];

const DashboardCard = ({ dashboard, index }: { dashboard: DashboardOption; index: number }) => {
  const Icon = dashboard.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.15, duration: 0.5 }}
      whileHover={{ y: -8, transition: { duration: 0.2 } }}
      className="group"
    >
      <Link to={dashboard.path}>
        <div className="relative h-full bg-dark-elevated/60 backdrop-blur border border-dark-border/50 rounded-2xl overflow-hidden transition-all duration-300 hover:border-dark-border hover:shadow-2xl hover:shadow-primary-500/5">
          {/* Gradient Header */}
          <div className={`relative h-40 bg-gradient-to-br ${dashboard.gradient} p-6 overflow-hidden`}>
            {/* Animated Background Pattern */}
            <motion.div
              className="absolute inset-0 opacity-20"
              style={{
                backgroundImage: `radial-gradient(circle at 2px 2px, white 1px, transparent 0)`,
                backgroundSize: '24px 24px'
              }}
              animate={{ y: [-24, 0] }}
              transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            />

            {/* Icon */}
            <motion.div
              className="absolute top-4 right-4 w-20 h-20 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center"
              whileHover={{ rotate: 5, scale: 1.05 }}
            >
              <Icon className="w-10 h-10 text-white" />
            </motion.div>

            {/* Title Area */}
            <div className="absolute bottom-4 left-6 right-6">
              <p className="text-white/70 text-sm mb-1">{dashboard.tagline}</p>
              <h3 className="text-2xl font-bold text-white">{dashboard.title}</h3>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            <p className="text-dark-text-secondary text-sm leading-relaxed mb-5">
              {dashboard.description}
            </p>

            {/* Features */}
            <div className="space-y-2 mb-6">
              {dashboard.features.map((feature, i) => (
                <div key={i} className="flex items-center gap-2">
                  <SparklesIcon className={`w-4 h-4 text-${dashboard.accent}-400`} />
                  <span className="text-xs text-dark-text-muted">{feature}</span>
                </div>
              ))}
            </div>

            {/* CTA */}
            <div className="flex items-center justify-between pt-4 border-t border-dark-border/30">
              <span className={`text-sm font-semibold text-${dashboard.accent}-400 group-hover:text-${dashboard.accent}-300 transition-colors`}>
                Launch Dashboard
              </span>
              <motion.div
                className={`w-8 h-8 rounded-full bg-${dashboard.accent}-500/20 flex items-center justify-center`}
                whileHover={{ x: 4 }}
              >
                <ArrowRightIcon className={`w-4 h-4 text-${dashboard.accent}-400`} />
              </motion.div>
            </div>
          </div>

          {/* Hover Glow Effect */}
          <div className={`absolute inset-0 bg-gradient-to-br ${dashboard.gradient} opacity-0 group-hover:opacity-5 transition-opacity duration-500 pointer-events-none`} />
        </div>
      </Link>
    </motion.div>
  );
};

export default function DashboardSelector() {
  return (
    <div className="min-h-screen bg-dark-bg text-dark-text-primary">
      {/* Hero Section */}
      <div className="relative overflow-hidden">
        {/* Background Effects */}
        <div className="absolute inset-0 bg-gradient-to-b from-primary-950/30 via-transparent to-transparent" />
        <div className="absolute top-0 left-1/4 w-96 h-96 bg-primary-500/10 rounded-full blur-3xl" />
        <div className="absolute top-20 right-1/4 w-72 h-72 bg-violet-500/10 rounded-full blur-3xl" />

        <div className="relative max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary-500/10 border border-primary-500/30 mb-6">
              <SparklesIcon className="w-4 h-4 text-primary-400" />
              <span className="text-sm text-primary-400 font-medium">Choose Your Experience</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold mb-4">
              <span className="bg-gradient-to-r from-primary-400 via-violet-400 to-pink-400 bg-clip-text text-transparent">
                How do you want to build?
              </span>
            </h1>

            <p className="text-lg text-dark-text-secondary max-w-2xl mx-auto">
              Building software should feel amazing. Choose the dashboard that matches
              your mindset and makes the process feel like magic.
            </p>
          </motion.div>
        </div>
      </div>

      {/* Dashboard Options */}
      <div className="max-w-6xl mx-auto px-6 pb-20">
        <div className="grid md:grid-cols-3 gap-6">
          {dashboards.map((dashboard, index) => (
            <DashboardCard key={dashboard.id} dashboard={dashboard} index={index} />
          ))}
        </div>

        {/* Philosophy Section */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="mt-20 text-center"
        >
          <div className="max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold mb-4 text-dark-text-primary">
              Building with Confidence
            </h2>
            <p className="text-dark-text-secondary leading-relaxed">
              FuzzyLlama isn't just about writing code faster—it's about feeling great
              throughout the entire process. Every decision is transparent, every milestone
              is celebrated, and every learning moment is captured. This is enterprise-quality
              development that respects both your time and your craft.
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex justify-center gap-12 mt-10 pt-10 border-t border-dark-border/30">
            <div className="text-center">
              <div className="text-3xl font-bold text-primary-400">10</div>
              <div className="text-sm text-dark-text-muted">Quality Gates</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-violet-400">14</div>
              <div className="text-sm text-dark-text-muted">AI Agents</div>
            </div>
            <div className="text-center">
              <div className="text-3xl font-bold text-emerald-400">100%</div>
              <div className="text-sm text-dark-text-muted">Transparency</div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
