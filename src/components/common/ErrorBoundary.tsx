import React from 'react';
import { ErrorPage } from './ErrorPage';

type Props = {
  children: React.ReactNode;
};

type State = {
  hasError: boolean;
};

/** Catches React render crashes and shows a clear page instead of a blank screen. */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // Keep details in the console for developers; never show stacks to end users.
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false });
  };

  render() {
    if (this.state.hasError) {
      return (
        <ErrorPage
          title="Something went wrong"
          message="This screen failed to load. Try again, or return to your dashboard."
          onRetry={this.handleRetry}
        />
      );
    }
    return this.props.children;
  }
}
