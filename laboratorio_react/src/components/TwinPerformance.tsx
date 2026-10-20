import { useEffect, useState } from 'react';
import type { ValidacionGemelo } from '../types';
import { getValidacion } from '../services/api';

export function TwinPerformance() {
  const [val, setVal] = useState<ValidacionGemelo | null>(null);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getValidacion()
      .then((data) => {
        setVal(data);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="panel" style={{ padding: '16px' }}><p className="muted">Cargando métricas de ajuste del gemelo…</p></div>;
  }

  if (!val) {
    return null;
  }

  const met = val.metricas_ajuste || {};
  const base = val.lineas_base || {};
  const align = val.alineacion_ventana;
  const cob = val.cobertura_incertidumbre_torre;
  const coh = val.coherencia_climatologica;

  return (
    <div className="panel" style={{ marginTop: '20px', border: '1px solid #c8e6c9', background: '#fafdfa' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }} onClick={() => setOpen(!open)}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h3 style={{ margin: 0, color: '#2e7d32' }}>🎯 Desempeño del gemelo (Métricas de ajuste)</h3>
            <span style={{ fontSize: '11px', background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
              AJUSTE IN-SAMPLE
            </span>
          </div>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#555' }}>
            R² 0.571 · RMSE 0.690 · MAE 0.561 (n = 86 meses). Todas las métricas corresponden a ajuste, no a validación independiente.
          </p>
        </div>
        <button type="button" style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#2e7d32' }}>
          {open ? '▲ Ocultar' : '▼ Ver análisis detallado'}
        </button>
      </div>

      {open && (
        <div style={{ marginTop: '16px', borderTop: '1px solid #e0e0e0', paddingTop: '16px' }}>
          {/* Advertencia obligatoria */}
          <div style={{ background: '#fff9c4', border: '1px solid #fff59d', padding: '10px 14px', borderRadius: '6px', fontSize: '12px', color: '#f57f17', marginBottom: '16px' }}>
            <strong>⚠ Regla de rigor científico:</strong> No usar las palabras "validación" ni "precisión" sin "ajuste". Los 90 meses observados en la torre FLUXNET (2002-2011) fueron datos de entrenamiento del LSTM. No existen datos de flujo posteriores a 2011 para una validación independiente fuera de muestra.
          </div>

          {/* 1. Métricas por subconjunto */}
          <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#333' }}>1. Métricas de ajuste por subconjunto</h4>
          <div className="tableWrap" style={{ marginBottom: '16px' }}>
            <table>
              <thead>
                <tr>
                  <th>Subconjunto de ajuste</th>
                  <th>n</th>
                  <th>R²</th>
                  <th>RMSE</th>
                  <th>MAE</th>
                  <th>Sesgo (pred − obs)</th>
                  <th>r Pearson</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(met).map(([k, d]) => (
                  <tr key={k} style={{ fontWeight: k.includes('todos') ? 600 : 400 }}>
                    <td>{k}</td>
                    <td>{d.n}</td>
                    <td>{d.r2.toFixed(3)}</td>
                    <td>{d.rmse.toFixed(3)}</td>
                    <td>{d.mae.toFixed(3)}</td>
                    <td>{d.sesgo_pred_menos_obs >= 0 ? '+' : ''}{d.sesgo_pred_menos_obs.toFixed(4)}</td>
                    <td>{d.r_pearson.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 2. Comparación con líneas base */}
          <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#333' }}>2. Contraste frente a líneas base (Baselines)</h4>
          <div className="tableWrap" style={{ marginBottom: '16px' }}>
            <table>
              <thead>
                <tr>
                  <th>Línea base</th>
                  <th>n</th>
                  <th>R²</th>
                  <th>RMSE</th>
                  <th>MAE</th>
                  <th>Sesgo</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(base).map(([k, d]) => (
                  <tr key={k}>
                    <td>{k}</td>
                    <td>{d.n}</td>
                    <td>{d.r2.toFixed(3)}</td>
                    <td>{d.rmse.toFixed(3)}</td>
                    <td>{d.mae.toFixed(3)}</td>
                    <td>{d.sesgo_pred_menos_obs >= 0 ? '+' : ''}{d.sesgo_pred_menos_obs.toFixed(4)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* 3. Alineación de la ventana temporal */}
          {align && (
            <div style={{ marginBottom: '16px' }}>
              <h4 style={{ margin: '0 0 8px', fontSize: '14px', color: '#333' }}>3. Prueba de desfase (Alineación de ventana)</h4>
              <p style={{ fontSize: '12px', color: '#666', margin: '0 0 8px' }}>
                {align.conclusion}
              </p>
              <div className="tableWrap">
                <table>
                  <thead>
                    <tr>
                      <th>Lag temporal</th>
                      <th>Ventana utilizada</th>
                      <th>R²</th>
                      <th>RMSE</th>
                      <th>MAE</th>
                      <th>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {align.tabla.map((t) => {
                      const isBest = t.lag_meses === align.mejor_lag;
                      return (
                        <tr key={t.lag_meses} style={{ background: isBest ? '#e8f5e9' : 'transparent', fontWeight: isBest ? 600 : 400 }}>
                          <td>Lag {t.lag_meses > 0 ? `+${t.lag_meses}` : t.lag_meses}</td>
                          <td>{t.lag_meses === 1 ? 't-4 a t-1 (meses previos)' : t.lag_meses === 0 ? 't-3 a t (incluye mes evaluado)' : `desfase ${t.lag_meses}`}</td>
                          <td>{t.r2.toFixed(3)}</td>
                          <td>{t.rmse.toFixed(3)}</td>
                          <td>{t.mae.toFixed(3)}</td>
                          <td>{isBest ? '⭐ Óptimo (Confirmado en API)' : 'Desalineado'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 4. Cobertura de incertidumbre y estacionalidad */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '14px', marginBottom: '16px' }}>
            {cob && (
              <div style={{ padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
                <strong style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Cobertura de Incertidumbre de la Torre</strong>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#555' }}>
                  <li>Dentro de 1× incertidumbre: <b>{(cob.dentro_1x_incert * 100).toFixed(1)}%</b></li>
                  <li>Dentro de 2× incertidumbre: <b>{(cob.dentro_2x_incert * 100).toFixed(1)}%</b></li>
                  <li>Incertidumbre media observada: <b>{cob.incert_media.toFixed(3)} gC m⁻² d⁻¹</b></li>
                </ul>
              </div>
            )}

            {coh && (
              <div style={{ padding: '12px', background: '#fff', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
                <strong style={{ fontSize: '13px', display: 'block', marginBottom: '6px' }}>Coherencia Climatológica (≥ 2012)</strong>
                <div style={{ fontSize: '11px', color: '#f57f17', marginBottom: '4px' }}>Etiqueta: {coh.etiqueta}</div>
                <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#555' }}>
                  <li>Correlación climatológica (r): <b>{coh.r_climatologias.toFixed(3)}</b></li>
                  <li>RMSE climatologías: <b>{coh.rmse_climatologias.toFixed(3)}</b></li>
                  <li>Periodo posterior analizado: <b>2012-01 a 2026-01 (n = {coh.n_meses_posteriores})</b></li>
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
