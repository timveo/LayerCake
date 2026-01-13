import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';

interface GitHubExportModalProps {
  projectName: string;
  onExport: (repoName: string, isPrivate: boolean, description?: string) => Promise<string>;
  onClose: () => void;
}

export const GitHubExportModal: React.FC<GitHubExportModalProps> = ({
  projectName,
  onExport,
  onClose,
}) => {
  const [repoName, setRepoName] = useState(
    projectName.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
  );
  const [description, setDescription] = useState('');
  const [isPrivate, setIsPrivate] = useState(true);
  const [isExporting, setIsExporting] = useState(false);
  const [exportStatus, setExportStatus] = useState<'idle' | 'creating' | 'pushing' | 'success' | 'error'>('idle');
  const [repoUrl, setRepoUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    if (!repoName.trim()) {
      setError('Repository name is required');
      return;
    }

    setIsExporting(true);
    setExportStatus('creating');
    setError(null);

    try {
      setExportStatus('pushing');
      const url = await onExport(repoName, isPrivate, description || undefined);
      setRepoUrl(url);
      setExportStatus('success');
    } catch (err: any) {
      setError(err.message || 'Failed to export to GitHub');
      setExportStatus('error');
    } finally {
      setIsExporting(false);
    }
  };

  if (exportStatus === 'success' && repoUrl) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-600 dark:text-green-400"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M5 13l4 4L19 7"
                />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-2">
              Successfully Exported!
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Your project has been exported to GitHub
            </p>
            <div className="bg-gray-50 dark:bg-gray-900 p-4 rounded-lg mb-6">
              <a
                href={repoUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 dark:text-blue-400 hover:underline break-all"
              >
                {repoUrl}
              </a>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose} className="flex-1">
                Close
              </Button>
              <Button
                onClick={() => window.open(repoUrl, '_blank')}
                className="flex-1"
              >
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                View on GitHub
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
        <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Export to GitHub
        </h3>

        {exportStatus === 'idle' && (
          <>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              Create a new GitHub repository and push your generated code.
            </p>

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Repository Name *
                </label>
                <Input
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="my-awesome-project"
                  disabled={isExporting}
                />
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Only lowercase letters, numbers, and hyphens
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Description (Optional)
                </label>
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="A short description of your project"
                  disabled={isExporting}
                />
              </div>

              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="private-repo"
                  checked={isPrivate}
                  onChange={(e) => setIsPrivate(e.target.checked)}
                  disabled={isExporting}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                />
                <label htmlFor="private-repo" className="text-sm text-gray-700 dark:text-gray-300">
                  Make repository private
                </label>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-800 dark:text-red-300">{error}</p>
              </div>
            )}

            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose} disabled={isExporting} className="flex-1">
                Cancel
              </Button>
              <Button
                onClick={handleExport}
                disabled={!repoName.trim() || isExporting}
                isLoading={isExporting}
                className="flex-1"
              >
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
                </svg>
                Export to GitHub
              </Button>
            </div>
          </>
        )}

        {(exportStatus === 'creating' || exportStatus === 'pushing') && (
          <div className="text-center py-8">
            <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-900 dark:text-gray-100 font-medium mb-2">
              {exportStatus === 'creating' && 'Creating repository...'}
              {exportStatus === 'pushing' && 'Pushing code to GitHub...'}
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              This may take a minute
            </p>
          </div>
        )}

        {exportStatus === 'error' && error && (
          <>
            <div className="text-center py-8">
              <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg
                  className="w-8 h-8 text-red-600 dark:text-red-400"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </div>
              <h4 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
                Export Failed
              </h4>
              <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
            </div>
            <div className="flex gap-3">
              <Button variant="secondary" onClick={onClose} className="flex-1">
                Close
              </Button>
              <Button onClick={() => setExportStatus('idle')} className="flex-1">
                Try Again
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
