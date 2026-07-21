import React, { Component, ErrorInfo, ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { AlertTriangle, RefreshCw, ArrowLeft } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  isIgnorable: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

/**
 * Detect iOS Capacitor / React StrictMode empty artefacts.
 *
 * These are {} objects or Error objects with no real message that Capacitor
 * surfaces during double-mount. They must NOT trigger the crash screen.
 */
function isEmptyNativeArtifact(raw: unknown): boolean {
  if (raw === null || raw === undefined) return true;

  // An Error with an empty message is an iOS artefact
  if (raw instanceof Error) {
    const msg = String(raw.message ?? '').trim();
    return !msg;
  }

  if (typeof raw !== 'object') return false;

  const obj = raw as Record<string, unknown>;

  // Check all own properties (including non-enumerable)
  const allKeys = new Set([
    ...Object.keys(obj),
    ...Object.getOwnPropertyNames(obj),
  ]);

  // If the object has any meaningful field with a non-empty value, it's real
  for (const key of ['message', 'errorMessage', 'code', 'details', 'hint', 'error', 'data']) {
    const desc = Object.getOwnPropertyDescriptor(obj, key);
    const value = desc?.value ?? (obj as any)[key];
    if (value != null && String(value).trim() !== '' && String(value) !== '{}') return false;
  }

  // Only auto-generated Error fields → artefact
  const onlyGeneratedFields = [...allKeys].every((k) =>
    ['stack', 'name', 'message', 'errorMessage', '__proto__', 'constructor'].includes(k)
  );
  return allKeys.size === 0 || onlyGeneratedFields;
}

function normaliseError(raw: unknown): Error {
  if (raw instanceof Error) return raw;
  if (raw !== null && typeof raw === 'object') {
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
    err.stack = readProp('stack') || err.stack;
    return err;
  }
  if (typeof raw === 'string') return new Error(raw);
  return new Error('Unknown error');
}

export class AppErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    isIgnorable: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(raw: unknown): State {
    if (isEmptyNativeArtifact(raw)) {
      // Mark as ignorable — render() will return children normally
      return { hasError: true, isIgnorable: true, error: null, errorInfo: null };
    }
    return { hasError: true, isIgnorable: false, error: normaliseError(raw), errorInfo: null };
  }

  public componentDidCatch(raw: unknown, errorInfo: ErrorInfo) {
    if (isEmptyNativeArtifact(raw)) {
      console.warn('[ErrorBoundary] Ignored empty iOS Capacitor artefact');
      // Reset so children render normally on next paint
      this.setState({ hasError: false, isIgnorable: false, error: null, errorInfo: null });
      return;
    }
    const error = normaliseError(raw);
    console.error('[ErrorBoundary] Caught error:', error.message, errorInfo);
    this.setState({ errorInfo });
  }

  private handleReload = () => window.location.reload();
  private handleGoBack = () => window.history.back();
  private handleReset = () => this.setState({ hasError: false, isIgnorable: false, error: null, errorInfo: null });

  public render() {
    const { hasError, isIgnorable, error } = this.state;

    // Ignorable artefact — render children as if nothing happened
    if (!hasError || isIgnorable) {
      return this.props.children;
    }

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
              A runtime error was thrown while rendering. Full message and stack trace below.
            </p>
          </div>
          {error && (
            <div className="text-left bg-muted/50 rounded-lg p-4 overflow-auto max-h-60">
              <p className="text-sm font-mono text-destructive break-all">{error.toString()}</p>
              {error.stack && (
                <pre className="text-xs text-muted-foreground mt-2 whitespace-pre-wrap break-all">
                  {error.stack}
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
}
