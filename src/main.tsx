import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './styles.css';
import './editor/chrome.css';
import './themeControls.css';

class ErrorBoundary extends React.Component<React.PropsWithChildren, { error: string }> {
  state = { error: '' };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() {
    if (this.state.error) return <main className="fatal-error"><img src="./squid.svg" alt="" /><h1>Squidware needs a restart</h1><p>Your latest autosave stays on this device.</p><pre>{this.state.error}</pre><button onClick={() => location.reload()}>Reload studio</button></main>;
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>);
