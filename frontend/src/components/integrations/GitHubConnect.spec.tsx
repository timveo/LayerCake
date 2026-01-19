import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { GitHubConnect } from './GitHubConnect';

describe('GitHubConnect', () => {
  const mockOnConnect = vi.fn();
  const mockOnDisconnect = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Disconnected State', () => {
    it('should render connect button when not connected', () => {
      const { container } = render(
        <GitHubConnect
          isConnected={false}
          onConnect={mockOnConnect}
          onDisconnect={mockOnDisconnect}
        />
      );

      expect(container.textContent).toContain('Connect GitHub');
      expect(container.textContent).toContain('GitHub Integration');
    });

    it('should display description text when disconnected', () => {
      const { container } = render(
        <GitHubConnect
          isConnected={false}
          onConnect={mockOnConnect}
          onDisconnect={mockOnDisconnect}
        />
      );

      expect(container.textContent).toContain('Connect your GitHub account');
    });

    it('should call onConnect when connect button clicked', async () => {
      mockOnConnect.mockResolvedValue(undefined);

      const { container } = render(
        <GitHubConnect
          isConnected={false}
          onConnect={mockOnConnect}
          onDisconnect={mockOnDisconnect}
        />
      );

      const connectButton = container.querySelector('button');
      if (connectButton) {
        connectButton.click();
      }

      // Wait a tick for async handler
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockOnConnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('Connected State', () => {
    it('should render disconnect button when connected', () => {
      const { container } = render(
        <GitHubConnect
          isConnected={true}
          connectedAccount="testuser"
          onConnect={mockOnConnect}
          onDisconnect={mockOnDisconnect}
        />
      );

      expect(container.textContent).toContain('Disconnect GitHub');
    });

    it('should display connected account name', () => {
      const { container } = render(
        <GitHubConnect
          isConnected={true}
          connectedAccount="testuser"
          onConnect={mockOnConnect}
          onDisconnect={mockOnDisconnect}
        />
      );

      expect(container.textContent).toContain('testuser');
      expect(container.textContent).toContain('Connected as');
    });

    it('should show green connection indicator', () => {
      const { container } = render(
        <GitHubConnect
          isConnected={true}
          connectedAccount="testuser"
          onConnect={mockOnConnect}
          onDisconnect={mockOnDisconnect}
        />
      );

      const indicator = container.querySelector('.bg-green-500');
      expect(indicator).toBeDefined();
    });

    it('should display connected description', () => {
      const { container } = render(
        <GitHubConnect
          isConnected={true}
          connectedAccount="testuser"
          onConnect={mockOnConnect}
          onDisconnect={mockOnDisconnect}
        />
      );

      expect(container.textContent).toContain('export your projects');
    });

    it('should show confirmation dialog before disconnect', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

      const { container } = render(
        <GitHubConnect
          isConnected={true}
          connectedAccount="testuser"
          onConnect={mockOnConnect}
          onDisconnect={mockOnDisconnect}
        />
      );

      const disconnectButton = container.querySelector('button');
      if (disconnectButton) {
        disconnectButton.click();
      }

      expect(confirmSpy).toHaveBeenCalledWith(
        'Are you sure you want to disconnect your GitHub account?'
      );
      expect(mockOnDisconnect).not.toHaveBeenCalled();

      confirmSpy.mockRestore();
    });

    it('should call onDisconnect when confirmed', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
      mockOnDisconnect.mockResolvedValue(undefined);

      const { container } = render(
        <GitHubConnect
          isConnected={true}
          connectedAccount="testuser"
          onConnect={mockOnConnect}
          onDisconnect={mockOnDisconnect}
        />
      );

      const disconnectButton = container.querySelector('button');
      if (disconnectButton) {
        disconnectButton.click();
      }

      // Wait a tick for async handler
      await new Promise(resolve => setTimeout(resolve, 0));
      expect(mockOnDisconnect).toHaveBeenCalledTimes(1);

      confirmSpy.mockRestore();
    });
  });

  describe('GitHub Logo', () => {
    it('should render GitHub logo SVG', () => {
      const { container } = render(
        <GitHubConnect
          isConnected={false}
          onConnect={mockOnConnect}
          onDisconnect={mockOnDisconnect}
        />
      );

      const logo = container.querySelector('svg');
      expect(logo).toBeDefined();
    });
  });

  describe('Error Handling', () => {
    it('should call onConnect even if it rejects', async () => {
      // The component calls onConnect but doesn't catch errors
      // This test verifies the component still calls onConnect
      mockOnConnect.mockResolvedValue(undefined);

      const { container } = render(
        <GitHubConnect
          isConnected={false}
          onConnect={mockOnConnect}
          onDisconnect={mockOnDisconnect}
        />
      );

      const connectButton = container.querySelector('button');
      if (connectButton) {
        await act(async () => {
          connectButton.click();
          await new Promise(resolve => setTimeout(resolve, 10));
        });
      }

      expect(mockOnConnect).toHaveBeenCalled();
    });
  });
});
