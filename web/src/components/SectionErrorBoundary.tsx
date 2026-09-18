import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Alert } from '@mui/material';

interface Props {
  name: string;
  children: ReactNode;
  /** When this changes (e.g. fresh data arrives), a failed section tries again. */
  resetKey?: unknown;
}

interface State {
  error: Error | null;
}

/**
 * Keeps one broken part of a page from blanking the whole page: if its
 * children throw while rendering, it shows what failed instead, and the rest
 * of the page keeps working.
 */
export default class SectionErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`[${this.props.name}] failed to render`, error, info.componentStack);
  }

  componentDidUpdate(prev: Props) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null });
    }
  }

  render() {
    if (this.state.error) {
      return (
        <Alert severity="error" sx={{ my: 2, borderRadius: 3 }}>
          <strong>{this.props.name} could not be shown.</strong> {this.state.error.message}. The data may be in a
          shape this app does not expect — the {'<>'} button shows the raw data.
        </Alert>
      );
    }
    return this.props.children;
  }
}
