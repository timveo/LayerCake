import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircleIcon,
  DocumentTextIcon,
  CodeBracketIcon,
  ShieldCheckIcon,
  RocketLaunchIcon,
  ShareIcon,
  ArrowRightIcon,
  SparklesIcon,
} from '@heroicons/react/24/outline';
import FuzzyLlamaLogoTransparent from '../assets/Llamalogo-transparent.png';

interface ProjectStats {
  gatesApproved: number;
  tasksCompleted: number;
  documentsGenerated: number;
  testCoverage: number;
  linesOfCode: number;
  tokensUsed: number;
  totalCost: number;
}

interface CelebrationScreenProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  userName: string;
  stats: ProjectStats;
}

// Confetti particle component
const ConfettiParticle = ({
  delay,
  x,
  color,
  rotateDirection,
  duration,
  isCircle,
}: {
  delay: number;
  x: number;
  color: string;
  rotateDirection: number;
  duration: number;
  isCircle: boolean;
}) => {
  return (
    <motion.div
      initial={{ y: -20, x, opacity: 1, rotate: 0 }}
      animate={{
        y: '100vh',
        opacity: [1, 1, 0],
        rotate: 360 * rotateDirection,
      }}
      transition={{
        duration,
        delay,
        ease: 'easeIn',
      }}
      className={`absolute w-3 h-3 ${color}`}
      style={{
        borderRadius: isCircle ? '50%' : '0',
        top: 0,
      }}
    />
  );
};

// Generate confetti colors
const confettiColors = [
  'bg-teal-400',
  'bg-cyan-400',
  'bg-emerald-400',
  'bg-amber-400',
  'bg-pink-400',
  'bg-purple-400',
  'bg-blue-400',
  'bg-orange-400',
];

