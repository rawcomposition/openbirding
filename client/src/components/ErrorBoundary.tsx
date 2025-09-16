import React from "react";
import { Button } from "./ui/button";
import { Link } from "react-router-dom";

type ErrorBoundaryState = {
  hasError: boolean;
  error?: Error;
  errorInfo?: React.ErrorInfo;
};

type ErrorBoundaryProps = {
  children: React.ReactNode;
  fallback?: React.ComponentType<{ error: Error; resetError: () => void }>;
};

class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ error, errorInfo });

    console.error("Error caught by boundary:", error, errorInfo);
  }

  resetError = () => {
    this.setState({ hasError: false, error: undefined, errorInfo: undefined });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        const FallbackComponent = this.props.fallback;
        return <FallbackComponent error={this.state.error!} resetError={this.resetError} />;
      }

      return (
        <div className="flex flex-col items-center justify-center px-4 pt-8 sm:pt-24 pb-8">
          <div className="max-w-md">
            <div className="text-center">
              <div className="mb-6">
                <div className="text-6xl font-bold text-red-400 mb-4">⚠️</div>
                <h1 className="text-2xl font-bold text-slate-900 mb-2">Something went wrong</h1>
                <p className="text-slate-700 mb-6">
                  We encountered an unexpected error. Please try refreshing the page or contact support if the problem
                  persists.
                </p>
              </div>

              <div className="space-y-2">
                <Button onClick={() => window.location.reload()} variant="outline" className="w-full">
                  Refresh Page
                </Button>

                <Button asChild variant="link" className="w-full">
                  <Link to="/">Or go home</Link>
                </Button>
              </div>

              {process.env.NODE_ENV === "development" && this.state.error && (
                <details className="mt-8 text-left">
                  <summary className="cursor-pointer text-slate-600 hover:text-slate-700 mb-2">Error Details</summary>
                  <div className="bg-slate-100 p-4 rounded-lg text-sm text-red-700 font-mono overflow-auto">
                    <div className="mb-2">
                      <strong>Error:</strong> {this.state.error.message}
                    </div>
                    {this.state.error.stack && (
                      <div>
                        <strong>Stack:</strong>
                        <pre className="whitespace-pre-wrap mt-1">{this.state.error.stack}</pre>
                      </div>
                    )}
                  </div>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
