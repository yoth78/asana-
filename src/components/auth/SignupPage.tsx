import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import toast from 'react-hot-toast';
import { UserPlus, Mail, Lock, User as UserIcon, Building2, KeyRound } from 'lucide-react';
import { GoogleSignInButton } from './GoogleSignInButton';
import './Auth.css';

export const SignupPage: React.FC = () => {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const inviteToken = params.get('token');
  const inviteEmail = params.get('email');
  const prefillVerifyEmail = params.get('verifyEmail');

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [pendingEmail, setPendingEmail] = useState<string | null>(prefillVerifyEmail);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [inviteAwaitingOtp, setInviteAwaitingOtp] = useState(false);
  const [inviteWorkspaceName, setInviteWorkspaceName] = useState<string | null>(null);
  const [inviteExistingUser, setInviteExistingUser] = useState(false);
  const [invitePreviewError, setInvitePreviewError] = useState<string | null>(null);
  const [invitePreviewLoading, setInvitePreviewLoading] = useState(Boolean(inviteToken));
  const [signupOpen, setSignupOpen] = useState<boolean | null>(inviteToken ? true : null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [resending, setResending] = useState(false);

  const signup = useAuthStore((state) => state.signup);
  const loginWithGoogle = useAuthStore((state) => state.loginWithGoogle);
  const verifySignup = useAuthStore((state) => state.verifySignup);
  const resendSignupOtp = useAuthStore((state) => state.resendSignupOtp);
  const previewInvitation = useAuthStore((state) => state.previewInvitation);
  const startInvitationAccept = useAuthStore((state) => state.startInvitationAccept);
  const acceptInvitationWithToken = useAuthStore((state) => state.acceptInvitationWithToken);
  const isLoading = useAuthStore((state) => state.isLoading);
  const navigate = useNavigate();

  useEffect(() => {
    if (!inviteToken) return;
    let cancelled = false;
    (async () => {
      setInvitePreviewLoading(true);
      try {
        const preview = await previewInvitation(inviteToken);
        if (cancelled) return;
        setInviteWorkspaceName(preview.workspaceName);
        setInviteExistingUser(preview.existingUser);
        setInvitePreviewError(null);
      } catch (err: any) {
        if (!cancelled) setInvitePreviewError(err.message || 'Invalid invitation');
      } finally {
        if (!cancelled) setInvitePreviewLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [inviteToken, previewInvitation]);

  useEffect(() => {
    if (inviteToken) return;

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/signup-status');
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (!res.ok) {
          setStatusError(data.error || 'Could not check signup status. Is the API running?');
          setSignupOpen(null);
          return;
        }
        setStatusError(null);
        setSignupOpen(Boolean(data.open));
      } catch {
        if (!cancelled) {
          setStatusError('Could not reach the server. Start the API and refresh.');
          setSignupOpen(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inviteToken]);

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteToken || !inviteEmail) {
      toast.error('Invalid invitation link');
      return;
    }

    const needsPassword = !inviteExistingUser;
    if (needsPassword) {
      if (!password || password !== confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
      if (password.length < 6) {
        toast.error('Password must be at least 6 characters');
        return;
      }
    }

    try {
      if (!inviteAwaitingOtp) {
        const started = await startInvitationAccept(inviteToken);
        setInviteAwaitingOtp(true);
        setInviteExistingUser(Boolean(started.existingUser));
        if (started.workspaceName) setInviteWorkspaceName(started.workspaceName);
        setOtpCode('');
        setDevCode(started.devCode || null);
        toast.success(`We sent a code to ${started.email}. Enter it to finish joining.`);
        return;
      }

      if (!otpCode.trim()) {
        toast.error('Enter the confirmation code from your email');
        return;
      }

      await acceptInvitationWithToken(
        inviteToken,
        otpCode.trim(),
        needsPassword ? password : undefined
      );
      toast.success(
        inviteExistingUser
          ? `Joined ${inviteWorkspaceName || 'workspace'}. Switch workspaces anytime from the header.`
          : 'Invitation accepted. Welcome!'
      );
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Failed to accept invitation');
    }
  };

  const handleResendInviteOtp = async () => {
    if (!inviteToken) return;
    setResending(true);
    try {
      const started = await startInvitationAccept(inviteToken);
      setDevCode(started.devCode || null);
      toast.success('A new confirmation code was sent');
    } catch (err: any) {
      toast.error(err.message || 'Could not resend code');
    } finally {
      setResending(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !companyName || !password || !confirmPassword) {
      toast.error('Please fill in all fields');
      return;
    }
    if (password !== confirmPassword) {
      toast.error('Passwords do not match');
      return;
    }
    if (password.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }

    try {
      const result = await signup(email, name, password, companyName);
      if (result.requiresVerification) {
        setPendingEmail(result.email);
        setOtpCode('');
        setDevCode(result.devCode || null);
        toast.success('Enter the verification code to finish signup');
        return;
      }
      toast.success('Workspace created! You are now the Super Admin.');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Signup failed');
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingEmail || !otpCode.trim()) {
      toast.error('Enter the verification code');
      return;
    }
    try {
      await verifySignup(pendingEmail, otpCode.trim());
      toast.success('Email verified. Your workspace is ready!');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Verification failed');
    }
  };

  const handleGoogle = async (idToken: string) => {
    if (!companyName.trim()) {
      toast.error('Enter your company / workspace name first');
      return;
    }
    try {
      await loginWithGoogle(idToken, { intent: 'signup', companyName: companyName.trim() });
      toast.success('Workspace created with Google');
      navigate('/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Google sign-up failed');
    }
  };

  const handleResend = async () => {
    if (!pendingEmail || resending) return;
    setResending(true);
    try {
      const result = await resendSignupOtp(pendingEmail);
      setDevCode(result.devCode || null);
      toast.success('A new code was sent if that account needs verification');
    } catch (err: any) {
      toast.error(err.message || 'Could not resend code');
    } finally {
      setResending(false);
    }
  };

  if (inviteToken) {
    if (invitePreviewLoading) {
      return (
        <div className="auth-container">
          <div className="auth-card">
            <div className="auth-header">
              <h2>Loading invitation…</h2>
            </div>
          </div>
        </div>
      );
    }

    if (invitePreviewError) {
      return (
        <div className="auth-container">
          <div className="auth-card">
            <div className="auth-header">
              <div className="auth-logo">
                <UserPlus size={28} />
              </div>
              <h2>Invitation unavailable</h2>
              <p>{invitePreviewError}</p>
            </div>
            <div className="auth-footer">
              <p>
                <Link to="/login">Sign in</Link>
              </p>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="auth-container">
        <div className="auth-card">
          <div className="auth-header">
            <div className="auth-logo">
              <UserPlus size={28} />
            </div>
            <h2>Join {inviteWorkspaceName || 'workspace'}</h2>
            <p>
              {inviteExistingUser
                ? inviteAwaitingOtp
                  ? `Enter the code sent to ${inviteEmail}. Your existing TeamFlow password stays the same.`
                  : `You already have a TeamFlow account. Confirm with an email code to join — no new password needed.`
                : inviteAwaitingOtp
                  ? `Enter the code sent to ${inviteEmail} to finish creating your account`
                  : 'Choose a password, then we email a confirmation code to the invited address'}
            </p>
          </div>

          <form onSubmit={handleAccept} className="auth-form">
            <div className="input-group">
              <label htmlFor="email">Email</label>
              <div className="input-icon-wrapper">
                <Mail className="input-icon" size={18} />
                <input id="email" type="email" value={inviteEmail || ''} disabled />
              </div>
            </div>

            {!inviteExistingUser && (
              <>
                <div className="input-group">
                  <label htmlFor="password">Password</label>
                  <div className="input-icon-wrapper">
                    <Lock className="input-icon" size={18} />
                    <input
                      id="password"
                      type="password"
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      disabled={isLoading || inviteAwaitingOtp}
                    />
                  </div>
                </div>

                <div className="input-group">
                  <label htmlFor="confirmPassword">Confirm Password</label>
                  <div className="input-icon-wrapper">
                    <Lock className="input-icon" size={18} />
                    <input
                      id="confirmPassword"
                      type="password"
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      disabled={isLoading || inviteAwaitingOtp}
                    />
                  </div>
                </div>
              </>
            )}

            {inviteAwaitingOtp && (
              <div className="input-group">
                <label htmlFor="inviteOtp">Confirmation code</label>
                <div className="input-icon-wrapper">
                  <KeyRound className="input-icon" size={18} />
                  <input
                    id="inviteOtp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    placeholder="6-digit code"
                    value={otpCode}
                    onChange={(e) => setOtpCode(e.target.value)}
                    disabled={isLoading}
                  />
                </div>
                {devCode && <p className="auth-hint">Dev code: {devCode}</p>}
                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginTop: 8 }}
                  onClick={handleResendInviteOtp}
                  disabled={resending || isLoading}
                >
                  {resending ? 'Sending…' : 'Resend code'}
                </button>
              </div>
            )}

            <div className="auth-actions">
              <label className="terms">
                <input type="checkbox" required />
                <span>
                  I agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>
                </span>
              </label>
            </div>

            <button type="submit" className="auth-btn" disabled={isLoading}>
              {isLoading ? (
                <span className="loader"></span>
              ) : inviteAwaitingOtp ? (
                'Verify & join'
              ) : (
                'Send confirmation code'
              )}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Invite expired or wrong link? <Link to="/login">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (statusError) {
    return (
      <div className="auth-container">
        <div
          className="auth-card"
          >
          <div className="auth-header">
            <div className="auth-logo">
              <Building2 size={28} />
            </div>
            <h2>Can&apos;t reach the server</h2>
            <p>{statusError}</p>
          </div>
          <div className="auth-footer">
            <p>
              Restart the API, then{' '}
              <button type="button" className="btn btn-secondary" onClick={() => window.location.reload()}>
                Refresh
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (signupOpen === null && !pendingEmail) {
    return (
      <div className="auth-container">
        <div className="auth-card">
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)' }}>Loading…</p>
        </div>
      </div>
    );
  }

  if (signupOpen === false && !pendingEmail) {
    return (
      <div className="auth-container">
        <div
          className="auth-card"
          >
          <div className="auth-header">
            <div className="auth-logo">
              <Building2 size={28} />
            </div>
            <h2>Invite only</h2>
            <p>This deployment is locked to a single workspace.</p>
          </div>
          <div className="signup-role-info">
            <p className="role-info-desc">
              Ask a Super Admin or Department Admin to send you an invitation link.
            </p>
          </div>
          <div className="auth-footer">
            <p>
              Already invited? Check your email/link, or <Link to="/login">Sign in</Link>
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (pendingEmail) {
    return (
      <div className="auth-container">
        <div
          className="auth-card"
          >
          <div className="auth-header">
            <div className="auth-logo">
              <KeyRound size={28} />
            </div>
            <h2>Verify your email</h2>
            <p>
              Enter the 6-digit code sent to <strong>{pendingEmail}</strong>
            </p>
          </div>

          {devCode && (
            <div className="signup-role-info" style={{ marginBottom: 16 }}>
              <p className="role-info-desc">
                Local dev (no SMTP): your code is <strong style={{ letterSpacing: 4 }}>{devCode}</strong>
              </p>
            </div>
          )}

          <form onSubmit={handleVerify} className="auth-form">
            <div className="input-group">
              <label htmlFor="otp">Verification code</label>
              <div className="input-icon-wrapper">
                <KeyRound className="input-icon" size={18} />
                <input
                  id="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="123456"
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  disabled={isLoading}
                />
              </div>
            </div>

            <button type="submit" className="auth-btn" disabled={isLoading || otpCode.length < 6}>
              {isLoading ? <span className="loader"></span> : 'Verify & create workspace'}
            </button>
          </form>

          <div className="auth-footer">
            <p>
              Didn&apos;t get it?{' '}
              <button type="button" className="btn btn-secondary" onClick={handleResend} disabled={resending}>
                {resending ? 'Sending…' : 'Resend code'}
              </button>
            </p>
            <p style={{ marginTop: 12 }}>
              Wrong email?{' '}
              <button type="button" className="btn btn-secondary" onClick={() => setPendingEmail(null)}>
                Go back
              </button>
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-container">
      <div
        className="auth-card"
        >
        <div className="auth-header">
          <div className="auth-logo">
            <Building2 size={28} />
          </div>
          <h2>Create a workspace</h2>
          <p>Use Google, or continue with email verification</p>
        </div>

        <div className="signup-role-info">
          <div className="role-info-badge">
            <UserPlus size={16} />
            <span>
              You&apos;ll be the <strong>Super Admin</strong>
            </span>
          </div>
          <p className="role-info-desc">
            Manage departments, invite teammates, and own billing for this workspace.
          </p>
        </div>

        <div className="input-group" style={{ marginBottom: 16 }}>
          <label htmlFor="companyNameGoogle">Company / workspace name</label>
          <div className="input-icon-wrapper">
            <Building2 className="input-icon" size={18} />
            <input
              id="companyNameGoogle"
              type="text"
              placeholder="Acme Inc"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              disabled={isLoading}
            />
          </div>
        </div>

        {!companyName.trim() && (
          <p className="google-hint">Enter a company name to enable Google signup</p>
        )}
        <GoogleSignInButton
          intent="signup"
          companyName={companyName}
          disabled={isLoading || !companyName.trim()}
          onCredential={handleGoogle}
        />
        <div className="auth-divider">or email</div>

        <form onSubmit={handleSubmit} className="auth-form">
          <div className="input-group">
            <label htmlFor="name">Full Name</label>
            <div className="input-icon-wrapper">
              <UserIcon className="input-icon" size={18} />
              <input
                id="name"
                type="text"
                placeholder="John Doe"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="email">Work email</label>
            <div className="input-icon-wrapper">
              <Mail className="input-icon" size={18} />
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
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
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="input-group">
            <label htmlFor="confirmPassword">Confirm Password</label>
            <div className="input-icon-wrapper">
              <Lock className="input-icon" size={18} />
              <input
                id="confirmPassword"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                disabled={isLoading}
              />
            </div>
          </div>

          <div className="auth-actions">
            <label className="terms">
              <input type="checkbox" required />
              <span>
                I agree to the <Link to="/terms">Terms</Link> and <Link to="/privacy">Privacy Policy</Link>
              </span>
            </label>
          </div>

          <button type="submit" className="auth-btn" disabled={isLoading}>
            {isLoading ? <span className="loader"></span> : 'Continue'}
          </button>
        </form>

        <div className="auth-footer">
          <p>
            Already have an account? <Link to="/login">Sign in</Link>
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
