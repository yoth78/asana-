import React, { useEffect, useMemo, useState } from 'react';
import { platformFetch } from './api';

type Staff = { id: string; email: string; name: string | null; role: string; mfaEnabled: boolean };

type Template = { id: string; name: string; subject: string; body: string };
type Recipient = { email: string; name: string | null; source?: string };

export const ComposeMailView: React.FC<{ staff: Staff; onError: (e: string) => void }> = ({
  staff,
  onError
}) => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [history, setHistory] = useState<any[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [fromAddr, setFromAddr] = useState('');
  const [allowedDomains, setAllowedDomains] = useState<string[]>(['teamflow.cyou']);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('Hi {{name}},\n\n');
  const [manualTo, setManualTo] = useState('');
  const [segment, setSegment] = useState('');
  const [includeNewsletter, setIncludeNewsletter] = useState(false);
  const [search, setSearch] = useState('');
  const [suggestions, setSuggestions] = useState<Recipient[]>([]);
  const [picked, setPicked] = useState<Recipient[]>([]);
  const [busy, setBusy] = useState(false);
  const [lastResult, setLastResult] = useState<any>(null);
  const [tplName, setTplName] = useState('');

  const canSend = staff.role === 'OWNER' || staff.role === 'BILLING' || staff.role === 'SUPPORT';

  const load = async () => {
    const [t, h, meta] = await Promise.all([
      platformFetch('/mail/templates'),
      platformFetch('/mail/history?limit=15'),
      platformFetch('/mail/meta')
    ]);
    setTemplates(t.templates || []);
    setHistory(h.emails || []);
    setAllowedDomains(meta.allowedDomains || ['teamflow.cyou']);
    if (!fromAddr && meta.defaultFrom) setFromAddr(meta.defaultFrom);
  };

  useEffect(() => {
    load().catch((e: any) => onError(e.message));
  }, []);

  useEffect(() => {
    if (search.trim().length < 2) {
      setSuggestions([]);
      return;
    }
    const handle = setTimeout(() => {
      platformFetch(`/mail/recipients?q=${encodeURIComponent(search.trim())}`)
        .then(data => setSuggestions(data.recipients || []))
        .catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [search]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (!t) return;
    setSubject(t.subject);
    setBody(t.body);
  };

  const addPicked = (r: Recipient) => {
    setPicked(prev =>
      prev.some(p => p.email.toLowerCase() === r.email.toLowerCase())
        ? prev
        : [...prev, { email: r.email, name: r.name }]
    );
    setSearch('');
    setSuggestions([]);
  };

  const recipientPreview = useMemo(() => {
    const emails = new Set(picked.map(p => p.email.toLowerCase()));
    for (const part of manualTo.split(/[\s,;]+/)) {
      const e = part.trim().toLowerCase();
      if (e.includes('@')) emails.add(e);
    }
    return emails.size;
  }, [picked, manualTo]);

  const send = async (dryRun: boolean) => {
    if (!canSend) return;
    setBusy(true);
    setLastResult(null);
    try {
      const data = await platformFetch('/mail/send', {
        method: 'POST',
        body: JSON.stringify({
          subject,
          body,
          from: fromAddr || undefined,
          templateId: templateId || undefined,
          to: manualTo,
          recipients: picked,
          segment: segment || undefined,
          includeNewsletter,
          dryRun
        })
      });
      setLastResult(data);
      if (!dryRun) await load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const saveTemplate = async () => {
    if (!canSend || !tplName.trim()) return;
    setBusy(true);
    try {
      await platformFetch('/mail/templates', {
        method: 'POST',
        body: JSON.stringify({ name: tplName.trim(), subject, body })
      });
      setTplName('');
      await load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h2>Compose email</h2>
      <p className="muted">
        Write subject and body, pick people from the database or paste addresses, apply a template,
        then send via Resend. Placeholders: {'{{name}}'}, {'{{email}}'}. Max 100 recipients per send.
      </p>

      <div className="compose-grid">
        <div className="panel compose-panel">
          <label>From (sender)</label>
          <input
            value={fromAddr}
            onChange={e => setFromAddr(e.target.value)}
            placeholder='"TeamFlow" &lt;noreply@teamflow.cyou&gt;'
          />
          <p className="muted" style={{ marginTop: '0.35rem' }}>
            Edit the name and address. Must stay on a verified domain:{' '}
            {allowedDomains.map(d => `@${d}`).join(', ')}. Examples:{' '}
            <code>hello@{allowedDomains[0] || 'teamflow.cyou'}</code> or{' '}
            <code>&quot;Support&quot; &lt;support@{allowedDomains[0] || 'teamflow.cyou'}&gt;</code>
          </p>

          <label>Template</label>
          <select value={templateId} onChange={e => applyTemplate(e.target.value)}>
            <option value="">— blank / custom —</option>
            {templates.map(t => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>

          <label>Subject</label>
          <input value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" />

          <label>Body</label>
          <textarea
            rows={12}
            value={body}
            onChange={e => setBody(e.target.value)}
            placeholder="Hi {{name}}, …"
          />

          <div className="row-actions">
            <input
              style={{ flex: 1, marginTop: 0 }}
              value={tplName}
              onChange={e => setTplName(e.target.value)}
              placeholder="Save current as template name"
            />
            <button className="btn btn-ghost" type="button" disabled={busy || !canSend} onClick={saveTemplate}>
              Save template
            </button>
          </div>
        </div>

        <div className="panel compose-panel">
          <label>Paste addresses (comma or newline)</label>
          <textarea
            rows={3}
            value={manualTo}
            onChange={e => setManualTo(e.target.value)}
            placeholder="a@company.com, b@company.com"
          />

          <label>Search users / newsletter</label>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Type at least 2 characters"
          />
          {suggestions.length > 0 && (
            <ul className="suggest-list">
              {suggestions.map(s => (
                <li key={`${s.source}-${s.email}`}>
                  <button type="button" className="suggest-btn" onClick={() => addPicked(s)}>
                    {s.name || s.email} <span className="muted">{s.email}</span>
                    {s.source ? <span className="muted"> · {s.source}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {picked.length > 0 && (
            <div className="chip-row">
              {picked.map(p => (
                <button
                  key={p.email}
                  type="button"
                  className="chip"
                  onClick={() => setPicked(prev => prev.filter(x => x.email !== p.email))}
                  title="Remove"
                >
                  {p.email} ×
                </button>
              ))}
            </div>
          )}

          <label>Or load a segment</label>
          <select value={segment} onChange={e => setSegment(e.target.value)}>
            <option value="">— none —</option>
            <option value="newsletter">Newsletter only</option>
            <option value="free_empty">Free empty workspaces</option>
            <option value="signed_up_no_department">Signed up, no department</option>
            <option value="inactive_14d">Inactive 14d</option>
          </select>

          <label className="check-row">
            <input
              type="checkbox"
              checked={includeNewsletter}
              onChange={e => setIncludeNewsletter(e.target.checked)}
            />
            Include all active newsletter subscribers
          </label>

          <p className="muted">
            Approx. selected now (manual + picker, before segment expand): {recipientPreview}
          </p>

          <div className="row-actions">
            <button className="btn btn-ghost" type="button" disabled={busy || !canSend} onClick={() => send(true)}>
              Dry run
            </button>
            <button className="btn" type="button" disabled={busy || !canSend} onClick={() => send(false)}>
              {busy ? 'Sending…' : 'Send'}
            </button>
          </div>

          {lastResult && (
            <div className="secret-box">
              {lastResult.dryRun ? (
                <>
                  Dry run from <code>{lastResult.from}</code>: {lastResult.recipientCount} recipients
                  <pre style={{ whiteSpace: 'pre-wrap', margin: '0.5rem 0 0' }}>
                    {JSON.stringify(lastResult.sample, null, 2)}
                  </pre>
                </>
              ) : (
                <>
                  From <code>{lastResult.from}</code> · sent {lastResult.email?.sentCount ?? 0} /{' '}
                  {lastResult.email?.recipientCount ?? 0}
                  {lastResult.email?.failedCount
                    ? ` · failed ${lastResult.email.failedCount}`
                    : ''}{' '}
                  · {lastResult.email?.status}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="panel" style={{ width: '100%', maxWidth: '100%', marginTop: '1rem' }}>
        <h3>Recent sends</h3>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Subject</th>
              <th>Status</th>
              <th>Sent</th>
            </tr>
          </thead>
          <tbody>
            {history.map(row => (
              <tr key={row.id}>
                <td className="muted">{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.subject}</td>
                <td>{row.status}</td>
                <td>
                  {row.sentCount}/{row.recipientCount}
                  {row.failedCount ? ` (−${row.failedCount})` : ''}
                </td>
              </tr>
            ))}
            {history.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  No outbound mail yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const GlobalFlagsView: React.FC<{ staff: Staff; onError: (e: string) => void }> = ({
  staff,
  onError
}) => {
  const [flags, setFlags] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const canWrite = staff.role === 'OWNER';

  const load = async () => {
    const data = await platformFetch('/flags');
    setFlags(data.flags || []);
  };

  useEffect(() => {
    load().catch((e: any) => onError(e.message));
  }, []);

  const toggle = async (featureKey: string, disabled: boolean) => {
    if (!canWrite) return;
    const reason = disabled
      ? window.prompt('Reason for global kill-switch (optional)') || 'Global kill-switch'
      : null;
    setBusy(true);
    try {
      await platformFetch(`/flags/${featureKey}`, {
        method: 'PUT',
        body: JSON.stringify({ disabled, reason })
      });
      await load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <h2>Global feature flags</h2>
      <p className="muted">
        Kill-switch for a feature across every workspace. Overrides plan entitlements and per-workspace
        promos. OWNER only.
      </p>
      <div className="panel" style={{ width: '100%', maxWidth: 720 }}>
        <table>
          <thead>
            <tr>
              <th>Feature</th>
              <th>Status</th>
              <th>Reason</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {flags.map(f => (
              <tr key={f.featureKey}>
                <td>
                  <code>{f.featureKey}</code>
                </td>
                <td>
                  <span className={`badge ${f.disabled ? 'suspended' : 'active'}`}>
                    {f.disabled ? 'KILLED' : 'ON'}
                  </span>
                </td>
                <td className="muted">{f.reason || '—'}</td>
                <td>
                  <button
                    className={`btn ${f.disabled ? 'btn-ghost' : 'btn-danger'}`}
                    type="button"
                    style={{ marginTop: 0 }}
                    disabled={busy || !canWrite}
                    onClick={() => toggle(f.featureKey, !f.disabled)}
                  >
                    {f.disabled ? 'Restore' : 'Kill'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const AbuseConsoleView: React.FC<{ staff: Staff; onError: (e: string) => void }> = ({
  staff,
  onError
}) => {
  const [data, setData] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const canSuspend = staff.role === 'OWNER' || staff.role === 'BILLING';

  const load = async () => {
    const summary = await platformFetch('/abuse/summary');
    setData(summary);
  };

  useEffect(() => {
    load().catch((e: any) => onError(e.message));
  }, []);

  const suspend = async (id: string) => {
    if (!canSuspend) return;
    if (!window.confirm('Suspend this workspace?')) return;
    setBusy(true);
    try {
      await platformFetch(`/abuse/workspaces/${id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Abuse console' })
      });
      await load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return (
      <div className="page">
        <p className="muted">Loading abuse signals…</p>
      </div>
    );
  }

  const c = data.counters || {};

  return (
    <div className="page">
      <h2>Abuse console</h2>
      <p className="muted">
        Lightweight risk signals (empty workspaces, OTP pending, invite bursts). Heavy staff-permission
        matrix / GDPR tools are deferred.
      </p>

      <div className="stat-grid">
        <div className="stat">
          <div className="stat-value">{c.unverifiedUsers7d ?? 0}</div>
          <div className="muted">Unverified users (7d)</div>
        </div>
        <div className="stat">
          <div className="stat-value">{c.otpPendingUpdated24h ?? 0}</div>
          <div className="muted">OTP pending (24h)</div>
        </div>
        <div className="stat">
          <div className="stat-value">{c.emptyWorkspaces7d ?? 0}</div>
          <div className="muted">Sparse workspaces (7d)</div>
        </div>
        <div className="stat">
          <div className="stat-value">{c.pendingInvites24h ?? 0}</div>
          <div className="muted">Pending invites (24h)</div>
        </div>
        <div className="stat">
          <div className="stat-value">{c.suspendedWorkspaces ?? 0}</div>
          <div className="muted">Suspended</div>
        </div>
        <div className="stat">
          <div className="stat-value">{c.failedOutbound7d ?? 0}</div>
          <div className="muted">Failed outbound (7d)</div>
        </div>
      </div>

      <div className="panel" style={{ width: '100%', maxWidth: '100%', marginTop: '1rem' }}>
        <h3>Sparse / empty workspaces</h3>
        <table>
          <thead>
            <tr>
              <th>Workspace</th>
              <th>Owner</th>
              <th>Members</th>
              <th>Invites</th>
              <th>Created</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data.emptyWorkspaces || []).map((w: any) => (
              <tr key={w.id}>
                <td>
                  {w.name}{' '}
                  <span className="muted">
                    ({w.status} / {w.plan})
                  </span>
                </td>
                <td>{w.ownerEmail}</td>
                <td>{w.members}</td>
                <td>{w.invitations}</td>
                <td className="muted">{new Date(w.createdAt).toLocaleString()}</td>
                <td>
                  {w.status !== 'SUSPENDED' && (
                    <button
                      className="btn btn-danger"
                      type="button"
                      style={{ marginTop: 0 }}
                      disabled={busy || !canSuspend}
                      onClick={() => suspend(w.id)}
                    >
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(data.emptyWorkspaces || []).length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  None flagged
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ width: '100%', maxWidth: '100%', marginTop: '1rem' }}>
        <h3>Invite-heavy workspaces</h3>
        <table>
          <thead>
            <tr>
              <th>Workspace</th>
              <th>Owner</th>
              <th>Invites</th>
              <th>Members</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(data.inviteHeavyWorkspaces || []).map((w: any) => (
              <tr key={w.id}>
                <td>{w.name}</td>
                <td>{w.ownerEmail}</td>
                <td>{w.invitations}</td>
                <td>{w.members}</td>
                <td>
                  {w.status !== 'SUSPENDED' && (
                    <button
                      className="btn btn-danger"
                      type="button"
                      style={{ marginTop: 0 }}
                      disabled={busy || !canSuspend}
                      onClick={() => suspend(w.id)}
                    >
                      Suspend
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {(data.inviteHeavyWorkspaces || []).length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  None flagged
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="panel" style={{ width: '100%', maxWidth: '100%', marginTop: '1rem' }}>
        <h3>OTP pending / unverified</h3>
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Verified</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            {[...(data.otpPendingUsers || []), ...(data.unverifiedUsers || [])]
              .filter(
                (u: any, i: number, arr: any[]) => arr.findIndex((x: any) => x.id === u.id) === i
              )
              .slice(0, 50)
              .map((u: any) => (
                <tr key={u.id}>
                  <td>{u.email}</td>
                  <td>{u.name || '—'}</td>
                  <td>{u.isVerified ? 'yes' : 'no'}</td>
                  <td className="muted">
                    {new Date(u.updatedAt || u.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
