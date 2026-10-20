import type { Scenario, Simulation } from '../types';
import { KpiCard } from '../components/KpiCard';
import { ModelTrace } from '../components/ModelTrace';
import type { IAProps } from './Scenario';

const FILAS: Array<[keyof Simulation['baseline'], string, string]> = [
  ['biomasa', 'Biomasa', 'Mg/ha'],
  ['npp', 'NPP (fórmula analítica)', 'Mg C/ha/año'],
  ['riesgo', 'Riesgo de incendio', 'probabilidad'],
  ['nee', 'NEE (balance neto C, ajuste)', 'gC m-2 d-1'],
];

export function ExportView({ s, result, ia }: { s: Scenario; result: Simulation | null; ia: IAProps }) {
  const sv = result?.source_version || 'v2.2.0';
  const fecha = result ? new Date().toLocaleString('es-ES') : '';
  const ref = result?.referencia;

  const download = (name: string, text: string, type = 'application/json') => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type }));
    a.download = name;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const exportJson = () => {
    if (!result) return;
    const payload = {
      generated_at: new Date().toISOString(),
      source_version: result.source_version,
      tipo_evaluacion: 'AJUSTE (datos de entrenamiento, no es validación independiente)',
      escenario: s,
      referencia_observada: ref || null,
      resumen: {
        linea_base: result.baseline,
        escenario: result.scenario,
        delta: result.delta,
      },
      temporal: result.temporal,
      modelos_usados: result.insumos
        ? result.insumos.modelos.map((m) => ({
            objetivo: m.objetivo,
            modelo: m.modelo,
            tipo: m.tipo,
            rama: m.rama,
            predictoras: m.predictoras,
            resultado: m.resultado,
            unidad: m.unidad,
          }))
        : undefined,
      insumos: result.insumos,
      explicacion_ia: ia.explicacion || undefined,
    };
    download(`resultado_escenario_${sv}.json`, JSON.stringify(payload, null, 2));
  };

  const exportCsv = () => {
    if (!result) return;
    const rows: string[] = [];
    rows.push('# RESUMEN DE LA SIMULACION — GEMELO DIGITAL FORESTAL');
    rows.push('# TIPO DE EVALUACION: AJUSTE (datos de entrenamiento)');
    rows.push(`fecha_generacion,${new Date().toISOString()}`);
    rows.push(`source_version,${result.source_version}`);
    if (ref) {
      rows.push(`origen_estado,${ref.origen_estado}`);
      rows.push(`ultimo_mes_frescura,${ref.ultimo_mes_estado_base}`);
      rows.push(`media_observada_mes,${ref.media_observada_mes ?? ''}`);
      rows.push(`valor_observado_mes,${ref.valor_observado ?? ''}`);
      rows.push(`incertidumbre_obs,${ref.incertidumbre ?? ''}`);
      rows.push(`calidad_qc_obs,${ref.calidad ?? ''}`);
    }
    rows.push('');
    rows.push('# RESULTADOS (MODELOS ENTRENADOS)');
    rows.push('variable,etiqueta,linea_base,escenario,delta,unidad');
    for (const [k, lbl, u] of FILAS) {
      rows.push(`${k},"${lbl}",${result.baseline[k] ?? ''},${result.scenario[k] ?? ''},${result.delta[k] ?? ''},"${u}"`);
    }

    if (result.insumos?.modelos?.length) {
      rows.push('');
      rows.push('# MODELOS Y RAMAS DE ENTRADA');
      rows.push('objetivo,modelo,tipo,rama,resultado,unidad');
      for (const m of result.insumos.modelos) {
        rows.push(`"${m.objetivo}","${m.modelo}","${m.tipo}","${m.rama || ''}",${m.resultado ?? ''},"${m.unidad}"`);
      }
    }

    if (ia.explicacion) {
      rows.push('');
      rows.push('# EXPLICACION CON IA (GEMINI)');
      rows.push(`"${ia.explicacion.replace(/"/g, '""').replace(/\r?\n/g, ' ')}"`);
    }

    rows.push('');
    rows.push('# SERIE TEMPORAL MENSUAL');
    rows.push('period,biomasa_base,biomasa_escenario,riesgo_base,riesgo_escenario,nee_base,nee_escenario');
    for (const x of result.temporal) {
      rows.push(
        `${x.period},${x.baseline},${x.scenario},${x.riesgo_base},${x.riesgo_escenario},${x.nee_base ?? ''},${x.nee_escenario ?? ''}`
      );
    }
    download(`serie_temporal_${sv}.csv`, rows.join('\n'), 'text/csv');
  };

  return (
    <div className="panel">
      <h2>Exportar resultado</h2>
      <p className="muted">
        Archivos y reporte imprimible con los resultados de la simulación. Trazabilidad <b>source_version={sv}</b>.
      </p>
      <div className="exportCards">
        <button className="primary" disabled={!result} onClick={exportJson}>
          ↓ Exportar JSON
        </button>
        <button disabled={!result} onClick={exportCsv}>
          ↓ Exportar CSV
        </button>
        <button disabled={!result} onClick={() => window.print()}>
          ▣ Generar vista imprimible / PDF
        </button>
        {result && ia.configurado && !ia.explicacion && !ia.cargando && (
          <button onClick={ia.onExplicar}>✨ Explicar con IA</button>
        )}
        {ia.cargando && <button disabled>Analizando con Gemini…</button>}
      </div>

      {result && !ia.configurado && (
        <p className="muted">IA no configurada: define GEMINI_API_KEY en el archivo .env del servidor para incluir la explicación.</p>
      )}

      {result ? (
        <div className="report">
          <h2>Reporte de simulación — Gemelo Digital Forestal BR-Sa1</h2>
          <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', fontSize: '13px', margin: '4px 0 16px', color: '#555' }}>
            <span>Origen: <b>{sv}</b></span>
            <span>Fecha: <b>{fecha}</b></span>
            <span style={{ background: '#e8f5e9', color: '#2e7d32', padding: '2px 8px', borderRadius: '4px', fontWeight: 600 }}>
              EVALUACIÓN: AJUSTE (datos de entrenamiento)
            </span>
          </div>

          {/* Bloque de referencia de observaciones */}
          {ref && (
            <div style={{ background: '#f5f5f5', border: '1px solid #e0e0e0', padding: '10px 14px', borderRadius: '6px', fontSize: '12px', marginBottom: '16px' }}>
              <strong>Referencia observada de la torre FLUXNET (Mes {s.month}):</strong>
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '4px' }}>
                <span>Climatología mensual: <b>{ref.media_observada_mes != null ? `${ref.media_observada_mes >= 0 ? '+' : ''}${ref.media_observada_mes.toFixed(2)}` : '—'} ± {ref.desviacion_observada_mes?.toFixed(2) ?? '—'} gC/m²/d</b></span>
                {ref.tiene_observacion ? (
                  <>
                    <span>Observado: <b>{ref.valor_observado?.toFixed(2)} ± {ref.incertidumbre?.toFixed(2)} gC/m²/d</b></span>
                    <span>Calidad QC: <b>{ref.calidad?.toFixed(2)}</b></span>
                  </>
                ) : (
                  <span>Sin medición directa para este mes específico (usa climatología)</span>
                )}
                <span>Origen estado: <b>{ref.origen_estado}</b> (frescura: {ref.ultimo_mes_estado_base})</span>
              </div>
            </div>
          )}

          <div className="kpis">
            <KpiCard label="Biomasa" value={result.scenario.biomasa} delta={result.delta.biomasa} unit=" Mg/ha" />
            <KpiCard label="NPP" value={result.scenario.npp} delta={result.delta.npp} unit=" Mg C/ha/año" badge="Fórmula analítica" />
            <KpiCard label="Riesgo incendio" value={result.scenario.riesgo * 100} delta={result.delta.riesgo * 100} unit="%" />
            <KpiCard label="NEE (Balance de C)" value={result.scenario.nee ?? 0} delta={result.delta.nee} unit=" gC/m²/d" />
          </div>

          <div className="compare">
            <div>
              <span>Línea base</span>
              <strong>{result.baseline.biomasa.toFixed(1)} Mg/ha</strong>
            </div>
            <div>
              <span>Escenario</span>
              <strong>{result.scenario.biomasa.toFixed(1)} Mg/ha</strong>
            </div>
          </div>

          {result.insumos && <ModelTrace insumos={result.insumos} referencia={result.referencia} />}

          {ia.explicacion && (
            <div className="iaPanel">
              <h3>Explicación con IA <small>(Gemini)</small></h3>
              <p className="iaText">{ia.explicacion}</p>
            </div>
          )}
          {ia.error && <p className="iaError">{ia.error}</p>}

          <h3>Serie temporal mensual</h3>
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
                    <td style={{ color: '#2e7d32', fontWeight: 600 }}>{x.nee_escenario != null ? x.nee_escenario.toFixed(2) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p className="muted" style={{ marginTop: '16px', fontSize: '11px' }}>
            Régimen de datos: todas las métricas corresponden a ajuste in-sample (2002–2011). Los años ≥ 2012 corresponden a estimaciones con forzantes climáticos ERA5 sin verdad terreno de flujos. No usar para decisiones operativas.
          </p>
        </div>
      ) : (
        <div className="empty">Ejecuta una simulación para poder exportarla.</div>
      )}
    </div>
  );
}