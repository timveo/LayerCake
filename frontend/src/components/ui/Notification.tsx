import React, { useEffect } from 'react';
import toast, { Toaster, type Toast } from 'react-hot-toast';

export type NotificationType = 'success' | 'error' | 'info' | 'warning';

interface NotificationProps {
  type: NotificationType;
  message: string;
  description?: string;
  duration?: number;
}

const icons = {
  success: (
    <svg className="w-5 h-5 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
  warning: (
    <svg className="w-5 h-5 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
    </svg>
  ),
};

const bgColors = {
  success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
  error: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800',
  info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
  warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
};

// Notification component rendered by toast
const NotificationContent: React.FC<{ notification: NotificationProps; toast: Toast }> = ({
  notification,
  toast: t,
}) => {
  return (
    <div
      className={`
        ${bgColors[notification.type]}
        border rounded-lg shadow-lg p-4 max-w-md w-full
        ${t.visible ? 'animate-enter' : 'animate-leave'}
      `}
    >
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">{icons[notification.type]}</div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
            {notification.message}
          </p>
          {notification.description && (
            <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
              {notification.description}
            </p>
          )}
        </div>
        <button
          onClick={() => toast.dismiss(t.id)}
          className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

// Notification provider
export const NotificationProvider: React.FC = () => {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: 5000,
        style: {
          background: 'transparent',
          boxShadow: 'none',
          padding: 0,
        },
      }}
    />
  );
};

// Notification API
export const notify = {
  success: (message: string, description?: string, duration?: number) => {
    toast.custom(
      (t) => <NotificationContent notification={{ type: 'success', message, description, duration }} toast={t} />,
      { duration: duration || 5000 },
    );
  },

  error: (message: string, description?: string, duration?: number) => {
    toast.custom(
      (t) => <NotificationContent notification={{ type: 'error', message, description, duration }} toast={t} />,
      { duration: duration || 7000 },
    );
  },

  info: (message: string, description?: string, duration?: number) => {
    toast.custom(
      (t) => <NotificationContent notification={{ type: 'info', message, description, duration }} toast={t} />,
      { duration: duration || 5000 },
    );
  },

  warning: (message: string, description?: string, duration?: number) => {
    toast.custom(
      (t) => <NotificationContent notification={{ type: 'warning', message, description, duration }} toast={t} />,
      { duration: duration || 6000 },
    );
  },

  promise: <T,>(
    promise: Promise<T>,
    messages: {
      loading: string;
      success: string | ((data: T) => string);
      error: string | ((error: any) => string);
    },
  ) => {
    return toast.promise(promise, {
      loading: messages.loading,
      success: (data) => (typeof messages.success === 'function' ? messages.success(data) : messages.success),
      error: (err) => (typeof messages.error === 'function' ? messages.error(err) : messages.error),
    });
  },
};

// Hook for WebSocket notifications
export const useWebSocketNotifications = (projectId?: string) => {
  useEffect(() => {
    // This would integrate with your WebSocket hook
    // Example implementation:
    // const { socket } = useWebSocket();

    // socket?.on('agent:started', (data) => {
    //   if (data.projectId === projectId) {
    //     notify.info('Agent Started', `${data.agentType} is now working on your project`);
    //   }
    // });

    // socket?.on('agent:completed', (data) => {
    //   if (data.projectId === projectId) {
    //     notify.success('Agent Completed', `${data.agentType} has finished successfully`);
    //   }
    // });

    // socket?.on('agent:failed', (data) => {
    //   if (data.projectId === projectId) {
    //     notify.error('Agent Failed', `${data.agentType}: ${data.error}`);
    //   }
    // });

    // socket?.on('gate:ready_for_approval', (data) => {
    //   if (data.projectId === projectId) {
    //     notify.warning('Gate Ready', `${data.gateType} is ready for your approval`);
    //   }
    // });

    return () => {
      // Cleanup socket listeners
    };
  }, [projectId]);
};
