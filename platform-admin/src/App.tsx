import React, { useEffect, useMemo, useState } from 'react';
import { getToken, platformFetch, setToken } from './api';
import {
  CampaignsView,
  CouponsView,
  PlansView,
  UsageOverview,
  downloadSegment
} from './Phase3Views';
import { AbuseConsoleView, ComposeMailView, GlobalFlagsView } from './Phase4Views';

type Staff = { id: string; email: string; name: string | null; role: string; mfaEnabled: boolean };

type WorkspaceListItem = {
  id: string;
  name: string;
  status: string;
  plan: string;
  memberCount: number;
  owner: { email: string; name: string | null };
};

type WorkspaceDetail = {
  id: string;
  name: string;
  status: string;
  plan: string;
  billingEmail: string | null;
  slug: string | null;
  owner: { email: string; name: string | null };
  subscription: any;
  overrides: Array<{ featureKey: string; enabled: boolean; reason: string | null; expiresAt: string | null }>;
  members: Array<{
    id: string;
    role: string;
    status: string;
    user: { id: string; email: string; name: string | null };
  }>;
};

type Entitlements = {
  plan: string;
  workspaceStatus: string;
  features: Record<string, boolean>;
  limits: { maxSeats: number };
  overrides: Array<{ featureKey: string; enabled: boolean; reason: string | null }>;
};

type View =
  | 'workspaces'
  | 'intake'
  | 'newsletter'
  | 'segments'
  | 'campaigns'
  | 'compose'
  | 'plans'
  | 'coupons'
  | 'usage'
  | 'flags'
  | 'abuse';

const FEATURE_KEYS = [
  'chat',
  'payroll',
  'time_tracking',
  'invites',
  'projects',
  'departments',
  'priority_support',
  'advanced_analytics'
];

export const App: React.FC = () => {
  const [staff, setStaff] = useState<Staff | null>(null);
  const [booting, setBooting] = useState(true);

  useEffect(() => {
    const token = getToken();
    if (!token) {
      setBooting(false);
      return;
    }
    platformFetch('/auth/me')
      .then(data => setStaff(data.staff))
      .catch(() => setToken(null))
      .finally(() => setBooting(false));
  }, []);

  if (booting) {
    return (
      <div className="auth-shell">
        <p className="muted">Loading…</p>
      </div>
    );
  }

  if (!staff) {
    return (
      <LoginFlow
        onAuthed={(nextStaff, token) => {
          setToken(token);
          setStaff(nextStaff);
        }}
      />
    );
  }

  return (
    <Console
      staff={staff}
      onLogout={() => {
        setToken(null);
        setStaff(null);
      }}
    />
  );
};

