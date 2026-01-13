import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { NotificationProvider, notify } from './Notification';

describe('Notification System', () => {
  describe('NotificationProvider', () => {
    it('should render without errors', () => {
      const { container } = render(<NotificationProvider />);
      expect(container).toBeDefined();
    });
  });

  describe('notify functions', () => {
    it('notify.success should be callable', () => {
      render(<NotificationProvider />);
      expect(() => notify.success('Success message', 'Success description')).not.toThrow();
    });

    it('notify.error should be callable', () => {
      render(<NotificationProvider />);
      expect(() => notify.error('Error message', 'Error description')).not.toThrow();
    });

    it('notify.info should be callable', () => {
      render(<NotificationProvider />);
      expect(() => notify.info('Info message', 'Info description')).not.toThrow();
    });

    it('notify.warning should be callable', () => {
      render(<NotificationProvider />);
      expect(() => notify.warning('Warning message', 'Warning description')).not.toThrow();
    });

    it('notify.promise should handle resolved promises', async () => {
      render(<NotificationProvider />);
      const promise = Promise.resolve('Success data');

      expect(() => notify.promise(promise, {
        loading: 'Loading...',
        success: 'Success!',
        error: 'Error!',
      })).not.toThrow();

      await promise;
    });

    it('notify.promise should handle rejected promises', async () => {
      render(<NotificationProvider />);
      const promise = Promise.reject(new Error('Failed'));

      expect(() => notify.promise(promise, {
        loading: 'Loading...',
        success: 'Success!',
        error: 'Error!',
      })).not.toThrow();

      await promise.catch(() => {}); // Catch to prevent unhandled rejection
    });
  });
});
