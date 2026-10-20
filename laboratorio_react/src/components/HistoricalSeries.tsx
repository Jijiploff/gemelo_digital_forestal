import { useState } from 'react';
import type { ObservacionesFlujos } from '../types';

export function HistoricalSeries({ observaciones }: { observaciones?: ObservacionesFlujos | null }) {
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const [filtroPeriodo, setFiltroPeriodo] = useState<'todo' | 'entrenamiento' | 'posterior'>('todo');

  if (!observaciones?.serie || observaciones.serie.length === 0) {
    return (
      <div className="panel" style={{ padding: '20px' }}>
        <p className="muted">Cargando serie histórica de observaciones (2002–2025)…</p>
      </div>
    );
  }

  // Filtrar según botón
  const allRows = observaciones.serie;
  const filteredRows =
    filtroPeriodo === 'entrenamiento'
      ? allRows.filter((r) => r.year <= 2011)
      : filtroPeriodo === 'posterior'
      ? allRows.filter((r) => r.year >= 2012)
      : allRows;

  const n = filteredRows.length;
  if (n === 0) return null;

  // Rango Y
  let minY = -3.0;
  let maxY = 4.0;
  filteredRows.forEach((r) => {
    if (r.nee_pred_calendario_lai_modis != null) {
      minY = Math.min(minY, r.nee_pred_calendario_lai_modis);
      maxY = Math.max(maxY, r.nee_pred_calendario_lai_modis);
    }
    if (r.nee_obs != null) {
      const inc = r.nee_incert ?? 0;
      minY = Math.min(minY, r.nee_obs - inc);
      maxY = Math.max(maxY, r.nee_obs + inc);
    }
  });
  minY = Math.floor(minY - 0.5);
  maxY = Math.ceil(maxY + 0.5);
  const rangeY = maxY - minY || 1;

  // Dimensiones SVG
  const width = 950;
  const height = 360;
  const padLeft = 55;
  const padRight = 30;
  const padTop = 45;
  const padBottom = 45;
  const plotW = width - padLeft - padRight;
  const plotH = height - padTop - padBottom;

  const getX = (i: number) => padLeft + (i / Math.max(1, n - 1)) * plotW;
  const getY = (val: number) => padTop + plotH - ((val - minY) / rangeY) * plotH;
  const zeroY = getY(0);

  // Línea predicha continua
  const predPoints = filteredRows
    .map((r, i) => (r.nee_pred_calendario_lai_modis != null ? `${getX(i)},${getY(r.nee_pred_calendario_lai_modis)}` : null))
    .filter(Boolean)
    .join(' ');

  // Ubicaciones de los periodos clave en el subconjunto actual
  let idx2011End = -1;
  for (let i = filteredRows.length - 1; i >= 0; i--) {
    if (filteredRows[i].year <= 2011) {
      idx2011End = i;
      break;
    }
  }
  const idxHuecoStart = filteredRows.findIndex((r) => r.periodo === '2006-02');
  const idxHuecoEnd = filteredRows.findIndex((r) => r.periodo === '2008-07');
  const idx2012Start = filteredRows.findIndex((r) => r.year >= 2012);

  const hoveredItem = hoveredIdx !== null ? filteredRows[hoveredIdx] : null;

  return (
    <div style={{ background: '#fff', border: '1px solid #e0e0e0', borderRadius: '8px', padding: '16px', marginTop: '16px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        <div>
          <h4 style={{ margin: 0, fontSize: '15px' }}>
            Serie histórica completa BR-Sa1 (2002–2025) · NEE observado vs predicho
          </h4>
          <span style={{ fontSize: '12px', color: '#666' }}>
            288 meses de inferencia con el régimen MODIS (ventana t-4..t-1) y observaciones de la torre FLUXNET.
          </span>
        </div>

        {/* Selector de periodo */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            className={filtroPeriodo === 'todo' ? 'primary' : ''}
            style={{ fontSize: '12px', padding: '4px 10px' }}
            onClick={() => setFiltroPeriodo('todo')}
          >
            Todo (2002–2025)
          </button>
          <button
            type="button"
            className={filtroPeriodo === 'entrenamiento' ? 'primary' : ''}
            style={{ fontSize: '12px', padding: '4px 10px' }}
            onClick={() => setFiltroPeriodo('entrenamiento')}
          >
            ≤ 2011 (Ajuste)
          </button>
          <button
            type="button"
            className={filtroPeriodo === 'posterior' ? 'primary' : ''}
            style={{ fontSize: '12px', padding: '4px 10px' }}
            onClick={() => setFiltroPeriodo('posterior')}
          >
            ≥ 2012 (Estimación)
          </button>
        </div>
      </div>

      <div style={{ position: 'relative', overflowX: 'auto' }}>
        <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 'auto', minWidth: '750px', display: 'block' }}>
          {/* Sombreado periodo <= 2011: Ajuste */}
          {idx2011End >= 0 && (
            <g>
              <rect
                x={padLeft}
                y={padTop}
                width={getX(idx2011End) - padLeft}
                height={plotH}
                fill="rgba(46, 125, 50, 0.05)"
              />
              <text x={padLeft + 8} y={padTop + 14} fontSize="11" fontWeight="600" fill="#2e7d32">
                Ajuste (datos de entrenamiento ≤ 2011)
              </text>
            </g>
          )}

          {/* Sombreado 2006-02 a 2008-07: Sin observación (hueco) */}
          {idxHuecoStart >= 0 && idxHuecoEnd >= 0 && (
            <g>
              <rect
                x={getX(idxHuecoStart)}
                y={padTop}
                width={getX(idxHuecoEnd) - getX(idxHuecoStart)}
                height={plotH}
                fill="rgba(244, 67, 54, 0.08)"
              />
              <text
                x={(getX(idxHuecoStart) + getX(idxHuecoEnd)) / 2}
                y={padTop + 28}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="#c62828"
              >
                Sin observación (2006-02 a 2008-07)
              </text>
            </g>
          )}

          {/* Sombreado periodo >= 2012: Estimación del modelo */}
          {idx2012Start >= 0 && (
            <g>
              <rect
                x={getX(idx2012Start)}
                y={padTop}
                width={padLeft + plotW - getX(idx2012Start)}
                height={plotH}
                fill="rgba(33, 150, 243, 0.04)"
              />
              <text
                x={getX(idx2012Start) + 8}
                y={padTop + 14}
                fontSize="11"
                fontWeight="600"
                fill="#1565c0"
              >
                Estimación del modelo (≥ 2012, forzantes ERA5 sin verdad terreno)
              </text>
            </g>
          )}

          {/* Eje 0 */}
          <line x1={padLeft} y1={zeroY} x2={padLeft + plotW} y2={zeroY} stroke="#bbb" strokeWidth="1" strokeDasharray="3 3" />
          <text x={padLeft - 6} y={zeroY + 4} textAnchor="end" fontSize="10" fill="#777">0.0</text>

          {/* Rejilla horizontal */}
          {[-2, -1, 1, 2, 3].map((val) => {
            if (val < minY || val > maxY || val === 0) return null;
            const y = getY(val);
            return (
              <g key={val}>
                <line x1={padLeft} y1={y} x2={padLeft + plotW} y2={y} stroke="#f0f0f0" strokeWidth="1" />
                <text x={padLeft - 6} y={y + 3} textAnchor="end" fontSize="10" fill="#aaa">
                  {val > 0 ? `+${val}` : val}
                </text>
              </g>
            );
          })}

          {/* Línea predicha (la válida: nee_pred_calendario_lai_modis) */}
          {predPoints && (
            <polyline points={predPoints} fill="none" stroke="#2e7d32" strokeWidth="1.8" />
          )}

          {/* Puntos observados con incertidumbre */}
          {filteredRows.map((r, i) => {
            if (!r.tiene_observacion || r.nee_obs == null) return null;
            const cx = getX(i);
            const cy = getY(r.nee_obs);
            const inc = r.nee_incert ?? 0;
            const topY = getY(r.nee_obs + inc);
            const botY = getY(r.nee_obs - inc);

            // Marca de ventana que cruza el hueco (2008-08 a 2008-11)
            const esCruceHueco = Boolean(r.ventana_cruza_hueco);
            // Baja calidad QC < 0.5
            const esBajaCalidad = Boolean(r.baja_calidad || (r.nee_qc != null && r.nee_qc < 0.5));

            return (
              <g key={r.periodo}>
                {/* Barra vertical de incertidumbre */}
                {inc > 0 && (
                  <line
                    x1={cx}
                    y1={topY}
                    x2={cx}
                    y2={botY}
                    stroke={esCruceHueco ? '#f57c00' : esBajaCalidad ? '#e65100' : '#455a64'}
                    strokeWidth="1.2"
                    opacity="0.75"
                  />
                )}

                {/* Símbolo según categoría */}
                {esCruceHueco ? (
                  // Rombo naranja para 2008-08..2008-11
                  <polygon
                    points={`${cx},${cy - 5} ${cx + 5},${cy} ${cx},${cy + 5} ${cx - 5},${cy}`}
                    fill="#ff9800"
                    stroke="#e65100"
                    strokeWidth="1"
                  />
                ) : esBajaCalidad ? (
                  // Círculo hueco naranja para baja calidad
                  <circle cx={cx} cy={cy} r="3.5" fill="#fff" stroke="#ff5722" strokeWidth="1.8" />
                ) : (
                  // Círculo normal
                  <circle cx={cx} cy={cy} r="3.5" fill="#263238" stroke="#fff" strokeWidth="0.8" />
                )}
              </g>
            );
          })}

          {/* Marcadores de años en el eje X */}
          {filteredRows.map((r, i) => {
            if (r.month === 1 || i === 0) {
              return (
                <g key={r.periodo}>
                  <line x1={getX(i)} y1={height - padBottom} x2={getX(i)} y2={height - padBottom + 5} stroke="#888" strokeWidth="1" />
                  <text x={getX(i)} y={height - padBottom + 18} textAnchor="middle" fontSize="10" fill="#555">
                    {r.year}
                  </text>
                </g>
              );
            }
            return null;
          })}

          {/* Rectángulos interactivos para hover */}
          {filteredRows.map((_, i) => (
            <rect
              key={i}
              x={getX(i) - plotW / (2 * n)}
              y={padTop}
              width={plotW / n}
              height={plotH}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => setHoveredIdx(i)}
              onMouseLeave={() => setHoveredIdx(null)}
            />
          ))}

          {/* Línea vertical de hover */}
          {hoveredIdx !== null && (
            <line
              x1={getX(hoveredIdx)}
              y1={padTop}
              x2={getX(hoveredIdx)}
              y2={height - padBottom}
              stroke="#000"
              strokeWidth="1"
              strokeDasharray="2 2"
            />
          )}
        </svg>
      </div>

      {/* Tooltip interactivo con datos completos del mes */}
      {hoveredItem && (
        <div style={{ marginTop: '10px', padding: '10px 14px', background: '#f8fafc', border: '1px solid #cbd5e1', borderRadius: '6px', fontSize: '12px', display: 'flex', gap: '18px', flexWrap: 'wrap' }}>
          <div>
            Periodo: <b>{hoveredItem.periodo}</b> {hoveredItem.year <= 2011 ? '(≤2011: Ajuste in-sample)' : '(≥2012: Estimación modelo)'}
          </div>
          <div>
            Predicción modelo (MODIS): <b>{hoveredItem.nee_pred_calendario_lai_modis != null ? `${hoveredItem.nee_pred_calendario_lai_modis.toFixed(2)} gC/m²/d` : '—'}</b>
          </div>
          {hoveredItem.tiene_observacion ? (
            <>
              <div>
                Observado (FLUXNET): <b>{hoveredItem.nee_obs?.toFixed(2)} ± {hoveredItem.nee_incert?.toFixed(2) ?? '0.00'}</b> gC/m²/d
              </div>
              <div>
                Calidad (QC): <b>{hoveredItem.nee_qc != null ? hoveredItem.nee_qc.toFixed(2) : '—'}</b>
              </div>
              {hoveredItem.ventana_cruza_hueco && (
                <div style={{ color: '#e65100', fontWeight: 600 }}>
                  ⚠ Ventana cruza el hueco 2006-02→2008-07
                </div>
              )}
              {hoveredItem.baja_calidad && (
                <div style={{ color: '#d32f2f', fontWeight: 600 }}>
                  ⚠ Baja calidad de medición (QC &lt; 0.5)
                </div>
              )}
            </>
          ) : (
            <div style={{ color: '#888' }}>Sin observación en torre para este mes</div>
          )}
        </div>
      )}

      {/* Leyenda exhaustiva */}
      <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap', marginTop: '14px', fontSize: '12px', alignItems: 'center', borderTop: '1px solid #f0f0f0', paddingTop: '10px' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '18px', height: '3px', background: '#2e7d32', display: 'inline-block' }} />
          Línea predicha (régimen MODIS)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#263238', display: 'inline-block' }} />
          Punto observado (± incertidumbre conjunta)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '9px', height: '9px', transform: 'rotate(45deg)', background: '#ff9800', border: '1px solid #e65100', display: 'inline-block' }} />
          2008-08 a 2008-11 (cruza hueco)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#fff', border: '2px solid #ff5722', display: 'inline-block' }} />
          Baja calidad (QC &lt; 0.5)
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '10px', background: 'rgba(46, 125, 50, 0.1)', border: '1px solid #2e7d32', display: 'inline-block' }} />
          ≤ 2011: Ajuste
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '14px', height: '10px', background: 'rgba(33, 150, 243, 0.08)', border: '1px solid #1976d2', display: 'inline-block' }} />
          ≥ 2012: Estimación del modelo
        </span>
      </div>
    </div>
  );
}