const LoginFlow: React.FC<{ onAuthed: (staff: Staff, token: string) => void }> = ({ onAuthed }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'login' | 'mfa' | 'setup'>('login');
  const [pendingToken, setPendingToken] = useState('');
  const [code, setCode] = useState('');
  const [secret, setSecret] = useState('');
  const [otpauthUrl, setOtpauthUrl] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await platformFetch('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      if (data.requiresMfaSetup) {
        setPendingToken(data.setupToken);
        setStep('setup');
        const setup = await platformFetch('/auth/mfa/setup/start', {
          method: 'POST',
          body: JSON.stringify({ setupToken: data.setupToken })
        });
        setSecret(setup.secret);
        setOtpauthUrl(setup.otpauthUrl);
        return;
      }
      if (data.requiresMfa) {
        setPendingToken(data.mfaToken);
        setStep('mfa');
        return;
      }
      setError('Unexpected login response');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  const submitMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await platformFetch('/auth/mfa/verify', {
        method: 'POST',
        body: JSON.stringify({ mfaToken: pendingToken, code })
      });
      onAuthed(data.staff, data.token);
    } catch (err: any) {
      setError(err.message || 'MFA failed');
    } finally {
      setBusy(false);
    }
  };

  const submitSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const data = await platformFetch('/auth/mfa/setup/confirm', {
        method: 'POST',
        body: JSON.stringify({ setupToken: pendingToken, code })
      });
      onAuthed(data.staff, data.token);
    } catch (err: any) {
      setError(err.message || 'Could not enable MFA');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card">
        <h1>Platform Admin</h1>
        <p className="muted">Staff access only. Product workspace admins cannot sign in here.</p>

        {step === 'login' && (
          <form onSubmit={submitLogin}>
            <label>Email</label>
            <input value={email} onChange={e => setEmail(e.target.value)} autoComplete="username" required />
            <label>Password</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
            <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
              Continue
            </button>
          </form>
        )}

        {step === 'mfa' && (
          <form onSubmit={submitMfa}>
            <label>Authenticator code</label>
            <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" required />
            <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
              Verify
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setStep('login')} style={{ width: '100%' }}>
              Back
            </button>
          </form>
        )}

        {step === 'setup' && (
          <form onSubmit={submitSetup}>
            <p className="muted">Scan this in your authenticator app, or enter the secret manually.</p>
            <div className="secret-box">
              <div>
                <strong>Secret:</strong> {secret}
              </div>
              <div style={{ marginTop: '0.5rem' }}>{otpauthUrl}</div>
            </div>
            <label>Confirm with a 6-digit code</label>
            <input value={code} onChange={e => setCode(e.target.value)} inputMode="numeric" required />
            <button className="btn" type="submit" disabled={busy} style={{ width: '100%' }}>
              Enable MFA &amp; enter
            </button>
          </form>
        )}

        {error && <div className="error">{error}</div>}
      </div>
    </div>
  );
};

const Console: React.FC<{ staff: Staff; onLogout: () => void }> = ({ staff, onLogout }) => {
  const [view, setView] = useState<View>('workspaces');
  const [error, setError] = useState('');

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <h1>Platform Admin</h1>
          <div className="muted">
            {staff.email} · {staff.role}
          </div>
        </div>
        <nav className="top-nav">
          {(
            [
              ['workspaces', 'Workspaces'],
              ['intake', 'Join requests'],
              ['newsletter', 'Newsletter'],
              ['segments', 'Segments'],
              ['campaigns', 'Campaigns'],
              ['compose', 'Compose'],
              ['plans', 'Plans'],
              ['coupons', 'Coupons'],
              ['usage', 'Usage'],
              ['flags', 'Flags'],
              ['abuse', 'Abuse']
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`nav-btn ${view === id ? 'active' : ''}`}
              onClick={() => setView(id)}
            >
              {label}
            </button>
          ))}
        </nav>
        <button className="btn btn-ghost" type="button" onClick={onLogout}>
          Sign out
        </button>
      </header>

      {error && (
        <div className="error" style={{ margin: '0.75rem 1.5rem 0' }}>
          {error}
        </div>
      )}

      {view === 'workspaces' && <WorkspacesView staff={staff} onError={setError} />}
      {view === 'intake' && <IntakeView staff={staff} onError={setError} />}
      {view === 'newsletter' && <NewsletterView onError={setError} />}
      {view === 'segments' && <SegmentsView onError={setError} />}
      {view === 'campaigns' && <CampaignsView staff={staff} onError={setError} />}
      {view === 'compose' && <ComposeMailView staff={staff} onError={setError} />}
      {view === 'plans' && <PlansView staff={staff} onError={setError} />}
      {view === 'coupons' && <CouponsView staff={staff} onError={setError} />}
      {view === 'usage' && <UsageOverview onError={setError} />}
      {view === 'flags' && <GlobalFlagsView staff={staff} onError={setError} />}
      {view === 'abuse' && <AbuseConsoleView staff={staff} onError={setError} />}
    </div>
  );
};

