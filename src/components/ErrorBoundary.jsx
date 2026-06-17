import React from 'react';
import AppErrorMessage from './ui/AppErrorMessage';
import { normalizeAppError } from '../utils/errorMessages';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, errorId: null, technicalDetail: null };
    this.handleRetry = this.handleRetry.bind(this);
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    error.__ErrorBoundary = true;
    window.__COMPONENT_ERROR__?.(error, errorInfo);

    const { errorId, technicalDetail } = normalizeAppError(error, 'ErrorBoundary');
    this.setState({ errorId, technicalDetail });
  }

  handleRetry() {
    this.setState({ hasError: false, errorId: null, technicalDetail: null });
  }

  render() {
    if (this.state.hasError) {
      return (
        <AppErrorMessage
          fullPage
          title="Algo salió mal"
          message="Ocurrió un error inesperado en la aplicación. Puedes intentar recargar o volver al inicio."
          errorId={this.state.errorId}
          technicalDetail={this.state.technicalDetail}
          onRetry={this.handleRetry}
          onBack="/"
        />
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
