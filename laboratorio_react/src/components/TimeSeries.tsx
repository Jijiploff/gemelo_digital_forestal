import { useState } from 'react';
import type { ObservacionesFlujos, ObservacionesSerieItem, Simulation } from '../types';

export function TimeSeries({
  temporal,
  observaciones,
  simYear,
}: {
  temporal?: Simulation['temporal'];
  observaciones?: ObservacionesFlujos | null;
  simYear?: number;
}) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  if (!temporal || temporal.length === 0) {
    return <div className="empty">No hay datos temporales para mostrar.</div>;
  }

  // Climatología por mes (1..12)
  const climMap = new Map<number, { media: number; sd: number }>();
  if (observaciones?.climatologia_observada) {
    for (const c of observaciones.climatologia_observada) {
      climMap.set(c.month, { media: c.nee_media, sd: c.nee_sd });
    }
  }

  // Observaciones reales del año si existen (2002-2011)
  const obsYearMap = new Map<number, ObservacionesSerieItem>();
  if (observaciones?.serie && simYear) {
    for (const s of observaciones.serie) {
      if (s.year === simYear && s.tiene_observacion && s.nee_obs != null) {
        obsYearMap.set(s.month, s);
      }
    }
  }

  // Determinar rango Y
  const allY: number[] = [0];
  temporal.forEach((row, idx) => {
    const month = idx + 1;
    if (row.nee_base != null) allY.push(row.nee_base);
    if (row.nee_escenario != null) allY.push(row.nee_escenario);
    const clim = climMap.get(month);
    if (clim) {
      allY.push(clim.media + clim.sd);
      allY.push(clim.media - clim.sd);
    }
    const obs = obsYearMap.get(month);
    if (obs?.nee_obs != null) {
      allY.push(obs.nee_obs);
    }
  });

  const minY = Math.floor(Math.min(...allY) - 0.5);
  const maxY = Math.ceil(Math.max(...allY) + 0.5);
  const rangeY = maxY - minY || 1;

  // Dimensiones del gráfico SVG
  const width = 800;
  const height = 320;
  const padLeft = 50;
  const padRight = 30;
  const padTop = 25;
  const padBottom = 40;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getX = (idx: number) => padLeft + (idx / 11) * plotW;
  const getY = (val: number) => padTop + plotH - ((val - minY) / rangeY) * plotH;

  // Banda de climatología: path cerrado
  let bandPath = '';
  if (climMap.size === 12) {
    const topPts = temporal.map((_, i) => {
      const c = climMap.get(i + 1);
      const yVal = c ? c.media + c.sd : 0;
      return `${getX(i)},${getY(yVal)}`;
    });
    const bottomPts = temporal.map((_, i) => {
      const c = climMap.get(12 - i);
      const yVal = c ? c.media - c.sd : 0;
      return `${getX(11 - i)},${getY(yVal)}`;
    });
    bandPath = `M ${topPts.join(' L ')} L ${bottomPts.join(' L ')} Z`;
  }

  // Línea base
  const ptsBase = temporal
    .map((r, i) => (r.nee_base != null ? `${getX(i)},${getY(r.nee_base)}` : null))
    .filter(Boolean)
    .join(' ');

  // Línea escenario
  const ptsScen = temporal
    .map((r, i) => (r.nee_escenario != null ? `${getX(i)},${getY(r.nee_escenario)}` : null))
    .filter(Boolean)
    .join(' ');

  // Media climatológica línea punteada
  const ptsClimMean = temporal
    .map((_, i) => {
      const c = climMap.get(i + 1);
      return c ? `${getX(i)},${getY(c.media)}` : null;
    })
    .filter(Boolean)
    .join(' ');

  const zeroY = getY(0);

  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '15px' }}>
            Dinámica mensual del NEE — Año simulado {simYear || temporal[0]?.period.slice(0, 4)}
          </h4>
          <span style={{ fontSize: '12px', color: '#666' }}>
            Balance neto de carbono (gC m⁻² d⁻¹). <b style={{ color: '#c62828' }}>Positivo (+) = emisión</b> · <b style={{ color: '#2e7d32' }}>Negativo (−) = sumidero</b>
          </span>
        </div>
      </div>

      <div style={{ position: 'relative', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', minWidth: '600px', display: 'block' }}>
          {/* Eje 0 (cero emisión/sumidero) */}
          <line x1={padLeft} y1={zeroY} x2={width - padRight} y2={zeroY} stroke="#bbb" strokeWidth="1.2" strokeDasharray="4 3" />
          <text x={padLeft - 6} y={zeroY + 4} textAnchor="end" fontSize="10" fill="#888">0.0</text>

          {/* Líneas de cuadrícula horizontal */}
          {[-2, -1, 1, 2, 3].map((gVal) => {
            if (gVal < minY || gVal > maxY || gVal === 0) return null;
            const gy = getY(gVal);
            return (
              <g key={gVal}>
                <line x1={padLeft} y1={gy} x2={width - padRight} y2={gy} stroke="#f0f0f0" strokeWidth="1" />
                <text x={padLeft - 6} y={gy + 3} textAnchor="end" fontSize="10" fill="#aaa">{gVal > 0 ? `+${gVal}` : gVal}</text>
              </g>
            );
          })}

          {/* Banda de referencia climatológica (media ± sd observada) */}
          {bandPath && (
            <path d={bandPath} fill="rgba(33, 150, 243, 0.12)" stroke="rgba(33, 150, 243, 0.25)" strokeWidth="0.8" />
          )}

          {/* Línea media climatológica */}
          {ptsClimMean && (
            <polyline points={ptsClimMean} fill="none" stroke="#2196f3" strokeWidth="1.2" strokeDasharray="3 3" />
          )}

          {/* Línea base */}
          {ptsBase && (
            <polyline points={ptsBase} fill="none" stroke="#546e7a" strokeWidth="2" />
          )}

          {/* Línea escenario */}
          {ptsScen && (
            <polyline points={ptsScen} fill="none" stroke="#2e7d32" strokeWidth="2.5" />
          )}

          {/* Puntos de cada mes */}
          {temporal.map((r, i) => {
            const cx = getX(i);
            const cyBase = r.nee_base != null ? getY(r.nee_base) : null;
            const cyScen = r.nee_escenario != null ? getY(r.nee_escenario) : null;
            const obs = obsYearMap.get(i + 1);
            const cyObs = obs?.nee_obs != null ? getY(obs.nee_obs) : null;

            return (
              <g key={i} onMouseEnter={() => setHoveredIdx(i)} onMouseLeave={() => setHoveredIdx(null)}>
                {/* Zona interactiva */}
                <rect x={cx - plotW / 24} y={padTop} width={plotW / 12} height={plotH} fill="transparent" />

                {/* Punto base */}
                {cyBase != null && <circle cx={cx} cy={cyBase} r="3" fill="#546e7a" />}

                {/* Punto escenario */}
                {cyScen != null && <circle cx={cx} cy={cyScen} r="4" fill="#2e7d32" />}

                {/* Punto observado real si existe en este año */}
                {cyObs != null && (
                  <circle cx={cx} cy={cyObs} r="5" fill="#e65100" stroke="#fff" strokeWidth="1.5" />
                )}

                {/* Etiqueta del mes en el eje X */}
                <text x={cx} y={height - padBottom + 16} textAnchor="middle" fontSize="11" fill="#555">
                  {['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'][i]}
                </text>
              </g>
            );
          })}

          {/* Indicador de cursor hovered */}
          {hoveredIdx !== null && (
            <line
              x1={getX(hoveredIdx)}
              y1={padTop}
              x2={getX(hoveredIdx)}
              y2={height - padBottom}
              stroke="#999"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          )}
        </svg>
      </div>

      {/* Detalle del mes seleccionado al pasar el cursor */}
      {hoveredIdx !== null && (
        <div style={{ marginTop: '8px', padding: '8px 12px', background: '#f5f5f5', borderRadius: '6px', fontSize: '12px', display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            Mes: <b>{['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'][hoveredIdx]}</b>
          </div>
          <div>
            Escenario: <b>{temporal[hoveredIdx]?.nee_escenario?.toFixed(2) ?? '—'} gC/m²/d</b>
          </div>
          <div>
            Línea base: <b>{temporal[hoveredIdx]?.nee_base?.toFixed(2) ?? '—'} gC/m²/d</b>
          </div>
          {climMap.get(hoveredIdx + 1) && (
            <div>
              Climatología obs: <b>{climMap.get(hoveredIdx + 1)!.media.toFixed(2)} ± {climMap.get(hoveredIdx + 1)!.sd.toFixed(2)}</b>
            </div>
          )}
          {obsYearMap.get(hoveredIdx + 1) && (
            <div style={{ color: '#e65100' }}>
              Observación real: <b>{obsYearMap.get(hoveredIdx + 1)!.nee_obs?.toFixed(2)} gC/m²/d</b>
            </div>
          )}
        </div>
      )}

      {/* Leyenda */}
      <div style={{ display: 'flex', gap: '18px', flexWrap: 'wrap', marginTop: '12px', fontSize: '12px', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '18px', height: '3px', background: '#2e7d32', display: 'inline-block' }} /> Escenario
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '18px', height: '2px', background: '#546e7a', display: 'inline-block' }} /> Línea base
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '10px', background: 'rgba(33, 150, 243, 0.2)', border: '1px solid rgba(33, 150, 243, 0.4)', display: 'inline-block' }} /> Banda observada del mes (media ± desv)
        </span>
        {obsYearMap.size > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#e65100', display: 'inline-block' }} /> Puntos observados reales en la torre
          </span>
        )}
      </div>
    </div>
  );
}
