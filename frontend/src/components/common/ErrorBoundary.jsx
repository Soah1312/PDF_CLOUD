import React from 'react';
import { AlertCircle, RefreshCw, Home } from 'lucide-react';

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('[CloudPDF Studio] Unhandled React error caught by ErrorBoundary:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      const errorMessage =
        this.state.error?.message ||
        (typeof this.state.error === 'string' ? this.state.error : 'An unexpected rendering error occurred.');

      return (
        <div className="min-h-screen bg-[#F1E9DA] flex items-center justify-center p-6 text-[#241B14]">
          <div className="max-w-md w-full bg-[#FAF6EE] border border-[#E2D9CC] rounded-lg shadow-xl p-8 space-y-6 text-center animate-fade-in">
            <div className="w-12 h-12 mx-auto rounded-full bg-[#D9441F]/10 border border-[#D9441F]/30 flex items-center justify-center text-[#D9441F]">
              <AlertCircle className="w-6 h-6" />
            </div>

            <div className="space-y-2">
              <h2 className="font-serif text-2xl font-bold text-[#241B14]">
                Workbench Interrupted
              </h2>
              <p className="text-xs text-[#5C4A3A] leading-relaxed">
                The interface encountered an unexpected state. Your document security and privacy guarantees remain intact.
              </p>
            </div>

            <div className="p-3 rounded border border-[#E2D9CC] bg-[#EAE2D2]/40 text-left text-xs font-mono text-[#5C4A3A] break-all max-h-32 overflow-y-auto">
              {errorMessage}
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => window.location.reload()}
                className="w-full sm:w-auto px-4 py-2 rounded bg-[#D9441F] text-[#FAF6EE] text-xs font-semibold shadow hover:bg-[#B33516] transition-colors flex items-center justify-center gap-2 min-h-[40px]"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Page</span>
              </button>
              <button
                type="button"
                onClick={this.handleReset}
                className="w-full sm:w-auto px-4 py-2 rounded border border-[#E2D9CC] bg-[#FAF6EE] hover:bg-[#EAE2D2] text-[#241B14] text-xs font-mono transition-colors flex items-center justify-center gap-2 min-h-[40px]"
              >
                <Home className="w-3.5 h-3.5" />
                <span>Return to Bench</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
