import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback: ReactNode;
}

interface State {
  hasError: boolean;
}

/** Catches a WebGL init crash from MapLibre so the rest of the app stays on screen. */
export default class MapBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch() {}

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}
