import React, { useEffect, useState } from 'react';
import { getToken, platformApiUrl, platformFetch } from './api';

/** Keep SegmentsView download helper export for App if needed */
export const downloadSegment = async (segment: string, onError: (e: string) => void) => {
  try {
    const token = getToken();
    const res = await fetch(
      platformApiUrl(`/segments/export?segment=${encodeURIComponent(segment)}`),
      {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      }
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || 'Export failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `segment-${segment}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (e: any) {
    onError(e.message);
  }
};

const FEATURE_KEYS = [
  'projects',
  'departments',
  'chat',
  'payroll',
  'time_tracking',
  'invites',
  'priority_support',
  'advanced_analytics'
];

type Staff = { role: string };

export const UsageOverview: React.FC<{ onError: (e: string) => void }> = ({ onError }) => {
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    platformFetch('/usage/overview')
      .then(setData)
      .catch((e: any) => onError(e.message));
  }, []);

  if (!data) return <div className="main"><p className="muted">Loading usage…</p></div>;

  return (
    <div className="main" style={{ maxWidth: 960, margin: '0 auto' }}>
      <h2>Usage overview</h2>
      <div className="stat-grid">
        {Object.entries(data.totals || {}).map(([k, v]) => (
          <div key={k} className="stat-card">
            <div className="muted">{k}</div>
            <div className="stat-value">{String(v)}</div>
          </div>
        ))}
      </div>
      <div className="section">
        <h2>Workspaces by plan</h2>
        <table>
          <thead>
            <tr>
              <th>Plan</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {(data.workspacesByPlan || []).map((r: any) => (
              <tr key={r.plan}>
                <td>{r.plan}</td>
                <td>{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="section">
        <h2>Workspaces by status</h2>
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {(data.workspacesByStatus || []).map((r: any) => (
              <tr key={r.status}>
                <td>{r.status}</td>
                <td>{r.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export const PlansView: React.FC<{ staff: Staff; onError: (e: string) => void }> = ({
  staff,
  onError
}) => {
  const [plans, setPlans] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const canEdit = staff.role === 'OWNER';

  const load = async () => {
    const data = await platformFetch('/plans');
    setPlans(data.plans || []);
  };

  useEffect(() => {
    load().catch((e: any) => onError(e.message));
  }, []);

  const save = async (plan: any) => {
    if (!canEdit) return;
    setBusy(true);
    try {
      await platformFetch(`/plans/${plan.planId}`, {
        method: 'PUT',
        body: JSON.stringify({ features: plan.features, limits: plan.limits })
      });
      await load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const updateFeature = (planId: string, key: string, value: boolean) => {
    setPlans(prev =>
      prev.map(p =>
        p.planId === planId ? { ...p, features: { ...p.features, [key]: value } } : p
      )
    );
  };

  const updateLimit = (planId: string, key: string, value: number) => {
    setPlans(prev =>
      prev.map(p =>
        p.planId === planId ? { ...p, limits: { ...p.limits, [key]: value } } : p
      )
    );
  };

  return (
    <div className="main" style={{ maxWidth: 1100, margin: '0 auto' }}>
      <h2>Plan catalog</h2>
      <p className="muted">
        Edits apply immediately to entitlement resolution (no redeploy). OWNER only.
      </p>
      {plans.map(plan => (
        <div key={plan.planId} className="section">
          <h2>{plan.planId}</h2>
          <div className="grid-2">
            {FEATURE_KEYS.map(key => (
              <label key={key} className="check-row">
                <input
                  type="checkbox"
                  checked={Boolean(plan.features?.[key])}
                  disabled={!canEdit}
                  onChange={e => updateFeature(plan.planId, key, e.target.checked)}
                />
                {key}
              </label>
            ))}
          </div>
          <div className="grid-2" style={{ marginTop: '0.75rem' }}>
            {(['maxSeats', 'maxProjects', 'maxDepartments', 'maxStorageMb'] as const).map(key => (
              <div key={key}>
                <label>{key}</label>
                <input
                  type="number"
                  value={plan.limits?.[key] ?? 0}
                  disabled={!canEdit}
                  onChange={e => updateLimit(plan.planId, key, Number(e.target.value))}
                />
              </div>
            ))}
          </div>
          {canEdit && (
            <button className="btn" type="button" disabled={busy} onClick={() => save(plan)}>
              Save {plan.planId}
            </button>
          )}
        </div>
      ))}
    </div>
  );
};

export const CouponsView: React.FC<{ staff: Staff; onError: (e: string) => void }> = ({
  staff,
  onError
}) => {
  const [coupons, setCoupons] = useState<any[]>([]);
  const [code, setCode] = useState('');
  const [percentOff, setPercentOff] = useState('20');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const canWrite = staff.role === 'OWNER' || staff.role === 'BILLING';

  const load = async () => {
    const data = await platformFetch('/coupons');
    setCoupons(data.coupons || []);
  };

  useEffect(() => {
    load().catch((e: any) => onError(e.message));
  }, []);

  const create = async () => {
    if (!canWrite) return;
    setBusy(true);
    try {
      await platformFetch('/coupons', {
        method: 'POST',
        body: JSON.stringify({
          code,
          percentOff: Number(percentOff),
          description: description || undefined
        })
      });
      setCode('');
      setDescription('');
      await load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const toggle = async (id: string, active: boolean) => {
    if (!canWrite) return;
    setBusy(true);
    try {
      await platformFetch(`/coupons/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ active: !active })
      });
      await load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="main" style={{ maxWidth: 960, margin: '0 auto' }}>
      <h2>Coupons</h2>
      {canWrite && (
        <div className="section" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
          <div className="grid-2">
            <div>
              <label>Code</label>
              <input value={code} onChange={e => setCode(e.target.value)} placeholder="LAUNCH20" />
            </div>
            <div>
              <label>Percent off</label>
              <input value={percentOff} onChange={e => setPercentOff(e.target.value)} />
            </div>
          </div>
          <label>Description</label>
          <input value={description} onChange={e => setDescription(e.target.value)} />
          <button className="btn" type="button" disabled={busy || !code} onClick={create}>
            Create coupon
          </button>
        </div>
      )}
      <table>
        <thead>
          <tr>
            <th>Code</th>
            <th>Discount</th>
            <th>Redeemed</th>
            <th>Active</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {coupons.map(c => (
            <tr key={c.id}>
              <td>{c.code}</td>
              <td>
                {c.percentOff != null ? `${c.percentOff}%` : `${c.amountOff} ${c.currency}`}
              </td>
              <td>
                {c.redeemedCount}
                {c.maxRedemptions != null ? ` / ${c.maxRedemptions}` : ''}
              </td>
              <td>{c.active ? 'yes' : 'no'}</td>
              <td>
                {canWrite && (
                  <button
                    className="btn btn-ghost"
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(c.id, c.active)}
                  >
                    {c.active ? 'Disable' : 'Enable'}
                  </button>
                )}
              </td>
            </tr>
          ))}
          {coupons.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                No coupons yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};

export const CampaignsView: React.FC<{ staff: Staff; onError: (e: string) => void }> = ({
  staff,
  onError
}) => {
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [name, setName] = useState('');
  const [segment, setSegment] = useState('free_empty');
  const [offerType, setOfferType] = useState('FEATURE');
  const [featureKey, setFeatureKey] = useState('chat');
  const [featureDays, setFeatureDays] = useState('30');
  const [couponCode, setCouponCode] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState(
    'Hi {{name}},\n\nWe have an offer for your Teamflow workspace.\n\n{{coupon}}'
  );
  const [preview, setPreview] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const canWrite = staff.role === 'OWNER' || staff.role === 'BILLING';

  const load = async () => {
    const data = await platformFetch('/campaigns');
    setCampaigns(data.campaigns || []);
  };

  useEffect(() => {
    load().catch((e: any) => onError(e.message));
  }, []);

  const loadPreview = async () => {
    try {
      const data = await platformFetch(`/segments/preview?segment=${encodeURIComponent(segment)}`);
      setPreview(data);
    } catch (e: any) {
      onError(e.message);
    }
  };

  const create = async () => {
    if (!canWrite) return;
    setBusy(true);
    try {
      await platformFetch('/campaigns', {
        method: 'POST',
        body: JSON.stringify({
          name,
          segment,
          offerType,
          featureKey: offerType === 'FEATURE' ? featureKey : undefined,
          featureDays: Number(featureDays),
          couponCode: couponCode || undefined,
          emailSubject: emailSubject || undefined,
          emailBody: emailBody || undefined
        })
      });
      setName('');
      await load();
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const run = async (id: string, dryRun: boolean) => {
    if (!canWrite) return;
    setBusy(true);
    try {
      const data = await platformFetch(`/campaigns/${id}/run`, {
        method: 'POST',
        body: JSON.stringify({ dryRun, sendEmail: true })
      });
      if (dryRun) {
        setPreview({ count: data.targetedCount, sample: data.sample, segment: 'dry-run' });
      } else {
        await load();
      }
    } catch (e: any) {
      onError(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="main" style={{ maxWidth: 1000, margin: '0 auto' }}>
      <h2>Campaigns</h2>
      <p className="muted">
        Segment → feature grant and/or email for people already in TeamFlow. To email anyone
        (including cold addresses), open <strong>Compose</strong> in the top nav — paste To, set
        From / subject / body, then Send.
      </p>

      {canWrite && (
        <div className="section" style={{ borderTop: 'none', paddingTop: 0, marginTop: 0 }}>
          <label>Name</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder="Q1 chat promo" />
          <div className="grid-2">
            <div>
              <label>Segment</label>
              <select value={segment} onChange={e => setSegment(e.target.value)}>
                <option value="free_empty">Free, 0 departments</option>
                <option value="signed_up_no_department">Signed up, no department</option>
                <option value="inactive_14d">Inactive 14 days</option>
                <option value="newsletter">Newsletter only</option>
              </select>
            </div>
            <div>
              <label>Offer type</label>
              <select value={offerType} onChange={e => setOfferType(e.target.value)}>
                <option value="FEATURE">Feature grant</option>
                <option value="COUPON">Coupon email</option>
                <option value="EMAIL_ONLY">Email only</option>
              </select>
            </div>
          </div>
          {offerType === 'FEATURE' && (
            <div className="grid-2">
              <div>
                <label>Feature</label>
                <select value={featureKey} onChange={e => setFeatureKey(e.target.value)}>
                  {FEATURE_KEYS.map(k => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label>Days</label>
                <input value={featureDays} onChange={e => setFeatureDays(e.target.value)} />
              </div>
            </div>
          )}
          {(offerType === 'COUPON' || offerType === 'EMAIL_ONLY') && (
            <>
              <label>Coupon code (optional)</label>
              <input value={couponCode} onChange={e => setCouponCode(e.target.value)} />
            </>
          )}
          <label>Email subject</label>
          <input value={emailSubject} onChange={e => setEmailSubject(e.target.value)} />
          <label>Email body (use {'{{name}}'}, {'{{email}}'}, {'{{coupon}}'})</label>
          <textarea value={emailBody} onChange={e => setEmailBody(e.target.value)} rows={5} />
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button className="btn btn-ghost" type="button" onClick={loadPreview}>
              Preview segment size
            </button>
            <button className="btn" type="button" disabled={busy || !name} onClick={create}>
              Create campaign
            </button>
          </div>
          {preview && (
            <p className="muted" style={{ marginTop: '0.75rem' }}>
              Segment matches <strong>{preview.count}</strong> targets
            </p>
          )}
        </div>
      )}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Segment</th>
            <th>Offer</th>
            <th>Status</th>
            <th>Stats</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {campaigns.map(c => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.segment}</td>
              <td>
                {c.offerType}
                {c.featureKey ? ` / ${c.featureKey}` : ''}
              </td>
              <td>{c.status}</td>
              <td className="muted">
                {c.targetedCount} targeted · {c.grantedCount} granted · {c.sentCount} emailed
              </td>
              <td>
                {canWrite && c.status !== 'CANCELED' && (
                  <div style={{ display: 'flex', gap: '0.35rem' }}>
                    <button className="btn btn-ghost" type="button" disabled={busy} onClick={() => run(c.id, true)}>
                      Dry run
                    </button>
                    <button className="btn" type="button" disabled={busy} onClick={() => run(c.id, false)}>
                      Run
                    </button>
                  </div>
                )}
              </td>
            </tr>
          ))}
          {campaigns.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                No campaigns yet
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
};