export const CelebrationScreen: React.FC<CelebrationScreenProps> = ({
  isOpen,
  onClose,
  projectId,
  projectName,
  userName,
  stats,
}) => {
  const navigate = useNavigate();
  const [showConfetti, setShowConfetti] = useState(true);

  // Generate confetti particles with stable random values using lazy initial state
  const [confettiParticles] = useState(() =>
    Array.from({ length: 100 }, (_, i) => ({
      id: i,
      x: Math.random() * 1000,
      delay: Math.random() * 2,
      color: confettiColors[Math.floor(Math.random() * confettiColors.length)],
      rotateDirection: Math.random() > 0.5 ? 1 : -1,
      duration: 3 + Math.random() * 2,
      isCircle: Math.random() > 0.5,
    }))
  );

  // Handle confetti visibility
  useEffect(() => {
    if (isOpen) {
      // Use setTimeout to avoid synchronous setState in effect
      const showTimer = setTimeout(() => setShowConfetti(true), 0);
      // Stop confetti after animation
      const hideTimer = setTimeout(() => setShowConfetti(false), 5000);
      return () => {
        clearTimeout(showTimer);
        clearTimeout(hideTimer);
      };
    }
  }, [isOpen]);

  const handleViewProject = () => {
    onClose();
    navigate(`/workspace?project=${projectId}`);
  };

  const handleCreateAnother = () => {
    onClose();
    navigate('/home');
  };

  const handleShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `I just shipped ${projectName}!`,
          text: `Built with Fuzzy Llama: ${stats.gatesApproved} gates, ${stats.tasksCompleted} tasks, ${stats.testCoverage}% test coverage!`,
          url: window.location.origin,
        });
      } catch {
        console.log('Share cancelled');
      }
    }
  };

  if (!isOpen) return null;

  const firstName = userName?.split(' ')[0] || 'Builder';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at 50% 30%, #1e574f 0%, #1e3a5f 40%, #1a365d 70%, #1e293b 100%)',
      }}
    >
      {/* Confetti */}
      {showConfetti && (
        <div className="absolute inset-0 pointer-events-none overflow-hidden">
          {confettiParticles.map((particle) => (
            <ConfettiParticle
              key={particle.id}
              x={particle.x}
              delay={particle.delay}
              color={particle.color}
              rotateDirection={particle.rotateDirection}
              duration={particle.duration}
              isCircle={particle.isCircle}
            />
          ))}
        </div>
      )}

      {/* Animated gradient overlay */}
      <div
        className="absolute inset-0 opacity-50"
        style={{
          background:
            'radial-gradient(circle at 30% 40%, rgba(20, 184, 166, 0.4) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(59, 130, 246, 0.3) 0%, transparent 50%)',
        }}
      />

      {/* Main content */}
      <div className="relative z-10 w-full max-w-2xl px-8">
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', delay: 0.2 }}
          className="text-center"
        >
          {/* Trophy/Celebration Icon */}
          <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="mb-6"
          >
            <motion.div
              animate={{
                scale: [1, 1.1, 1],
                rotate: [0, 5, -5, 0],
              }}
              transition={{ duration: 2, repeat: Infinity }}
              className="inline-block"
            >
              <img
                src={FuzzyLlamaLogoTransparent}
                alt="Celebration"
                className="w-32 h-32 mx-auto"
              />
            </motion.div>
          </motion.div>

          {/* Main Title */}
          <motion.h1
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4 }}
            className="text-4xl md:text-5xl font-bold text-white mb-3"
          >
            🎉 Congratulations, {firstName}!
          </motion.h1>

          <motion.p
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="text-xl text-slate-300 mb-8"
          >
            You shipped <span className="text-teal-400 font-semibold">{projectName}</span>!
          </motion.p>

          {/* Stats Grid */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8"
          >
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <CheckCircleIcon className="w-6 h-6 text-emerald-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-white">{stats.gatesApproved}</div>
              <div className="text-xs text-slate-400">Gates Approved</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <SparklesIcon className="w-6 h-6 text-cyan-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-white">{stats.tasksCompleted}</div>
              <div className="text-xs text-slate-400">Tasks Completed</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <DocumentTextIcon className="w-6 h-6 text-amber-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-white">{stats.documentsGenerated}</div>
              <div className="text-xs text-slate-400">Docs Generated</div>
            </div>
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/50">
              <ShieldCheckIcon className="w-6 h-6 text-teal-400 mx-auto mb-2" />
              <div className="text-2xl font-bold text-white">{stats.testCoverage}%</div>
              <div className="text-xs text-slate-400">Test Coverage</div>
            </div>
          </motion.div>

          {/* Additional Stats */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="flex items-center justify-center gap-6 text-sm text-slate-400 mb-8"
          >
            <div className="flex items-center gap-2">
              <CodeBracketIcon className="w-4 h-4" />
              <span>{stats.linesOfCode.toLocaleString()} lines of code</span>
            </div>
            <span>•</span>
            <div className="flex items-center gap-2">
              <RocketLaunchIcon className="w-4 h-4" />
              <span>{(stats.tokensUsed / 1000).toFixed(1)}k tokens</span>
            </div>
            <span>•</span>
            <div>${stats.totalCost.toFixed(2)} total cost</div>
          </motion.div>

          {/* Action Buttons */}
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8 }}
            className="flex items-center justify-center gap-4"
          >
            <button
              onClick={handleViewProject}
              className="inline-flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-xl transition-colors"
            >
              View Project
              <ArrowRightIcon className="w-4 h-4" />
            </button>
            <button
              onClick={handleCreateAnother}
              className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white font-medium rounded-xl transition-colors"
            >
              Create Another
            </button>
            <button
              onClick={handleShare}
              className="inline-flex items-center justify-center w-12 h-12 bg-slate-800 hover:bg-slate-700 text-white rounded-xl transition-colors"
              title="Share"
            >
              <ShareIcon className="w-5 h-5" />
            </button>
          </motion.div>

          {/* Close hint */}
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1 }}
            className="mt-8 text-xs text-slate-500"
          >
            Press Escape or click outside to close
          </motion.p>
        </motion.div>
      </div>

      {/* Click outside to close */}
      <div
        className="absolute inset-0 -z-10"
        onClick={onClose}
        onKeyDown={(e) => e.key === 'Escape' && onClose()}
      />
    </motion.div>
  );
};

export default CelebrationScreen;
