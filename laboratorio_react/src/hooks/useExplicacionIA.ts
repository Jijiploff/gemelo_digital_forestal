import { useCallback, useEffect, useState } from 'react';
import type { Scenario, Simulation } from '../types';
import { explicarIA, explicarEstado } from '../services/api';

export function useExplicacionIA() {
  const [configurado, setConfigurado] = useState(false);
  const [explicacion, setExplicacion] = useState('');
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    explicarEstado()
      .then(e => setConfigurado(e.configurado))
      .catch((e: Error) => {
        setConfigurado(false);
        setError(e.message);
      });
  }, []);

  const run = useCallback(async (s: Scenario, sim: Simulation) => {
    setCargando(true);
    setError('');
    setExplicacion('');
    try {
      setExplicacion(await explicarIA(s, sim));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando(false);
    }
  }, []);

  return { configurado, explicacion, cargando, error, run };
}