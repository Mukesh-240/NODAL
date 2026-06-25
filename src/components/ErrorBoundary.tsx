'use client';
import React, { ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

export class ErrorBoundary extends React.Component<Props> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="w-full h-screen flex items-center justify-center">
          <div className="text-center">
            <span className="material-symbols-outlined text-[48px] text-red-500">error</span>
            <p className="font-medium text-zinc-900 mt-4">Failed to load insights</p>
            <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 bg-black text-white rounded-lg">
              Retry
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
