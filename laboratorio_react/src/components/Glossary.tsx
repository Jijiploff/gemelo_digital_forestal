// components/Glossary.tsx
import type { ReactNode } from 'react';
import { useState } from 'react';

export const GLOSSARY_TERMS = {
  biomasa: 'Biomasa: cantidad de materia vegetal (troncos, ramas, hojas) por hectárea. Más biomasa = más carbono almacenado en el bosque.',
  npp: 'NPP (Producción Primaria Neta): cálculo analítico para estimar la productividad anual del bosque. Lleva la insignia "fórmula analítica" porque no proviene de un modelo de Machine Learning.',
  riesgo: 'Riesgo de incendio: probabilidad estimada de que ocurra un incendio en la zona, según humedad del combustible, vegetación y clima.',
  nee: 'NEE (Intercambio Neto del Ecosistema): flujo neto de carbono entre el bosque y la atmósfera. SIGNO: positivo (+) significa emisión neta a la atmósfera; negativo (-) significa sumidero o absorción neta de CO2 por el bosque.',
  signo_nee: 'Signo de NEE: Positivo (+) = EMISIÓN neta de CO2. Negativo (-) = SUMIDERO o absorción neta de CO2.',
  cut_vs_vut: 'CUT vs VUT: métodos de filtrado de fricción (u*) en FLUXNET. CUT (Constant Ustar Threshold) se usa para el NEE observado y predicho; VUT (Variable Ustar Threshold) para GPP y Reco. Nunca deben restarse directamente entre sí por tener métodos distintos.',
  calidad: 'Calidad (QC): fracción de 0 a 1 de datos de flujos medidos directamente o con buen relleno de huecos (gap-filling). Meses con QC < 0.5 se consideran de baja calidad.',
  incertidumbre: 'Incertidumbre: banda de error conjunto (aleatoria y filtro de fricción) de la medición en la torre FLUXNET (gC m-2 d-1). Permite contrastar si las estimaciones caen dentro del margen de error.',
  ajuste_vs_validacion: 'Ajuste vs Validación: Todas las métricas del gemelo corresponden a "ajuste" (datos in-sample con que se entrenó el modelo, 2002-2011). No existe validación con conjunto independiente por falta de mediciones posteriores a 2011.',
  npp_3pg: 'NPP_3PG: variable fisiológica de entrada al modelo. Permanece en el piso de 0.1 en el 72% de los meses por saturación de la fórmula de radiación y agua; por ello no debe interpretarse como productividad del bosque.',
  estimacion_posterior: 'Estimaciones ≥ 2012: salidas del modelo calculadas con forzantes climáticos ERA5. No son pronósticos meteorológicos ni se interpretan climáticamente, pues no cuentan con verdad terreno para contrastar.',
  linea_base: 'Línea base: cómo estaría el bosque si NO se aplicara ninguna acción de manejo (clareo, quema, restauración). Es el punto de comparación.',
  escenario: 'Escenario: cómo cambiaría el bosque con las acciones de manejo que definiste en los controles.',
  fmc: 'FMC (Contenido de Humedad del Combustible): cuánta agua tiene la vegetación y la hojarasca. Menos humedad = más riesgo de incendio.',
  lai: 'LAI (Índice de Área Foliar): capas de hojas por metro cuadrado de suelo. Para el modelo NEE se utiliza el régimen derivado de MODIS_NDVI.',
  ndvi: 'NDVI: índice satelital de verdor de la vegetación (0 = suelo descubierto, 1 = vegetación densa).',
  modelo_entrenado: 'Modelo entrenado: algoritmo ajustado con datos de la torre FLUXNET Tapajós BR-Sa1 (2002-2011) etiquetado rigurosamente como ajuste.',
} as const;

export type GlossaryKey = keyof typeof GLOSSARY_TERMS;

function splitTerm(def: string) {
  const idx = def.indexOf(':');
  return { title: def.slice(0, idx), body: def.slice(idx + 1).trim() };
}

/** Ícono "ⓘ" chico e inline. */
export function InfoTip({ term, className = '' }: { term: GlossaryKey; className?: string }) {
  return (
    <span
      className={`glossary-infotip ${className}`.trim()}
      tabIndex={0}
      role="note"
      aria-label={GLOSSARY_TERMS[term]}
      title={GLOSSARY_TERMS[term]}
    >
      ⓘ
    </span>
  );
}

/** Envuelve un elemento existente y le agrega el ícono de ayuda. */
export function WithInfo({ term, children }: { term: GlossaryKey; children: ReactNode }) {
  return (
    <div className="glossary-with-info">
      {children}
      <InfoTip term={term} className="glossary-corner" />
    </div>
  );
}

/** Botón para abrir el glosario. */
export function GlossaryToggle({ onOpen }: { onOpen: () => void }) {
  return (
    <button type="button" className="glossary-toggle" onClick={onOpen} title="Ver glosario de términos">
      ❓ Glosario y Reglas
    </button>
  );
}

/** Panel lateral colapsable con todos los términos. */
export function GlossaryDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="glossary-drawer-backdrop" onClick={onClose}>
      <aside className="glossary-drawer" onClick={(e) => e.stopPropagation()}>
        <div className="glossary-drawer-header">
          <h3>Glosario y Convenciones Técnicas</h3>
          <button type="button" onClick={onClose} aria-label="Cerrar glosario">✕</button>
        </div>
        <div style={{ padding: '0 16px 12px', fontSize: '12px', color: '#666', borderBottom: '1px solid #eee' }}>
          Reglas de lenguaje: No usar "validación" ni "precisión" sin "ajuste". Signo de NEE: positivo = emisión neta.
        </div>
        <dl>
          {Object.entries(GLOSSARY_TERMS).map(([key, def]) => {
            const { title, body } = splitTerm(def);
            return (
              <div key={key} className="glossary-entry">
                <dt>{title}</dt>
                <dd>{body}</dd>
              </div>
            );
          })}
        </dl>
      </aside>
    </div>
  );
}

export function useGlossary() {
  const [open, setOpen] = useState(false);
  return { open, openGlossary: () => setOpen(true), closeGlossary: () => setOpen(false) };
}