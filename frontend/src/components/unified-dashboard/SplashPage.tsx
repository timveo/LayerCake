// Splash Page Component for new users

import { motion } from 'framer-motion';
import FuzzyLlamaLogoSvg from '../../assets/Llamalogo.png';

interface SplashPageProps {
  onGetStarted: () => void;
}

export const SplashPage = ({ onGetStarted }: SplashPageProps) => {
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
            src={FuzzyLlamaLogoSvg}
            alt="Fuzzy Llama"
            className="w-48 h-48 mx-auto brightness-0 invert"
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
