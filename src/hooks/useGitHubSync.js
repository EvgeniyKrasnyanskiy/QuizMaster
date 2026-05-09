import { useState, useCallback, useRef } from 'react';
import { Alert, Platform, ToastAndroid } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system/legacy';
import { GITHUB_CONFIG, CACHE_KEYS, MASTER_TEACHER, APP_SALT, FALLBACK_APP_SALT } from '../constants';
import { stripDatExtension, decodeEncryptedPayload, parseQuestions, buildQuizStatusKey, buildQuizProgressKey } from '../utils';

// Safety checks for lazy-loaded constants
const SafeDirs = require('../constants').QUIZ_DIRS || { ROOT: '', STUDENT: '', TEACHER: '', DOWNLOADS: '' };

export const useGitHubSync = ({ config, teacherProfile, setTeacherProfile, subscriptions, setSubscriptions, setLoading }) => {
  const [cloudRegistry, setCloudRegistry] = useState([]);
  const [lastSyncTime, setLastSyncTime] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [newTestsCount, setNewTestsCount] = useState(0);

  const hasCyrillic = (str) => /[а-яё]/i.test(str);

  const showToast = (msg) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert('Облако', msg);
    }
  };

  const githubRequest = useCallback(async (path, method = 'GET', body = null, customCreds = null) => {
    const activeToken = customCreds?.token || teacherProfile?.token || GITHUB_CONFIG.TOKEN;
    const activeOwner = customCreds?.owner || teacherProfile?.owner || GITHUB_CONFIG.OWNER;
    const activeRepo = customCreds?.repo || teacherProfile?.repo || GITHUB_CONFIG.REPO;

    if (method !== 'GET' && (!activeToken || activeToken === 'ВАШ_GITHUB_TOKEN')) {
      throw new Error('GitHub Token не настроен. Для записи/удаления тестов необходим токен в профиле или .env');
    }

    const apiBase = customCreds?.apiBase || `https://api.github.com/repos/${activeOwner}/${activeRepo}/contents`;
    const encodedPath = path.split('/').map(segment => encodeURIComponent(segment)).join('/');
    const url = `${apiBase}/${encodedPath}`;

    const headers = {
      'Accept': 'application/vnd.github.v3+json',
      'Content-Type': 'application/json',
    };
    if (activeToken && activeToken !== 'ВАШ_GITHUB_TOKEN') {
      headers['Authorization'] = `token ${activeToken}`;
    }
    const options = { method, headers };
    if (body) options.body = JSON.stringify(body);

    const controller = new AbortController();
    const timeoutMs = config?.remoteFetchTimeoutMs || 10000;
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    options.signal = controller.signal;

    try {
      const response = await fetch(url, options);
      clearTimeout(timeoutId);

      if (!response.ok) {
        const err = await response.json().catch(() => ({ message: response.statusText }));
        if (response.status === 404 && method === 'GET') return null; // File not found is OK for GET
        throw new Error(`GitHub API (${activeOwner}): ${err.message}`);
      }
      return response.json();
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.name === 'AbortError') throw new Error('Request timed out. Please check your internet connection.');
      throw e;
    }
  }, [teacherProfile, config]);

  const fetchCloudRegistry = useCallback(async () => {
    let merged = [];
    for (const sub of (subscriptions || [])) {
      if (sub.disabled) continue;
      try {
        const creds = {
          owner: sub.owner,
          repo: sub.repo,
          token: sub.token || undefined,
          isMaster: sub.isMaster
        };
        const data = await githubRequest(GITHUB_CONFIG.REGISTRY_PATH, 'GET', null, creds);
        if (data && data.content) {
          const decoded = atob(data.content.replace(/\n/g, ''));
          const registry = JSON.parse(decoded);
          const authorName = sub.name || sub.owner;

          const withAuthor = registry.map(item => ({
            ...item,
            authorId: sub.owner,
            authorName: authorName,
            isFromMaster: sub.isMaster
          }));
          merged = [...merged, ...withAuthor];
        }
      } catch (e) {
        // Silent fail for background fetch
      }
    }
    return merged;
  }, [subscriptions, githubRequest]);

  const syncCloudRegistry = useCallback(async (action, testMeta) => {
    const currentFile = await githubRequest(GITHUB_CONFIG.REGISTRY_PATH);
    let registry = [];
    let sha = null;

    if (currentFile) {
      sha = currentFile.sha;
      const decoded = atob(currentFile.content.replace(/\n/g, ''));
      registry = JSON.parse(decoded);
    }

    if (action === 'add') {
      registry = registry.filter(item => item.id !== testMeta.id);
      registry.push(testMeta);
    } else {
      registry = registry.filter(item => item.id !== testMeta.id);
    }

    const newContent = btoa(unescape(encodeURIComponent(JSON.stringify(registry, null, 2))));
    await githubRequest(GITHUB_CONFIG.REGISTRY_PATH, 'PUT', {
      message: `Registry update: ${action} ${testMeta.id}`,
      content: newContent,
      sha: sha || undefined
    });
    setCloudRegistry(registry);
  }, [githubRequest]);

  return {
    cloudRegistry, setCloudRegistry,
    lastSyncTime, setLastSyncTime,
    isSyncing, setIsSyncing,
    isRefreshing, setIsRefreshing,
    newTestsCount, setNewTestsCount,
    githubRequest,
    fetchCloudRegistry,
    syncCloudRegistry,
    showToast,
    hasCyrillic
  };
};
