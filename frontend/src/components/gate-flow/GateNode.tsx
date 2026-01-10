import React from 'react';
import { Handle, Position, NodeProps } from 'reactflow';

export type GateStatus = 'BLOCKED' | 'IN_PROGRESS' | 'READY' | 'APPROVED' | 'REJECTED';

export interface GateNodeData {
  gateType: string;
  label: string;
  status: GateStatus;
  description?: string;
  artifactsCount?: number;
  onApprove?: () => void;
  onReject?: () => void;
  onViewDetails?: () => void;
}

const statusColors = {
  BLOCKED: 'bg-gray-300 dark:bg-gray-700 border-gray-400 dark:border-gray-600',
  IN_PROGRESS: 'bg-blue-100 dark:bg-blue-900/30 border-blue-500 dark:border-blue-400',
  READY: 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-500 dark:border-yellow-400',
  APPROVED: 'bg-green-100 dark:bg-green-900/30 border-green-500 dark:border-green-400',
  REJECTED: 'bg-red-100 dark:bg-red-900/30 border-red-500 dark:border-red-400',
};

const statusIcons = {
  BLOCKED: (
    <svg className="w-5 h-5 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
    </svg>
  ),
  IN_PROGRESS: (
    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
    </svg>
  ),
  READY: (
    <svg className="w-5 h-5 text-yellow-600 dark:text-yellow-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
  APPROVED: (
    <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  REJECTED: (
    <svg className="w-5 h-5 text-red-600 dark:text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

export const GateNode: React.FC<NodeProps<GateNodeData>> = ({ data }) => {
  const { gateType, label, status, description, artifactsCount, onViewDetails } = data;

  return (
    <div
      className={`
        px-4 py-3 rounded-lg border-2 shadow-md min-w-[240px]
        ${statusColors[status]}
        transition-all duration-200 hover:shadow-lg
      `}
    >
      {/* Input Handle (top) */}
      {gateType !== 'G0' && (
        <Handle
          type="target"
          position={Position.Top}
          className="w-3 h-3 !bg-gray-400 dark:!bg-gray-600 border-2 border-white dark:border-gray-800"
        />
      )}

      {/* Gate Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {statusIcons[status]}
          <span className="font-bold text-sm text-gray-700 dark:text-gray-300">
            {gateType}
          </span>
        </div>
        {artifactsCount !== undefined && artifactsCount > 0 && (
          <span className="text-xs bg-white dark:bg-gray-800 px-2 py-1 rounded-full text-gray-600 dark:text-gray-400">
            {artifactsCount} artifacts
          </span>
        )}
      </div>

      {/* Gate Title */}
      <div className="font-semibold text-gray-900 dark:text-gray-100 mb-1">
        {label}
      </div>

      {/* Description */}
      {description && (
        <div className="text-xs text-gray-600 dark:text-gray-400 mb-3">
          {description}
        </div>
      )}

      {/* Status Badge */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
          {status === 'BLOCKED' && 'Waiting for previous gate'}
          {status === 'IN_PROGRESS' && 'Agents working...'}
          {status === 'READY' && 'Ready for approval'}
          {status === 'APPROVED' && 'Approved ✓'}
          {status === 'REJECTED' && 'Rejected'}
        </span>

        {/* View Details Button */}
        {onViewDetails && (status === 'READY' || status === 'APPROVED' || status === 'REJECTED') && (
          <button
            onClick={onViewDetails}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            View →
          </button>
        )}
      </div>

      {/* Output Handle (bottom) */}
      {gateType !== 'G9' && (
        <Handle
          type="source"
          position={Position.Bottom}
          className="w-3 h-3 !bg-gray-400 dark:!bg-gray-600 border-2 border-white dark:border-gray-800"
        />
      )}
    </div>
  );
};
