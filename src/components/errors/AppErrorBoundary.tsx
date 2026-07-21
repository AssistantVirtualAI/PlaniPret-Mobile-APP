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
 * Extract a meaningful message from any thrown value.
 * Returns null if the error is empty/non-fatal (iOS Capacitor artefact).
 *
 * iOS Capacitor throws internal `{}` objects at startup (e.g. from StatusBar
 * UNIMPLEMENTED responses). These have no message, no stack, and no enumerable
 * properties — but may have non-enumerable ones. We must not show a crash
 * screen for these.
 */
function extractMessage(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;

  // Real Error objects always have a message
  if (raw instanceof Error) {
    return raw.message || null;
  }

  if (typeof raw === 'string') return raw || null;
  if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);

  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;

    // Try every possible way to get a message — including non-enumerable props
    const tryGet = (key: string): string | null => {
      try {
        const val = obj[key] ?? Object.getOwnPropertyDescriptor(obj, key)?.value;
        return val != null && String(val).trim() ? String(val).trim() : null;
      } catch { return null; }
    };

    return (
      tryGet('message') ||
      tryGet('hint') ||
      tryGet('details') ||
      tryGet('code') ||
      tryGet('error') ||
      tryGet('description') ||
      null  // No message found → treat as non-fatal iOS artefact
    );
  }

  return null;
}

function normaliseError(raw: unknown): Error {
  if (raw instanceof Error) return raw;
  const msg = extractMessage(raw) || 'Unknown error';
  const err = new Error(msg);
  if (typeof raw === 'object' && raw !== null) {
    try {
      const stack = (raw as any).stack ?? Object.getOwnPropertyDescriptor(raw, 'stack')?.value;
      if (stack) err.stack = String(stack);
    } catch {}
  }
  return err;
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(raw: unknown): Partial<State> {
    // CRITICAL: iOS Capacitor throws empty {} objects at startup from internal
    // events (StatusBar UNIMPLEMENTED, React StrictMode double-mount artefacts).
    // If we cannot extract a real message, we MUST NOT show the crash screen.
    const msg = extractMessage(raw);
    if (!msg) {
      console.warn('[ErrorBoundary] Ignoring non-fatal empty error:', raw);
      return {}; // No state change — children keep rendering
    }
    return { hasError: true, error: normaliseError(raw) };
  }

  public componentDidCatch(raw: unknown, errorInfo: ErrorInfo) {
    const msg = extractMessage(raw);
    if (!msg) return; // Same guard — skip empty errors silently
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
      // Double-check: if there's no real message, don't show crash screen.
      // This handles the case where getDerivedStateFromError returned {} but
      // React still set hasError=true due to internal state merging behaviour.
      const msg = this.state.error ? extractMessage(this.state.error) : null;
      if (!msg) {
        // Reset state and render children normally
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
