import React from 'react';
import { reportException } from '../lib/monitoring';

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, requestId: null };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    const requestId = typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    this.setState({ requestId });
    reportException(error, {
      source: 'react_error_boundary',
      request_id: requestId,
      component_stack: info?.componentStack?.slice(0, 2000),
    });
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen flex items-center justify-center bg-paper px-4">
        <div className="w-full max-w-md bg-surface border border-line rounded-xl p-6 text-center">
          <h1 className="font-bold text-ink mb-2">خطایی غیرمنتظره رخ داد</h1>
          <p className="text-sm text-ink/60 mb-4">
            اطلاعات مالی شما حذف نشده است. صفحه را دوباره بارگذاری کنید.
          </p>
          {this.state.requestId && (
            <p className="text-xs text-ink/40 mb-4">کد پیگیری: {this.state.requestId}</p>
          )}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="focus-ring bg-ink text-white rounded-md px-4 py-2 text-sm"
          >
            بارگذاری دوباره
          </button>
        </div>
      </div>
    );
  }
}
