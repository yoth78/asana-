import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { LogIn, Mail, Lock } from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import './Auth.css';

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const login = useAuthStore((state) => state.login);
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const isLoading = useAuthStore((state) => state.isLoading);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      toast.error('Please enter both email and password');
      return;
    }

    try {
      await login(email, password);
      toast.success('Login successful');
      navigate('/dashboard');
    } catch (err: any) {
      if (err?.code === 'EMAIL_NOT_VERIFIED') {
        toast.error('Please verify your email first');
        navigate(`/signup?verifyEmail=${encodeURIComponent(err.email || email)}`);
        return;
      }
      toast.error(err.message || 'Login failed');
    }
  };

  const handleGoogle = async (idToken: string) => {
    try {
      await loginWithGoogle(idToken, { intent: 'login' });
      toast.success('Signed in with Google');
      navigate('/dashboard');
    } catch (err: any) {
      if (err?.code === 'GOOGLE_ACCOUNT_NOT_FOUND' || err?.code === 'GOOGLE_NEEDS_WORKSPACE') {
        toast.error('No workspace yet. Create one on signup.');
        navigate('/signup');
        return;
      }
      toast.error(err.message || 'Google sign-in failed');
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-header">
          <div className="auth-logo">
            <LogIn size={24} />
          </div>
          <h2>Sign in</h2>
          <p>Access your Teamflow workspace</p>
        </div>

        <GoogleSignInButton intent="login" disabled={isLoading} onCredential={handleGoogle} />
        <div className="auth-divider">or</div>

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
                autoComplete="email"
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="password">Password</label>
            <div className="input-icon-wrapper">
              <Lock className="input-icon" size={18} />
              <input
                id="password"
                type="password"
                placeholder="Your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                autoComplete="current-password"
              />
            </div>
          </div>

          <div className="auth-actions">
            <label className="remember-me">
              <input type="checkbox" />
              <span>Remember me</span>
            </label>
            <Link to="/forgot-password" className="forgot-link">
              Forgot password?
            </Link>
          </div>

          <button type="submit" className="auth-btn" disabled={isLoading}>
            {isLoading ? <span className="loader"></span> : 'Sign in'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Need a workspace? <Link to="/signup">Create one</Link>
          </p>
          <div className="auth-legal-links">
            <Link to="/privacy">Privacy</Link>
            <Link to="/terms">Terms</Link>
          </div>
        </div>
      </div>
    </div>
  );
};
