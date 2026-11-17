import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { Modal } from './Modal';
import type { User } from '../../types';

const EMPTY_IDS: string[] = [];

interface MemberPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  users: User[];
  excludeIds?: string[];
  initialSelectedIds?: string[];
  confirmLabel?: string;
  onConfirm: (selectedIds: string[]) => void | Promise<void>;
}

export const MemberPickerDialog: React.FC<MemberPickerDialogProps> = ({
  isOpen,
  onClose,
  title = 'Select members',
  description = 'Choose people already in this company. You can select none, one, or many.',
  users,
  excludeIds = EMPTY_IDS,
  initialSelectedIds = EMPTY_IDS,
  confirmLabel = 'Add selected',
  onConfirm
}) => {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  // Stabilize list deps — inline `[]` defaults otherwise re-create every render
  // and trip the open-sync effect into an infinite update loop.
  const excludeKey = excludeIds.join(',');
  const initialKey = initialSelectedIds.join(',');
  const exclude = useMemo(
    () => new Set(excludeKey ? excludeKey.split(',') : []),
    [excludeKey]
  );

  useEffect(() => {
    if (!isOpen) return;
    setSearch('');
    const initial = initialKey ? initialKey.split(',') : [];
    setSelected(new Set(initial.filter(id => !exclude.has(id))));
  }, [isOpen, excludeKey, initialKey, exclude]);

  const candidates = useMemo(() => {
    const q = search.trim().toLowerCase();
    return users
      .filter(u => !exclude.has(u.id))
      .filter(
        u =>
          !q ||
          u.name.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, exclude, search]);

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAllVisible = () => {
    const ids = candidates.map(u => u.id);
    const allSelected = ids.length > 0 && ids.every(id => selected.has(id));
    setSelected(prev => {
      const next = new Set(prev);
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  };

  const handleConfirm = async () => {
    setBusy(true);
    try {
      await onConfirm([...selected]);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} size="md">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <p style={{ margin: 0, color: 'var(--text-secondary)', fontSize: '0.875rem' }}>
          {description}
        </p>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.5rem 0.75rem',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)',
            background: 'var(--bg-body)'
          }}
        >
          <Search size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or email…"
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontSize: '0.875rem'
            }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button
            type="button"
            className="btn btn-ghost"
            style={{ padding: '0.25rem 0.5rem', fontSize: '0.8rem' }}
            onClick={toggleAllVisible}
            disabled={candidates.length === 0}
          >
            {candidates.length > 0 && candidates.every(u => selected.has(u.id))
              ? 'Clear visible'
              : 'Select all visible'}
          </button>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            {selected.size} selected
          </span>
        </div>

        <div
          style={{
            maxHeight: '280px',
            overflowY: 'auto',
            border: '1px solid var(--border-color)',
            borderRadius: 'var(--radius-md)'
          }}
        >
          {candidates.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
              No people available to add
            </div>
          ) : (
            candidates.map(u => {
              const checked = selected.has(u.id);
              return (
                <label
                  key={u.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    padding: '0.75rem 1rem',
                    borderBottom: '1px solid var(--border-color)',
                    cursor: 'pointer',
                    background: checked ? 'var(--primary-alpha, rgba(108,92,231,0.08))' : 'transparent'
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(u.id)}
                    style={{ width: 16, height: 16, cursor: 'pointer' }}
                  />
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem', color: 'var(--text-primary)' }}>
                      {u.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                      {u.email} · {u.role.replace('_', ' ')}
                    </div>
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn btn-secondary" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="btn btn-primary" onClick={handleConfirm} disabled={busy}>
            {busy ? 'Saving…' : `${confirmLabel}${selected.size ? ` (${selected.size})` : ''}`}
          </button>
        </div>
      </div>
    </Modal>
  );
};
