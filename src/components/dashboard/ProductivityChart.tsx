import React, { useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import type { Task } from '../../types';
import { format, subDays, isSameDay } from 'date-fns';

interface ProductivityChartProps {
  tasks: Task[];
  title?: string;
}

/** Counts DONE tasks whose last update falls on each of the last 7 days. */
export const ProductivityChart: React.FC<ProductivityChartProps> = ({
  tasks,
  title = 'Tasks completed (last 7 days)'
}) => {
  const data = useMemo(() => {
    const done = tasks.filter(t => t.status === 'DONE' && !t.parentTaskId);
    return Array.from({ length: 7 }).map((_, i) => {
      const date = subDays(new Date(), 6 - i);
      const completed = done.filter(t => {
        const updated = new Date(t.updatedAt);
        return !Number.isNaN(updated.getTime()) && isSameDay(updated, date);
      }).length;
      return {
        name: format(date, 'MMM dd'),
        completed
      };
    });
  }, [tasks]);

  const total = data.reduce((sum, d) => sum + d.completed, 0);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            padding: '0.75rem',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-md)'
          }}
        >
          <p style={{ margin: '0 0 0.35rem 0', color: 'var(--text-secondary)', fontSize: '0.8rem' }}>
            {label}
          </p>
          <p style={{ margin: 0, color: 'var(--text-primary)', fontWeight: 600 }}>
            {payload[0].value} completed
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '1rem' }}>
        <h3 className="card-panel-title" style={{ margin: 0 }}>{title}</h3>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          {total} done this week
        </span>
      </div>
      <div style={{ flex: 1, minHeight: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="colorCompletedReal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-color)" vertical={false} />
            <XAxis dataKey="name" stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} />
            <YAxis stroke="var(--text-secondary)" fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="completed"
              stroke="var(--primary)"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorCompletedReal)"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
};
