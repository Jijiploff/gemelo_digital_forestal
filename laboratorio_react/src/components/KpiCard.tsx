import type { ReactNode } from 'react';

export function KpiCard({
  label,
  value,
  delta,
  unit = '',
  badge,
  extra,
}: {
  label: string;
  value: number;
  delta?: number | null;
  unit?: string;
  badge?: string;
  extra?: ReactNode;
}) {
  return (
    <div className="kpi">
      <div className="kpi-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', marginBottom: '4px' }}>
        <span>{label}</span>
        {badge && (
          <span
            className="kpi-badge"
            style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 6px',
              borderRadius: '4px',
              background: 'rgba(57, 120, 74, 0.15)',
              color: '#39784a',
              letterSpacing: '0.02em',
              textTransform: 'uppercase',
            }}
          >
            {badge}
          </span>
        )}
      </div>
      <strong>{value.toFixed(2)}{unit}</strong>
      {delta !== undefined && delta !== null && (
        <small className={delta >= 0 ? 'up' : 'down'}>
          {delta >= 0 ? '+' : ''}{delta.toFixed(2)} vs base
        </small>
      )}
      {extra && (
        <div style={{ fontSize: '11px', color: '#666', marginTop: '4px' }}>
          {extra}
        </div>
      )}
    </div>
  );
}
