import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render-phase exceptions from any descendant and shows a recovery panel
 * instead of a blank white page. We log to console so the error still surfaces
 * for developers; a future Sentry hook can be added in `componentDidCatch`.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('[error-boundary]', error, info.componentStack);
  }

  private handleReset = () => {
    this.setState({ error: null });
  };

  private handleReload = () => {
    window.location.reload();
  };

  render() {
    if (!this.state.error) return this.props.children;

    const message = this.state.error.message || 'Unexpected error';
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4 bg-background"
        data-testid="error-boundary-fallback"
      >
        <div className="max-w-md w-full glass-strong border border-red-500/30 rounded-2xl p-6 space-y-4 text-center">
          <h1 className="text-2xl font-bold text-gradient-gold">Something broke</h1>
          <p className="text-sm text-gold-light/70">
            The page hit an unexpected error. Reloading usually clears it.
          </p>
          <pre
            className="text-xs text-left text-red-300/80 bg-black/30 p-3 rounded-md overflow-auto max-h-40"
            data-testid="error-boundary-message"
          >
            {message}
          </pre>
          <div className="flex gap-3 justify-center pt-2">
            <button
              type="button"
              onClick={this.handleReset}
              data-testid="button-error-dismiss"
              className="px-4 py-2 rounded-md border border-gold/20 text-gold-light hover:bg-gold/10 text-sm"
            >
              Try to recover
            </button>
            <button
              type="button"
              onClick={this.handleReload}
              data-testid="button-error-reload"
              className="px-4 py-2 rounded-md btn-gold text-sm"
            >
              Reload page
            </button>
          </div>
        </div>
      </div>
    );
  }
}
