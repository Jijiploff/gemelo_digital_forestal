import { useEffect, useState } from 'react';
import type { ObservacionesFlujos, Simulation } from '../types';
import { getObservaciones } from '../services/api';
import { TimeSeries } from '../components/TimeSeries';
import { HistoricalSeries } from '../components/HistoricalSeries';
import { TwinPerformance } from '../components/TwinPerformance';

export function TimelineView({ result }: { result: Simulation | null }) {
  const [tab, setTab] = useState<'año' | 'historico'>('año');
  const [observaciones, setObservaciones] = useState<ObservacionesFlujos | null>(null);

  useEffect(() => {
    getObservaciones().then(setObservaciones).catch(() => {});
  }, []);

  const simYear = result?.temporal?.[0]?.period ? parseInt(result.temporal[0].period.slice(0, 4), 10) : 2025;

  return (
    <div className="panel">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginBottom: '16px' }}>
        <div>
          <h2>Serie temporal e inferencia histórica</h2>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            Evolución mensual del NEE, biomasa y riesgo de incendio.
          </p>
        </div>

        {/* Pestañas de modo */}
        <div style={{ display: 'flex', gap: '6px' }}>
          <button
            type="button"
            className={tab === 'año' ? 'primary' : ''}
            onClick={() => setTab('año')}
          >
            📅 Vista del año ({simYear})
          </button>
          <button
            type="button"
            className={tab === 'historico' ? 'primary' : ''}
            onClick={() => setTab('historico')}
          >
            📈 Vista histórica (2002–2025)
          </button>
        </div>
      </div>

      {tab === 'año' ? (
        result ? (
          <>
            <TimeSeries
              temporal={result.temporal}
              observaciones={observaciones}
              simYear={simYear}
            />

            <h3 style={{ marginTop: '24px', fontSize: '15px' }}>Tabla de inferencia mensual — {simYear}</h3>
            <div className="tableWrap">
              <table>
                <thead>
                  <tr>
                    <th>Periodo</th>
                    <th>Biomasa base (Mg/ha)</th>
                    <th>Biomasa escenario</th>
                    <th>Riesgo base</th>
                    <th>Riesgo escenario</th>
                    <th>NEE base (gC/m²/d)</th>
                    <th>NEE escenario (gC/m²/d)</th>
                  </tr>
                </thead>
                <tbody>
                  {result.temporal.map((x) => (
                    <tr key={x.period}>
                      <td><b>{x.period}</b></td>
                      <td>{x.baseline.toFixed(1)}</td>
                      <td>{x.scenario.toFixed(1)}</td>
                      <td>{(x.riesgo_base * 100).toFixed(1)}%</td>
                      <td>{(x.riesgo_escenario * 100).toFixed(1)}%</td>
                      <td>{x.nee_base != null ? x.nee_base.toFixed(2) : '—'}</td>
                      <td style={{ color: '#2e7d32', fontWeight: 600 }}>
                        {x.nee_escenario != null ? x.nee_escenario.toFixed(2) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Tarjeta de desempeño del gemelo */}
            <TwinPerformance />
          </>
        ) : (
          <div className="empty">Ejecuta una simulación para visualizar la dinámica del año.</div>
        )
      ) : (
        <>
          <HistoricalSeries observaciones={observaciones} />
          <TwinPerformance />
        </>
      )}
    </div>
  );
}
