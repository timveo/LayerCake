import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  MapIcon,
  FlagIcon,
  SparklesIcon,
  LightBulbIcon,
  ChatBubbleLeftRightIcon,
  BookOpenIcon,
  TrophyIcon,
  ArrowRightIcon,
  HeartIcon,
  StarIcon,
  CheckIcon,
  PencilIcon
} from '@heroicons/react/24/outline';
import { useState } from 'react';
import { projectsApi } from '../api/projects';
import { tasksApi } from '../api/tasks';

// Journey Map Dashboard - Story-driven progress narrative
// "You're on an adventure" energy - building as a journey, not a checklist

interface JourneyMilestone {
  id: string;
  title: string;
  description: string;
  status: 'completed' | 'current' | 'upcoming';
  completedAt?: string;
  insights: string[];
  celebration?: string;
}

interface StoryCard {
  id: string;
  chapter: number;
  title: string;
  narrative: string;
  achievements: string[];
  learnings: string[];
  nextStep: string;
}

const MilestoneNode = ({ milestone, index, total }: { milestone: JourneyMilestone; index: number; total: number }) => {
  const isLeft = index % 2 === 0;

  return (
    <div className={`flex items-center gap-6 ${isLeft ? 'flex-row' : 'flex-row-reverse'}`}>
      {/* Content Card */}
      <motion.div
        initial={{ opacity: 0, x: isLeft ? -50 : 50 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: index * 0.15 }}
        className={`flex-1 max-w-md ${isLeft ? 'text-right' : 'text-left'}`}
      >
        <div className={`
          p-5 rounded-2xl border transition-all duration-300
          ${milestone.status === 'completed'
            ? 'bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border-emerald-500/30'
            : milestone.status === 'current'
            ? 'bg-gradient-to-br from-primary-500/20 to-violet-500/20 border-primary-400/50 shadow-lg shadow-primary-500/10'
            : 'bg-dark-elevated/40 border-dark-border/30 opacity-60'}
        `}>
          {milestone.status === 'completed' && milestone.celebration && (
            <div className={`flex items-center gap-2 mb-2 ${isLeft ? 'justify-end' : 'justify-start'}`}>
              <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium">
                {milestone.celebration}
              </span>
            </div>
          )}
          <h3 className={`text-lg font-semibold mb-2 ${
            milestone.status === 'completed' ? 'text-emerald-400' :
            milestone.status === 'current' ? 'text-primary-300' : 'text-dark-text-muted'
          }`}>
            {milestone.title}
          </h3>
          <p className="text-sm text-dark-text-secondary mb-3">{milestone.description}</p>

          {milestone.insights.length > 0 && milestone.status !== 'upcoming' && (
            <div className={`space-y-1 ${isLeft ? 'items-end' : 'items-start'}`}>
              {milestone.insights.map((insight, i) => (
                <div key={i} className={`flex items-center gap-2 text-xs text-dark-text-muted ${isLeft ? 'flex-row-reverse' : ''}`}>
                  <LightBulbIcon className="w-3 h-3 text-amber-400 flex-shrink-0" />
                  <span>{insight}</span>
                </div>
              ))}
            </div>
          )}

          {milestone.completedAt && (
            <div className={`mt-3 text-xs text-dark-text-muted ${isLeft ? 'text-right' : 'text-left'}`}>
              {milestone.completedAt}
            </div>
          )}
        </div>
      </motion.div>

      {/* Center Line Node */}
      <div className="relative flex flex-col items-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: index * 0.15, type: 'spring' }}
          className={`
            w-12 h-12 rounded-full flex items-center justify-center z-10 border-4
            ${milestone.status === 'completed'
              ? 'bg-emerald-500 border-emerald-400/50'
              : milestone.status === 'current'
              ? 'bg-primary-500 border-primary-400/50 ring-4 ring-primary-500/20'
              : 'bg-dark-elevated border-dark-border'}
          `}
        >
          {milestone.status === 'completed' ? (
            <CheckIcon className="w-6 h-6 text-white" />
          ) : milestone.status === 'current' ? (
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            >
              <SparklesIcon className="w-6 h-6 text-white" />
            </motion.div>
          ) : (
            <FlagIcon className="w-5 h-5 text-dark-text-muted" />
          )}
        </motion.div>

        {/* Connecting Line */}
        {index < total - 1 && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 100 }}
            transition={{ delay: index * 0.15 + 0.1, duration: 0.5 }}
            className={`w-1 ${
              milestone.status === 'completed' ? 'bg-gradient-to-b from-emerald-500 to-emerald-500/30' : 'bg-dark-border/50'
            }`}
          />
        )}
      </div>

      {/* Spacer for alternating layout */}
      <div className="flex-1 max-w-md" />
    </div>
  );
};

