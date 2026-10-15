import { useEffect, useState } from 'react';
import { getModel } from './services/api';
import { useSimulacion } from './hooks/useSimulacion';
import { useExplicacionIA } from './hooks/useExplicacionIA';
import type { Scenario, Model } from './types';
import { ScenarioView } from './views/Scenario';
import { MapsView } from './views/Maps';
import { TimelineView } from './views/Timeline';
import { ExportView } from './views/Export';
import { GlossaryDrawer, GlossaryToggle, useGlossary } from './components/Glossary';
import './components/Glossary.css';

const initial: Scenario = {
  clareo_pct: 10, quema_pct: 5, restauracion_plantas_ha: 80, manejo_combustibles: 20,
  fmc: 55, lai: 4, ndvi: .72, precipitacion_mm: 180, temperatura_c: 27, year: 2026, month: 9
};

export default function App() {
  const [model, setModel] = useState<Model | null>(null);
  const [apiError, setApiError] = useState<string>('');
  const [tab, setTab] = useState('Escenario');
  const [s, setS] = useState(initial);
  const { loading, result, error: simError, run } = useSimulacion();
  const ia = useExplicacionIA();
  const explicar = () => { if (result) ia.run(s, result); };
  const { open, openGlossary, closeGlossary } = useGlossary();

  useEffect(() => {
    getModel()
      .then(setModel)
      .catch((e: Error) => setApiError(e.message));
  }, []);

  const tabs = ['Escenario', 'Mapas 2D/3D', 'Serie temporal', 'Exportar reporte'];
  const iaProps = { configurado: ia.configurado, explicacion: ia.explicacion, cargando: ia.cargando, error: ia.error, onExplicar: explicar };
  const globalError = apiError || simError;

  return <main>
    <header>
      <div><small>LABORATORIO DEL MEJOR MODELO · GEMELO DIGITAL FORESTAL</small>
        <h1>{model ? model.nombre : apiError ? '⚠ Backend no conectado' : 'Conectando…'}</h1>
        {model && <p>R² {model.metricas.r2.toFixed(2)} · RMSE {model.metricas.rmse.toFixed(1)} · MAE {model.metricas.mae.toFixed(1)} · {model.source_version}</p>}
        <GlossaryToggle onOpen={openGlossary} />
      </div>
      <div className={`status ${apiError ? 'status--offline' : model ? 'status--online' : 'status--connecting'}`}>
        <span>●</span> {apiError ? 'SIN CONEXIÓN' : model ? 'INFERENCIA' : 'CONECTANDO…'}
      </div>
    </header>

    {globalError && (
      <div className="api-error-banner" role="alert">
        <span>⚠</span>
        <span>{globalError}</span>
      </div>
    )}

    <nav>
      {tabs.map(x => <button className={tab === x ? 'active' : ''} onClick={() => setTab(x)} key={x}>{x}</button>)}
    </nav>

    {tab === 'Escenario' && <ScenarioView s={s} setS={setS} result={result} run={() => run(s)} loading={loading} ia={iaProps} />}
    {tab === 'Mapas 2D/3D' && <MapsView result={result} />}
    {tab === 'Serie temporal' && <TimelineView result={result} />}
    {tab === 'Exportar reporte' && <ExportView s={s} result={result} ia={iaProps} />}

    <footer>BR-Sa1 como referencia geografica · inferencia con modelos entrenados (fuente {model?.source_version || '—'}) · no usar para decisiones operativas reales</footer>
    <GlossaryDrawer open={open} onClose={closeGlossary} />
  </main>;
}