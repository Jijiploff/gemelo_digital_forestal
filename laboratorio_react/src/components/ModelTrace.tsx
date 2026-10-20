import type { Insumos, ReferenciaSimulacion } from '../types';

export function ModelTrace({
  insumos,
  referencia,
}: {
  insumos?: Insumos;
  referencia?: ReferenciaSimulacion;
}) {
  if (!insumos) return null;
  const g = insumos.gestion || {};
  const v = insumos.vegetacion_efectiva || {};
  const ventana = insumos.ventana_lstm;
  const origen = insumos.origen_estado || referencia?.origen_estado || 'desconocido';
  const ultimoMes = referencia?.ultimo_mes_estado_base || '2025-12';

  return (
    <div className="traza" style={{ marginTop: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '8px', marginBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0 }}>Trazabilidad del modelo · Factores y ramas analizadas</h3>
          <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#666' }}>
            Dos ramas de entrada desacopladas según el régimen de entrenamiento.
          </p>
        </div>
        <div style={{ textAlign: 'right', fontSize: '12px', background: '#f5f5f5', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e0e0e0' }}>
          <div>Origen estado: <b>{origen}</b></div>
          <div style={{ color: '#888' }}>Último mes base: <b>{ultimoMes}</b> (frescura)</div>
          {referencia?.indicador_dato_entrenamiento && (
            <span style={{ display: 'inline-block', marginTop: '2px', padding: '1px 6px', background: '#e3f2fd', color: '#1976d2', borderRadius: '4px', fontSize: '11px', fontWeight: 600 }}>
              Dato de entrenamiento (In-Sample)
            </span>
          )}
        </div>
      </div>

      {/* Ventana usada por el LSTM */}
      {ventana && (
        <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '10px 14px', borderRadius: '8px', marginBottom: '14px', fontSize: '13px' }}>
          <strong style={{ color: '#166534' }}>⏱ Ventana temporal del LSTM:</strong>{' '}
          <span>{ventana.descripcion}</span>
          <div style={{ marginTop: '4px', fontSize: '12px', color: '#15803d' }}>
            Meses previos evaluados en orden cronológico real: {ventana.meses.join(' → ')}. (Alineación requerida por el modelo para predecir el mes t).
          </div>
        </div>
      )}

      {/* Las dos ramas de entrada */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px', marginBottom: '16px' }}>
        <div style={{ padding: '12px', borderRadius: '8px', background: '#fafafa', border: '1px solid #e5e5e5' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: '#2d3748', marginBottom: '6px' }}>
            🌿 Rama 1: Vegetación combinada (AGB_GEDI e INCENDIO)
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
            Utiliza el régimen combinado Sentinel-2 / MODIS con el manejo aplicado sobre la observación:
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '12px' }}>
            <span style={{ background: '#fff', border: '1px solid #ddd', padding: '2px 8px', borderRadius: '4px' }}>
              NDVI efectivo: <b>{v.ndvi_combinado ?? '—'}</b>
            </span>
            <span style={{ background: '#fff', border: '1px solid #ddd', padding: '2px 8px', borderRadius: '4px' }}>
              LAI efectivo: <b>{v.lai_combinado ?? '—'}</b>
            </span>
          </div>
        </div>

        <div style={{ padding: '12px', borderRadius: '8px', background: '#fafafa', border: '1px solid #e5e5e5' }}>
          <div style={{ fontWeight: 600, fontSize: '13px', color: '#2d3748', marginBottom: '6px' }}>
            🛰 Rama 2: Régimen MODIS (3-PG LSTM para NEE)
          </div>
          <div style={{ fontSize: '12px', color: '#666', marginBottom: '8px' }}>
            LAI y NPP_3PG derivados exclusivamente de MODIS_NDVI (acorde a entrenamiento 2002-2011):
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', fontSize: '12px' }}>
            <span style={{ background: '#fff', border: '1px solid #ddd', padding: '2px 8px', borderRadius: '4px' }}>
              MODIS NDVI: <b>{v.modis_ndvi ?? '—'}</b>
            </span>
            <span style={{ background: '#fff', border: '1px solid #ddd', padding: '2px 8px', borderRadius: '4px' }}>
              MODIS LAI: <b>{v.modis_lai ?? '—'}</b>
            </span>
            <span style={{ background: '#fff', border: '1px solid #ddd', padding: '2px 8px', borderRadius: '4px' }}>
              NPP_3PG (clamped): <b>{v.npp_3pg_lstm ?? '—'}</b>
            </span>
          </div>
        </div>
      </div>

      {/* Acciones de manejo aplicadas */}
      <div className="vege" style={{ marginBottom: '16px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, color: '#4a5568' }}>Acciones relativas aplicadas:</span>
        {Object.entries(g).map(([k, x]) => (
          <span key={k}>{k.replace(/_/g, ' ')}: <b>{x}</b></span>
        ))}
      </div>

      {/* Modelos y sus predictoras */}
      <div className="trazaCards">
        {insumos.modelos?.map((m, i) => (
          <div className="trazaCard" key={i}>
            <div className="trazaHead">
              <div>
                <strong>{m.objetivo}</strong>
                {m.rama && <div style={{ fontSize: '11px', color: '#4a5568', fontWeight: 500 }}>{m.rama}</div>}
              </div>
              <span style={{ textAlign: 'right' }}>{m.modelo} · {m.tipo}</span>
            </div>
            <div className="predictores">
              {m.predictoras.map((p, j) => (
                <span className="pred" key={j}>
                  {p.nombre} <b>{p.valor}</b> {p.unidad}
                </span>
              ))}
            </div>
            <div className="resultado">
              {m.resultado != null ? (
                <>
                  <span>estimación (ajuste)</span>
                  <b>{m.resultado}</b> {m.unidad}
                </>
              ) : (
                <>
                  <span>estimación</span>
                  <b>no disponible</b>
                </>
              )}
            </div>
          </div>
        ))}
      </div>

      {insumos.interpretaciones?.length ? (
        <div style={{ marginTop: '16px', background: '#fafafa', border: '1px solid #eee', borderRadius: '8px', padding: '12px 16px' }}>
          <strong style={{ fontSize: '13px', color: '#2d3748', display: 'block', marginBottom: '6px' }}>
            Notas técnicas del gemelo:
          </strong>
          <ul className="interpretaciones" style={{ margin: 0, paddingLeft: '18px', fontSize: '12px', color: '#555', lineHeight: 1.5 }}>
            {insumos.interpretaciones.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}