const StoryChapter = ({ story, isActive }: { story: StoryCard; isActive: boolean }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className={`
        relative overflow-hidden rounded-2xl border transition-all duration-500
        ${isActive
          ? 'bg-gradient-to-br from-dark-elevated via-primary-950/30 to-violet-950/20 border-primary-500/40 shadow-xl shadow-primary-500/10'
          : 'bg-dark-elevated/60 border-dark-border/30 hover:border-dark-border/50'}
      `}
    >
      {/* Chapter Header */}
      <div className="p-6 border-b border-dark-border/30">
        <div className="flex items-center gap-3 mb-3">
          <div className={`
            w-10 h-10 rounded-xl flex items-center justify-center font-mono font-bold text-lg
            ${isActive ? 'bg-primary-500/20 text-primary-400' : 'bg-dark-border/30 text-dark-text-muted'}
          `}>
            {story.chapter}
          </div>
          <div>
            <h3 className={`font-semibold ${isActive ? 'text-dark-text-primary' : 'text-dark-text-secondary'}`}>
              {story.title}
            </h3>
            <p className="text-xs text-dark-text-muted">Chapter {story.chapter}</p>
          </div>
        </div>
        <p className="text-sm text-dark-text-secondary leading-relaxed">{story.narrative}</p>
      </div>

      {/* Achievements & Learnings */}
      <div className="p-6 grid grid-cols-2 gap-6">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <TrophyIcon className="w-4 h-4 text-amber-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-amber-400">Achievements</span>
          </div>
          <ul className="space-y-2">
            {story.achievements.map((achievement, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-dark-text-secondary">
                <StarIcon className="w-4 h-4 text-amber-400/50 flex-shrink-0 mt-0.5" />
                {achievement}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-3">
            <BookOpenIcon className="w-4 h-4 text-violet-400" />
            <span className="text-xs font-semibold uppercase tracking-wider text-violet-400">Learnings</span>
          </div>
          <ul className="space-y-2">
            {story.learnings.map((learning, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-dark-text-secondary">
                <LightBulbIcon className="w-4 h-4 text-violet-400/50 flex-shrink-0 mt-0.5" />
                {learning}
              </li>
            ))}
          </ul>
        </div>
      </div>

      {/* Next Step */}
      {isActive && (
        <div className="px-6 pb-6">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex items-center gap-3 p-4 rounded-xl bg-primary-500/10 border border-primary-500/30"
          >
            <ArrowRightIcon className="w-5 h-5 text-primary-400" />
            <div>
              <span className="text-xs text-primary-400 font-semibold uppercase tracking-wider">Next Step</span>
              <p className="text-sm text-dark-text-primary">{story.nextStep}</p>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
};

const EmotionalPulse = ({ mood, label }: { mood: 'excited' | 'confident' | 'focused' | 'celebrating'; label: string }) => {
  const styles = {
    excited: { color: 'from-amber-400 to-orange-500', icon: SparklesIcon, bg: 'bg-amber-500/10' },
    confident: { color: 'from-emerald-400 to-teal-500', icon: HeartIcon, bg: 'bg-emerald-500/10' },
    focused: { color: 'from-primary-400 to-blue-500', icon: PencilIcon, bg: 'bg-primary-500/10' },
    celebrating: { color: 'from-violet-400 to-pink-500', icon: TrophyIcon, bg: 'bg-violet-500/10' }
  };

  const style = styles[mood];
  const Icon = style.icon;

  return (
    <motion.div
      whileHover={{ scale: 1.05 }}
      className={`${style.bg} rounded-2xl p-4 text-center cursor-pointer transition-all`}
    >
      <motion.div
        animate={{ scale: [1, 1.1, 1] }}
        transition={{ duration: 2, repeat: Infinity }}
        className={`w-12 h-12 mx-auto rounded-full bg-gradient-to-br ${style.color} flex items-center justify-center mb-2`}
      >
        <Icon className="w-6 h-6 text-white" />
      </motion.div>
      <span className="text-xs font-medium text-dark-text-secondary">{label}</span>
    </motion.div>
  );
};

const BuilderQuote = () => {
  const quotes = [
    { text: "Every line of code is a step forward in your journey.", author: "The Process" },
    { text: "Quality isn't a destination, it's how you travel.", author: "The Practice" },
    { text: "The best architectures tell a story.", author: "The Craft" }
  ];

  const [currentQuote] = useState(quotes[Math.floor(Math.random() * quotes.length)]);

  return (
    <div className="text-center py-6">
      <ChatBubbleLeftRightIcon className="w-8 h-8 text-primary-400/50 mx-auto mb-3" />
      <blockquote className="text-lg italic text-dark-text-secondary mb-2">
        "{currentQuote.text}"
      </blockquote>
      <cite className="text-sm text-dark-text-muted">— {currentQuote.author}</cite>
    </div>
  );
};

export default function DashboardV2JourneyMap() {
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

  const milestones: JourneyMilestone[] = [
    {
      id: '1',
      title: 'The Vision Takes Shape',
      description: 'You defined what you\'re building and why it matters. The foundation of every great product.',
      status: 'completed',
      completedAt: '3 days ago',
      insights: ['Clear problem statement defined', 'Target users identified'],
      celebration: '🎯 Vision Set!'
    },
    {
      id: '2',
      title: 'Architecture Emerges',
      description: 'The skeleton of your application took form. Decisions made here will echo through every feature.',
      status: 'completed',
      completedAt: '2 days ago',
      insights: ['Chose microservices for scalability', 'PostgreSQL fits your data model'],
      celebration: '🏗️ Foundations Laid!'
    },
    {
      id: '3',
      title: 'Core Features Come Alive',
      description: 'You\'re breathing life into the essential functionality. This is where ideas become real.',
      status: 'current',
      insights: ['Authentication system robust', 'API design follows REST best practices'],
    },
    {
      id: '4',
      title: 'Polish & Refinement',
      description: 'The difference between good and great lies in the details you\'re about to add.',
      status: 'upcoming',
      insights: [],
    },
    {
      id: '5',
      title: 'Ready for the World',
      description: 'Your creation, ready to meet its users. This is what it\'s all been building toward.',
      status: 'upcoming',
      insights: [],
    }
  ];

  const currentStory: StoryCard = {
    id: '1',
    chapter: 3,
    title: 'Building the Engine',
    narrative: 'You\'ve moved past planning and into creation. The core features are taking shape, each one carefully crafted to serve your users. This is the exciting middle chapter where progress becomes tangible.',
    achievements: [
      'User authentication complete',
      'Database models defined',
      'API endpoints functional',
      '87% test coverage achieved'
    ],
    learnings: [
      'JWT tokens suit your stateless needs',
      'Connection pooling prevents bottlenecks',
      'Early testing catches issues faster'
    ],
    nextStep: 'Implement the project dashboard with real-time updates'
  };

  const projectCount = projects?.length || 0;
  const completedTasks = taskStats?.completed || 0;

  return (
    <div className="min-h-screen bg-dark-bg text-dark-text-primary">
      {/* Hero Header */}
      <header className="relative overflow-hidden border-b border-dark-border/30">
        <div className="absolute inset-0 bg-gradient-to-br from-primary-950/50 via-transparent to-violet-950/30" />
        <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNjAiIGhlaWdodD0iNjAiIHZpZXdCb3g9IjAgMCA2MCA2MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZyBmaWxsPSJub25lIiBmaWxsLXJ1bGU9ImV2ZW5vZGQiPjxnIGZpbGw9IiMyMDIwMjAiIGZpbGwtb3BhY2l0eT0iMC4wNSI+PGNpcmNsZSBjeD0iMzAiIGN5PSIzMCIgcj0iMiIvPjwvZz48L2c+PC9zdmc+')] opacity-50" />

        <div className="relative max-w-6xl mx-auto px-6 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center"
          >
            <div className="flex items-center justify-center gap-3 mb-4">
              <MapIcon className="w-8 h-8 text-primary-400" />
              <h1 className="text-3xl font-bold bg-gradient-to-r from-primary-400 to-violet-400 bg-clip-text text-transparent">
                Your Building Journey
              </h1>
            </div>
            <p className="text-dark-text-secondary max-w-xl mx-auto">
              Every great product is a story of decisions, discoveries, and dedication.
              Here's yours.
            </p>
          </motion.div>

          {/* Emotional Pulse */}
          <div className="flex justify-center gap-4 mt-8">
            <EmotionalPulse mood="confident" label="Feeling Confident" />
            <EmotionalPulse mood="focused" label="Deep in Flow" />
            <EmotionalPulse mood="excited" label="Making Progress" />
            <EmotionalPulse mood="celebrating" label="Wins Happening" />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Journey Stats Bar */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-center gap-8 mb-12 p-4 rounded-2xl bg-dark-elevated/40 border border-dark-border/30"
        >
          <div className="text-center">
            <div className="text-2xl font-bold text-primary-400">{projectCount}</div>
            <div className="text-xs text-dark-text-muted">Projects Started</div>
          </div>
          <div className="w-px h-8 bg-dark-border/50" />
          <div className="text-center">
            <div className="text-2xl font-bold text-emerald-400">{completedTasks}</div>
            <div className="text-xs text-dark-text-muted">Tasks Conquered</div>
          </div>
          <div className="w-px h-8 bg-dark-border/50" />
          <div className="text-center">
            <div className="text-2xl font-bold text-violet-400">2</div>
            <div className="text-xs text-dark-text-muted">Milestones Reached</div>
          </div>
          <div className="w-px h-8 bg-dark-border/50" />
          <div className="text-center">
            <div className="text-2xl font-bold text-amber-400">12</div>
            <div className="text-xs text-dark-text-muted">Learnings Captured</div>
          </div>
        </motion.div>

        <div className="grid grid-cols-12 gap-8">
          {/* Main Journey Map */}
          <div className="col-span-7">
            <div className="mb-6">
              <h2 className="text-xl font-semibold mb-2">The Path Forward</h2>
              <p className="text-sm text-dark-text-muted">Your journey from idea to deployment</p>
            </div>

            <div className="relative">
              {/* Central Line */}
              <div className="absolute left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-emerald-500 via-primary-500/50 to-dark-border/30 transform -translate-x-1/2" />

              {/* Milestones */}
              <div className="space-y-4">
                {milestones.map((milestone, index) => (
                  <MilestoneNode
                    key={milestone.id}
                    milestone={milestone}
                    index={index}
                    total={milestones.length}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Right Column - Current Chapter & Inspiration */}
          <div className="col-span-5 space-y-6">
            {/* Current Chapter */}
            <div>
              <h2 className="text-xl font-semibold mb-4">Current Chapter</h2>
              <StoryChapter story={currentStory} isActive={true} />
            </div>

            {/* Builder's Inspiration */}
            <div className="bg-dark-elevated/40 rounded-2xl border border-dark-border/30 p-6">
              <BuilderQuote />
            </div>

            {/* Recent Wins */}
            <div className="bg-gradient-to-br from-emerald-500/10 to-teal-500/5 rounded-2xl border border-emerald-500/20 p-6">
              <div className="flex items-center gap-2 mb-4">
                <TrophyIcon className="w-5 h-5 text-emerald-400" />
                <h3 className="font-semibold text-emerald-400">Recent Wins</h3>
              </div>
              <ul className="space-y-3">
                <li className="flex items-start gap-3">
                  <span className="text-lg">🎉</span>
                  <div>
                    <p className="text-sm text-dark-text-primary">All tests passing!</p>
                    <p className="text-xs text-dark-text-muted">2 hours ago</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-lg">✨</span>
                  <div>
                    <p className="text-sm text-dark-text-primary">Auth flow complete</p>
                    <p className="text-xs text-dark-text-muted">Yesterday</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <span className="text-lg">🚀</span>
                  <div>
                    <p className="text-sm text-dark-text-primary">API performance improved 40%</p>
                    <p className="text-xs text-dark-text-muted">2 days ago</p>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
