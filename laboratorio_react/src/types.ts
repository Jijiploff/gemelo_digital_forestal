export type Scenario = {
  clareo_pct: number;
  quema_pct: number;
  restauracion_plantas_ha: number;
  manejo_combustibles: number;
  fmc: number;
  lai: number;
  ndvi: number;
  precipitacion_mm: number;
  temperatura_c: number;
  year: number;
  month: number;
};

export type Metricas = {
  biomasa: number;
  npp: number;
  riesgo: number;
  nee?: number | null;
};

export type Predictora = {
  nombre: string;
  valor: number;
  unidad: string;
};

export type TrazaModelo = {
  objetivo: string;
  modelo: string;
  tipo: string;
  predictoras: Predictora[];
  resultado?: number | null;
  unidad: string;
  rama?: string;
};

export type Insumos = {
  gestion: Record<string, number>;
  vegetacion_efectiva: Record<string, number>;
  ventana_lstm?: {
    meses: string[];
    descripcion: string;
  };
  origen_estado?: string;
  modelos: TrazaModelo[];
  interpretaciones: string[];
};

export type Tree = {
  x: number;
  y: number;
  height: number;
  crown: number;
  biomass: number;
  risk: number;
  loss: number;
  elevation?: number;
  en_subparcela_3d?: boolean;
};

export type Terreno = {
  grid_size: number;
  resolution_m: number;
  elevation_min: number;
  elevation_max: number;
  elevations: number[][];
};

export type ParcelaMetadata = {
  sitio: string;
  latitud: number;
  longitud: number;
  area_macro_m: number;
  subparcela_3d_m: number;
  fuente: string;
  total_arboles_macro: number;
  total_arboles_subparcela_3d: number;
};

export type ReferenciaSimulacion = {
  media_observada_mes?: number | null;
  desviacion_observada_mes?: number | null;
  tiene_observacion: boolean;
  valor_observado?: number | null;
  calidad?: number | null;
  incertidumbre?: number | null;
  baja_calidad?: boolean | null;
  indicador_dato_entrenamiento: boolean;
  origen_estado: string;
  ultimo_mes_estado_base: string;
  regimen_lai?: string;
};

export type Simulation = {
  source_version: string;
  baseline: Metricas;
  scenario: Metricas;
  delta: Metricas;
  temporal: Array<{
    period: string;
    baseline: number;
    scenario: number;
    riesgo_base: number;
    riesgo_escenario: number;
    nee_base?: number | null;
    nee_escenario?: number | null;
  }>;
  trees: Tree[];
  insumos?: Insumos;
  referencia?: ReferenciaSimulacion;
  terreno?: Terreno;
  metadata_parcela?: ParcelaMetadata;
};

export type Model = {
  nombre: string;
  etiqueta?: string;
  tipo?: string;
  objetivo?: string;
  metricas: {
    r2?: number;
    rmse?: number;
    mae?: number;
    sesgo?: number;
    r_pearson?: number;
    n?: number;
  } & Record<string, number | undefined>;
  hiperparametros?: Record<string, unknown>;
  source_version: string;
  fecha?: string;
};

// Tipos para /observaciones y /validacion
export type ObservacionesSerieItem = {
  periodo: string;
  year: number;
  month: number;
  tiene_observacion: boolean;
  nee_obs?: number | null;
  nee_qc?: number | null;
  nee_incert?: number | null;
  baja_calidad?: boolean;
  gpp_dt_vut?: number | null;
  reco_dt_vut?: number | null;
  nee_pred_entrenamiento?: number | null;
  residuo_obs_menos_pred?: number | null;
  ventana_cruza_hueco?: boolean | null;
  nee_pred_calendario?: number | null;
  nee_pred_calendario_lai_modis?: number | null;
};

export type ClimatologiaObservadaItem = {
  month: number;
  nee_media: number;
  nee_sd: number;
  n: number;
  gpp_dt_vut_media?: number;
  reco_dt_vut_media?: number;
};

export type ObservacionesFlujos = {
  metadata: {
    sitio: string;
    producto: string;
    unidades_flujos: string;
    nee_observado: {
      meses: number;
      primer_mes: string;
      ultimo_mes: string;
      media: number;
      huecos_internos: string[];
    };
    advertencias: string[];
  };
  climatologia_observada: ClimatologiaObservadaItem[];
  serie: ObservacionesSerieItem[];
};

export type MetricaAjusteDetalle = {
  n: number;
  r2: number;
  rmse: number;
  mae: number;
  sesgo_pred_menos_obs: number;
  r_pearson: number;
};

export type ValidacionGemelo = {
  metadata: {
    generado?: string;
    etiqueta: string;
    modelo: string;
    objetivo: string;
    versiones?: Record<string, string>;
    convenciones?: Record<string, string>;
  };

  paridad_entrenamiento?: {
    ok: boolean;
    recalculado: MetricaAjusteDetalle;
    referencia: { r2: number; rmse: number; mae: number };
  };
  metricas_ajuste: Record<string, MetricaAjusteDetalle>;
  lineas_base: Record<string, MetricaAjusteDetalle>;
  alineacion_ventana: {
    tabla: Array<{
      lag_meses: number;
      n: number;
      r2: number;
      rmse: number;
      mae: number;
      sesgo_pred_menos_obs: number;
      r_pearson: number;
    }>;
    mejor_lag: number;
    conclusion: string;
    regla_api: string;
  };
  ventanas_cruzan_hueco?: {
    n: number;
    fechas_objetivo: string[];
  };
  estacionalidad: {
    meses_secos: number[];
    sesgo_por_mes: Array<{
      month: number;
      n: number;
      obs_media: number;
      pred_media: number;
      sesgo_pred_menos_obs: number;
      rmse: number;
    }>;
    sesgo_por_estacion: Array<{
      estacion: string;
      n: number;
      obs_media: number;
      pred_media: number;
      sesgo_pred_menos_obs: number;
      rmse: number;
    }>;
  };
  cobertura_incertidumbre_torre: {
    n: number;
    dentro_1x_incert: number;
    dentro_2x_incert: number;
    incert_media: number;
    rmse: number;
  };
  coherencia_climatologica: {
    etiqueta: string;
    periodo_posterior: string[];
    n_meses_posteriores: number;
    r_climatologias: number;
    rmse_climatologias: number;
    media_obs: number;
    media_pred_posterior: number;
    tabla: Array<{
      month: number;
      obs_2002_2011: number;
      pred_mismos_meses_2002_2011: number;
      pred_posterior: number;
    }>;
  };
  advertencias?: string[];
  diagnostico_regimen_entrada?: {
    etiqueta: string;
    npp3pg?: {
      n: number;
      min: number;
      mediana: number;
      max: number;
      fraccion_en_piso_0_1: number;
      r_con_gpp: number;
    };
    veredicto: string;
    regla_api: string;
  };
};

export type MetricaArticuloArchivo = {
  nombre: string;
  tipo: 'figura' | 'tabla' | 'metadatos';
  titulo: string;
  descripcion: string;
  tamano_bytes: number;
  url: string;
};

export type MetricasArticulo = {
  directorio: string;
  archivos: MetricaArticuloArchivo[];
};
