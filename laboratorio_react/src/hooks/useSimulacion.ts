import { useState } from 'react';
import type { Scenario, Simulation } from '../types';
import { simulate } from '../services/api';

export function useSimulacion() {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Simulation | null>(null);
  const [error, setError] = useState<string>('');

  const run = async (s: Scenario) => {
    setLoading(true);
    setError('');
    try {
      setResult(await simulate(s));
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return { loading, result, error, run };
}