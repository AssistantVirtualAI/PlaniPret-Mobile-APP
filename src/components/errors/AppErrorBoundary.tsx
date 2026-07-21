import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
  stack: string;
  errorInfo: ErrorInfo | null;
}

/**
 * Extract a non-empty message string from any thrown value.
 * Returns empty string if the error has no real message (iOS Capacitor artefact).
 */
function getErrorMessage(raw: unknown): string {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.trim();
  if (raw instanceof Error) return (raw.message || '').trim();
  if (typeof raw === 'object') {
    // Try direct property access first
    const obj = raw as Record<string, unknown>;
    for (const key of ['message', 'hint', 'details', 'reason', 'description']) {
      try {
        const val = obj[key];
        if (val && typeof val === 'string' && val.trim() && val !== 'undefined') {
          return val.trim();
        }
      } catch { /* ignore */ }
    }
    // Try non-enumerable properties via descriptor
    for (const key of ['message', 'stack', 'name']) {
      try {
        const desc = Object.getOwnPropertyDescriptor(raw, key);
        const val = desc?.value;
        if (val && typeof val === 'string' && val.trim() && val !== 'Error' && val !== 'undefined') {
          return val.trim();
        }
      } catch { /* ignore */ }
    }
  }
  return '';
}

function getErrorStack(raw: unknown): string {
  if (!raw) return '';
  if (raw instanceof Error) return raw.stack || '';
  if (typeof raw === 'object') {
    try {
      return String((raw as any).stack || '') || '';
    } catch { return ''; }
  }
  return '';
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: '',
    stack: '',
    errorInfo: null,
  };

  public static getDerivedStateFromError(raw: unknown): Partial<State> {
    const message = getErrorMessage(raw);
    if (!message) {
      // No real message — iOS Capacitor artefact, ignore completely
      console.warn('[ErrorBoundary] Swallowed empty iOS error:', raw);
      return {}; // No state change
    }
    return {
      hasError: true,
      message,
      stack: getErrorStack(raw),
    };
  }

  public componentDidCatch(raw: unknown, errorInfo: ErrorInfo) {
    const message = getErrorMessage(raw);
    if (!message) {
      console.warn('[ErrorBoundary] Swallowed empty iOS error (componentDidCatch):', raw);
      return;
    }
    console.error('[ErrorBoundary] Caught error:', message, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => { window.location.reload(); };
  private handleGoBack = () => { window.history.back(); };
  private handleReset = () => {
    this.setState({ hasError: false, message: '', stack: '', errorInfo: null });
  };

  public render() {
    // CRITICAL: even if hasError was set somehow, only show crash screen if
    // there is a real non-empty message string.
    if (this.state.hasError && this.state.message) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
              <p className="text-muted-foreground">
                A runtime error was thrown while rendering.
              </p>
            </div>
            <div className="text-left bg-muted/50 rounded-lg p-4 overflow-auto max-h-60">
              <p className="text-sm font-mono text-destructive break-all">
                {this.state.message}
              </p>
              {this.state.stack && (
                <pre className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-all">
                  {this.state.stack}
                </pre>
              )}
              {this.state.errorInfo?.componentStack && (
                <pre className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-all">
                  {this.state.errorInfo.componentStack}
                </pre>
              )}
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button variant="outline" onClick={this.handleGoBack} className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                Go back
              </Button>
              <Button onClick={this.handleReset} className="gap-2">
                <RefreshCw className="w-4 h-4" />
                Retry
              </Button>
              <Button variant="ghost" onClick={this.handleReload} className="gap-2">
                Reload page
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