const WorkspacesView: React.FC<{ staff: Staff; onError: (e: string) => void }> = ({ staff, onError }) => {
  const [query, setQuery] = useState('');
  const [list, setList] = useState<WorkspaceListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<WorkspaceDetail | null>(null);
  const [entitlements, setEntitlements] = useState<Entitlements | null>(null);
  const [audit, setAudit] = useState<any[]>([]);
  const [payments, setPayments] = useState<any[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [usage, setUsage] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const [plan, setPlan] = useState('FREE');
  const [status, setStatus] = useState('ACTIVE');
  const [billingEmail, setBillingEmail] = useState('');
  const [overrideDraft, setOverrideDraft] = useState<Record<string, boolean | null>>({});
  const [overrideReason, setOverrideReason] = useState('');

  const [subStatus, setSubStatus] = useState('INACTIVE');
  const [subSeats, setSubSeats] = useState('5');
  const [renewBlocked, setRenewBlocked] = useState(false);
  const [periodEnd, setPeriodEnd] = useState('');

  const [payAmount, setPayAmount] = useState('');
  const [payProvider, setPayProvider] = useState('OTHER');
  const [payRef, setPayRef] = useState('');

  const [noteBody, setNoteBody] = useState('');
  const [impersonateUserId, setImpersonateUserId] = useState('');
  const [impersonateCode, setImpersonateCode] = useState('');
  const [impersonateLink, setImpersonateLink] = useState('');

  const canWrite = staff.role === 'OWNER' || staff.role === 'BILLING';
  const canImpersonate = ['OWNER', 'BILLING', 'SUPPORT'].includes(staff.role);

  const loadList = async (q = query) => {
    const data = await platformFetch(`/workspaces?query=${encodeURIComponent(q)}`);
    setList(data.workspaces || []);
  };

  const loadDetail = async (id: string) => {
    onError('');
    setSelectedId(id);
    setImpersonateLink('');
    const data = await platformFetch(`/workspaces/${id}`);
    setDetail(data.workspace);
    setEntitlements(data.entitlements);
    setPlan(data.workspace.plan);
    setStatus(data.workspace.status);
    setBillingEmail(data.workspace.billingEmail || '');
    const sub = data.workspace.subscription;
    setSubStatus(sub?.status || 'INACTIVE');
    setSubSeats(String(sub?.seats ?? 5));
    setRenewBlocked(Boolean(sub?.renewBlocked));
    setPeriodEnd(sub?.currentPeriodEnd ? String(sub.currentPeriodEnd).slice(0, 10) : '');
    const draft: Record<string, boolean | null> = {};
    for (const key of FEATURE_KEYS) {
      const ov = data.workspace.overrides?.find((o: any) => o.featureKey === key);
      draft[key] = ov ? ov.enabled : null;
    }
    setOverrideDraft(draft);
    const [auditData, payData, noteData, usageData] = await Promise.all([
      platformFetch(`/audit?workspaceId=${encodeURIComponent(id)}&limit=30`),
      platformFetch(`/workspaces/${id}/payments`),
      platformFetch(`/workspaces/${id}/notes`),
      platformFetch(`/workspaces/${id}/usage`)
    ]);
    setAudit(auditData.logs || []);
    setPayments(payData.payments || []);
    setNotes(noteData.notes || []);
    setUsage(usageData);
    if (data.workspace.members?.[0]) {
      setImpersonateUserId(data.workspace.members[0].user.id);
    }
  };

  useEffect(() => {
    loadList('').catch((e: any) => onError(e.message));
  }, []);

  const effectivePreview = useMemo(() => entitlements?.features || {}, [entitlements]);

  const saveWorkspace = async () => {
    if (!detail || !canWrite) return;
    setBusy(true);
    try {
      await platformFetch(`/workspaces/${detail.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ plan, status, billingEmail: billingEmail || null })
      });
      await loadDetail(detail.id);
      await loadList();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveSubscription = async () => {
    if (!detail || !canWrite) return;
    setBusy(true);
    try {
      await platformFetch(`/workspaces/${detail.id}/subscription`, {
        method: 'PATCH',
        body: JSON.stringify({
          plan,
          status: subStatus,
          seats: Number(subSeats),
          renewBlocked,
          currentPeriodEnd: periodEnd || null
        })
      });
      await loadDetail(detail.id);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveOverrides = async () => {
    if (!detail || !canWrite) return;
    setBusy(true);
    try {
      const overrides: Array<{ featureKey: string; enabled: boolean; reason?: string }> = [];
      const removeKeys: string[] = [];
      for (const key of FEATURE_KEYS) {
        const val = overrideDraft[key];
        if (val === null || val === undefined) removeKeys.push(key);
        else overrides.push({ featureKey: key, enabled: val, reason: overrideReason || undefined });
      }
      await platformFetch(`/workspaces/${detail.id}/overrides`, {
        method: 'PUT',
        body: JSON.stringify({ overrides, removeKeys })
      });
      await loadDetail(detail.id);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const grantChatPromo = async () => {
    if (!detail || !canWrite) return;
    setBusy(true);
    try {
      await platformFetch(`/workspaces/${detail.id}/promos/grant-chat`, {
        method: 'POST',
        body: JSON.stringify({ days: 30, reason: 'Promo: chat 30 days' })
      });
      await loadDetail(detail.id);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addPayment = async () => {
    if (!detail || !canWrite) return;
    setBusy(true);
    try {
      await platformFetch(`/workspaces/${detail.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: Number(payAmount),
          provider: payProvider,
          providerReference: payRef || undefined,
          status: 'PAID',
          purpose: 'PLAN'
        })
      });
      setPayAmount('');
      setPayRef('');
      await loadDetail(detail.id);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const addNote = async () => {
    if (!detail || !noteBody.trim()) return;
    setBusy(true);
    try {
      await platformFetch(`/workspaces/${detail.id}/notes`, {
        method: 'POST',
        body: JSON.stringify({ body: noteBody.trim() })
      });
      setNoteBody('');
      await loadDetail(detail.id);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const setMemberStatus = async (memberId: string, next: 'ACTIVE' | 'DISABLED') => {
    if (!detail || !canWrite) return;
    setBusy(true);
    try {
      await platformFetch(`/workspaces/${detail.id}/members/${memberId}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: next })
      });
      await loadDetail(detail.id);
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const startImpersonation = async () => {
    if (!detail || !canImpersonate) return;
    setBusy(true);
    try {
      const data = await platformFetch(`/workspaces/${detail.id}/impersonate`, {
        method: 'POST',
        body: JSON.stringify({ userId: impersonateUserId, code: impersonateCode })
      });
      setImpersonateLink(data.openUrl);
      setImpersonateCode('');
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <form
          className="search-row"
          onSubmit={e => {
            e.preventDefault();
            loadList().catch((err: any) => onError(err.message));
          }}
        >
          <input placeholder="Search name, email, id…" value={query} onChange={e => setQuery(e.target.value)} />
          <button className="btn" type="submit">
            Search
          </button>
        </form>

        <ul className="ws-list">
          {list.map(w => (
            <li key={w.id}>
              <button
                type="button"
                className={selectedId === w.id ? 'active' : ''}
                onClick={() => loadDetail(w.id).catch((e: any) => onError(e.message))}
              >
                <div className="name">{w.name}</div>
                <div className="meta">
                  {w.plan} · {w.memberCount} members · {w.owner?.email}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </aside>

      <main className="main">
        {!detail && <p className="muted">Select a workspace to manage billing, features, and support.</p>}

        {detail && (
          <>
            <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0 }}>{detail.name}</h2>
              <span className={`badge ${detail.status === 'SUSPENDED' ? 'suspended' : 'active'}`}>
                {detail.status}
              </span>
              <span className="badge">{detail.plan}</span>
            </div>
            <p className="muted" style={{ marginTop: '0.35rem' }}>
              Owner {detail.owner?.name || '—'} ({detail.owner?.email}) · id {detail.id}
            </p>

            {usage && (
              <div className="section" style={{ marginTop: '1rem' }}>
                <h2>Usage</h2>
                <div className="stat-grid">
                  <div className="stat-card">
                    <div className="muted">Seats</div>
                    <div className="stat-value">
                      {usage.usage.seats}/{usage.limits.maxSeats}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="muted">Projects</div>
                    <div className="stat-value">
                      {usage.usage.projects}/{usage.limits.maxProjects}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="muted">Departments</div>
                    <div className="stat-value">
                      {usage.usage.departments}/{usage.limits.maxDepartments}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="muted">Messages</div>
                    <div className="stat-value">{usage.usage.messages}</div>
                  </div>
                  <div className="stat-card">
                    <div className="muted">Storage (MB)</div>
                    <div className="stat-value">
                      {usage.usage.storageMb}/{usage.limits.maxStorageMb}
                    </div>
                  </div>
                </div>
              </div>
            )}

            <div className="section">
              <h2>Plan &amp; status</h2>
              <div className="grid-2">
                <div>
                  <label>Plan</label>
                  <select value={plan} onChange={e => setPlan(e.target.value)} disabled={!canWrite}>
                    <option value="FREE">FREE</option>
                    <option value="STARTER">STARTER</option>
                    <option value="BUSINESS">BUSINESS</option>
                  </select>
                </div>
                <div>
                  <label>Status</label>
                  <select value={status} onChange={e => setStatus(e.target.value)} disabled={!canWrite}>
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="PENDING">PENDING</option>
                    <option value="SUSPENDED">SUSPENDED</option>
                  </select>
                </div>
              </div>
              <label>Billing email</label>
              <input value={billingEmail} onChange={e => setBillingEmail(e.target.value)} disabled={!canWrite} />
              {canWrite && (
                <button className="btn" type="button" disabled={busy} onClick={saveWorkspace}>
                  Save workspace
                </button>
              )}
            </div>

            <div className="section">
              <h2>Subscription</h2>
              <div className="grid-2">
                <div>
                  <label>Status</label>
                  <select value={subStatus} onChange={e => setSubStatus(e.target.value)} disabled={!canWrite}>
                    {['INACTIVE', 'TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED'].map(s => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label>Seats</label>
                  <input value={subSeats} onChange={e => setSubSeats(e.target.value)} disabled={!canWrite} />
                </div>
              </div>
              <div className="grid-2">
                <div>
                  <label>Period end</label>
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={e => setPeriodEnd(e.target.value)}
                    disabled={!canWrite}
                  />
                </div>
                <div>
                  <label>Renew blocked</label>
                  <select
                    value={renewBlocked ? 'yes' : 'no'}
                    onChange={e => setRenewBlocked(e.target.value === 'yes')}
                    disabled={!canWrite}
                  >
                    <option value="no">No</option>
                    <option value="yes">Yes</option>
                  </select>
                </div>
              </div>
              {canWrite && (
                <button className="btn" type="button" disabled={busy} onClick={saveSubscription}>
                  Save subscription
                </button>
              )}
            </div>

            <div className="section">
              <h2>Payments</h2>
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Amount</th>
                    <th>Provider</th>
                    <th>Status</th>
                    <th>Ref</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map(p => (
                    <tr key={p.id}>
                      <td>{new Date(p.createdAt).toLocaleString()}</td>
                      <td>
                        {p.amount} {p.currency}
                      </td>
                      <td>{p.provider}</td>
                      <td>{p.status}</td>
                      <td className="muted">{p.providerReference}</td>
                    </tr>
                  ))}
                  {payments.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
                        No payments yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
              {canWrite && (
                <div className="grid-2" style={{ marginTop: '0.75rem' }}>
                  <div>
                    <label>Amount</label>
                    <input value={payAmount} onChange={e => setPayAmount(e.target.value)} />
                  </div>
                  <div>
                    <label>Provider</label>
                    <input value={payProvider} onChange={e => setPayProvider(e.target.value)} />
                  </div>
                  <div>
                    <label>Reference (optional)</label>
                    <input value={payRef} onChange={e => setPayRef(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <button className="btn" type="button" disabled={busy || !payAmount} onClick={addPayment}>
                      Record payment
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="section">
              <h2>Feature overrides</h2>
              {canWrite && (
                <button className="btn btn-ghost" type="button" disabled={busy} onClick={grantChatPromo}>
                  Promo: grant chat 30 days
                </button>
              )}
              <label>Reason (stored on save)</label>
              <input
                value={overrideReason}
                onChange={e => setOverrideReason(e.target.value)}
                placeholder="e.g. Q1 promo"
                disabled={!canWrite}
              />
              {FEATURE_KEYS.map(key => (
                <div className="feature-row" key={key}>
                  <div>
                    <strong>{key}</strong>
                    <div className="muted">
                      effective: {effectivePreview[key] ? 'on' : 'off'}
                      {overrideDraft[key] === null ? ' (plan default)' : ' (override)'}
                    </div>
                  </div>
                  <div className="toggle">
                    <select
                      value={
                        overrideDraft[key] === null || overrideDraft[key] === undefined
                          ? 'default'
                          : overrideDraft[key]
                            ? 'on'
                            : 'off'
                      }
                      disabled={!canWrite}
                      onChange={e => {
                        const v = e.target.value;
                        setOverrideDraft(prev => ({
                          ...prev,
                          [key]: v === 'default' ? null : v === 'on'
                        }));
                      }}
                    >
                      <option value="default">Plan default</option>
                      <option value="on">Force on</option>
                      <option value="off">Force off</option>
                    </select>
                  </div>
                </div>
              ))}
              {canWrite && (
                <button className="btn" type="button" disabled={busy} onClick={saveOverrides}>
                  Save overrides
                </button>
              )}
            </div>

            <div className="section">
              <h2>Support notes</h2>
              <div className="notes-list">
                {notes.map(n => (
                  <div key={n.id} className="note-item">
                    <div className="muted">
                      {n.staff?.email || 'staff'} · {new Date(n.createdAt).toLocaleString()}
                    </div>
                    <div>{n.body}</div>
                  </div>
                ))}
                {notes.length === 0 && <p className="muted">No notes yet</p>}
              </div>
              <label>Add note</label>
              <textarea value={noteBody} onChange={e => setNoteBody(e.target.value)} rows={3} />
              <button className="btn" type="button" disabled={busy || !noteBody.trim()} onClick={addNote}>
                Save note
              </button>
            </div>

            <div className="section">
              <h2>Members</h2>
              <table>
                <thead>
                  <tr>
                    <th>User</th>
                    <th>Role</th>
                    <th>Status</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {detail.members.map(m => (
                    <tr key={m.id}>
                      <td>
                        {m.user.name || '—'}
                        <div className="muted">{m.user.email}</div>
                      </td>
                      <td>{m.role}</td>
                      <td>{m.status}</td>
                      <td>
                        {canWrite && (
                          <button
                            className="btn btn-ghost"
                            type="button"
                            disabled={busy}
                            onClick={() =>
                              setMemberStatus(m.id, m.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED')
                            }
                          >
                            {m.status === 'DISABLED' ? 'Enable' : 'Disable'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {canImpersonate && (
              <div className="section">
                <h2>Impersonate (30 min)</h2>
                <p className="muted">Requires your authenticator code. Opens the product app as that user.</p>
                <label>Member</label>
                <select value={impersonateUserId} onChange={e => setImpersonateUserId(e.target.value)}>
                  {detail.members.map(m => (
                    <option key={m.user.id} value={m.user.id}>
                      {m.user.email} ({m.role})
                    </option>
                  ))}
                </select>
                <label>Your MFA code</label>
                <input
                  value={impersonateCode}
                  onChange={e => setImpersonateCode(e.target.value)}
                  inputMode="numeric"
                />
                <button
                  className="btn"
                  type="button"
                  disabled={busy || !impersonateCode}
                  onClick={startImpersonation}
                >
                  Start support session
                </button>
                {impersonateLink && (
                  <div className="secret-box" style={{ marginTop: '0.75rem' }}>
                    <a href={impersonateLink} target="_blank" rel="noreferrer">
                      Open support session
                    </a>
                  </div>
                )}
              </div>
            )}

            <div className="section">
              <h2>Audit (this workspace)</h2>
              <table>
                <thead>
                  <tr>
                    <th>When</th>
                    <th>Action</th>
                    <th>Staff</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map(row => (
                    <tr key={row.id}>
                      <td>{new Date(row.createdAt).toLocaleString()}</td>
                      <td>{row.action}</td>
                      <td>{row.staff?.email || '—'}</td>
                    </tr>
                  ))}
                  {audit.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        No audit events yet
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </main>
    </div>
  );
};

const IntakeView: React.FC<{ staff: Staff; onError: (e: string) => void }> = ({ staff, onError }) => {
  const [requests, setRequests] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const canWrite = staff.role === 'OWNER' || staff.role === 'BILLING';

  const load = async () => {
    const data = await platformFetch('/join-requests?status=PENDING');
    setRequests(data.requests || []);
  };

  useEffect(() => {
    load().catch((e: any) => onError(e.message));
  }, []);

  const act = async (id: string, action: 'approve' | 'reject') => {
    if (!canWrite) return;
    setBusy(true);
    try {
      await platformFetch(`/join-requests/${id}/${action}`, { method: 'POST', body: '{}' });
      await load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="main" style={{ maxWidth: 960, margin: '0 auto' }}>
      <h2>Join requests</h2>
      <p className="muted">Companies that requested a workspace from the marketing site.</p>
      <table>
        <thead>
          <tr>
            <th>Company</th>
            <th>Contact</th>
            <th>Message</th>
            <th>When</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {requests.map(r => (
            <tr key={r.id}>
              <td>{r.companyName}</td>
              <td>
                {r.contactName}
                <div className="muted">{r.contactEmail}</div>
              </td>
              <td>{r.message || '—'}</td>
              <td>{new Date(r.createdAt).toLocaleString()}</td>
              <td>
                {canWrite && (
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button className="btn" type="button" disabled={busy} onClick={() => act(r.id, 'approve')}>
                      Approve
                    </button>
                    <button
                      className="btn btn-ghost"
                      type="button"
                      disabled={busy}
                      onClick={() => act(r.id, 'reject')}
                    >
                      Reject
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {requests.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No pending requests
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const NewsletterView: React.FC<{ onError: (e: string) => void }> = ({ onError }) => {
  const [subscribers, setSubscribers] = useState<any[]>([]);

  useEffect(() => {
    platformFetch('/newsletter?status=ACTIVE')
      .then(data => setSubscribers(data.subscribers || []))
      .catch((e: any) => onError(e.message));
  }, []);

  return (
    <div className="main" style={{ maxWidth: 960, margin: '0 auto' }}>
      <h2>Newsletter</h2>
      <p className="muted">{subscribers.length} active subscribers</p>
      <table>
        <thead>
          <tr>
            <th>Email</th>
            <th>Name</th>
            <th>Source</th>
            <th>Subscribed</th>
          </tr>
        </thead>
        <tbody>
          {subscribers.map(s => (
            <tr key={s.id}>
              <td>{s.email}</td>
              <td>{s.name || '—'}</td>
              <td>{s.source}</td>
              <td>{new Date(s.subscribedAt).toLocaleString()}</td>
            </tr>
          ))}
          {subscribers.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                No subscribers yet. Marketing form posts to /api/newsletter/subscribe
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

const SegmentsView: React.FC<{ onError: (e: string) => void }> = ({ onError }) => {
  return (
    <div className="main" style={{ maxWidth: 720, margin: '0 auto' }}>
      <h2>Segments</h2>
      <p className="muted">Export CSV lists for campaigns.</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
        <button className="btn" type="button" onClick={() => downloadSegment('free_empty', onError)}>
          Free workspaces with 0 departments
        </button>
        <button
          className="btn"
          type="button"
          onClick={() => downloadSegment('signed_up_no_department', onError)}
        >
          Signed up 1+ day ago, still no department
        </button>
        <button className="btn" type="button" onClick={() => downloadSegment('inactive_14d', onError)}>
          Inactive 14 days
        </button>
        <button className="btn" type="button" onClick={() => downloadSegment('newsletter', onError)}>
          Newsletter subscribers
        </button>
      </div>
    </div>
  );
};
