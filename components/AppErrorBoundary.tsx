'use client';

import React from 'react';
import { reportAppError } from '@/lib/appErrorReporting';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
  errorMessage: string;
};

export class AppErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      errorMessage: error?.message || 'Erro desconhecido',
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    void reportAppError({
      source: 'react_error_boundary',
      message: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack || undefined,
      errorName: error.name,
    });
  }

  private handleReload = () => {
    if (typeof window !== 'undefined') window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#0f1218] text-white p-6">
          <div className="max-w-md w-full rounded-xl border border-[#2d3340] bg-[#1a1f29] p-6 text-center space-y-4">
            <h1 className="text-lg font-bold text-red-400">Algo deu errado</h1>
            <p className="text-sm text-gray-400">
              A aplicação encontrou um erro. O registro foi enviado para análise
              (incluindo iOS Safari).
            </p>
            {this.state.errorMessage && (
              <p className="text-xs text-gray-500 font-mono break-all bg-black/30 rounded p-2">
                {this.state.errorMessage}
              </p>
            )}
            <button
              type="button"
              onClick={this.handleReload}
              className="w-full py-2.5 rounded-lg bg-[#4999e9] hover:bg-[#3b82d9] text-sm font-semibold"
            >
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
