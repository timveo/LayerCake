import React, { useState } from 'react';
import { Button } from '../ui/Button';

interface GitHubConnectProps {
  isConnected: boolean;
  connectedAccount?: string;
  onConnect: () => void;
  onDisconnect: () => void;
}

export const GitHubConnect: React.FC<GitHubConnectProps> = ({
  isConnected,
  connectedAccount,
  onConnect,
  onDisconnect,
}) => {
  const [isLoading, setIsLoading] = useState(false);

  const handleConnect = async () => {
    setIsLoading(true);
    try {
      await onConnect();
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (window.confirm('Are you sure you want to disconnect your GitHub account?')) {
      setIsLoading(true);
      try {
        await onDisconnect();
      } finally {
        setIsLoading(false);
      }
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
      <div className="flex items-start gap-4">
        {/* GitHub Logo */}
        <div className="flex-shrink-0">
          <div className="w-12 h-12 bg-gray-900 dark:bg-white rounded-lg flex items-center justify-center">
            <svg className="w-7 h-7 text-white dark:text-gray-900" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
            </svg>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            GitHub Integration
          </h3>

          {isConnected ? (
            <>
              <div className="flex items-center gap-2 mb-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  Connected as <span className="font-medium text-gray-900 dark:text-gray-100">{connectedAccount}</span>
                </span>
              </div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                You can now export your projects to GitHub repositories.
              </p>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleDisconnect}
                disabled={isLoading}
              >
                Disconnect GitHub
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
                Connect your GitHub account to export generated code directly to your repositories.
              </p>
              <Button
                onClick={handleConnect}
                loading={isLoading}
                disabled={isLoading}
                size="sm"
              >
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Connect GitHub
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
