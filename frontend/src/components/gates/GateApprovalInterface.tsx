import React, { useState } from 'react';
import { Button } from '../ui/Button';
import { ProofArtifactViewer } from '../artifacts/ProofArtifactViewer';
import type { ProofArtifact } from '../artifacts/ProofArtifactViewer';

export interface GateApprovalData {
  gateType: string;
  label: string;
  description: string;
  artifacts: ProofArtifact[];
  checklist: Array<{
    id: string;
    label: string;
    checked: boolean;
    required: boolean;
  }>;
}

interface GateApprovalInterfaceProps {
  gate: GateApprovalData;
  onApprove: (feedback?: string) => Promise<void>;
  onReject: (reason: string) => Promise<void>;
  onRequestChanges?: (changes: string) => Promise<void>;
}

export const GateApprovalInterface: React.FC<GateApprovalInterfaceProps> = ({
  gate,
  onApprove,
  onReject,
  onRequestChanges,
}) => {
  const [checklist, setChecklist] = useState(gate.checklist);
  const [feedback, setFeedback] = useState('');
  const [rejectionReason, setRejectionReason] = useState('');
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [showRejectionModal, setShowRejectionModal] = useState(false);

  const handleChecklistToggle = (id: string) => {
    setChecklist((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    );
  };

  const allRequiredChecked = checklist
    .filter((item) => item.required)
    .every((item) => item.checked);

  const handleApprove = async () => {
    setIsApproving(true);
    try {
      await onApprove(feedback || undefined);
    } catch (error) {
      console.error('Failed to approve gate:', error);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      alert('Please provide a reason for rejection');
      return;
    }

    setIsRejecting(true);
    try {
      await onReject(rejectionReason);
      setShowRejectionModal(false);
    } catch (error) {
      console.error('Failed to reject gate:', error);
    } finally {
      setIsRejecting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Gate Header */}
      <div className="bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 p-6 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-2">
              {gate.gateType}: {gate.label}
            </h2>
            <p className="text-gray-600 dark:text-gray-400">{gate.description}</p>
          </div>
          <div className="flex items-center gap-2 bg-yellow-100 dark:bg-yellow-900/30 px-3 py-1.5 rounded-full">
            <svg
              className="w-5 h-5 text-yellow-600 dark:text-yellow-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-sm font-medium text-yellow-800 dark:text-yellow-300">
              Awaiting Approval
            </span>
          </div>
        </div>
      </div>

      {/* Approval Checklist */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Approval Checklist
        </h3>
        <div className="space-y-3">
          {checklist.map((item) => (
            <label
              key={item.id}
              className="flex items-start gap-3 cursor-pointer group hover:bg-gray-50 dark:hover:bg-gray-750 p-2 rounded-lg transition-colors"
            >
              <input
                type="checkbox"
                checked={item.checked}
                onChange={() => handleChecklistToggle(item.id)}
                className="mt-1 w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
              />
              <div className="flex-1">
                <span className="text-gray-900 dark:text-gray-100">
                  {item.label}
                  {item.required && <span className="text-red-500 ml-1">*</span>}
                </span>
              </div>
            </label>
          ))}
        </div>

        {!allRequiredChecked && (
          <div className="mt-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-yellow-800 dark:text-yellow-300">
              Please complete all required checklist items before approving
            </p>
          </div>
        )}
      </div>

      {/* Proof Artifacts */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Proof Artifacts ({gate.artifacts.length})
        </h3>
        <ProofArtifactViewer artifacts={gate.artifacts} />
      </div>

      {/* Feedback */}
      <div className="bg-white dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
          Approval Feedback (Optional)
        </h3>
        <textarea
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          placeholder="Add any feedback or comments about this gate approval..."
          className="w-full h-24 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between bg-gray-50 dark:bg-gray-800 p-6 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="flex gap-3">
          <Button
            variant="secondary"
            onClick={() => setShowRejectionModal(true)}
            disabled={isApproving || isRejecting}
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
            Reject Gate
          </Button>

          {onRequestChanges && (
            <Button
              variant="secondary"
              onClick={() => onRequestChanges(feedback)}
              disabled={isApproving || isRejecting || !feedback.trim()}
            >
              <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6"
                />
              </svg>
              Request Changes
            </Button>
          )}
        </div>

        <Button
          onClick={handleApprove}
          disabled={!allRequiredChecked || isApproving || isRejecting}
          isLoading={isApproving}
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          {isApproving ? 'Approving...' : 'Approve Gate'}
        </Button>
      </div>

      {/* Rejection Modal */}
      {showRejectionModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Reject Gate
            </h3>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              Please provide a reason for rejecting this gate. This feedback will help the agents
              understand what needs to be fixed.
            </p>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Explain why you're rejecting this gate..."
              className="w-full h-32 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
              autoFocus
            />
            <div className="flex gap-3 justify-end">
              <Button
                variant="secondary"
                onClick={() => setShowRejectionModal(false)}
                disabled={isRejecting}
              >
                Cancel
              </Button>
              <Button
                onClick={handleReject}
                disabled={!rejectionReason.trim() || isRejecting}
                isLoading={isRejecting}
              >
                {isRejecting ? 'Rejecting...' : 'Reject Gate'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
