import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../stores/auth';
import { useThemeStore } from '../stores/theme';
import { Sun, Moon } from 'lucide-react';
import FuzzyLlamaLogo from '../assets/Llamalogo.png';

export const Register: React.FC = () => {
  const navigate = useNavigate();
  const register = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);
  const { theme, toggleTheme } = useThemeStore();
  const isDark = theme === 'dark';

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateForm = () => {
    const newErrors: Record<string, string> = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    }

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/\S+@\S+\.\S+/.test(formData.email)) {
      newErrors.email = 'Email is invalid';
    }

    if (!formData.password) {
      newErrors.password = 'Password is required';
    } else if (formData.password.length < 8) {
      newErrors.password = 'Password must be at least 8 characters';
    }

    if (formData.password !== formData.confirmPassword) {
      newErrors.confirmPassword = 'Passwords do not match';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    try {
      await register(formData.name, formData.email, formData.password);
      navigate('/home');
    } catch (err: any) {
      setErrors({
        general: err.response?.data?.message || 'Registration failed. Please try again.',
      });
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData((prev) => ({
      ...prev,
      [e.target.name]: e.target.value,
    }));
    // Clear error for this field
    if (errors[e.target.name]) {
      setErrors((prev) => {
        const newErrors = { ...prev };
        delete newErrors[e.target.name];
        return newErrors;
      });
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center transition-colors duration-200 py-12"
      style={{
        background: isDark
          ? 'radial-gradient(ellipse at 50% 30%, #1e574f 0%, #1e3a5f 40%, #1a365d 70%, #1e293b 100%)'
          : 'radial-gradient(ellipse at 50% 30%, #134e4a 0%, #164e63 40%, #1e3a5f 70%, #1e293b 100%)',
      }}
    >
      {/* Animated Gradient Overlay */}
      <div
        className="absolute inset-0 opacity-50 pointer-events-none"
        style={{
          background: isDark
            ? 'radial-gradient(circle at 30% 40%, rgba(20, 184, 166, 0.4) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(59, 130, 246, 0.3) 0%, transparent 50%)'
            : 'radial-gradient(circle at 30% 40%, rgba(20, 184, 166, 0.3) 0%, transparent 50%), radial-gradient(circle at 70% 60%, rgba(59, 130, 246, 0.2) 0%, transparent 50%)',
        }}
      />

      {/* Theme Toggle */}
      <button
        onClick={toggleTheme}
        className={`absolute top-6 right-6 p-3 rounded-xl transition-all duration-200 ${
          isDark
            ? 'bg-slate-800/80 hover:bg-slate-700 text-teal-400'
            : 'bg-slate-800/60 hover:bg-slate-700/80 text-teal-400'
        }`}
        aria-label="Toggle theme"
      >
        {isDark ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>

      {/* Register Card */}
      <div className="relative w-full max-w-md mx-4 z-10">
        <div className={`rounded-2xl shadow-2xl p-8 backdrop-blur-md ${
          isDark
            ? 'bg-slate-900/90 border border-slate-700'
            : 'bg-slate-900/85 border border-slate-700'
        }`}>
          {/* Logo */}
          <div className="flex flex-col items-center mb-8">
            <img
              src={FuzzyLlamaLogo}
              alt="Fuzzy Llama"
              className="w-20 h-20 mb-4"
            />
            <h1 className="text-3xl font-bold text-white">
              Create Account
            </h1>
            <p className="mt-2 text-slate-400">
              Start building with AI agents today
            </p>
          </div>

          {/* Error Alert */}
          {errors.general && (
            <div className="mb-6 p-4 rounded-xl border bg-red-900/30 border-red-800 text-red-200">
              <p className="text-sm">{errors.general}</p>
            </div>
          )}

          {/* Register Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Full Name
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                  </svg>
                </div>
                <input
                  type="text"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="John Doe"
                  required
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border transition-colors outline-none bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-teal-500 ${errors.name ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.name && <p className="text-sm text-red-400 mt-1">{errors.name}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Email
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207" />
                  </svg>
                </div>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="you@example.com"
                  required
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border transition-colors outline-none bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-teal-500 ${errors.email ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.email && <p className="text-sm text-red-400 mt-1">{errors.email}</p>}
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                  </svg>
                </div>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border transition-colors outline-none bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-teal-500 ${errors.password ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.password && <p className="text-sm text-red-400 mt-1">{errors.password}</p>}
              <p className="text-xs mt-1 text-slate-500">
                At least 8 characters
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium mb-2 text-slate-300">
                Confirm Password
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <input
                  type="password"
                  name="confirmPassword"
                  value={formData.confirmPassword}
                  onChange={handleChange}
                  placeholder="••••••••"
                  required
                  className={`w-full pl-10 pr-4 py-3 rounded-xl border transition-colors outline-none bg-slate-800 border-slate-600 text-white placeholder-slate-500 focus:border-teal-500 ${errors.confirmPassword ? 'border-red-500' : ''}`}
                />
              </div>
              {errors.confirmPassword && <p className="text-sm text-red-400 mt-1">{errors.confirmPassword}</p>}
            </div>

            <div className="flex items-start">
              <input
                type="checkbox"
                required
                className="w-4 h-4 mt-1 rounded border-slate-600 text-teal-500 focus:ring-teal-500 focus:ring-offset-0 bg-slate-800"
              />
              <label className="ml-2 text-sm text-slate-400">
                I agree to the{' '}
                <Link to="/terms" className="text-teal-400 hover:text-teal-300">
                  Terms of Service
                </Link>{' '}
                and{' '}
                <Link to="/privacy" className="text-teal-400 hover:text-teal-300">
                  Privacy Policy
                </Link>
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full py-3 px-4 bg-teal-600 hover:bg-teal-500 text-white font-medium rounded-xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Creating account...' : 'Create Account'}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-700" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-4 bg-slate-900 text-slate-500">
                Or continue with
              </span>
            </div>
          </div>

          {/* OAuth Buttons */}
          <div className="space-y-3">
            <button
              type="button"
              className="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border font-medium transition-colors bg-slate-800 border-slate-600 text-white hover:bg-slate-700"
            >
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <span>GitHub</span>
            </button>
          </div>

          {/* Login Link */}
          <p className="mt-6 text-center text-sm text-slate-400">
            Already have an account?{' '}
            <Link
              to="/login"
              className="text-teal-400 hover:text-teal-300 font-medium"
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
};
