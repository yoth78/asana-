import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  compact?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon,
  title,
  description,
  action,
  compact = false
}) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      textAlign: 'center',
      padding: compact ? '1.5rem 1rem' : '3rem 1.5rem',
      color: 'var(--text-muted)'
    }}
  >
    {Icon && (
      <div
        style={{
          width: compact ? 48 : 64,
          height: compact ? 48 : 64,
          borderRadius: 'var(--radius-md)',
          background: 'var(--bg-body)',
          border: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '1rem',
          opacity: 0.9
        }}
      >
        <Icon size={compact ? 22 : 28} />
      </div>
    )}
    <h3
      style={{
        margin: '0 0 0.5rem 0',
        fontSize: compact ? '1rem' : '1.125rem',
        fontWeight: 600,
        color: 'var(--text-primary)'
      }}
    >
      {title}
    </h3>
    <p
      style={{
        margin: action ? '0 0 1.25rem 0' : 0,
        fontSize: '0.875rem',
        maxWidth: 360,
        lineHeight: 1.5,
        color: 'var(--text-muted)'
      }}
    >
      {description}
    </p>
    {action}
  </div>
);
