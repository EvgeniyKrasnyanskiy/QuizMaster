import { useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';
import { DEFAULT_CONFIG, CACHE_KEYS, SYNCABLE_CONFIG_KEYS, API_TIMEOUT } from '../constants';

export const sanitizeRemoteConfig = (remoteConfig) => {
  const nextConfig = {};

  for (const key of SYNCABLE_CONFIG_KEYS) {
    if (!(key in remoteConfig)) continue;

    const value = remoteConfig[key];

    if (['title', 'welcomeDesc', 'loadingDesc', 'prestartText', 'adminCode', 'reportEmail'].includes(key)) {
      if (typeof value === 'string') nextConfig[key] = value.trim();
      continue;
    }

    if (key === 'allowedQuizHosts') {
      if (Array.isArray(value)) {
        nextConfig[key] = value
          .filter(item => typeof item === 'string')
          .map(item => item.trim().toLowerCase())
          .filter(Boolean);
      }
      continue;
    }

    if (['maxQuizFileBytes', 'remoteFetchTimeoutMs', 'TEST_COOLDOWN_MS'].includes(key)) {
      if (Number.isInteger(value) && value >= 0) nextConfig[key] = value;
    }
  }

  return nextConfig;
};

export const useConfig = (githubConfig) => {
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [localConfig, setLocalConfig] = useState(DEFAULT_CONFIG);
  const [remoteConfigSnapshot, setRemoteConfigSnapshot] = useState(null);
  const [configSyncFailed, setConfigSyncFailed] = useState(false);

  const loadConfig = useCallback(async ({ silent = false } = {}) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);

    try {
      const res = await fetch(githubConfig.CONFIG_URL, { signal: controller.signal });
      if (!res.ok) throw new Error(`Config HTTP ${res.status}`);
      const json = await res.json();
      if (!json || typeof json !== 'object' || Array.isArray(json)) {
        throw new Error('Удаленный конфиг имеет неверный формат.');
      }
      const syncedConfig = sanitizeRemoteConfig(json);
      setRemoteConfigSnapshot(syncedConfig);
      setConfigSyncFailed(false);
      const merged = {
        ...DEFAULT_CONFIG,
        ...syncedConfig,
      };
      setConfig(prev => ({
        ...prev,
        ...merged,
      }));
      setLocalConfig(merged);
      await AsyncStorage.setItem(CACHE_KEYS.CONFIG, JSON.stringify(merged));
      if (!silent) {
        Alert.alert('Синхронизация завершена', 'Параметры успешно обновлены из удаленного конфига.');
      }
    } catch (e) {
      setConfigSyncFailed(true);
      const msg = e.name === 'AbortError' ? 'Request timed out. Please check your internet connection.' : (e.message || 'Не удалось загрузить удаленный конфиг.');
      if (!silent) {
        Alert.alert('Ошибка синхронизации', msg);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }, [githubConfig]);

  const updateConfig = useCallback(async (nextConfig) => {
    try {
      const sanitized = sanitizeRemoteConfig(nextConfig);
      const merged = { ...config, ...sanitized };
      setConfig(merged);
      await AsyncStorage.setItem(CACHE_KEYS.CONFIG, JSON.stringify(merged));
      return true;
    } catch (e) {
      console.error('Failed to update config:', e);
      return false;
    }
  }, [config]);

  // handlePublishConfigToCloud requires githubRequest and teacherProfile which are outside useConfig.
  // We will leave it in App.js or useGitHubSync for now, or pass dependencies.

  return {
    config,
    setConfig,
    localConfig,
    setLocalConfig,
    remoteConfigSnapshot,
    configSyncFailed,
    loadConfig,
    updateConfig
  };
};
