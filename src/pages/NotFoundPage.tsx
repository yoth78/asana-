import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Home, ArrowLeft } from 'lucide-react';
import '../components/auth/Auth.css';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div
      className="flex flex-col items-center justify-center min-h-[80vh] p-4 text-center"
      style={{ padding: 32 }}
    >
      <div style={{ maxWidth: 420, width: '100%' }}>
        <h1
          style={{
            fontSize: '4.5rem',
            fontWeight: 700,
            color: 'var(--text-muted)',
            marginBottom: 8,
            letterSpacing: '-0.04em'
          }}
        >
          404
        </h1>
        <h2 style={{ fontSize: '1.5rem', marginBottom: 12 }}>Page not found</h2>
        <p className="text-muted" style={{ marginBottom: 28 }}>
          This URL does not match any page in Teamflow.
        </p>
        <div className="flex gap-4 justify-center" style={{ flexWrap: 'wrap' }}>
          <button className="btn btn-secondary" onClick={() => navigate(-1)}>
            <ArrowLeft size={18} /> Go back
          </button>
          <button className="btn btn-primary" onClick={() => navigate('/dashboard')}>
            <Home size={18} /> Dashboard
          </button>
        </div>
        <div className="auth-legal-links" style={{ marginTop: 28 }}>
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </div>
      </div>
    </div>
  );
};
