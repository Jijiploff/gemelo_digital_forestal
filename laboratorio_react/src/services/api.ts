import type { Scenario, Simulation, Model, ObservacionesFlujos, ValidacionGemelo, MetricasArticulo } from '../types';

const BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000';

export class ApiUnavailableError extends Error {
  constructor(endpoint: string) {
    super(
      `Servicio no disponible: no se pudo conectar con el backend en "${endpoint}". ` +
      `Verifica que el servidor esté activo e inténtalo de nuevo.`
    );
    this.name = 'ApiUnavailableError';
  }
}

async function safeFetch(input: string, init?: RequestInit): Promise<Response> {
  let response: Response;
  try {
    response = await fetch(input, init);
  } catch {
    throw new ApiUnavailableError(input);
  }
  if (!response.ok) {
    throw new ApiUnavailableError(input);
  }
  return response;
}

export async function getModel(): Promise<Model> {
  const r = await safeFetch(`${BASE}/modelo/mejor`);
  return r.json();
}

export async function simulate(s: Scenario): Promise<Simulation> {
  const r = await safeFetch(`${BASE}/simular`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(s),
  });
  return r.json();
}

export async function getDictionary() {
  const r = await safeFetch(`${BASE}/diccionario`);
  return r.json();
}

export async function getObservaciones(): Promise<ObservacionesFlujos | null> {
  try {
    const r = await fetch(`${BASE}/observaciones`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function getValidacion(): Promise<ValidacionGemelo | null> {
  try {
    const r = await fetch(`${BASE}/validacion`);
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}

export async function getMetricasArticulo(): Promise<MetricasArticulo> {
  const r = await safeFetch(`${BASE}/metricas-articulo`);
  return r.json();
}

export function metricasArticuloUrl(url: string): string {
  return `${BASE}${url}`;
}

export async function explicarEstado(): Promise<{ configurado: boolean }> {
  const r = await safeFetch(`${BASE}/explicar/estado`);
  return r.json();
}

export async function explicarIA(escenario: Scenario, simulation: Simulation): Promise<string> {
  const r = await safeFetch(`${BASE}/explicar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ escenario, simulation }),
  });
  const d = await r.json();
  return d.explicacion;
}