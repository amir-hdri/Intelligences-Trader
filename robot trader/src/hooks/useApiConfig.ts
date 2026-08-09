import { useCallback, useEffect, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ApiConfig } from '../types';

type PersistedApiConfig = Omit<ApiConfig, 'apiKey'>;

const storageKey = 'apiConfig';
const tokenKey = 'apiAccessToken';

const sanitizePersisted = (value: unknown, fallback: PersistedApiConfig): PersistedApiConfig => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const candidate = value as Partial<PersistedApiConfig>;
  return {
    proxyUrl: typeof candidate.proxyUrl === 'string' ? candidate.proxyUrl : fallback.proxyUrl,
    isConnected: typeof candidate.isConnected === 'boolean' ? candidate.isConnected : fallback.isConnected,
    useDigitalTwin: typeof candidate.useDigitalTwin === 'boolean' ? candidate.useDigitalTwin : fallback.useDigitalTwin,
  };
};

export const useApiConfig = (
  defaultValue: ApiConfig,
): [ApiConfig, Dispatch<SetStateAction<ApiConfig>>] => {
  const defaults: PersistedApiConfig = {
    proxyUrl: defaultValue.proxyUrl,
    isConnected: defaultValue.isConnected,
    useDigitalTwin: defaultValue.useDigitalTwin,
  };
  const [config, setConfigState] = useState<ApiConfig>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      const persisted = sanitizePersisted(stored ? JSON.parse(stored) : null, defaults);
      return { ...persisted, apiKey: sessionStorage.getItem(tokenKey) || '' };
    } catch {
      return { ...defaults, apiKey: '' };
    }
  });

  useEffect(() => {
    const { apiKey, ...persisted } = config;
    localStorage.setItem(storageKey, JSON.stringify(persisted));
    if (apiKey) sessionStorage.setItem(tokenKey, apiKey);
    else sessionStorage.removeItem(tokenKey);
  }, [config]);

  const setConfig = useCallback<Dispatch<SetStateAction<ApiConfig>>>((next) => {
    setConfigState(previous => typeof next === 'function' ? next(previous) : next);
  }, []);

  return [config, setConfig];
};
