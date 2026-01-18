import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  X,
  User,
  Lock,
  Key,
  Palette,
  CreditCard,
  Trash2,
  Sun,
  Moon,
  ChevronRight,
} from 'lucide-react';
import { useAuthStore } from '../stores/auth';
import { useThemeStore } from '../stores/theme';
import FuzzyLlamaLogo from '../assets/Llamalogo.png';

type SettingsTab = 'profile' | 'password' | 'api-keys' | 'appearance' | 'subscription' | 'danger';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout);
  const { theme, toggleTheme } = useThemeStore();
  const queryClient = useQueryClient();
  const isDark = theme === 'dark';

  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');

  const [profileData, setProfileData] = useState({
    name: user?.name || '',
    email: user?.email || '',
  });

  const [passwordData, setPasswordData] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });

  const [apiKeys, setApiKeys] = useState({
    claudeApiKey: '',
    openaiApiKey: '',
    githubToken: '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});

  const updateProfileMutation = useMutation({
    mutationFn: async (data: typeof profileData) => {
      console.log('Updating profile:', data);
      return { success: true };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
    },
  });

  const updatePasswordMutation = useMutation({
    mutationFn: async (data: typeof passwordData) => {
      console.log('Updating password:', data);
      return { success: true };
    },
    onSuccess: () => {
      setPasswordData({ currentPassword: '', newPassword: '', confirmPassword: '' });
    },
  });

  const updateApiKeysMutation = useMutation({
    mutationFn: async (data: typeof apiKeys) => {
      console.log('Updating API keys:', data);
      return { success: true };
    },
  });

  const handleProfileSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateProfileMutation.mutate(profileData);
  };

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const newErrors: Record<string, string> = {};
    if (passwordData.newPassword.length < 8) {
      newErrors.newPassword = 'Password must be at least 8 characters';
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }
    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
    updatePasswordMutation.mutate(passwordData);
  };

  const handleApiKeysSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateApiKeysMutation.mutate(apiKeys);
  };

  const tabs: { id: SettingsTab; label: string; icon: React.ElementType }[] = [
    { id: 'profile', label: 'Profile', icon: User },
    { id: 'password', label: 'Password', icon: Lock },
    { id: 'api-keys', label: 'API Keys', icon: Key },
    { id: 'appearance', label: 'Appearance', icon: Palette },
    { id: 'subscription', label: 'Subscription', icon: CreditCard },
    { id: 'danger', label: 'Danger Zone', icon: Trash2 },
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className={`w-full max-w-3xl max-h-[85vh] rounded-2xl shadow-2xl overflow-hidden flex ${
            isDark ? 'bg-slate-900' : 'bg-slate-900'
          }`}
        >
          {/* Sidebar */}
          <div className="w-56 flex-shrink-0 border-r bg-slate-800/50 border-slate-700">
            {/* Header with Logo */}
            <div className="p-4 border-b border-slate-700">
              <div className="flex items-center gap-3">
                <img src={FuzzyLlamaLogo} alt="Fuzzy Llama" className="w-10 h-10" />
                <div>
                  <h2 className="text-lg font-semibold text-white">Settings</h2>
                  <p className="text-xs text-slate-400">Fuzzy Llama</p>
                </div>
              </div>
            </div>

            {/* Navigation */}
            <nav className="p-2 space-y-1">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors ${
                    activeTab === tab.id
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-400 hover:bg-slate-700/50 hover:text-white'
                  } ${tab.id === 'danger' ? 'text-red-400 hover:text-red-300' : ''}`}
                >
                  <tab.icon className="w-4 h-4" />
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>

            {/* Sign Out */}
            <div className="p-2 mt-auto border-t border-slate-700">
              <button
                onClick={() => {
                  logout();
                  onClose();
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm transition-colors text-red-400 hover:bg-red-500/20"
              >
                <ChevronRight className="w-4 h-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Header with close button */}
            <div className="flex items-center justify-between p-4 border-b border-slate-700">
              <h3 className="text-lg font-medium text-white">
                {tabs.find(t => t.id === activeTab)?.label}
              </h3>
              <button
                onClick={onClose}
                className="p-2 rounded-lg transition-colors hover:bg-slate-700 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Profile Tab */}
              {activeTab === 'profile' && (
                <form onSubmit={handleProfileSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      Full Name
                    </label>
                    <input
                      type="text"
                      value={profileData.name}
                      onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border transition-colors bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-teal-500 outline-none"
                      placeholder="John Doe"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      Email Address
                    </label>
                    <input
                      type="email"
                      value={profileData.email}
                      onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border transition-colors bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-teal-500 outline-none"
                      placeholder="john@example.com"
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={updateProfileMutation.isPending}
                      className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                    >
                      {updateProfileMutation.isPending ? 'Saving...' : 'Save Changes'}
                    </button>
                    {updateProfileMutation.isSuccess && (
                      <span className="text-sm text-green-400">Saved!</span>
                    )}
                  </div>
                </form>
              )}

              {/* Password Tab */}
              {activeTab === 'password' && (
                <form onSubmit={handlePasswordSubmit} className="space-y-6">
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      Current Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.currentPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, currentPassword: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border transition-colors bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-teal-500 outline-none"
                      placeholder="••••••••"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.newPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, newPassword: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border transition-colors bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-teal-500 outline-none"
                      placeholder="••••••••"
                    />
                    {errors.newPassword && (
                      <p className="text-sm text-red-400 mt-1">{errors.newPassword}</p>
                    )}
                    <p className="text-xs mt-1 text-slate-500">
                      Must be at least 8 characters
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={passwordData.confirmPassword}
                      onChange={(e) => setPasswordData({ ...passwordData, confirmPassword: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border transition-colors bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-teal-500 outline-none"
                      placeholder="••••••••"
                    />
                    {errors.confirmPassword && (
                      <p className="text-sm text-red-400 mt-1">{errors.confirmPassword}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={updatePasswordMutation.isPending}
                      className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                    >
                      {updatePasswordMutation.isPending ? 'Updating...' : 'Update Password'}
                    </button>
                    {updatePasswordMutation.isSuccess && (
                      <span className="text-sm text-green-400">Password updated!</span>
                    )}
                  </div>
                </form>
              )}

              {/* API Keys Tab */}
              {activeTab === 'api-keys' && (
                <form onSubmit={handleApiKeysSubmit} className="space-y-6">
                  <p className="text-sm text-slate-400">
                    Connect your own API keys to use premium AI models
                  </p>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      Claude API Key
                    </label>
                    <input
                      type="password"
                      value={apiKeys.claudeApiKey}
                      onChange={(e) => setApiKeys({ ...apiKeys, claudeApiKey: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border transition-colors bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-teal-500 outline-none"
                      placeholder="sk-ant-api..."
                    />
                    <p className="text-xs mt-1 text-slate-500">
                      Get your API key from console.anthropic.com
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      OpenAI API Key
                    </label>
                    <input
                      type="password"
                      value={apiKeys.openaiApiKey}
                      onChange={(e) => setApiKeys({ ...apiKeys, openaiApiKey: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border transition-colors bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-teal-500 outline-none"
                      placeholder="sk-..."
                    />
                    <p className="text-xs mt-1 text-slate-500">
                      Get your API key from platform.openai.com
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-2 text-slate-300">
                      GitHub Personal Access Token
                    </label>
                    <input
                      type="password"
                      value={apiKeys.githubToken}
                      onChange={(e) => setApiKeys({ ...apiKeys, githubToken: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border transition-colors bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-teal-500 outline-none"
                      placeholder="ghp_..."
                    />
                    <p className="text-xs mt-1 text-slate-500">
                      Required for GitHub export. Get from github.com/settings/tokens
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      type="submit"
                      disabled={updateApiKeysMutation.isPending}
                      className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-medium transition-colors disabled:opacity-50"
                    >
                      {updateApiKeysMutation.isPending ? 'Saving...' : 'Save API Keys'}
                    </button>
                    {updateApiKeysMutation.isSuccess && (
                      <span className="text-sm text-green-400">Saved!</span>
                    )}
                  </div>
                </form>
              )}

              {/* Appearance Tab */}
              {activeTab === 'appearance' && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between p-4 rounded-xl bg-slate-800">
                    <div>
                      <p className="font-medium text-white">Theme</p>
                      <p className="text-sm text-slate-400">
                        Current: {isDark ? 'Dark' : 'Light'}
                      </p>
                    </div>
                    <button
                      onClick={toggleTheme}
                      className="flex items-center gap-2 px-4 py-2 rounded-xl transition-colors bg-slate-700 hover:bg-slate-600 text-white"
                    >
                      {isDark ? (
                        <>
                          <Sun className="w-4 h-4" />
                          <span>Light Mode</span>
                        </>
                      ) : (
                        <>
                          <Moon className="w-4 h-4" />
                          <span>Dark Mode</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Subscription Tab */}
              {activeTab === 'subscription' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl bg-slate-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-white">
                          Current Plan: <span className="text-teal-400">Free</span>
                        </p>
                        <p className="text-sm text-slate-400">
                          1 project • 50 agent executions/month
                        </p>
                      </div>
                      <button className="px-6 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-medium transition-colors">
                        Upgrade to Pro
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Danger Zone Tab */}
              {activeTab === 'danger' && (
                <div className="space-y-6">
                  <div className="p-4 rounded-xl border bg-red-950/30 border-red-800">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium text-red-400">Delete Account</p>
                        <p className="text-sm text-slate-400">
                          Permanently delete your account and all data
                        </p>
                      </div>
                      <button className="px-6 py-2.5 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition-colors">
                        Delete Account
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default SettingsModal;
