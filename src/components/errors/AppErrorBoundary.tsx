import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Returns true if the thrown value is a non-fatal iOS Capacitor / React
 * internal artefact (e.g. the `{}` thrown by StatusBar UNIMPLEMENTED).
 *
 * Uses Object.getOwnPropertyNames() to inspect ALL properties (including
 * non-enumerable ones) before concluding the object is truly empty.
 */
function isEmptyNativeArtifact(raw: unknown): boolean {
  if (!raw || typeof raw !== 'object') return !raw;
  const obj = raw as Record<string, unknown>;
  const keys = new Set([
    ...Object.keys(obj),
    ...Object.getOwnPropertyNames(obj),
  ]);
  for (const key of ['message', 'stack', 'name', 'code', 'details', 'hint', 'error']) {
    const value = obj[key] ?? Object.getOwnPropertyDescriptor(obj, key)?.value;
    if (value != null && String(value).trim()) return false;
  }
  return keys.size === 0;
}

function normaliseError(raw: unknown): Error {
  if (raw instanceof Error) return raw;
  if (typeof raw === 'object' && raw !== null) {
    const obj = raw as Record<string, unknown>;
    const readProp = (key: string): string | undefined => {
      const val = obj[key] ?? Object.getOwnPropertyDescriptor(obj, key)?.value;
      return val != null ? String(val) : undefined;
    };
    const message =
      readProp('message') ||
      readProp('hint') ||
      readProp('details') ||
      readProp('code') ||
      readProp('error') ||
      JSON.stringify(raw);
    const err = new Error(message || 'Unknown error');
    const stack = readProp('stack');
    if (stack) err.stack = stack;
    return err;
  }
  if (typeof raw === 'string') return new Error(raw);
  if (typeof raw === 'number' || typeof raw === 'boolean') return new Error(String(raw));
  return new Error('Unknown error');
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(raw: unknown): Partial<State> {
    // iOS Capacitor throws empty {} at startup — ignore them completely.
    if (isEmptyNativeArtifact(raw)) {
      console.warn('[ErrorBoundary] Ignored empty native React artifact');
      return {}; // No state change — children keep rendering
    }
    return { hasError: true, error: normaliseError(raw) };
  }

  public componentDidCatch(raw: unknown, errorInfo: ErrorInfo) {
    if (isEmptyNativeArtifact(raw)) {
      console.warn('[ErrorBoundary] Ignored empty native React artifact');
      return;
    }
    const error = normaliseError(raw);
    console.error('[ErrorBoundary] Caught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleGoBack = () => {
    window.history.back();
  };

  private handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  public render() {
    if (this.state.hasError) {
      // Render() guard: even if hasError was set, if the error has no real
      // content, render children normally (React may merge partial state).
      if (!this.state.error || isEmptyNativeArtifact(this.state.error)) {
        return this.props.children;
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
          <div className="max-w-md w-full text-center space-y-6">
            <div className="w-16 h-16 mx-auto bg-destructive/10 rounded-full flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-destructive" />
            </div>

            <div className="space-y-2">
              <h1 className="text-2xl font-bold text-foreground">Something went wrong</h1>
              <p className="text-muted-foreground">
                A runtime error was thrown while rendering. Full message and stack trace below.
              </p>
            </div>

            {this.state.error && (
              <div className="text-left bg-muted/50 rounded-lg p-4 overflow-auto max-h-60">
                <p className="text-sm font-mono text-destructive break-all">
                  {this.state.error.toString()}
                </p>
                {this.state.error.stack && (
                  <pre className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-all">
                    {this.state.error.stack}
                  </pre>
                )}
                {this.state.errorInfo?.componentStack && (
                  <pre className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-all">
                    {this.state.errorInfo.componentStack}
                  </pre>
                )}
              </div>
            )}

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
