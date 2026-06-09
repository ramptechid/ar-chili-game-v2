import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      
      return (
        <div className="flex flex-col items-center justify-center p-8 bg-slate-900/90 text-white rounded-3xl border border-red-500/30 max-w-sm mx-auto my-10">
          <h2 className="text-2xl font-black text-red-500 mb-4">Something went wrong</h2>
          <p className="text-slate-400 text-center mb-8">
            The application encountered an error while loading 3D assets or starting AR.
          </p>
          <div className="bg-black/50 p-4 rounded-xl font-mono text-xs text-red-400 mb-8 break-all max-w-full">
            {this.state.error?.message}
          </div>
          <button 
            onClick={() => window.location.reload()}
            className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-4 rounded-2xl transition-all"
          >
            Reload Game
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
