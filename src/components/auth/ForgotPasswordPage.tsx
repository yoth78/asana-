import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { KeyRound, Mail, ArrowLeft } from 'lucide-react';
import './Auth.css';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      toast.error('Please enter your email');
      return;
    }

    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setIsSubmitted(true);
      toast.success('If an account exists, reset instructions were sent');
    }, 1000);
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <KeyRound size={24} />
          </div>
          <h2>Reset password</h2>
          <p>Enter your account email to receive reset instructions</p>
        </div>

        {!isSubmitted ? (
          <form onSubmit={handleSubmit} className="auth-form">
            <div className="input-group">
              <label htmlFor="email">Email</label>
              <div className="input-icon-wrapper">
                <Mail className="input-icon" size={18} />
                <input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
              </div>
            </div>
            <button type="submit" className="auth-btn" disabled={isLoading}>
              {isLoading ? <span className="loader"></span> : 'Send reset link'}
            </button>
          </form>
        ) : (
          <div className="success-message">
            <div className="success-icon">OK</div>
            <p>Check your inbox for the next steps.</p>
          </div>
        )}

        <div className="auth-footer">
          <Link to="/login" className="back-link">
            <ArrowLeft size={16} /> Back to sign in
          </Link>
          <div className="auth-legal-links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </div>
      </div>
    </div>
  );
};
