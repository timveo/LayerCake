import React, { useState } from 'react';

export interface ProofArtifact {
  id: string;
  type: 'BUILD_OUTPUT' | 'LINT_OUTPUT' | 'TEST_OUTPUT' | 'COVERAGE_REPORT' | 'SECURITY_SCAN' | 'SPEC_VALIDATION';
  filename: string;
  content: string;
  createdAt: string;
  size?: number;
  metadata?: Record<string, any>;
}

interface ProofArtifactViewerProps {
  artifacts: ProofArtifact[];
  onClose?: () => void;
}

const artifactIcons = {
  BUILD_OUTPUT: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
    </svg>
  ),
  LINT_OUTPUT: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  TEST_OUTPUT: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
    </svg>
  ),
  COVERAGE_REPORT: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
    </svg>
  ),
  SECURITY_SCAN: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
    </svg>
  ),
  SPEC_VALIDATION: (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
    </svg>
  ),
};

const artifactColors = {
  BUILD_OUTPUT: 'text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30',
  LINT_OUTPUT: 'text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/30',
  TEST_OUTPUT: 'text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30',
  COVERAGE_REPORT: 'text-yellow-600 dark:text-yellow-400 bg-yellow-100 dark:bg-yellow-900/30',
  SECURITY_SCAN: 'text-red-600 dark:text-red-400 bg-red-100 dark:bg-red-900/30',
  SPEC_VALIDATION: 'text-indigo-600 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-900/30',
};

export const ProofArtifactViewer: React.FC<ProofArtifactViewerProps> = ({ artifacts, onClose }) => {
  const [selectedArtifact, setSelectedArtifact] = useState<ProofArtifact | null>(
    artifacts.length > 0 ? artifacts[0] : null,
  );

  const formatSize = (bytes?: number): string => {
    if (!bytes) return 'N/A';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleString();
  };

  const downloadArtifact = (artifact: ProofArtifact) => {
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = artifact.filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  if (artifacts.length === 0) {
    return (
      <div className="text-center py-12">
        <svg
          className="w-16 h-16 text-gray-400 dark:text-gray-600 mx-auto mb-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
        <p className="text-gray-600 dark:text-gray-400 text-lg">No proof artifacts available</p>
        <p className="text-gray-500 dark:text-gray-500 text-sm mt-2">
          Artifacts will appear here once agents complete their tasks
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-4 h-full">
      {/* Artifact List Sidebar */}
      <div className="col-span-4 bg-gray-50 dark:bg-gray-800 rounded-lg p-4 overflow-y-auto">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">
            Proof Artifacts ({artifacts.length})
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Click an artifact to view its contents
          </p>
        </div>

        <div className="space-y-2">
          {artifacts.map((artifact) => (
            <button
              key={artifact.id}
              onClick={() => setSelectedArtifact(artifact)}
              className={`
                w-full text-left p-3 rounded-lg transition-all
                ${
                  selectedArtifact?.id === artifact.id
                    ? 'bg-blue-100 dark:bg-blue-900/30 border-2 border-blue-500'
                    : 'bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-650'
                }
              `}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`p-1.5 rounded ${artifactColors[artifact.type]}`}>
                  {artifactIcons[artifact.type]}
                </div>
                <span className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                  {artifact.filename}
                </span>
              </div>
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {artifact.type.replace(/_/g, ' ')} · {formatSize(artifact.size)}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Artifact Content Viewer */}
      <div className="col-span-8 bg-white dark:bg-gray-800 rounded-lg overflow-hidden">
        {selectedArtifact ? (
          <>
            {/* Artifact Header */}
            <div className="bg-gray-100 dark:bg-gray-700 px-4 py-3 border-b border-gray-200 dark:border-gray-600">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded ${artifactColors[selectedArtifact.type]}`}>
                    {artifactIcons[selectedArtifact.type]}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
                      {selectedArtifact.filename}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {selectedArtifact.type.replace(/_/g, ' ')} · {formatSize(selectedArtifact.size)} ·{' '}
                      {formatDate(selectedArtifact.createdAt)}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => downloadArtifact(selectedArtifact)}
                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                    title="Download artifact"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                      />
                    </svg>
                  </button>
                  {onClose && (
                    <button
                      onClick={onClose}
                      className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
                      title="Close viewer"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* Artifact Content */}
            <div className="p-4 overflow-y-auto" style={{ maxHeight: '600px' }}>
              <pre className="text-sm font-mono text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words">
                {selectedArtifact.content}
              </pre>
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full text-gray-500 dark:text-gray-400">
            Select an artifact to view
          </div>
        )}
      </div>
    </div>
  );
};
