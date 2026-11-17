import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import '../auth/Auth.css';

type Props = {
  title?: string;
  message?: string;
  onRetry?: () => void;
};

/** Friendly full-page error for production users (no stack traces). */
export const ErrorPage: React.FC<Props> = ({
  title = 'Something went wrong',
  message = 'We hit an unexpected problem loading this page. You can try again, or go back to your workspace.',
  onRetry
}) => {
  return (
    <div className="auth-container">
      <div className="auth-card" style={{ textAlign: 'center' }}>
        <div className="auth-logo" style={{ background: 'var(--error)' }}>
          <AlertTriangle size={24} />
        </div>
        <div className="auth-header">
          <h2>{title}</h2>
          <p>{message}</p>
        </div>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          {onRetry && (
            <button type="button" className="auth-btn" style={{ flex: 1, minWidth: 140 }} onClick={onRetry}>
              <RefreshCw size={16} style={{ marginRight: 8 }} /> Try again
            </button>
          )}
          <Link
            to="/dashboard"
            className="auth-btn"
            style={{
              flex: 1,
              minWidth: 140,
              textDecoration: 'none',
              background: 'var(--bg-body)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)'
            }}
          >
            <Home size={16} style={{ marginRight: 8 }} /> Dashboard
          </Link>
        </div>
        <div className="auth-legal-links" style={{ marginTop: 24 }}>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>
      </div>
    </div>
  );
};
