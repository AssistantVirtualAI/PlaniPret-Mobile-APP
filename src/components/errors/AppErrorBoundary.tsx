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
 * Normalise any thrown value into a proper Error object with a message.
 *
 * Supabase PostgrestError objects have non-enumerable properties, so they
 * serialise as `{}` when cast to string. We extract the message / hint /
 * code fields manually to produce a readable error message.
 */
function normaliseError(raw: unknown): Error {
  if (raw instanceof Error) return raw;

  // Handle plain objects (e.g. PostgrestError { message, hint, code, details })
  if (raw !== null && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    // Try to read Supabase-style fields — they are non-enumerable so we use
    // Object.getOwnPropertyDescriptor to access them even when JSON.stringify
    // returns "{}".
    const readProp = (key: string): string | undefined => {
      const val =
        obj[key] ??
        Object.getOwnPropertyDescriptor(obj, key)?.value;
      return val != null ? String(val) : undefined;
    };

    const message =
      readProp('message') ||
      readProp('hint') ||
      readProp('details') ||
      readProp('code') ||
      readProp('error') ||
      JSON.stringify(raw);

    const err = new Error(message || 'Unknown error (empty object)');
    err.stack = readProp('stack') || err.stack;
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
    // Ignore empty/falsy errors — React StrictMode double-mount artefacts or
    // non-fatal iOS Capacitor internal events surface as `{}` with no message.
    // Returning {} (no state change) prevents the crash screen from showing.
    if (!raw) return {};
    if (typeof raw === 'object' && !(raw instanceof Error) && Object.keys(raw).length === 0) return {};
    const msg = (raw as any)?.message ?? '';
    if (typeof raw === 'object' && !(raw instanceof Error) && !msg) return {};
    return { hasError: true, error: normaliseError(raw) };
  }

  public componentDidCatch(raw: unknown, errorInfo: ErrorInfo) {
    // Same guard — skip empty {} errors silently
    if (!raw) return;
    if (typeof raw === 'object' && !(raw instanceof Error) && Object.keys(raw).length === 0) return;
    const msg = (raw as any)?.message ?? '';
    if (typeof raw === 'object' && !(raw instanceof Error) && !msg) return;
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
