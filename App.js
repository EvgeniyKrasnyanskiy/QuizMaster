import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  Alert, ScrollView, Platform, FlatList,
  StatusBar, ActivityIndicator, KeyboardAvoidingView,
  Modal, SectionList, RefreshControl, Animated, Easing, ToastAndroid, Linking
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import * as MailComposer from 'expo-mail-composer';

// ── Модули проекта ──
import {
  C, DEFAULT_CONFIG,
  APP_VERSION, GITHUB_CONFIG, QUIZ_DIRS, FILES,
  CACHE_KEYS, SYNCABLE_CONFIG_KEYS, DEFAULT_ALLOWED_CONTENT_TYPES,
  API_ENDPOINTS, COOLDOWN_SETTINGS, APP_METADATA, MASTER_TEACHER, LOCAL_TEACHER_NAME, API_TIMEOUT,
  FALLBACK_APP_SALT, SECURITY_CONFIG, APP_SALT,
  MASTER_SOURCE_URL
} from './src/constants';

// Safety checks for lazy-loaded constants
const SafeDirs = QUIZ_DIRS || { ROOT: '', STUDENT: '', TEACHER: '', DOWNLOADS: '' };
const SafeMaster = MASTER_TEACHER || { name: 'Master', password: '777' };
const SafeFiles = FILES || { TRACKING_FILE: '' };
import {
  buildQuizProgressKey,
  buildQuizStatusKey,
  buildCleanReportText,
  decodeEncryptedPayload,
  encodeEncryptedPayload,
  decryptAndParseFile,
  formatNiceDate,
  formatTime,
  getStoredQuizMeta,
  parseQuestions,
  QUIZ_TEMPLATE,
  stripDatExtension,
} from './src/utils';
import { styles } from './src/styles';
import QuizScreen from './src/screens/QuizScreen';
import TeacherProfileScreen from './src/screens/TeacherProfileScreen';
import TeachersScreen from './src/screens/TeachersScreen';
import { AuthService } from './src/services/authService';
import { Btn } from './src/components/Btn';
import { Card } from './src/components/Card';
import { HelpModal } from './src/components/HelpModal';
import { useConfig, sanitizeRemoteConfig } from './src/hooks/useConfig';

// ── GitHub Configuration ──
// Destructuring removed to prevent runtime crashes if GITHUB_CONFIG is undefined at boot.
// Direct access GITHUB_CONFIG.TOKEN, etc. is used inside functions.
// Direct access to QUIZ_DIRS, CACHE_KEYS, and FILES is used inside functions to support Lazy Getters.

// Global env check moved to bootstrap useEffect to avoid early property access.

// Constants removed (moved to appConfig.js)

// ─────────────────────────────────────────────
// HELPER: имя файла отчёта 
// ─────────────────────────────────────────────
const buildReportFileName = (userName, testFileName) => {
  const safe = (s) => (s || 'noname').replace(/[^a-zA-Zа-яА-ЯёЁ0-9]/g, '_');
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  const randomSuffix = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
  return `${safe(userName)}_${safe(testFileName)}_${dd}-${mm}-${yy}_${randomSuffix}.txt`;
};

const hasCyrillic = (str) => /[а-яё]/i.test(str);

const validateQuizAsset = (asset, maxQuizFileBytes) => {
  const name = asset?.name || 'quiz';
  const ext = name.includes('.') ? name.split('.').pop().toLowerCase() : '';

  if (ext && !['csv', 'txt', 'dat'].includes(ext)) {
    throw new Error(`Файл "${name}" имеет неподдерживаемое расширение.`);
  }

  if (typeof asset?.size === 'number' && asset.size > maxQuizFileBytes) {
    throw new Error(`Файл "${name}" слишком большой. Допустимо до ${Math.round(maxQuizFileBytes / 1024)} KB.`);
  }
};

const validateQuizUrl = (input, allowedHosts) => {
  let parsedUrl;

  try {
    parsedUrl = new URL(input);
  } catch {
    throw new Error('Ссылка имеет некорректный формат.');
  }

  if (parsedUrl.protocol !== 'https:') {
    throw new Error('Разрешены только HTTPS-ссылки.');
  }

  if (allowedHosts.length > 0 && !allowedHosts.includes(parsedUrl.hostname)) {
    throw new Error(`Хост "${parsedUrl.hostname}" не входит в список разрешенных.`);
  }

  return parsedUrl.toString();
};

const makeSafeFileName = (name) => (name || 'quiz').replace(/[^a-zA-Zа-яА-ЯёЁ0-9._-]/g, '_');

const buildDatNameWithTimestamp = (baseName) => {
  return `${makeSafeFileName(baseName)}.dat`;
};

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function App() {
  const insets = useSafeAreaInsets();

  const {
    config, setConfig, localConfig, setLocalConfig,
    remoteConfigSnapshot, configSyncFailed, loadConfig, updateConfig
  } = useConfig(GITHUB_CONFIG);

  const [screen, _setScreen] = useState('welcome');
  const setScreen = (val) => {
    if (val === 'student-library') {
      const now = Date.now();
      const COOLDOWN = 10 * 60 * 1000; // 10 minutes
      if (now - lastSyncTime > COOLDOWN) {
        checkForUpdates();
      }
    }
    _setScreen(val);
  };
  const [userName, setUserName] = useState('');
  const [questions, setQuestions] = useState([]);
  const [fileUrl, setFileUrl] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(0);
  const syncAnim = useRef(new Animated.Value(0)).current;
  const isSyncingRef = useRef(false);
  const [isAppReady, setIsAppReady] = useState(false);
  const syncTimerRef = useRef(null);

  useEffect(() => {
    isSyncingRef.current = isSyncing;
    if (isSyncing) {
      const runSyncAnimation = () => {
        syncAnim.setValue(0);
        Animated.timing(syncAnim, {
          toValue: 1,
          duration: 1500,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }).start(({ finished }) => {
          if (finished && isSyncingRef.current) {
            runSyncAnimation();
          } else if (!isSyncingRef.current) {
            // Плавное возвращение в исходную позицию при окончании
            Animated.spring(syncAnim, {
              toValue: 0,
              useNativeDriver: true,
              friction: 7,
              tension: 40
            }).start();
          }
        });
      };
      runSyncAnimation();
    }
  }, [isSyncing]);

  const spin = syncAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });
  const [results, setResults] = useState([]);
  const [totalTime, setTotalTime] = useState(0);
  const [loading, setLoading] = useState(false);
  const [permanentlyHiddenIds, setPermanentlyHiddenIds] = useState([]);
  const [showHiddenTests, setShowHiddenTests] = useState(false);
  const [actionModalVisible, setActionModalVisible] = useState(false);
  const [actionTargetTest, setActionTargetTest] = useState(null);
  const [activeAuthorId, setActiveAuthorId] = useState('');
  const [librarySearch, setLibrarySearch] = useState('');
  const [studentLibraryFiles, setStudentLibraryFiles] = useState([]);
  const [teacherLibraryFiles, setTeacherLibraryFiles] = useState([]);
  const [studentQuizStatus, setStudentQuizStatus] = useState({});
  const [activeQuizPath, setActiveQuizPath] = useState('');
  const [activeProgressKey, setActiveProgressKey] = useState('');
  const [activeStatusKey, setActiveStatusKey] = useState('');
  const [activeSessionId, setActiveSessionId] = useState('');
  const [editFilePath, setEditFilePath] = useState('');
  const [editFileName, setEditFileName] = useState('');


  const [editContent, setEditContent] = useState('');
  const [editIsNew, setEditIsNew] = useState(false);
  const [resultsReadOnly, setResultsReadOnly] = useState(false);
  const [resultsOrigin, setResultsOrigin] = useState('student');
  const [testFileName, setTestFileName] = useState('quiz');
  const [cloudRegistry, setCloudRegistry] = useState([]); // [ {id, title, qCount, fileName, author} ]
  const [resumeData, setResumeData] = useState(null); // Для передачи в QuizScreen при возобновлении
  const [newTestsCount, setNewTestsCount] = useState(0);
  const [editIsCloud, setEditIsCloud] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [helpType, setHelpType] = useState('student');
  const [teacherProfile, setTeacherProfile] = useState(null);
  const [subscriptions, setSubscriptions] = useState([MASTER_TEACHER]);
  const [newSubUsername, setNewSubUsername] = useState('');
  const [profileInput, setProfileInput] = useState({ owner: '', repo: '', token: '' });

  const checkAppVersion = async () => {
    try {
      const response = await fetch('https://raw.githubusercontent.com/EvgeniyKrasnyanskiy/quiz-app-data/refs/heads/main/package.json');
      if (response.ok) {
        const data = await response.json();
        if (data.version && data.version !== APP_VERSION) {
          Alert.alert(
            'Доступно обновление',
            `Доступна новая версия приложения: ${data.version}. Текущая версия: ${APP_VERSION}.\n\nРекомендуется обновить приложение для стабильной работы.`,
            [
              { text: 'Позже', style: 'cancel' },
              { text: 'Скачать', onPress: () => Linking.openURL('https://github.com/EvgeniyKrasnyanskiy/QuizApp/releases') }
            ]
          );
        }
      }
    } catch (e) {
      console.log('Version check failed:', e.message);
    }
  };

  const handlePublishConfigToCloud = async (configData) => {
    if (!teacherProfile?.token) {
      Alert.alert('Ошибка', 'GitHub Token не установлен в профиле.');
      return false;
    }
    if (teacherProfile.owner !== 'EvgeniyKrasnyanskiy') {
      Alert.alert('Ошибка', 'Только основной администратор может обновлять глобальный конфиг.');
      return false;
    }

    try {
      setLoading(true);
      const fileName = 'quiz-config.json';
      const path = fileName; // В корне репозитория

      // 1. Пытаемся получить существующий файл, чтобы взять его SHA
      let sha = null;
      try {
        const existing = await githubRequest(path);
        if (existing && existing.sha) sha = existing.sha;
      } catch (e) {
        // Файл может не существовать, это нормально для первой загрузки
      }

      // 2. Подготавливаем JSON
      const content = JSON.stringify(configData, null, 2);

      // 3. Отправляем в GitHub (напрямую, так как это текстовый JSON)
      const res = await githubRequest(path, 'PUT', {
        message: `update: remote configuration [app-editor]`,
        content: btoa(unescape(encodeURIComponent(content))),
        sha: sha
      });

      if (res) {
        Alert.alert('Успех', 'Конфигурация успешно опубликована в GitHub и будет доступна всем пользователям после обновления.');
        return true;
      }
    } catch (e) {
      Alert.alert('Ошибка публикации', e.message);
    } finally {
      setLoading(false);
    }
    return false;
  };

  useEffect(() => {
    const bootstrap = async () => {
      try {
        await ensureQuizDirectories();
        await initDemoQuiz();

        // Load configurations
        const cached = await AsyncStorage.getItem(CACHE_KEYS.CONFIG);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
            const merged = { ...DEFAULT_CONFIG, ...sanitizeRemoteConfig(parsed) };
            setConfig(merged);
            setLocalConfig(merged);
          }
        }

        // Load multi-user data
        const subsRaw = await AsyncStorage.getItem(CACHE_KEYS.SUBSCRIPTIONS);
        if (subsRaw) {
          const parsedSubs = JSON.parse(subsRaw);
          // Если Мастер тестов почему-то пропал из списка (хотя он защищен), добавляем его
          if (!parsedSubs.some(s => s.isMaster)) {
            const nextSubs = [MASTER_TEACHER, ...parsedSubs];
            setSubscriptions(nextSubs);
            await AsyncStorage.setItem(CACHE_KEYS.SUBSCRIPTIONS, JSON.stringify(nextSubs));
          } else {
            setSubscriptions(parsedSubs);
          }
        } else {
          // Если данных нет вообще, инициализируем мастером
          setSubscriptions([MASTER_TEACHER]);
        }

        // Проверка загрузки переменных окружения
        if (!GITHUB_CONFIG.TOKEN || !GITHUB_CONFIG.OWNER || !GITHUB_CONFIG.REPO) {
          console.warn('ВНИМАНИЕ: Переменные окружения GitHub не загружены. Проверьте файл .env');
        }

        const studentName = await AsyncStorage.getItem(CACHE_KEYS.STUDENT_NAME);
        if (studentName) {
          setUserName(studentName);
        }

        const hiddenRaw = await AsyncStorage.getItem(CACHE_KEYS.HIDDEN_TESTS);
        if (hiddenRaw) {
          setPermanentlyHiddenIds(JSON.parse(hiddenRaw));
        }

        // Load teacher profile
        const savedProfile = await AsyncStorage.getItem(CACHE_KEYS.TEACHER_PROFILE);
        if (savedProfile) {
          try {
            const profile = JSON.parse(savedProfile);
            if (profile.token) {
              // Decrypt token
              profile.token = decodeEncryptedPayload(profile.token);
            }
            setTeacherProfile(profile);
            setProfileInput({ owner: profile.owner, repo: profile.repo, token: profile.token });
          } catch (profileErr) {
            console.warn('Failed to load teacher profile:', profileErr.message);
          }
        }

        checkAppVersion();
        await refreshStudentLibrary();
        await refreshTeacherLibrary();
        fetchMasterData();
      } catch (e) {
        console.warn('Bootstrap Error:', e.message);
        setConfig(DEFAULT_CONFIG);
        setLocalConfig(DEFAULT_CONFIG);
      } finally {
        loadConfig({ silent: true });
        setIsAppReady(true);
      }
    };
    bootstrap();
  }, []);

  // Синхронизация при изменении профиля учителя (логин)
  useEffect(() => {
    if (isAppReady && teacherProfile && teacherProfile.token) {
      refreshTeacherLibrary();
      checkForUpdates();
    }
  }, [teacherProfile, isAppReady]);

  // Синхронизация при изменении подписок (с дебаунсом)
  useEffect(() => {
    if (!isAppReady) return;
    
    if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    syncTimerRef.current = setTimeout(() => {
      checkForUpdates();
    }, 1500); // 1.5s debounce
    
    return () => {
      if (syncTimerRef.current) clearTimeout(syncTimerRef.current);
    };
  }, [subscriptions, isAppReady]);

  const getActiveTeacherDir = () => {
    const owner = teacherProfile?.owner || 'local';
    return `${QUIZ_DIRS.TEACHER}${owner}/`;
  };

  // ─────────────────────────────────────────────
  // GITHUB CLOUD HELPERS
  // ─────────────────────────────────────────────
  const githubRequest = async (path, method = 'GET', body = null, customCreds = null) => {
    const activeToken = customCreds?.token || teacherProfile?.token || GITHUB_CONFIG.TOKEN;
    const activeOwner = customCreds?.owner || teacherProfile?.owner || GITHUB_CONFIG.OWNER;
    const activeRepo = customCreds?.repo || teacherProfile?.repo || GITHUB_CONFIG.REPO;

    if (method !== 'GET' && (!activeToken || activeToken === 'ВАШ_GITHUB_TOKEN')) {
      throw new Error('GitHub Token не настроен. Для записи/удаления тестов необходим токен в профиле или .env');
    }

    const apiBase = customCreds?.apiBase || `https://api.github.com/repos/${activeOwner}/${activeRepo}/contents`;

    // Кодируем каждый сегмент пути отдельно для поддержки кириллицы
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
    const timeoutId = setTimeout(() => controller.abort(), remoteFetchTimeoutMs);
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
  };

  const fetchCloudRegistry = async () => {
    let merged = [];
    for (const sub of (subscriptions || [])) {
      if (sub.disabled) continue;
      try {
        const creds = {
          owner: sub.owner,
          repo: sub.repo,
          token: sub.token || undefined, // Students usually don't have tokens for others
          isMaster: sub.isMaster
        };
        const data = await githubRequest(GITHUB_CONFIG.REGISTRY_PATH, 'GET', null, creds);
        if (data && data.content) {
          const decoded = atob(data.content.replace(/\n/g, ''));
          const registry = JSON.parse(decoded);
          const authorName = sub.name || sub.owner;

          // Добавляем инфо об авторе к каждому тесту
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
  };

  const syncCloudRegistry = async (action, testMeta) => {
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
  };

  const handlePublishToCloud = async (file) => {
    if (hasCyrillic(file.name)) {
      Alert.alert(
        "Кириллица в названии",
        "Для стабильной работы облака, пожалуйста, переименуйте тест, используя только латинские буквы и цифры (например, 'Math_Test_1').",
        [{ text: "Понятно" }]
      );
      return;
    }

    // Проверка прав (Permission check)
    if (file.authorId && file.authorId !== teacherProfile?.owner) {
      Alert.alert("Доступ запрещен", "Вы не можете изменять чужие тесты");
      return;
    }

    try {
      setLoading(true);
      const testId = stripDatExtension(file.name);
      const fileContent = await FileSystem.readAsStringAsync(file.path, {
        encoding: FileSystem.EncodingType.Base64
      });

      const cloudFilePath = `${GITHUB_CONFIG.CLOUD_TESTS_DIR}/${file.name}`;
      const existingFile = await githubRequest(cloudFilePath);

      await githubRequest(cloudFilePath, 'PUT', {
        message: `Publish test: ${file.name}`,
        content: fileContent,
        sha: existingFile?.sha || undefined
      });

      await syncCloudRegistry('add', {
        id: testId,
        title: file.displayName,
        qCount: file.questionCount || 0,
        fileName: file.name
      });

      Alert.alert('Готово', 'Тест успешно опубликован в облаке ☁️');
    } catch (e) {
      Alert.alert('Ошибка публикации', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnpublishFromCloud = async (file) => {
    Alert.alert('Удалить из облака?', 'Тест перестанет быть доступным для скачивания другими учениками.', [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          try {
            setLoading(true);
            const testId = stripDatExtension(file.name);
            const cloudFilePath = `${GITHUB_CONFIG.CLOUD_TESTS_DIR}/${file.name}`;
            const existingFile = await githubRequest(cloudFilePath);
            if (existingFile) {
              await githubRequest(cloudFilePath, 'DELETE', {
                message: `Delete test: ${file.name}`,
                sha: existingFile.sha
              });
            }
            await syncCloudRegistry('remove', { id: testId });
            // Сразу обновляем реестр для чистоты экрана управления
            const updatedRegistry = await fetchCloudRegistry();
            setCloudRegistry(updatedRegistry);

            Alert.alert('Готово', 'Тест удален из облака.');
          } catch (e) {
            Alert.alert('Ошибка', e.message);
          } finally {
            setLoading(false);
          }
        }
      }
    ]);
  };

  const showToast = (msg) => {
    if (Platform.OS === 'android') {
      ToastAndroid.show(msg, ToastAndroid.SHORT);
    } else {
      Alert.alert('Облако', msg);
    }
  };

  const checkForUpdates = async (isManual = false) => {
    try {
      const registry = await fetchCloudRegistry();
      setCloudRegistry(registry);
      setLastSyncTime(Date.now());

      if (isManual) {
        console.log("Cloud sync started...");
      }

      let downloadedCount = 0;
      for (const item of registry) {
        // Изоляция: папка автора + оригинальное имя
        const authorDir = `${SafeDirs.DOWNLOADS}${item.authorId}/`;
        const localPath = `${authorDir}${item.fileName}`;

        // Убеждаемся, что папка автора существует
        const dirInfo = await FileSystem.getInfoAsync(authorDir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(authorDir, { intermediates: true });
        }

        const exists = await FileSystem.getInfoAsync(localPath);
        if (!exists.exists) {
          try {
            const creds = { owner: item.authorId, repo: item.repo || 'quiz-app-data' };
            const cloudFilePath = `${GITHUB_CONFIG.CLOUD_TESTS_DIR}/${item.fileName}`;
            const cloudFile = await githubRequest(cloudFilePath, 'GET', null, creds);
            if (cloudFile && cloudFile.content) {
              const effectiveSalt = APP_SALT || FALLBACK_APP_SALT;
              const binary = atob(cloudFile.content.replace(/\n/g, ''));
              const decrypted = decodeEncryptedPayload(binary, effectiveSalt);

              const { questions } = parseQuestions(decrypted);
              if (questions && questions.length > 0) {
                // Overwrite local file with correctly decrypted content
                await FileSystem.writeAsStringAsync(localPath, decrypted);
                downloadedCount++;
              } else {
                console.warn(`[MasterSync] File ${item.fileName} is corrupted or decryption failed. Skipping save.`);
              }
            }
          } catch (e) {
            console.warn(`Failed to auto-download ${item.fileName} from ${item.authorId}:`, e.message);
          }
        }
      }

      // Очистка "призраков" в папке загрузок
      try {
        if ((await FileSystem.getInfoAsync(SafeDirs.DOWNLOADS)).exists) {
          const authorFolders = await FileSystem.readDirectoryAsync(SafeDirs.DOWNLOADS);
          for (const authorId of authorFolders) {
            const authorDir = `${SafeDirs.DOWNLOADS}${authorId}/`;
            const files = await FileSystem.readDirectoryAsync(authorDir);

            for (const fileName of files) {
              const isStillInCloud = registry.some(item => item.authorId === authorId && item.fileName === fileName);
              const statusKey = buildQuizStatusKey(fileName, authorId);
              const statusRaw = await AsyncStorage.getItem(statusKey);
              let status = statusRaw ? JSON.parse(statusRaw) : null;

              if (!isStillInCloud) {
                const progressKey = buildQuizProgressKey(fileName, authorId);
                const progressRaw = await AsyncStorage.getItem(progressKey);
                const hasProgress = Boolean(progressRaw);
                const isCompleted = status?.completedAt || (Array.isArray(status?.results) && status?.results.length > 0);

                if (!isCompleted && !hasProgress) {
                  await FileSystem.deleteAsync(authorDir + fileName, { idempotent: true });
                  console.log(`Cleaned up ghost file: ${authorId}/${fileName}`);
                } else {
                  if (!status || !status.isOrphaned) {
                    const currentStatus = status || {};
                    currentStatus.isOrphaned = true;
                    await AsyncStorage.setItem(statusKey, JSON.stringify(currentStatus));
                  }
                }
              } else {
                if (status && status.isOrphaned) {
                  status.isOrphaned = false;
                  await AsyncStorage.setItem(statusKey, JSON.stringify(status));
                }
              }
            }
          }
        }
      } catch (cleanupErr) {
        console.warn('Cleanup failed:', cleanupErr.message);
      }

      await refreshStudentLibrary();

      const masterItemsCount = registry.filter(item => item.isFromMaster).length;
      if (masterItemsCount > 0) {
        console.log(`[MasterSync] Successfully synced ${masterItemsCount} files from Мастер тестов.`);
      }

      if (downloadedCount > 0) {
        console.log(`Downloaded ${downloadedCount} new tests.`);
      }

      // Считаем новые тесты (проверяем все подпапки DOWNLOADS)
      const completedRaw = await AsyncStorage.getItem(CACHE_KEYS.COMPLETED_IDS);
      const completed = completedRaw ? JSON.parse(completedRaw) : [];
      let activeNewCount = 0;

      for (const item of registry) {
        const localPath = `${SafeDirs.DOWNLOADS}${item.authorId}/${item.fileName}`;
        const exists = await FileSystem.getInfoAsync(localPath);
        if (exists.exists && !completed.includes(`${item.authorId}_${item.id}`)) {
          activeNewCount++;
        }
      }
      setNewTestsCount(activeNewCount);
      return downloadedCount;
    } catch (e) {
      console.log("SYNC ERROR DETAILS:", e.message);
      if (e.message.includes("directory") || e.message.includes("folder")) {
        console.log("Possible missing directory:", SafeDirs.DOWNLOADS);
      }
      return null;
    }
  };

  const handleManualSync = async () => {
    setIsSyncing(true);
    const count = await checkForUpdates(true);
    setIsSyncing(false);
    if (count === null) {
      showToast("Ошибка синхронизации. Проверьте интернет");
    } else if (count > 0) {
      showToast(`Загружено ${count} новых тестов`);
    } else {
      showToast("Новых тестов ещё нет");
    }
  };

  const handlePullToRefresh = async () => {
    setIsRefreshing(true);
    const count = await checkForUpdates(true);
    setIsRefreshing(false);
    if (count === null) {
      showToast("Ошибка синхронизации. Проверьте интернет");
    } else if (count > 0) {
      showToast(`Загружено ${count} новых тестов`);
    } else {
      showToast("Новых тестов ещё нет");
    }
  };



  const handleOpenCloudFileEditor = async (cloudItem) => {
    try {
      setLoading(true);
      const cloudFilePath = `${GITHUB_CONFIG.CLOUD_TESTS_DIR}/${cloudItem.fileName}`;
      const cloudFile = await githubRequest(cloudFilePath);
      if (cloudFile && cloudFile.content) {
        // Декодируем из base64
        const binary = atob(cloudFile.content.replace(/\n/g, ''));
        const decrypted = decodeEncryptedPayload(binary);
        setEditContent(decrypted);
        setEditFileName(cloudItem.fileName);
        setEditIsNew(false);
        setEditIsCloud(true);
        setScreen('edit-quiz');
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось загрузить файл из облака: ' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveProfile = async () => {
    const { owner, repo, token } = profileInput;
    if (!owner || !repo || !token) {
      Alert.alert('Ошибка', 'Все поля должны быть заполнены.');
      return;
    }
    try {
      setLoading(true);
      // Проверка соединения
      const creds = { owner, repo, token };
      const res = await githubRequest('', 'GET', null, creds);
      if (res) {
        const profile = { owner, repo, token };
        setTeacherProfile(profile);

        // Encrypt and save profile
        const profileToSave = { ...profile };
        profileToSave.token = encodeEncryptedPayload(token);
        await AsyncStorage.setItem(CACHE_KEYS.TEACHER_PROFILE, JSON.stringify(profileToSave));

        Alert.alert('Успех', 'Профиль учителя успешно настроен и проверен.');
        setScreen('teacher');
      }
    } catch (e) {
      Alert.alert('Ошибка проверки', 'Не удалось подключиться к репозиторию. Проверьте данные и токен.\n' + e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubscription = async () => {
    const username = newSubUsername.trim();
    if (!username) return;

    if (subscriptions.some(s => s.owner.toLowerCase() === username.toLowerCase())) {
      Alert.alert('Внимание', 'Вы уже подписаны на этого учителя.');
      return;
    }

    try {
      setLoading(true);
      const creds = { owner: username, repo: 'quiz-app-data' }; // Default repo name as discussed
      // Checking if registry exists to verify
      const res = await githubRequest(GITHUB_CONFIG.REGISTRY_PATH, 'GET', null, creds);

      if (res) {
        const newSub = {
          id: username,
          name: username,
          owner: username,
          repo: 'quiz-app-data',
          isMaster: false,
          disabled: false
        };
        const nextSubs = [...subscriptions, newSub];
        setSubscriptions(nextSubs);
        await AsyncStorage.setItem(CACHE_KEYS.SUBSCRIPTIONS, JSON.stringify(nextSubs));
        setNewSubUsername('');
        Alert.alert('Успех', `Вы подписались на ${username}. Тесты скоро появятся в списке.`);
        checkForUpdates();
      }
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось найти репозиторий "quiz-app-data" у этого пользователя или он недоступен.');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveSubscription = (sub) => {
    if (sub.isMaster) {
      Alert.alert('Мастер тестов', 'Вы не можете полностью удалить Мастера тестов, но можете отключить его подписку.');
      return;
    }
    Alert.alert(
      'Удалить подписку?',
      `Вы отпишетесь от ${sub.name}. Весь прогресс будет скрыт (но не удален).`,
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить',
          style: 'destructive',
          onPress: async () => {
            const nextSubs = subscriptions.filter(s => s.owner !== sub.owner);
            setSubscriptions(nextSubs);
            await AsyncStorage.setItem(CACHE_KEYS.SUBSCRIPTIONS, JSON.stringify(nextSubs));
            checkForUpdates();
          }
        }
      ]
    );
  };

  const handleToggleSubscription = async (sub) => {
    const nextSubs = subscriptions.map(s =>
      s.owner === sub.owner ? { ...s, disabled: !s.disabled } : s
    );
    setSubscriptions(nextSubs);
    await AsyncStorage.setItem(CACHE_KEYS.SUBSCRIPTIONS, JSON.stringify(nextSubs));
    checkForUpdates();
  };

  const handleRestoreMaster = async () => {
    const nextSubs = subscriptions.map(s =>
      s.isMaster ? { ...s, disabled: false } : s
    );
    if (!nextSubs.some(s => s.isMaster)) {
      nextSubs.push(MASTER_TEACHER);
    }
    setSubscriptions(nextSubs);
    await AsyncStorage.setItem(CACHE_KEYS.SUBSCRIPTIONS, JSON.stringify(nextSubs));
    checkForUpdates();
    Alert.alert('Успех', 'Подписка на Мастера тестов восстановлена.');
  };

  // ── Определение режима учителя ──
  const handleNameChange = async (text) => {
    setUserName(text);
    if (!text) return;

    // Авторизация учителя через AuthService
    const result = await AuthService.login(text, config.adminCode);
    if (result.success) {
      refreshTeacherLibrary().finally(() => setScreen('teacher'));
      // Не очищаем userName здесь, так как он может понадобиться студенту, 
      // а учитель переходит на другой экран. 
      // Но если это был код входа, то лучше очистить, чтобы не светить его.
      setUserName('');
    } else {
      // Если это не код входа, сохраняем как имя студента
      await AsyncStorage.setItem(CACHE_KEYS.STUDENT_NAME, text);
    }
  };

  const handleContinueStudent = async () => {
    if (!userName.trim()) return;
    try {
      const files = await refreshStudentLibrary();
      if (files.length > 0) {
        setScreen('student-library');
      } else {
        setScreen('loading');
      }
    } catch {
      setScreen('loading');
    }
  };

  const handleBackFromPrestart = async () => {
    const files = await refreshStudentLibrary();
    if (files.length > 0) {
      setScreen('student-library');
      return;
    }
    setScreen('loading');
  };



  const handleExitApp = () => {
    Alert.alert(
      "Выход",
      "Вы действительно хотите закрыть приложение?",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Выйти", onPress: () => {
            if (Platform.OS === 'android') {
              const { BackHandler } = require('react-native');
              BackHandler.exitApp();
            } else {
              setScreen('welcome');
            }
          }
        }
      ]
    );
  };

  const renderConfigSection = (title, configData) => {
    if (!configData) return null;
    const sortedKeys = Object.keys(configData).sort();

    return (
      <Card style={{ padding: 12, backgroundColor: 'rgba(255,255,255,0.03)', marginBottom: 12, borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)' }}>
        <Text style={{ fontSize: 11, fontWeight: '800', color: C.accent, marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>{title}</Text>
        {sortedKeys.map(key => (
          <Text key={key} style={{ fontSize: 10, color: C.textSecondary, marginBottom: 2 }}>
            {key}: <Text style={{ color: C.textPrimary, fontWeight: '500' }}>{JSON.stringify(configData[key])}</Text>
          </Text>
        ))}
      </Card>
    );
  };

  const safeStyle = {
    flex: 1,
    backgroundColor: C.bg,
  };

  const allowedQuizHosts = Array.isArray(config.allowedQuizHosts) && config.allowedQuizHosts.length > 0
    ? config.allowedQuizHosts
    : DEFAULT_CONFIG.allowedQuizHosts;
  const maxQuizFileBytes = Number.isInteger(config.maxQuizFileBytes) && config.maxQuizFileBytes > 0
    ? config.maxQuizFileBytes
    : DEFAULT_CONFIG.maxQuizFileBytes;
  const remoteFetchTimeoutMs = Number.isInteger(config.remoteFetchTimeoutMs) && config.remoteFetchTimeoutMs > 0
    ? config.remoteFetchTimeoutMs
    : DEFAULT_CONFIG.remoteFetchTimeoutMs;
  const reportEmail = typeof config.reportEmail === 'string' ? config.reportEmail.trim() : '';

  const ensureQuizDirectories = async () => {
    try {
      for (const key in QUIZ_DIRS) {
        const dir = QUIZ_DIRS[key];
        const info = await FileSystem.getInfoAsync(dir);
        if (!info.exists) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
      }
      const tDir = getActiveTeacherDir();
      const tInfo = await FileSystem.getInfoAsync(tDir);
      if (!tInfo.exists) await FileSystem.makeDirectoryAsync(tDir, { intermediates: true });
    } catch (e) {
      console.warn('Failed to ensure directories:', e.message);
    }
  };

  const initDemoQuiz = async () => {
    try {
      const demoFileName = 'System_Welcome_Demo.dat';
      const demoPath = SafeDirs.STUDENT + demoFileName;
      const exists = await FileSystem.getInfoAsync(demoPath);

      if (!exists.exists) {
        const content = [
          'METADATA=title:Обучающий тест;author:System',
          'M;Чтобы начать обучение, нажмите кнопку "Запустить" справа. Что нужно сделать?;Нажать "Запустить";Нажать "Выход";Ничего не делать;Удалить приложение;1',
          'M;Если вы выйдете из теста, прогресс сохранится автоматически. Это удобно?;Да, очень!;Нет;Не уверен;Мне все равно;1',
          'T;Для текстовых ответов используйте поле ввода. Введите слово "СТАРТ" для продолжения;Введите слово СТАРТ;СТАРТ;СТАРТ',
          'M;После этого теста вы сможете скачивать задания других учителей. Готовы?;Да, готов!;Нет, хочу еще учиться;Может быть;Я передумал;1'
        ].join('\n');

        const encrypted = encodeEncryptedPayload(content);
        await FileSystem.writeAsStringAsync(demoPath, encrypted, {
          encoding: FileSystem.EncodingType.UTF8
        });
        await refreshStudentLibrary();
      }
    } catch (e) {
      // Silent fail
    }
  };

  const fetchMasterData = async () => {
    try {
      // 1. Загружаем registry.json (публично)
      const baseUrl = 'https://raw.githubusercontent.com/EvgeniyKrasnyanskiy/quiz-app-data/refs/heads/main';
      const registryUrl = `${baseUrl}/registry.json`;

      console.log("[MasterSync] Fetching registry:", registryUrl);
      const regResponse = await fetch(registryUrl);
      if (!regResponse.ok) throw new Error(`Registry HTTP ${regResponse.status}`);

      const registry = await regResponse.json();
      const tests = registry.tests || [];

      // 2. Обработка автора из реестра для подписок + Дедупликация
      const authorName = registry.author || registry.username || 'Мастер тестов';
      const masterOwner = 'EvgeniyKrasnyanskiy';
      const subId = `master-public-${registry.id || 'reg'}`;

      setSubscriptions(prev => {
        const base = (prev || []).filter(s => s && (s.owner || s.username || s.name));

        const nextSubs = [...base, {
          id: subId,
          name: authorName,
          owner: masterOwner,
          repo: 'quiz-app-data',
          isMaster: true
        }];

        // Строгая дедупликация по owner (уникальный ключ для GitHub-источников)
        const uniqueMap = new Map();
        nextSubs.forEach(s => {
          if (s && (s.owner || s.username)) {
            const key = (s.owner || s.username).toLowerCase();
            uniqueMap.set(key, s);
          }
        });

        return Array.from(uniqueMap.values());
      });

      let successCount = 0;
      for (const test of tests) {
        try {
          const fileName = test.file || `${test.id}.dat`;
          const fileUrl = `${baseUrl}/tests/${fileName}`;

          console.log(`[MasterSync] Syncing: ${fileName}`);
          const fileRes = await fetch(fileUrl);
          if (!fileRes.ok) continue;

          const rawContent = await fileRes.text();
          const effectiveSalt = APP_SALT || FALLBACK_APP_SALT;

          const decrypted = decodeEncryptedPayload(rawContent, effectiveSalt);

          const { questions } = parseQuestions(decrypted);

          if (questions && questions.length > 0) {
            const savePath = SafeDirs.STUDENT + fileName;
            // Overwrite local file with correctly decrypted content
            await FileSystem.writeAsStringAsync(savePath, decrypted);
            successCount++;
          } else {
            console.warn(`[MasterSync] File ${fileName} is corrupted or decryption failed. Skipping save.`);
          }
        } catch (fileErr) {
          console.log(`[MasterSync] Error ${test?.id || 'unknown'}:`, fileErr.message);
        }
      }

      await refreshStudentLibrary();
      console.log(`[MasterSync] Successfully synced ${successCount} files.`);
    } catch (e) {
      console.log("[MasterSync] Registry sync skipped:", e.message);
    }
  };

  const recordTestCompletion = async (testName, authorId = '') => {
    try {
      const prefix = authorId ? `${authorId}_` : '';
      const key = (prefix + stripDatExtension(testName)).toLowerCase();
      console.log(`[Cooldown] Recording completion for key: ${key}`);
      let trackingData = {};
      const info = await FileSystem.getInfoAsync(SafeFiles.TRACKING_FILE);
      if (info.exists) {
        const content = await FileSystem.readAsStringAsync(SafeFiles.TRACKING_FILE);
        trackingData = JSON.parse(content);
      }
      trackingData[key] = new Date().toISOString();
      await FileSystem.writeAsStringAsync(SafeFiles.TRACKING_FILE, JSON.stringify(trackingData));
    } catch (e) {
      console.error("Tracking error:", e);
    }
  };

  const getTestCooldown = async (testName, authorId = '') => {
    if (authorId === 'System') return false;
    try {
      const prefix = authorId ? `${authorId}_` : '';
      const key = (prefix + stripDatExtension(testName)).toLowerCase();
      const info = await FileSystem.getInfoAsync(SafeFiles.TRACKING_FILE);
      if (!info.exists) return false;

      const content = await FileSystem.readAsStringAsync(SafeFiles.TRACKING_FILE);
      const trackingData = JSON.parse(content);
      const lastCompletion = trackingData[key];
      if (!lastCompletion) return false;

      const now = new Date().getTime();
      const diff = now - new Date(lastCompletion).getTime();
      const cooldownMs = Number(config.TEST_COOLDOWN_MS || DEFAULT_CONFIG.TEST_COOLDOWN_MS) || 3600000;

      const isLocked = diff < cooldownMs;
      console.log(`[Cooldown] Check ${key}: diff=${Math.round(diff / 1000)}s, cooldown=${Math.round(cooldownMs / 1000)}s, locked=${isLocked}`);

      return isLocked ? lastCompletion : false;
    } catch (e) {
      console.error("[Cooldown] Error:", e);
      return false;
    }
  };

  const formatUnlockTime = (completionIso) => {
    if (!completionIso) return '';
    const now = new Date().getTime();
    const cooldownMs = Number(config.TEST_COOLDOWN_MS || DEFAULT_CONFIG.TEST_COOLDOWN_MS) || 3600000;
    const unlockTime = new Date(completionIso).getTime() + cooldownMs;
    const diff = unlockTime - now;

    if (diff <= 0) return '';

    const diffMin = Math.ceil(diff / 60000);

    // Если блокировка больше суток, показываем дату
    if (diff > 24 * 60 * 60 * 1000) {
      return formatNiceDate(new Date(unlockTime));
    }

    if (diffMin < 60) {
      return `через ${diffMin} мин`;
    }

    const h = Math.floor(diffMin / 60);
    const m = diffMin % 60;

    if (m === 0) {
      return `через ${h} ч.`;
    }

    return `через ${h} ч. ${m} мин.`;
  };

  const listDatFiles = async (folderPath, options = {}) => {
    const { isStudent = false, authorId: forcedAuthorId = null } = options;
    await ensureQuizDirectories();

    // Рекурсивный поиск в SafeDirs.DOWNLOADS, если это путь к корню загрузок
    if (folderPath === SafeDirs.DOWNLOADS) {
      let allRecords = [];
      const authorFolders = await FileSystem.readDirectoryAsync(SafeDirs.DOWNLOADS);
      for (const author of authorFolders) {
        const subRecords = await listDatFiles(`${SafeDirs.DOWNLOADS}${author}/`, { isStudent, authorId: author });
        allRecords = [...allRecords, ...subRecords];
      }
      return allRecords;
    }

    const fileNames = await FileSystem.readDirectoryAsync(folderPath);
    const datNames = fileNames.filter(name => name.toLowerCase().endsWith('.dat'));
    const records = await Promise.all(datNames.map(async (name) => {
      const fullPath = `${folderPath}${name}`;
      const info = await FileSystem.getInfoAsync(fullPath);
      let questionCount = 0;
      let authorId = forcedAuthorId;
      let displayName = name;

      if (isStudent && !authorId) {
        // Системный префикс
        if (name.startsWith('System_')) {
          authorId = 'System';
          displayName = stripDatExtension(name).replace('System_', '').replace(/_/g, ' ');
        } else if (name.includes('_')) {
          // Старая логика префиксов для файлов в STUDENT_QUIZZES_DIR
          const parts = name.split('_');
          authorId = parts[0];
          displayName = stripDatExtension(parts.slice(1).join('_'));
        }
      }

      let metaDate = null;
      try {
        const encrypted = await FileSystem.readAsStringAsync(fullPath, { encoding: FileSystem.EncodingType.UTF8 });
        const decrypted = decodeEncryptedPayload(encrypted);
        const { questions, metadata } = parseQuestions(decrypted);
        questionCount = questions ? questions.length : 0;

        // Если в метаданных есть заголовок, используем его
        if (metadata && metadata.title) {
          displayName = metadata.title;
        } else {
          displayName = stripDatExtension(displayName);
        }
        
        if (metadata && metadata.createdat) {
          metaDate = metadata.createdat;
        }
      } catch (e) {
        displayName = stripDatExtension(displayName);
        // Silent fail for parsing individual file meta
      }

      return {
        name,
        displayName,
        authorId,
        path: fullPath,
        size: typeof info.size === 'number' ? info.size : 0,
        mtime: typeof info.modificationTime === 'number' ? info.modificationTime : 0,
        createdAt: metaDate,
        questionCount,
        canEdit: authorId === teacherProfile?.owner || folderPath === getActiveTeacherDir(),
      };
    }));
    return records.sort((a, b) => b.mtime - a.mtime);
  };

  const handleHideTest = async (testId) => {
    if (!permanentlyHiddenIds.includes(testId)) {
      const nextHidden = [...permanentlyHiddenIds, testId];
      setPermanentlyHiddenIds(nextHidden);
      await AsyncStorage.setItem(CACHE_KEYS.HIDDEN_TESTS, JSON.stringify(nextHidden));
    }
    setActionModalVisible(false);
    refreshStudentLibrary();
  };

  const handleRestoreTest = async (testId) => {
    const nextHidden = permanentlyHiddenIds.filter(id => id !== testId);
    setPermanentlyHiddenIds(nextHidden);
    await AsyncStorage.setItem(CACHE_KEYS.HIDDEN_TESTS, JSON.stringify(nextHidden));
    setActionModalVisible(false);
    refreshStudentLibrary();
  };

  const handleHideCompletedTests = async () => {
    const idsToHide = [];
    studentLibraryFiles.forEach(item => {
      const status = studentQuizStatus[item.path] || {};
      const isCompleted = !!(status.completedAt || (Array.isArray(status.results) && status.results.length > 0));
      if (isCompleted) {
        const testId = item.authorId ? `${item.authorId}_${stripDatExtension(item.displayName)}` : stripDatExtension(item.displayName);
        if (!permanentlyHiddenIds.includes(testId)) {
          idsToHide.push(testId);
        }
      }
    });

    if (idsToHide.length === 0) {
      Alert.alert("Инфо", "Нет завершенных тестов для скрытия.");
      return;
    }

    Alert.alert(
      "Скрыть пройденные",
      `Вы действительно хотите скрыть все завершенные тесты (${idsToHide.length})? Их можно будет вернуть через кнопку глаза в заголовке.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Скрыть",
          onPress: async () => {
            const nextHidden = [...permanentlyHiddenIds, ...idsToHide];
            setPermanentlyHiddenIds(nextHidden);
            await AsyncStorage.setItem(CACHE_KEYS.HIDDEN_TESTS, JSON.stringify(nextHidden));
            showToast(`Скрыто: ${idsToHide.length}`);
            refreshStudentLibrary();
          }
        }
      ]
    );
  };

  const handleDeleteTestPermanently = async (path, statusKey, testId) => {
    Alert.alert(
      "Удаление навсегда",
      "Это действие удалит файл теста и всю историю его прохождений. Продолжить?",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Удалить всё",
          style: "destructive",
          onPress: async () => {
            await FileSystem.deleteAsync(path, { idempotent: true });
            if (statusKey) {
              await AsyncStorage.removeItem(statusKey);
            }
            const nextHidden = permanentlyHiddenIds.filter(id => id !== testId);
            if (nextHidden.length !== permanentlyHiddenIds.length) {
              setPermanentlyHiddenIds(nextHidden);
              await AsyncStorage.setItem(CACHE_KEYS.HIDDEN_TESTS, JSON.stringify(nextHidden));
            }
            setActionModalVisible(false);
            refreshStudentLibrary();
          }
        }
      ]
    );
  };

  const refreshStudentLibrary = async () => {
    // Собираем из двух источников: локальная папка студента и папка загрузок
    const studentFiles = await listDatFiles(SafeDirs.STUDENT, { isStudent: true });
    const downloadedFiles = await listDatFiles(SafeDirs.DOWNLOADS, { isStudent: true });
    const files = [...studentFiles, ...downloadedFiles];

    // Загружаем список просмотренных тестов
    const seenRaw = await AsyncStorage.getItem(CACHE_KEYS.SEEN_TESTS);
    const seen = seenRaw ? JSON.parse(seenRaw) : [];

    // Получаем статусы для всех файлов перед сортировкой
    const fileDataEntries = await Promise.all(files.map(async (file) => {
      const statusKey = buildQuizStatusKey(file.displayName, file.authorId);
      const progressKey = buildQuizProgressKey(file.displayName, file.authorId);
      const testId = file.authorId ? `${file.authorId}_${stripDatExtension(file.displayName)}` : stripDatExtension(file.displayName);

      const statusRaw = await AsyncStorage.getItem(statusKey);
      const progressRaw = await AsyncStorage.getItem(progressKey);
      const isLocked = await getTestCooldown(stripDatExtension(file.displayName), file.authorId);

      let status = null;
      if (statusRaw) {
        try { status = JSON.parse(statusRaw); } catch { status = null; }
      }

      const isSeen = seen.includes(testId);
      const results = status?.results || [];
      const score = results.filter(r => r.correct).length;
      const isCompleted = !!(status?.completedAt || results.length > 0);

      let hasActualProgress = false;
      if (progressRaw) {
        try {
          const p = JSON.parse(progressRaw);
          hasActualProgress = Array.isArray(p.results) && p.results.some(r => r !== null);
        } catch {
          hasActualProgress = false;
        }
      }

      const statusObj = {
        ...(status || {}),
        hasProgress: hasActualProgress,
        isLocked,
        authorId: file.authorId,
        canEdit: file.canEdit,
        score,
        isCompleted,
        isSeen
      };

      return { file, status: statusObj, testId };
    }));

    // Умная сортировка
    const sortedData = fileDataEntries.sort((a, b) => {
      // Приоритет 1: Новые/непросмотренные (isSeen === false)
      if (!a.status.isSeen && b.status.isSeen) return -1;
      if (a.status.isSeen && !b.status.isSeen) return 1;

      // Приоритет 2: Непройденные или с нулевым результатом
      const needsCompletionA = !a.status.isCompleted || a.status.score === 0;
      const needsCompletionB = !b.status.isCompleted || b.status.score === 0;

      if (needsCompletionA && !needsCompletionB) return -1;
      if (!needsCompletionA && needsCompletionB) return 1;

      // Приоритет 3: По времени (новые сверху)
      return b.file.mtime - a.file.mtime;
    });

    const allFiles = sortedData.map(d => d.file);
    const statusMap = Object.fromEntries(sortedData.map(d => [d.file.path, d.status]));

    setStudentLibraryFiles(allFiles);
    setStudentQuizStatus(statusMap);
    return allFiles;
  };

  const refreshTeacherLibrary = async () => {
    const teacherDir = getActiveTeacherDir();
    const teacherDirInfo = await FileSystem.getInfoAsync(teacherDir);
    if (!teacherDirInfo.exists) {
      await FileSystem.makeDirectoryAsync(teacherDir, { intermediates: true });
    }
    const ownFiles = await listDatFiles(teacherDir);
    const downloadedFiles = await listDatFiles(SafeDirs.DOWNLOADS);

    const combined = [...ownFiles, ...downloadedFiles];

    // Deduplicate and filter 0-size files
    const uniqueFiles = [];
    const seenPaths = new Set();

    for (const file of combined) {
      if (file.size <= 0) continue;
      if (!seenPaths.has(file.path)) {
        seenPaths.add(file.path);
        uniqueFiles.push(file);
      }
    }

    const allFiles = uniqueFiles.sort((a, b) => b.mtime - a.mtime);
    setTeacherLibraryFiles(allFiles);
    return allFiles;
  };

  const saveDatToLibrary = async (folderPath, fileName, content) => {
    await ensureQuizDirectories();
    const targetName = fileName.toLowerCase().endsWith('.dat') ? fileName : `${fileName}.dat`;
    const normalizedName = makeSafeFileName(targetName);
    const targetPath = `${folderPath}${normalizedName}`;
    await FileSystem.writeAsStringAsync(targetPath, content, { encoding: FileSystem.EncodingType.UTF8 });
    return { path: targetPath, name: normalizedName };
  };

  const saveStudentDat = async (baseName, content) => {
    await ensureQuizDirectories();
    const normalizedName = `${makeSafeFileName(baseName)}.dat`;
    const targetPath = SafeDirs.STUDENT + normalizedName;
    const existing = await FileSystem.getInfoAsync(targetPath);
    await FileSystem.writeAsStringAsync(targetPath, content, { encoding: FileSystem.EncodingType.UTF8 });
    return { path: targetPath, name: normalizedName, overwritten: existing.exists };
  };

  const loadQuizFromDatFile = async (path, name, authorId = '', options = {}) => {
    const { navigateToQuiz = true } = options;
    const encrypted = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
    const decrypted = decodeEncryptedPayload(encrypted);
    const { questions } = parseQuestions(decrypted);
    const parsed = questions;
    if (!parsed || parsed.length === 0) {
      throw new Error('Файл не содержит корректных вопросов.');
    }
    const baseName = stripDatExtension(name || 'quiz');
    if (navigateToQuiz) {
      _startQuiz(parsed, baseName, path, authorId);
    }
    return { questions: parsed };
  };

  const handleEncryptAndSave = async () => {
    try {
      setLoading(true);
      const result = await DocumentPicker.getDocumentAsync({
        type: ['text/csv', 'text/plain', '*/*'],
      });
      if (result.canceled) return;

      const asset = result.assets[0];
      const name = asset.name || 'quiz';
      const ext = name.split('.').pop().toLowerCase();
      validateQuizAsset(asset, maxQuizFileBytes);

      if (!['csv', 'txt', 'dat'].includes(ext)) {
        Alert.alert(
          'Неподдерживаемый формат',
          `Файл "${name}" не является CSV, TXT или DAT.\nВыберите файл с подходящим расширением.`,
        );
        return;
      }

      if (ext === 'dat') {
        const encrypted = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const stampedName = makeSafeFileName(name);
        await saveDatToLibrary(getActiveTeacherDir(), stampedName, encrypted);
        await refreshTeacherLibrary();
        Alert.alert('Готово', `Файл .dat импортирован в библиотеку: ${stampedName}`);
      } else {
        const sourceText = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
        const encrypted = encodeEncryptedPayload(sourceText);
        const baseName = name.replace(/\.[^.]+$/, '');
        const stampedName = `${makeSafeFileName(baseName)}.dat`;
        await saveDatToLibrary(getActiveTeacherDir(), stampedName, encrypted);
        await refreshTeacherLibrary();
        Alert.alert('Готово', `Файл зашифрован и сохранен: ${stampedName}`);
      }
      setScreen('teacher-library');
    } catch (e) {
      Alert.alert('Ошибка', e.message || 'Не удалось зашифровать файл.');
    } finally {
      setLoading(false);
    }
  };

  const handleLoadByUrl = async () => {
    if (!fileUrl.trim()) {
      Alert.alert('Ошибка', 'Введите ссылку на файл');
      return;
    }
    setLoading(true);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), remoteFetchTimeoutMs);
    try {
      const resolvedUrl = validateQuizUrl(fileUrl.trim(), allowedQuizHosts);
      const response = await fetch(resolvedUrl, { signal: controller.signal });
      if (!response.ok) throw new Error(`Ошибка сети: ${response.status}`);

      const contentLengthHeader = response.headers.get('content-length');
      const contentType = response.headers.get('content-type') || '';
      const declaredSize = contentLengthHeader ? Number.parseInt(contentLengthHeader, 10) : null;

      if (Number.isInteger(declaredSize) && declaredSize > maxQuizFileBytes) {
        throw new Error(`Файл слишком большой. Допустимо до ${Math.round(maxQuizFileBytes / 1024)} KB.`);
      }

      if (contentType && !DEFAULT_ALLOWED_CONTENT_TYPES.some(type => contentType.includes(type))) {
        throw new Error(`Неподдерживаемый content-type: ${contentType}`);
      }

      const encryptedData = await response.text();
      if (encryptedData.length > maxQuizFileBytes) {
        throw new Error(`Файл слишком большой. Допустимо до ${Math.round(maxQuizFileBytes / 1024)} KB.`);
      }
      const decryptedCSV = decodeEncryptedPayload(encryptedData);
      const { questions: parsedQuestions } = parseQuestions(decryptedCSV);

      if (!parsedQuestions || parsedQuestions.length === 0) {
        throw new Error('Файл не содержит корректных вопросов');
      }

      const urlSegments = fileUrl.trim().split('/');
      const rawName = urlSegments[urlSegments.length - 1]
        .split('?')[0]
        .replace(/\.dat$/i, '') || 'quiz';
      const stored = await saveStudentDat(rawName, encryptedData);
      await refreshStudentLibrary();
      if (stored.overwritten) {
        Alert.alert('Файл обновлен', `Тест "${stored.name}" уже существовал и был перезаписан.`);
      }

      setFileUrl('');
      _startQuiz(parsedQuestions, stripDatExtension(stored.name), stored.path);
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'Request timed out. Please check your internet connection.' : (e.message || '');
      Alert.alert(
        'Ошибка загрузки',
        'Не удалось загрузить или обработать тест.\n\n' + msg,
      );
    } finally {
      clearTimeout(timeoutId);
      setLoading(false);
    }
  };

  const handleLoadDat = async () => {
    try {
      setLoading(true);
      const result = await DocumentPicker.getDocumentAsync({ type: ['*/*'] });
      if (result.canceled) return;

      const asset = result.assets[0];
      const name = asset.name || '';
      validateQuizAsset(asset, maxQuizFileBytes);

      let encrypted;
      try {
        encrypted = await FileSystem.readAsStringAsync(asset.uri, {
          encoding: FileSystem.EncodingType.UTF8,
        });
      } catch {
        throw new Error(`Не удалось прочитать файл "${name}".\nВозможно, файл повреждён или неверный формат.`);
      }

      const decrypted = decodeEncryptedPayload(encrypted);
      const { questions } = parseQuestions(decrypted);
      const parsed = questions;

      if (!parsed || parsed.length === 0) {
        throw new Error(
          'Файл не содержит корректных вопросов.\n' +
          'Убедитесь, что выбран файл .dat с зашифрованным тестом.',
        );
      }

      const baseName = name.replace(/\.[^.]+$/, '') || 'quiz';
      const encryptedToStore = encodeEncryptedPayload(decrypted);
      const stored = await saveStudentDat(baseName, encryptedToStore);
      await refreshStudentLibrary();
      if (stored.overwritten) {
        Alert.alert('Файл обновлен', `Тест "${stored.name}" уже существовал и был перезаписан.`);
      }
      _startQuiz(parsed, stripDatExtension(stored.name), stored.path);
    } catch (e) {
      Alert.alert('Ошибка чтения файла', e.message || 'Неизвестная ошибка.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewStudentResults = async (file) => {
    try {
      setLoading(true);
      const statusKey = buildQuizStatusKey(file.displayName, file.authorId);
      const key = buildQuizProgressKey(file.displayName, file.authorId);
      const statusRaw = await AsyncStorage.getItem(statusKey);
      const status = statusRaw ? JSON.parse(statusRaw) : null;
      const saved = await AsyncStorage.getItem(key);

      if ((status?.completedAt || (Array.isArray(status?.results) && status?.results.length > 0)) && !saved) {
        setQuestions(status.questions || []);
        setTotalTime(status.totalTime || status.secondsElapsed || 0);
        setTestFileName(status.testFileName || stripDatExtension(file.displayName));
        setActiveAuthorId(file.authorId);
        setActiveStatusKey(statusKey);
        setResultsReadOnly(true);
        setResults(status.results || []);
        setActiveSessionId(Date.now().toString());
        setResultsOrigin('student');
        setScreen('results');
      } else {
        Alert.alert("Ошибка", "Архивные результаты не найдены.");
      }
    } catch (e) {
      Alert.alert('Ошибка', e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenStudentQuiz = async (file) => {
    const fileName = stripDatExtension(file.displayName);
    const locked = await getTestCooldown(fileName, file.authorId);
    if (locked) {
      Alert.alert("Тест временно заблокирован", `Повторная попытка будет доступна ${formatUnlockTime(locked)}.`);
      return;
    }

    try {
      setLoading(true);
      const statusKey = buildQuizStatusKey(file.displayName, file.authorId);
      const key = buildQuizProgressKey(file.displayName, file.authorId);
      const saved = await AsyncStorage.getItem(key);


      if (saved) {
        Alert.alert(
          'Найден сохраненный прогресс',
          `Продолжить тест "${file.displayName}" с сохраненного места?`,
          [
            {
              text: 'Сначала',
              onPress: async () => {
                try {
                  setLoading(true);
                  await AsyncStorage.removeItem(key);
                  await loadQuizFromDatFile(file.path, file.displayName, file.authorId);
                } catch (e) {
                  Alert.alert('Ошибка', e.message);
                } finally {
                  setLoading(false);
                }
              },
            },
            {
              text: 'Продолжить',
              onPress: async () => {
                try {
                  setLoading(true);
                  // Questions are NOT stored in progress payload anymore — reload from .dat file
                  const { questions: loadedQuestions } = await loadQuizFromDatFile(
                    file.path, file.displayName, file.authorId, { navigateToQuiz: false }
                  );
                  const payload = JSON.parse(saved);
                  setQuestions(loadedQuestions || []);
                  setResumeData(payload);
                  setTestFileName(payload.testFileName || stripDatExtension(file.displayName));
                  setActiveAuthorId(file.authorId);
                  setActiveQuizPath(file.path);
                  setActiveProgressKey(key);
                  setActiveStatusKey(statusKey);
                  setResultsReadOnly(false);
                  setResults([]);
                  setActiveSessionId(Date.now().toString());
                  setResultsOrigin('student');
                  setScreen('quiz');
                } catch (e) {
                  Alert.alert('Ошибка', 'Не удалось загрузить тест: ' + e.message);
                } finally {
                  setLoading(false);
                }
              },
            },
            { text: 'Отмена', style: 'cancel' },
          ],
        );
      } else {
        const statusRaw = await AsyncStorage.getItem(statusKey);
        const status = statusRaw ? JSON.parse(statusRaw) : null;

        if (status?.completedAt) {
          // Отмечаем как просмотренный при открытии
          const seenRaw = await AsyncStorage.getItem(CACHE_KEYS.SEEN_TESTS);
          const seen = seenRaw ? JSON.parse(seenRaw) : [];
          const testId = `${file.authorId}_${stripDatExtension(file.displayName)}`;
          if (!seen.includes(testId)) {
            const nextSeen = [...seen, testId];
            await AsyncStorage.setItem(CACHE_KEYS.SEEN_TESTS, JSON.stringify(nextSeen));
            setNewTestsCount(prev => Math.max(0, prev - 1));
          }

          Alert.alert(
            'Повторное прохождение',
            'Этот тест уже был пройден. Вы можете просмотреть прошлый результат или начать заново (старый результат будет удален).',
            [
              { text: 'Отмена', style: 'cancel' },
              {
                text: 'Результат',
                onPress: () => handleViewStudentResults(file)
              },
              {
                text: 'Начать заново',
                onPress: () => {
                  Alert.alert(
                    'Вы уверены?',
                    'Ваш прошлый результат будет удален. Начать тест с начала?',
                    [
                      { text: 'Отмена', style: 'cancel' },
                      {
                        text: 'Да, начать',
                        onPress: async () => {
                          try {
                            setLoading(true);
                            // Очищаем старые результаты перед новым запуском
                            await AsyncStorage.removeItem(statusKey);
                            await loadQuizFromDatFile(file.path, file.displayName, file.authorId);
                          } catch (e) {
                            Alert.alert('Ошибка', e.message);
                          } finally {
                            setLoading(false);
                          }
                        }
                      }
                    ]
                  );
                }
              }
            ]
          );
        } else {
          // Отмечаем как просмотренный при открытии
          const seenRaw = await AsyncStorage.getItem(CACHE_KEYS.SEEN_TESTS);
          const seen = seenRaw ? JSON.parse(seenRaw) : [];
          const testId = `${file.authorId}_${stripDatExtension(file.displayName)}`;
          if (!seen.includes(testId)) {
            const nextSeen = [...seen, testId];
            await AsyncStorage.setItem(CACHE_KEYS.SEEN_TESTS, JSON.stringify(nextSeen));
            setNewTestsCount(prev => Math.max(0, prev - 1));
          }
          await loadQuizFromDatFile(file.path, file.displayName, file.authorId);
        }
      }
    } catch (e) {
      Alert.alert('Ошибка', e.message || 'Не удалось открыть тест.');
    } finally {
      setLoading(false);
    }
  };

  const handleShareFile = async (file, skipWarning = false) => {
    const doShare = async () => {
      try {
        const canShare = await Sharing.isAvailableAsync();
        if (!canShare) {
          Alert.alert("Ошибка", "Шеринг недоступен на этом устройстве");
          return;
        }
        await Sharing.shareAsync(file.path, {
          mimeType: 'application/octet-stream',
          dialogTitle: `Поделиться тестом: ${file.name}`,
          UTI: 'public.data',
        });
      } catch (e) {
        Alert.alert('Ошибка', 'Не удалось отправить файл.');
      }
    };

    if (skipWarning) {
      await doShare();
    } else {
      Alert.alert(
        "Внимание!",
        "Вы собираетесь отправить файл самого теста, а не результат его прохождения. Продолжить?",
        [
          { text: "Отмена", style: "cancel" },
          { text: "Да, отправить", onPress: doShare }
        ]
      );
    }
  };

  const handleDeleteLibraryFile = async (file, folderType) => {
    Alert.alert('Удалить файл?', file.name, [
      { text: 'Отмена', style: 'cancel' },
      {
        text: 'Удалить',
        style: 'destructive',
        onPress: async () => {
          const cleanName = stripDatExtension(file.name);
          const progressKey = buildQuizProgressKey(cleanName);
          const statusKey = buildQuizStatusKey(cleanName);

          await AsyncStorage.multiRemove([progressKey, statusKey]);
          await FileSystem.deleteAsync(file.path, { idempotent: true });

          if (folderType === 'student') {
            await refreshStudentLibrary();
          } else {
            await refreshTeacherLibrary();
          }
        },
      },
    ]);
  };

  const handleDeleteAllFiles = async (folderPaths, folderType) => {
    const paths = Array.isArray(folderPaths) ? folderPaths : [folderPaths];
    Alert.alert(
      'Удалить все тесты?',
      'Это действие нельзя отменить. Все локальные файлы в списке будут безвозвратно удалены.',
      [
        { text: 'Отмена', style: 'cancel' },
        {
          text: 'Удалить всё',
          style: 'destructive',
          onPress: async () => {
            try {
              setLoading(true);
              let totalDeleted = 0;

              for (const folderPath of paths) {
                try {
                  const files = await FileSystem.readDirectoryAsync(folderPath);
                  const datFiles = files.filter(f => f.toLowerCase().endsWith('.dat'));

                  for (const fileName of datFiles) {
                    const cleanName = stripDatExtension(fileName);
                    const progressKey = buildQuizProgressKey(cleanName);
                    const statusKey = buildQuizStatusKey(cleanName);
                    await AsyncStorage.multiRemove([progressKey, statusKey]);
                    await FileSystem.deleteAsync(`${folderPath}${fileName}`, { idempotent: true });
                    totalDeleted++;
                  }
                } catch (e) {
                  console.warn(`Could not read or clear folder: ${folderPath}`, e);
                }
              }

              if (totalDeleted === 0) {
                Alert.alert('Информация', 'Нет локальных файлов для удаления.');
                return;
              }

              if (folderType === 'student') {
                await refreshStudentLibrary();
              } else {
                await refreshTeacherLibrary();
              }
              Alert.alert('Готово', `Удалено файлов: ${totalDeleted}`);
            } catch (e) {
              Alert.alert('Ошибка', 'Не удалось завершить удаление всех файлов.');
            } finally {
              setLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleShareStudentResult = async (file) => {
    try {
      const statusRaw = await AsyncStorage.getItem(buildQuizStatusKey(file.name));
      if (!statusRaw) throw new Error('Не найден сохраненный результат.');
      const status = JSON.parse(statusRaw);
      if (!status?.completedAt || !Array.isArray(status?.results)) {
        throw new Error('Для этого теста еще нет завершенных результатов.');
      }
      const text = buildCleanReportText({
        title: config.title,
        testFileName: status.testFileName || stripDatExtension(file.name),
        userName: status.userName || userName,
        totalTime: status.totalTime || 0,
        results: status.results || [],
        questionsLength: (status.questions || []).length,
      });
      const outName = buildReportFileName(status.userName || userName, status.testFileName || stripDatExtension(file.name));
      const path = FileSystem.documentDirectory + outName;
      await FileSystem.writeAsStringAsync(path, text, { encoding: FileSystem.EncodingType.UTF8 });
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert('Шаринг недоступен', `Файл сохранен: ${outName}`);
        return;
      }
      await Sharing.shareAsync(path, {
        mimeType: 'text/plain',
        dialogTitle: 'Поделиться отчетом',
        UTI: 'public.plain-text',
      });
    } catch (e) {
      Alert.alert('Ошибка', e.message || 'Не удалось отправить результат.');
    }
  };

  const handleShareResultStatus = async () => {
    let sharePath = '';
    try {
      const text = buildReportText();
      const fileName = buildReportFileName(userName, testFileName);
      sharePath = FileSystem.cacheDirectory + fileName;
      await FileSystem.writeAsStringAsync(sharePath, text);
      await Sharing.shareAsync(sharePath, {
        dialogTitle: 'Поделиться результатом',
        mimeType: 'text/plain',
        UTI: 'public.plain-text',
      });
    } catch (e) {
      Alert.alert('Ошибка', 'Не удалось поделиться результатом.');
    } finally {
      if (sharePath) {
        await FileSystem.deleteAsync(sharePath, { idempotent: true }).catch(() => { });
      }
    }
  };

  const handleOpenTeacherFileEditor = async (file) => {
    try {
      setLoading(true);
      const encrypted = await FileSystem.readAsStringAsync(file.path, { encoding: FileSystem.EncodingType.UTF8 });
      const decrypted = decodeEncryptedPayload(encrypted);
      setEditFilePath(file.path);
      setEditFileName(file.name);
      setEditContent(decrypted);
      setEditIsNew(false);
      setEditIsCloud(false);
      setScreen('edit-quiz');
    } catch (e) {
      Alert.alert('Ошибка', e.message || 'Не удалось открыть тест для редактирования.');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTeacherQuiz = () => {
    setEditFilePath('');
    setEditFileName('');
    setEditContent(QUIZ_TEMPLATE);
    setEditIsNew(true);
    setEditIsCloud(false);
    setScreen('edit-quiz');
  };

  // Вспомогательная функция для записи файла, чтобы не дублировать код
  const performSave = async (fileName, content) => {
    const encrypted = encodeEncryptedPayload(content);
    const stampedName = fileName.toLowerCase().endsWith('.dat') ? fileName : `${fileName}.dat`;
    const normalizedName = makeSafeFileName(stampedName);

    await saveDatToLibrary(SafeDirs.TEACHER, normalizedName, encrypted);
    await refreshTeacherLibrary();
    Alert.alert('Сохранено', `Тест "${normalizedName}" успешно сохранен.`);
    setScreen('teacher-library');
  };

  const handleSaveEditedQuiz = async () => {
    try {
      // 1. Валидируем контент
      const { questions: validationParsed } = parseQuestions(editContent);
      if (!validationParsed || validationParsed.length === 0) {
        throw new Error('Файл не содержит корректных вопросов.');
      }

      const rawName = editFileName.trim();
      if (!rawName) {
        Alert.alert('Ошибка', 'Пожалуйста, введите название файла');
        return;
      }

      setLoading(true);

      // Очищаем имя от расширений и спецсимволов
      let cleanName = rawName.replace(/\.dat$/i, '');
      const finalName = `${makeSafeFileName(cleanName)}.dat`;
      const encrypted = encodeEncryptedPayload(editContent);

      // Логика сохранения:
      // Если это существующий файл и имя не изменилось — перезаписываем
      const oldName = editFilePath ? editFilePath.split('/').pop() : '';

      if (!editIsNew && finalName === oldName) {
        await FileSystem.writeAsStringAsync(editFilePath, encrypted, { encoding: FileSystem.EncodingType.UTF8 });
        Alert.alert('Сохранено', 'Изменения записаны.');
      } else {
        // Если имя изменилось или это новый файл — создаем новый .dat
        await saveDatToLibrary(getActiveTeacherDir(), finalName, encrypted);
        Alert.alert('Сохранено', `Тест "${finalName}" успешно сохранен.`);
      }

      // 2. Если это облачный файл - обновляем и на GitHub
      if (editIsCloud) {
        const fileContentB64 = btoa(unescape(encodeURIComponent(encrypted)));
        const cloudFilePath = `${GITHUB_CONFIG.CLOUD_TESTS_DIR}/${finalName}`;
        const existingFile = await githubRequest(cloudFilePath);

        await githubRequest(cloudFilePath, 'PUT', {
          message: `Update test via editor: ${finalName}`,
          content: fileContentB64,
          sha: existingFile?.sha || undefined
        });

        // Обновляем в реестре (могли измениться вопросы)
        const { questions: validationParsed, metadata } = parseQuestions(editContent);
        const qCount = validationParsed ? validationParsed.length : 0;
        await syncCloudRegistry('add', {
          id: stripDatExtension(finalName),
          title: (metadata && metadata.title) || stripDatExtension(finalName),
          qCount: qCount,
          fileName: finalName
        });
      }

      await refreshTeacherLibrary();
      setScreen('teacher-library');
      Alert.alert('Успех', editIsCloud ? 'Тест сохранен локально и в облаке' : 'Тест сохранен');
    } catch (e) {
      Alert.alert('Ошибка формата', e.message || 'Проверьте структуру теста.');
    } finally {
      setLoading(false);
    }
  };

  const clearActiveQuizProgress = async () => {
    if (!activeProgressKey) return;
    await AsyncStorage.removeItem(activeProgressKey);
  };

  const handleFileImport = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ type: '*/*' });
      if (res.canceled) return;
      const asset = res.assets[0];

      const fileName = asset.name || 'imported_quiz.dat';
      if (!fileName.toLowerCase().endsWith('.dat')) {
        Alert.alert('Ошибка', 'Допускаются только файлы с расширением .dat');
        return;
      }

      validateQuizAsset(asset, maxQuizFileBytes);

      const encrypted = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.UTF8 });
      try {
        const decrypted = decodeEncryptedPayload(encrypted);
        const { questions } = parseQuestions(decrypted);
        if (!questions || questions.length === 0) throw new Error();
      } catch {
        Alert.alert('Ошибка', 'Файл имеет неверный формат или поврежден.');
        return;
      }

      const targetPath = SafeDirs.STUDENT + fileName;
      await FileSystem.copyAsync({ from: asset.uri, to: targetPath });
      await refreshStudentLibrary();
      Alert.alert('Успех', `Тест "${fileName}" успешно добавлен.`);
      setScreen('student-library');
    } catch (e) {
      Alert.alert('Ошибка импорта', e.message);
    }
  };

  const handleUrlImport = async (url) => {
    if (typeof url !== 'string' || !url.trim()) return;
    const cleanUrl = url.trim();
    try {
      setLoading(true);
      const resolvedUrl = validateQuizUrl(cleanUrl, allowedQuizHosts);
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), remoteFetchTimeoutMs);

      let res;
      try {
        res = await fetch(resolvedUrl, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }
      if (!res.ok) throw new Error('Не удалось загрузить файл по ссылке.');

      const contentLengthHeader = res.headers.get('content-length');
      const declaredSize = contentLengthHeader ? parseInt(contentLengthHeader, 10) : null;
      if (Number.isInteger(declaredSize) && declaredSize > maxQuizFileBytes) {
        throw new Error(`Файл слишком большой. Допустимо до ${Math.round(maxQuizFileBytes / 1024)} KB.`);
      }

      const content = await res.text();

      if (content.length > maxQuizFileBytes) {
        throw new Error(`Файл слишком большой. Допустимо до ${Math.round(maxQuizFileBytes / 1024)} KB.`);
      }

      try {
        const decrypted = decodeEncryptedPayload(content);
        const { questions } = parseQuestions(decrypted);
        if (!questions || questions.length === 0) throw new Error();
      } catch {
        Alert.alert('Ошибка', 'Контент по ссылке не является валидным тестом (.dat).');
        return;
      }

      let fileName = cleanUrl.split('/').pop().split('?')[0] || 'imported_quiz.dat';
      if (!fileName.toLowerCase().endsWith('.dat')) fileName += '.dat';
      const targetPath = SafeDirs.STUDENT + fileName;

      await FileSystem.writeAsStringAsync(targetPath, content);
      await refreshStudentLibrary();
      Alert.alert('Успех', 'Тест успешно загружен.');
      setFileUrl('');
      setScreen('student-library');
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'Request timed out. Please check your internet connection.' : e.message;
      Alert.alert('Ошибка', msg);
    } finally {
      setLoading(false);
    }
  };

  const markQuizCompleted = async (payload) => {
    try {
      if (!payload) return;

      const sourceQuestions = payload.questions;
      if (!sourceQuestions || sourceQuestions.length === 0) {
        console.warn('markQuizCompleted: Missing questions in payload');
        return;
      }
      const rawAnswers = payload.rawAnswers || [];
      const times = payload.questionTimes || [];
      const totalTimeVal = payload.totalTime !== undefined ? payload.totalTime : 0;

      // ФИНАЛЬНАЯ ВЕРИФИКАЦИЯ (details)
      const processedResults = sourceQuestions.map((q, i) => {
        const answer = rawAnswers[i];

        let isCorrect = false;
        let formattedAnswer = '';

        if (answer === null || answer === undefined) {
          formattedAnswer = '—';
          isCorrect = false;
        } else if (q.type === 'multi') {
          // Full set comparison — supports multiple correct answers (e.g. "1,3" → [0, 2])
          const correctIndices = (Array.isArray(q.a) ? q.a : [q.a])
            .map(v => parseInt(v, 10))
            .filter(v => !isNaN(v));
          const selectedIndices = (Array.isArray(answer) ? answer : [])
            .map(idx => parseInt(idx, 10))
            .filter(v => !isNaN(v));

          const correctSet = new Set(correctIndices);
          const selectedSet = new Set(selectedIndices);
          isCorrect = correctSet.size === selectedSet.size &&
            [...correctSet].every(v => selectedSet.has(v));

          formattedAnswer = selectedIndices.map(idx => q.opts[idx]).join(', ');
        } else {
          // Улучшенная нормализация по просьбе пользователя
          const userStr = String(answer || '').trim().toLowerCase();
          const correctStr = String(q.a || '').trim().toLowerCase();
          isCorrect = userStr === correctStr;

          formattedAnswer = String(answer).trim();
        }

        return {
          q: q.q,
          userAnswer: formattedAnswer || '—',
          correct: isCorrect,
          time: times[i] || 0
        };
      });

      setResults(processedResults);
      setTotalTime(totalTimeVal);

      if (activeStatusKey) {
        const statusRaw = await AsyncStorage.getItem(activeStatusKey);
        const status = statusRaw ? JSON.parse(statusRaw) : {};
        const nextStatus = {
          ...status,
          completedAt: new Date().toISOString(),
          results: processedResults,
          totalTime: totalTimeVal,
          testFileName: testFileName,
          userName: userName,
          questions: sourceQuestions,
          authorId: activeAuthorId,
        };
        await AsyncStorage.setItem(activeStatusKey, JSON.stringify(nextStatus));

        // Снимаем пометку "скрыт", если тест пересдан
        const testId = activeAuthorId ? `${activeAuthorId}_${testFileName}` : testFileName;
        if (permanentlyHiddenIds.includes(testId)) {
          const nextHidden = permanentlyHiddenIds.filter(id => id !== testId);
          setPermanentlyHiddenIds(nextHidden);
          await AsyncStorage.setItem(CACHE_KEYS.HIDDEN_TESTS, JSON.stringify(nextHidden));
        }

        await refreshStudentLibrary();
      }

      setScreen('results');
    } catch (error) {
      console.error("Ошибка завершения теста:", error);
      setScreen('results');
    }
  };

  const handleFinish = async (payload) => {
    // payload может быть массивом результатов или объектом со статистикой
    const finalPayload = Array.isArray(payload) ? { results: payload } : payload;
    await markQuizCompleted(finalPayload);
    await recordTestCompletion(testFileName, activeAuthorId);

    // Сохраняем ID как пройденный для умного счетчика
    const testId = `${activeAuthorId}_${stripDatExtension(testFileName)}`;
    const completedRaw = await AsyncStorage.getItem(CACHE_KEYS.COMPLETED_IDS);
    const completed = completedRaw ? JSON.parse(completedRaw) : [];
    if (!completed.includes(testId)) {
      const nextCompleted = [...completed, testId];
      await AsyncStorage.setItem(CACHE_KEYS.COMPLETED_IDS, JSON.stringify(nextCompleted));
      checkForUpdates(); // Пересчитываем счетчик мгновенно
    }

    if (activeProgressKey) {
      await AsyncStorage.removeItem(activeProgressKey);
    }

  };

  const _startQuiz = (parsedQuestions, fileName = 'quiz', sourcePath = '', authorId = '') => {
    const progressKey = buildQuizProgressKey(fileName, authorId);
    const statusKey = buildQuizStatusKey(fileName, authorId);
    setQuestions(parsedQuestions);
    setTestFileName(fileName);
    setActiveAuthorId(authorId);
    setActiveQuizPath(sourcePath);
    setActiveProgressKey(progressKey);
    setActiveStatusKey(statusKey);
    setResumeData(null);
    setResultsReadOnly(false);
    setResults([]);
    setActiveSessionId(Date.now().toString());
    setScreen('prestart');
    AsyncStorage.setItem(
      statusKey,
      JSON.stringify({ startedAt: new Date().toISOString(), completedAt: null, authorId }),
    ).catch(() => { });
  };

  const handleStartQuizAction = async () => {
    const isStillLocked = await getTestCooldown(testFileName, activeAuthorId);
    if (isStillLocked) {
      Alert.alert("Ошибка", "Этот тест уже был пройден. Повторная попытка будет доступна через 24 часа.");
      return;
    }
    setScreen('quiz');
  };

  const handleAbortQuiz = () => {
    Alert.alert(
      'Выход',
      'Прогресс будет сохранен автоматически. Вы действительно хотите выйти?',
      [
        {
          text: 'Выйти',
          style: 'destructive',
          onPress: () => {
            setScreen('student-library');
            refreshStudentLibrary();
          },
        },
        { text: 'Отмена', style: 'cancel' },
      ],
    );
  };

  const handleResetCooldowns = async () => {
    Alert.alert(
      "Сбросить блокировки?",
      "Все пройденные тесты снова станут доступны для прохождения.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Сбросить", onPress: async () => {
            try {
              await FileSystem.deleteAsync(SafeFiles.TRACKING_FILE, { idempotent: true });
              await refreshStudentLibrary();
              Alert.alert("Успех", "Все блокировки тестов сброшены.");
            } catch (e) {
              Alert.alert("Ошибка", "Не удалось сбросить блокировки.");
            }
          }
        }
      ]
    );
  };

  const handleResetSyncCooldowns = () => {
    setLastSyncTime(0);
    Alert.alert("Готово", "Таймер синхронизации сброшен. Облако обновится при следующем входе в библиотеку.");
  };

  const buildReportText = () => {
    return buildCleanReportText({
      title: config.title,
      testFileName,
      userName,
      totalTime,
      results,
      questionsLength: questions.length,
    });
  };


  const handleSendReport = async () => {
    try {
      const isAvailable = await MailComposer.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Почта недоступна', 'На устройстве не настроен почтовый клиент.');
        return;
      }
      const text = buildReportText();
      await MailComposer.composeAsync({
        recipients: reportEmail ? [reportEmail] : [],
        subject: `Результаты — ${userName || 'Студент'} — ${config.title}`,
        body: text,
      });
    } catch (e) {
      Alert.alert('Ошибка отправки', e.message);
    }
  };

  const getGroupedQuizzes = () => {
    // Группируем локальные файлы по авторам на основе префиксов
    const groups = {};

    studentLibraryFiles
      .filter(file => {
        const testId = file.authorId ? `${file.authorId}_${stripDatExtension(file.displayName)}` : stripDatExtension(file.displayName);
        const isHidden = permanentlyHiddenIds.includes(testId);

        if (!showHiddenTests && isHidden) return false;

        const search = librarySearch.toLowerCase();
        return file.displayName.toLowerCase().includes(search) || (file.authorId && file.authorId.toLowerCase().includes(search));
      })
      .forEach(file => {
        const isSystem = file.authorId === 'System';
        const isCloud = !!file.authorId && !isSystem;
        const authorKey = isSystem ? 'system_teacher' : (isCloud ? file.authorId : 'local_teacher');

        let authorName = '';
        if (isSystem) {
          authorName = 'Обучающие тесты';
        } else if (isCloud) {
          authorName = (subscriptions || []).find(s => s.owner === file.authorId)?.name || SafeMaster.name;
        } else {
          authorName = LOCAL_TEACHER_NAME;
        }

        if (!groups[authorKey]) {
          groups[authorKey] = {
            title: isSystem ? authorName : `Источник: ${authorName}`,
            data: []
          };
        }
        groups[authorKey].data.push(file);
      });

    // Сортируем секции: System -> Master -> Local -> Остальные
    return Object.values(groups).sort((a, b) => {
      const isASystem = a.title === 'Обучающие тесты';
      const isBSystem = b.title === 'Обучающие тесты';
      if (isASystem) return -1;
      if (isBSystem) return 1;

      const isAMaster = a.title.includes(SafeMaster.name);
      const isBMaster = b.title.includes(SafeMaster.name);
      if (isAMaster) return -1;
      if (isBMaster) return 1;

      const isALocal = a.title.includes(LOCAL_TEACHER_NAME);
      const isBLocal = b.title.includes(LOCAL_TEACHER_NAME);
      if (isALocal) return 1;
      if (isBLocal) return -1;

      return a.title.localeCompare(b.title);
    });
  };

  const renderHeader = (title, onBack, rightContent) => (
    <View style={[
      styles.headerContainer,
      { paddingTop: insets.top + 45, minHeight: 60 + insets.top, flexDirection: 'row', alignItems: 'center' }
    ]}>
      {/* Абсолютный заголовок — мертво по центру */}
      <Text style={[
        styles.headerTitle,
        { position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: 0 }
      ]}>
        {title}
      </Text>

      {/* Левая часть */}
      <View style={{ flex: 1, alignItems: 'flex-start', zIndex: 1 }}>
        {onBack ? (
          <TouchableOpacity onPress={onBack} style={styles.headerBack}>
            <Ionicons name="chevron-back" size={24} color={C.accent} />
            <Text style={styles.headerBackText}>Назад</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {/* Правая часть */}
      <View style={{ flex: 1, alignItems: 'flex-end', zIndex: 1 }}>
        {rightContent}
      </View>
    </View>
  );

  const renderSmartActionModal = () => {
    if (!actionTargetTest) return null;
    const { item, status, testId, isHidden } = actionTargetTest;
    const isSystem = item.authorId === 'System';
    const isCloud = !!item.authorId;
    const isOrphaned = status.isOrphaned;

    const canDelete = !isSystem && (!isCloud || isOrphaned);

    // StatusKey for deletion
    const fileName = item.path.split('/').pop();
    const statusKey = buildQuizStatusKey(fileName);

    return (
      <Modal visible={actionModalVisible} transparent animationType="fade" onRequestClose={() => setActionModalVisible(false)}>
        <TouchableOpacity style={styles.modalOverlay} activeOpacity={1} onPress={() => setActionModalVisible(false)}>
          <View style={styles.actionModalContent}>
            <Text style={styles.actionModalTitle}>{item.displayName}</Text>

            {isHidden ? (
              <TouchableOpacity style={styles.actionOption} onPress={() => handleRestoreTest(testId)}>
                <Ionicons name="eye-outline" size={22} color={C.accent} />
                <Text style={styles.actionOptionText}>Восстановить в списке</Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity style={styles.actionOption} onPress={() => handleHideTest(testId)}>
                <Ionicons name="eye-off-outline" size={22} color={C.textSecondary} />
                <Text style={styles.actionOptionText}>Скрыть из списка</Text>
              </TouchableOpacity>
            )}

            {canDelete && (
              <TouchableOpacity
                style={[styles.actionOption, styles.actionOptionLast]}
                onPress={() => handleDeleteTestPermanently(item.path, statusKey, testId)}
              >
                <Ionicons name="trash-outline" size={22} color={C.danger} />
                <Text style={[styles.actionOptionText, styles.actionOptionDanger]}>Удалить навсегда</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={{ marginTop: 20, alignItems: 'center', justifyContent: 'center', height: 48 }}
              onPress={() => setActionModalVisible(false)}
            >
              <Text style={{ color: '#00BFFF', fontWeight: '700', fontSize: 16 }}>Закрыть</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    );
  };

  const renderContent = () => {
    try {
      if (screen === 'welcome') {
        return (
          <View style={safeStyle}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />

            <TouchableOpacity
              style={[styles.helpBtn, { position: 'absolute', top: insets.top + 10, right: 16 }]}
              onPress={() => {
                setHelpType('student');
                setHelpVisible(true);
              }}
            >
              <Text style={styles.helpBtnText}>?</Text>
            </TouchableOpacity>

            <KeyboardAvoidingView
              style={styles.flex}
              behavior="padding"
            >
              <View style={L.halfBottom}>
                <View style={{ alignItems: 'center', marginBottom: 24 }}>
                  <View style={[styles.logoCircle, { backgroundColor: 'rgba(91, 139, 245, 0.08)', width: 120, height: 120, borderRadius: 60, marginBottom: 24, borderWidth: 1, borderColor: 'rgba(91, 139, 245, 0.2)' }]}>
                    <MaterialCommunityIcons name="brain" size={80} color={C.accent} />
                  </View>
                  {newTestsCount > 0 && (
                    <View style={{ backgroundColor: 'rgba(76, 175, 80, 0.1)', padding: 12, borderRadius: 12, marginBottom: 20, borderWidth: 1, borderColor: C.success }}>
                      <Text style={{ color: C.success, fontWeight: '700', textAlign: 'center' }}>
                        Появились новые задания ({newTestsCount}) ☁️
                      </Text>
                    </View>
                  )}

                  <Text style={styles.welcomeTitle}>{config.title || 'Вход в систему'}</Text>
                  <Text style={styles.welcomeDesc}>{config.welcomeDesc}</Text>
                </View>
                <Text style={styles.label}>Ваше имя</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Введите ваше имя..."
                  placeholderTextColor={C.textDisabled}
                  value={userName}
                  onChangeText={handleNameChange}
                  autoCorrect={false}
                />
                <Btn
                  label="Войти"
                  onPress={handleContinueStudent}
                  disabled={!userName.trim()}
                />
                <View style={{ marginTop: 20 }}>
                  <Btn label="Выход" onPress={handleExitApp} variant="black" />
                </View>
                <Text style={{ textAlign: 'center', marginTop: 16, color: C.textDisabled, fontSize: 10 }}>
                  Версия {APP_VERSION}
                </Text>
              </View>
            </KeyboardAvoidingView>
          </View>
        );
      }

      if (screen === 'teacher') {
        return (
          <View style={safeStyle}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            {renderHeader(
              "Режим учителя",
              () => setScreen('welcome'),
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => setScreen('teacher-profile')}
                  style={{
                    backgroundColor: '#FFD700',
                    paddingHorizontal: 12,
                    height: 34,
                    borderRadius: 8,
                    marginRight: 8,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: '#FFA700'
                  }}
                >
                  <Text style={{ color: '#111', fontSize: 11, fontWeight: '800', letterSpacing: 0.5 }}>МОЙ ПРОФИЛЬ</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.helpBtn}
                  onPress={() => {
                    setHelpType('teacher');
                    setHelpVisible(true);
                  }}
                >
                  <Text style={styles.helpBtnText}>?</Text>
                </TouchableOpacity>
              </View>
            )}

            <View style={{ flex: 1, paddingHorizontal: 16 }}>
              <ScrollView style={{ flex: 1 }} nestedScrollEnabled showsVerticalScrollIndicator={false}>
                {/* 1. Quick Start Block */}
                <Card style={{ padding: 20, backgroundColor: 'rgba(91, 139, 245, 0.08)', marginTop: 10, borderLeftWidth: 4, borderLeftColor: C.accent, minHeight: 300 }}>
                  <Text style={{ fontSize: 22, fontWeight: '700', color: C.accent, marginBottom: 12 }}>🚀 Быстрый старт</Text>
                  <Text style={{ fontSize: 19, color: C.textPrimary, lineHeight: 28 }}>
                    • <Text style={{ fontWeight: '700' }}>Создание:</Text> Используйте встроенный редактор или импортируйте CSV/TXT файлы тестов созданные по <Text onPress={() => { setHelpType('template'); setHelpVisible(true); }} style={{ color: C.accent, textDecorationLine: 'underline' }}>шаблону</Text>. Вы также можете импортировать уже зашифрованные тесты.{"\n"}
                    • <Text style={{ fontWeight: '700' }}>Облако:</Text> Для работы с GitHub укажите ваш <Text style={{ color: C.accent }}>Username</Text>, <Text style={{ color: C.accent }}>Repo</Text> и <Text style={{ color: C.accent }}>Token</Text> в профиле.{"\n"}
                    • <Text style={{ fontWeight: '700' }}>Синхронизация:</Text> Все изменения в вашем репозитории отслеживаются автоматически.{"\n"}
                    • <Text style={{ fontWeight: '700' }}>Безопасность:</Text> Файлы <Text style={{ color: C.success }}>.dat</Text> шифруются ключом приложения.{"\n"}
                    • <Text style={{ fontWeight: '700' }}>Публикация:</Text> Тесты загружаются в ваш личный репозиторий, а ученики подписываются на ваши обновления.{"\n"}
                    • <Text style={{ color: C.textSecondary, fontSize: 16, marginTop: 10 }}>Листайте вниз для доступа к Dev Tools.</Text>
                  </Text>
                </Card>

                {/* 2. Configuration Block */}
                <View style={{ marginTop: 20 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: C.textDisabled, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    ⚙️ Конфигурация
                  </Text>
                  {renderConfigSection("Локальные директории (DIRS)", {
                    ROOT: SafeDirs.ROOT,
                    STUDENT: SafeDirs.STUDENT,
                    TEACHER: SafeDirs.TEACHER,
                    DOWNLOADS: SafeDirs.DOWNLOADS
                  })}
                  {renderConfigSection("Статус GitHub", {
                    Owner: teacherProfile?.owner || GITHUB_CONFIG.OWNER || 'не задан',
                    Repo: teacherProfile?.repo || GITHUB_CONFIG.REPO || 'не задан',
                    Token: (teacherProfile?.token || GITHUB_CONFIG.TOKEN) ? 'Установлен' : 'Отсутствует',
                    Connected: (teacherProfile?.owner || GITHUB_CONFIG.OWNER) ? '✅ Да' : '❌ Нет'
                  })}
                  {renderConfigSection("Удаленная конфигурация (CLOUD)", {
                    Title: config.title,
                    AdminCode: '••••',
                    ReportEmail: config.reportEmail || 'не задан',
                    Timeout: `${remoteFetchTimeoutMs}ms`,
                    Cooldown: `${(config.TEST_COOLDOWN_MS / 3600000).toFixed(1)}ч`,
                    MaxFileSize: `${Math.round(config.maxQuizFileBytes / 1024)}KB`
                  })}
                  <Btn
                    label="Синхронизировать конфиг"
                    onPress={() => loadConfig()}
                    variant="success"
                    style={{ marginTop: 4, height: 36 }}
                    textStyle={{ fontSize: 11 }}
                  />
                </View>

                {/* 3. System Info Block */}
                <View style={{ marginTop: 8 }}>
                  <Text style={{ fontSize: 11, fontWeight: '800', color: C.textDisabled, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 }}>
                    📱 Системная информация
                  </Text>
                  <Card style={{ padding: 12, backgroundColor: 'rgba(255,255,255,0.02)' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, color: C.textSecondary }}>Версия приложения</Text>
                      <Text style={{ fontSize: 11, color: C.textPrimary, fontWeight: '700' }}>v{APP_VERSION}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 11, color: C.textSecondary }}>GitHub API</Text>
                      <Text style={{ fontSize: 10, color: C.accent }}>{GITHUB_CONFIG.API_BASE?.substring(0, 30)}...</Text>
                    </View>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 11, color: C.textSecondary }}>Кулдаун тестов</Text>
                      <Text style={{ fontSize: 11, color: C.textPrimary }}>{(config.TEST_COOLDOWN_MS / 3600000).toFixed(1)}ч</Text>
                    </View>
                  </Card>
                </View>

                {/* 4. Developer Tools */}
                <Card style={{ padding: 16, backgroundColor: 'rgba(255,140,0,0.05)', marginTop: 24, marginBottom: 20 }}>
                  <Text style={{ fontSize: 12, fontWeight: '700', color: '#FFA700', marginBottom: 12 }}>🛠 Инструменты разработчика (локально)</Text>
                  <View style={{ alignItems: 'center' }}>
                    <Btn
                      label="Сбросить все блокировки тестов"
                      onPress={handleResetCooldowns}
                      variant="black"
                      style={{ width: '90%', height: 44, marginBottom: 12 }}
                      textStyle={{ fontSize: 13 }}
                    />
                    <Btn
                      label="Сбросить кулдаун синхронизации"
                      onPress={handleResetSyncCooldowns}
                      variant="black"
                      style={{ width: '90%', height: 44 }}
                      textStyle={{ fontSize: 13 }}
                    />
                  </View>
                </Card>
              </ScrollView>
            </View>

            {/* Footer */}
            <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg }}>
              <Btn
                label="📁 УПРАВЛЕНИЕ ТЕСТАМИ"
                onPress={async () => {
                  await refreshTeacherLibrary();
                  setResultsOrigin('teacher');
                  setScreen('teacher-library');
                }}
                variant="gold"
                style={{ height: 54 }}
              />
              <Text style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: C.textDisabled, fontWeight: '600', letterSpacing: 0.5 }}>
                СОЗДАНИЕ, РЕДАКТИРОВАНИЕ И ПУБЛИКАЦИЯ В ОБЛАКО
              </Text>
            </View>
          </View>
        );
      }

      if (screen === 'teacher-profile') {
        return (
          <TeacherProfileScreen
            title="Мой профиль"
            teacherProfile={teacherProfile}
            setTeacherProfile={setTeacherProfile}
            onBack={() => setScreen('teacher')}
            apiTimeout={remoteFetchTimeoutMs}
            config={config}
            updateConfig={updateConfig}
            loadConfig={loadConfig}
            publishConfigToCloud={handlePublishConfigToCloud}
          />
        );
      }

      if (screen === 'teacher-profile-setup') {
        return (
          <TeacherProfileScreen
            title="Новый профиль"
            teacherProfile={teacherProfile}
            setTeacherProfile={setTeacherProfile}
            onBack={() => setScreen('teacher')}
            apiTimeout={remoteFetchTimeoutMs}
            config={config}
            updateConfig={updateConfig}
            loadConfig={loadConfig}
            publishConfigToCloud={handlePublishConfigToCloud}
          />
        );
      }

      if (screen === 'student-library') {
        const groupedData = getGroupedQuizzes();

        return (
          <View style={safeStyle}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            {renderHeader(
              "Доступные тесты",
              () => setScreen('welcome'),
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity onPress={() => setShowHiddenTests(!showHiddenTests)} style={[styles.fileActionBtn, { borderColor: showHiddenTests ? C.accent : C.border, height: 24, paddingVertical: 0, justifyContent: 'center', marginRight: 8 }]}>
                  <Ionicons name={showHiddenTests ? "eye-outline" : "eye-off-outline"} size={14} color={showHiddenTests ? C.accent : C.textSecondary} />
                </TouchableOpacity>

                <TouchableOpacity onPress={handleHideCompletedTests} style={[styles.fileActionBtn, { borderColor: C.accent, height: 24, paddingVertical: 0, justifyContent: 'center', marginRight: 8 }]}>
                  <Ionicons name="checkmark-done-outline" size={14} color={C.accent} />
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleManualSync}
                  style={[styles.fileActionBtn, { borderColor: C.success, height: 24, paddingVertical: 0, justifyContent: 'center', marginRight: 8 }]}
                  activeOpacity={0.7}
                >
                  <Animated.View style={{ transform: [{ rotate: spin }] }}>
                    <Ionicons name="sync" size={14} color={C.success} />
                  </Animated.View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => setScreen('student-subscriptions')}
                  style={[styles.fileActionBtn, { borderColor: C.accent, height: 24, paddingVertical: 0, justifyContent: 'center' }]}
                >
                  <Text style={{ color: C.accent, fontWeight: '700', fontSize: 11 }}>Подписки</Text>
                </TouchableOpacity>
              </View>
            )}
            <View style={L.libraryWrap}>
              <View style={{ marginBottom: 16 }}>
                <TextInput
                  style={[styles.input, { height: 46, marginBottom: 0, backgroundColor: C.surface }]}
                  placeholder="🔍 Поиск тестов..."
                  placeholderTextColor={C.textDisabled}
                  value={librarySearch}
                  onChangeText={setLibrarySearch}
                  autoCorrect={false}
                />
              </View>
              <SectionList
                sections={groupedData}
                keyExtractor={(item) => item.path}
                stickySectionHeadersEnabled={false}
                refreshControl={
                  <RefreshControl
                    refreshing={isRefreshing}
                    onRefresh={handlePullToRefresh}
                    tintColor={C.accent}
                    colors={[C.accent]}
                  />
                }
                renderSectionHeader={({ section: { title } }) => (
                  <View style={{ backgroundColor: C.bg, paddingVertical: 8, marginTop: 8 }}>
                    <Text style={{ color: C.textSecondary, fontWeight: '700', fontSize: 14 }}>{title}</Text>
                  </View>
                )}
                ListEmptyComponent={
                  <View style={{ alignItems: 'center', marginTop: 40 }}>
                    <Text style={styles.welcomeDesc}>У вас пока нет скачанных тестов.</Text>
                    <Btn label="Обновить облако" onPress={checkForUpdates} style={{ marginTop: 12 }} />
                  </View>
                }
                renderItem={({ item }) => {
                  const status = studentQuizStatus[item.path] || {};
                  const isLocked = status.isLocked;
                  const isSystem = item.authorId === 'System';
                  const isCompleted = !!(status.completedAt || (Array.isArray(status.results) && status.results.length > 0));
                  const testId = item.authorId ? `${item.authorId}_${stripDatExtension(item.displayName)}` : stripDatExtension(item.displayName);
                  const isHidden = permanentlyHiddenIds.includes(testId);

                  return (
                    <View style={[styles.libraryRow, isHidden && { opacity: 0.5 }]}>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <Text style={styles.libraryTitle}>
                            {item.authorId && !isSystem ? '☁️ ' : ''}{isSystem ? '🎓 ' : ''}{item.displayName}
                          </Text>
                          {isHidden && (
                            <View style={{ backgroundColor: C.border, paddingHorizontal: 4, borderRadius: 2, marginLeft: 6 }}>
                              <Text style={{ color: C.textSecondary, fontSize: 8, fontWeight: '700' }}>СКРЫТ</Text>
                            </View>
                          )}
                        </View>

                        <View style={{ marginTop: 4 }}>
                          {(() => {
                            const correctCount = status.results?.filter(r => r.correct).length || 0;
                            const totalCount = item.questionCount || 1;
                            const hasResult = isCompleted;

                            if (!hasResult) {
                              if (status.hasProgress) {
                                return <Text style={{ color: C.warning, fontSize: 12, fontWeight: '700' }}>⏳ Не закончен</Text>;
                              }
                              return <Text style={{ color: C.textSecondary, fontSize: 12 }}>Не начат</Text>;
                            }
                            if (correctCount === totalCount && totalCount > 0) {
                              return <Text style={{ color: C.success, fontSize: 12, fontWeight: '700' }}>🌟 Отлично! {correctCount}/{totalCount}</Text>;
                            }
                            return <Text style={{ color: C.textSecondary, fontSize: 12 }}>📖 Пройдено: {correctCount}/{totalCount}</Text>;
                          })()}
                        </View>

                        <Text style={[styles.libraryMeta, { marginTop: 4, fontSize: 11 }]}>
                          Вопросов: {item.questionCount}
                        </Text>

                        {status.isOrphaned && (
                          <Text style={{ color: C.textSecondary, fontSize: 10, fontStyle: 'italic', marginTop: 2 }}>
                            (Удален из облака)
                          </Text>
                        )}
                        {isLocked && (
                          <Text style={{ color: C.danger, fontSize: 11, marginTop: 2 }}>
                            Доступен: {formatUnlockTime(isLocked)}
                          </Text>
                        )}
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        {/* 1. Посмотреть результат (появляется после прохождения) */}
                        {isCompleted ? (
                          <TouchableOpacity
                            onPress={() => handleViewStudentResults(item)}
                            style={[styles.fileActionBtn, { marginRight: 8, borderColor: C.accent }]}
                          >
                            <Ionicons name="list-outline" size={20} color={C.accent} />
                          </TouchableOpacity>
                        ) : null}

                        {/* 2. Кнопка пройти тест */}
                        <TouchableOpacity
                          onPress={() => handleOpenStudentQuiz(item)}
                          style={[
                            styles.fileActionBtn,
                            {
                              backgroundColor: isLocked ? C.border : (isSystem && !isCompleted ? C.accent : 'transparent'),
                              marginRight: (isSystem && !isCompleted) ? 0 : 8,
                              borderColor: (isSystem && !isCompleted) ? C.accent : C.border,
                              width: (isSystem && !isCompleted) ? 'auto' : 40,
                              paddingHorizontal: (isSystem && !isCompleted) ? 12 : 0,
                              flexDirection: 'row'
                            }
                          ]}
                          disabled={!!isLocked}
                        >
                          <Ionicons
                            name={status.hasProgress ? "play-circle-outline" : "chevron-forward-outline"}
                            size={20}
                            color={isLocked ? C.textDisabled : (isSystem && !isCompleted ? C.white : C.accent)}
                            style={(!status.hasProgress && !isSystem) ? { marginLeft: 2 } : {}}
                          />
                          {isSystem && !isCompleted && (
                            <Text style={{ color: C.white, fontSize: 13, fontWeight: '800', marginLeft: 6 }}>ЗАПУСТИТЬ</Text>
                          )}
                        </TouchableOpacity>

                        {/* 3. Кнопка поделиться файлом теста (скрыта для системы) */}
                        {!isSystem && (
                          <TouchableOpacity
                            onPress={() => handleShareFile(item)}
                            style={[styles.fileActionBtn, { marginRight: 8, borderColor: C.success }]}
                          >
                            <Ionicons name="share-outline" size={20} color={C.success} />
                          </TouchableOpacity>
                        )}

                        {/* 4. Смарт-кнопка управления (Modal) */}
                        {(() => {
                          const isCloud = !!item.authorId;
                          const isOrphaned = status.isOrphaned;

                          // Показываем кнопку управления (Hide) для системы только после прохождения.
                          // Для остальных облачных тестов - только если пройден или сирота.
                          // Для локальных - всегда.
                          const hideEllipsis = isSystem ? !isCompleted : (!isCompleted && !isOrphaned && isCloud);
                          if (hideEllipsis) return null;

                          return (
                            <TouchableOpacity
                              onPress={() => {
                                setActionTargetTest({ item, status, testId, isHidden });
                                setActionModalVisible(true);
                              }}
                              style={[styles.fileActionBtn, { borderColor: isHidden ? C.accent : C.border }]}
                            >
                              <Ionicons name="ellipsis-vertical" size={20} color={isHidden ? C.accent : C.textSecondary} />
                            </TouchableOpacity>
                          );
                        })()}
                      </View>
                    </View>
                  );
                }}
              />
              <Btn
                label="Добавить тесты"
                onPress={() => { setScreen('add-test'); }}
                style={{ marginTop: 16 }}
              />
            </View>
          </View>
        );
      }

      if (screen === 'student-subscriptions') {
        return (
          <TeachersScreen
            subscriptions={subscriptions || []}
            setSubscriptions={setSubscriptions}
            teacherProfile={teacherProfile}
            apiTimeout={remoteFetchTimeoutMs}
            onBack={() => {
              setScreen('student-library');
              checkForUpdates();
            }}
          />
        );
      }

      if (screen === 'teacher-library') {
        return (
          <View style={safeStyle}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            {renderHeader(
              "На устройстве",
              () => setScreen('teacher'),
              <TouchableOpacity
                onPress={async () => {
                  setScreen('cloud-manager');
                  setLoading(true);
                  try {
                    const registry = await fetchCloudRegistry();
                    setCloudRegistry(registry);
                  } finally {
                    setLoading(false);
                  }
                }}
                style={styles.headerBack}
              >
                <Ionicons name="cloud-outline" size={22} color={C.accent} />
                <Text style={styles.headerBackText}> Облако</Text>
              </TouchableOpacity>
            )}
            <View style={L.libraryWrap}>
              <Text style={[styles.welcomeDesc, { marginBottom: 12, textAlign: 'left', fontSize: 13 }]}>
                Локальные тесты. Если тест уже есть в облаке, изменения в редакторе автоматически обновят его и в облаке GitHub.
              </Text>
              {/* ОПТИМИЗИРОВАНО: Добавлены параметры для FlatList */}
              <FlatList
                data={teacherLibraryFiles}
                keyExtractor={(item) => item.path}
                initialNumToRender={10}
                maxToRenderPerBatch={10}
                windowSize={5}
                ListEmptyComponent={<Text style={styles.welcomeDesc}>Нет сохраненных тестов.</Text>}
                renderItem={({ item }) => (
                  <View style={styles.libraryRow}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={styles.libraryTitle}>{item.displayName}</Text>
                        {cloudRegistry?.some?.(c => c.id === stripDatExtension(item.name)) && (
                          <Text style={{ marginLeft: 6 }}>☁️</Text>
                        )}
                      </View>
                      <Text style={[styles.libraryMeta, { color: C.accent, fontWeight: '600' }]}>
                        Вопросов: {item.questionCount || 0}{"\n"}Размер: {Math.round(item.size / 1024)} KB
                      </Text>
                      <Text style={[styles.libraryMeta, { fontSize: 11, marginTop: 2 }]}>
                        Создан: {formatNiceDate(item.createdAt || item.mtime * 1000)}
                      </Text>
                    </View>
                    {item.canEdit && (
                      <TouchableOpacity onPress={() => handleOpenTeacherFileEditor(item)} style={styles.fileActionBtn}>
                        <Ionicons name="create-outline" size={24} color={C.accent} />
                      </TouchableOpacity>
                    )}
                    {item.canEdit && teacherProfile?.token && (
                      <TouchableOpacity
                        onPress={() => {
                          const isPublished = cloudRegistry?.some?.(c => c.id === stripDatExtension(item.name));
                          if (isPublished) {
                            handleUnpublishFromCloud(item);
                          } else {
                            handlePublishToCloud(item);
                          }
                        }}
                        style={[styles.fileActionBtn, { backgroundColor: cloudRegistry?.some?.(c => c.id === stripDatExtension(item.name)) ? '#111' : '#FFD700', borderWidth: 0 }]}
                      >
                        <Ionicons
                          name={cloudRegistry?.some?.(c => c.id === stripDatExtension(item.name)) ? "cloud-offline-outline" : "cloud-upload-outline"}
                          size={22}
                          color={cloudRegistry?.some?.(c => c.id === stripDatExtension(item.name)) ? "#fff" : "#000"}
                        />
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={() => handleShareFile(item, true)} style={styles.fileActionBtn}>
                      <Ionicons name="share-outline" size={24} color={C.accent} />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleDeleteLibraryFile(item, 'teacher')} style={styles.deleteBtn}>
                      <Text style={styles.deleteBtnText}>🗑</Text>
                    </TouchableOpacity>
                  </View>
                )}
              />
              <Btn label="📝 Создать тест" onPress={handleCreateTeacherQuiz} variant="gold" style={{ marginTop: 12 }} />
              <Btn label="📥 Импортировать файл" onPress={handleEncryptAndSave} variant="black" style={{ marginTop: 10, borderColor: '#FFD700' }} />
              <Btn label="🗑 Удалить все" onPress={() => handleDeleteAllFiles([SafeDirs.TEACHER, SafeDirs.DOWNLOADS], 'teacher')} variant="black" style={{ marginTop: 10, borderColor: C.danger }} />
            </View>
          </View>
        );
      }

      if (screen === 'edit-quiz') {
        return (
          <View style={safeStyle}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            {renderHeader(
              editIsNew ? 'Создание теста' : 'Редактор',
              () => setScreen(editIsCloud ? 'cloud-manager' : 'teacher-library')
            )}
            <View style={styles.editorWrap}>
              <Text style={[styles.label, { marginBottom: 4, marginLeft: 4 }]}>Имя файла:</Text>
              <TextInput
                style={[styles.input, { marginBottom: 12, backgroundColor: C.surfaceHigh }]}
                placeholder="Название файла"
                placeholderTextColor={C.textDisabled}
                value={editFileName}
                onChangeText={setEditFileName}
              />
              <Text style={[styles.label, { marginBottom: 4, marginLeft: 4 }]}>Содержимое (CSV):</Text>
              <TextInput
                style={styles.editorInput}
                multiline
                value={editContent}
                onChangeText={setEditContent}
                autoCapitalize="none"
                autoCorrect={false}
                textAlignVertical="top"
              />
              <View style={styles.editorActions}>
                <Btn label="Сохранить" onPress={handleSaveEditedQuiz} disabled={!!loading} variant="gold" />
                <Btn label="Отмена" variant="black" onPress={() => setScreen('teacher-library')} style={{ marginTop: 8 }} />
              </View>
            </View>
          </View>
        );
      }

      if (screen === 'loading') {
        return (
          <View style={safeStyle}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
              {renderHeader(
                "Загрузка теста",
                () => setScreen('welcome')
              )}
            </View>

            <KeyboardAvoidingView
              style={styles.flex}
              behavior="padding"
            >
              <View style={L.halfBottom}>
                {loading ? (
                  <View style={{ paddingBottom: 40 }}>
                    <ActivityIndicator color={C.accent} size="large" />
                  </View>
                ) : (
                  <>
                    <Text style={[styles.welcomeDesc, { marginBottom: 24 }]}>
                      {config.loadingDesc}
                    </Text>
                    <Btn label="📂 Выбрать .dat файл" onPress={handleLoadDat} />

                    <View style={L.divider}>
                      <View style={L.dividerLine} />
                      <Text style={L.dividerText}>ИЛИ</Text>
                      <View style={L.dividerLine} />
                    </View>

                    <Text style={[styles.label, { marginBottom: 8 }]}>Ссылка на файл:</Text>
                    <TextInput
                      style={[styles.input, { marginBottom: 12 }]}
                      placeholder="https://..."
                      placeholderTextColor={C.textDisabled}
                      value={fileUrl}
                      onChangeText={setFileUrl}
                      autoCapitalize="none"
                      keyboardType="url"
                    />
                    <Btn
                      label="🌐 Загрузить по ссылке"
                      onPress={handleLoadByUrl}
                      disabled={!fileUrl || fileUrl.trim().length < 10}
                    />
                  </>
                )}
              </View>
            </KeyboardAvoidingView>
          </View>
        );
      }

      if (screen === 'prestart') {
        const prestartText =
          config.prestartText ||
          `Тест загружен успешно!\nВнимательно читайте каждый вопрос. При множественном выборе возможно несколько правильных ответов. Кнопка «Вперед» позволяет переходить к следующему вопросу.\nУдачи!`;

        return (
          <View style={safeStyle}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            {renderHeader(
              "Готов к тесту?",
              handleBackFromPrestart
            )}

            <View style={L.halfBottom}>
              <View style={{ alignItems: 'center', marginBottom: 16 }}>
                <View style={styles.logoCircle}>
                  <Text style={styles.logoText}>!</Text>
                </View>
                <Text style={[styles.welcomeTitle, { marginBottom: 4 }]}>{testFileName}</Text>
                <Text style={[styles.welcomeDesc]}>Вопросов: {questions.length}</Text>
              </View>
              <ScrollView style={{ maxHeight: 200 }} showsVerticalScrollIndicator={false}>
                <Text style={[styles.welcomeDesc, { textAlign: 'left', lineHeight: 24 }]}>
                  {prestartText}
                </Text>
              </ScrollView>
              <Btn label="🚀 Начать тест" onPress={handleStartQuizAction} style={{ marginTop: 24 }} />
              <Btn label="Нет, позже" onPress={handleBackFromPrestart} variant="black" style={{ marginTop: 12 }} />
            </View>
          </View>
        );
      }

      if (screen === 'quiz') {
        return (
          <QuizScreen
            key={activeSessionId}
            questions={questions}
            testFileName={testFileName}
            userName={userName}
            config={config}
            activeProgressKey={activeProgressKey}
            onFinish={handleFinish}
            onAbort={handleAbortQuiz}
            initialData={resumeData}
          />
        );
      }

      if (screen === 'results') {
        const score = results.filter(r => r && r.correct).length;
        const total = questions.length;
        const percent = Math.round((score / total) * 100);
        const passed = percent >= 60;

        return (
          <View style={safeStyle} key={activeSessionId}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            {renderHeader(
              resultsReadOnly ? 'Результаты (архив)' : 'Ваш результат',
              null
            )}

            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 24 }}>
              <Card style={[styles.scoreCard, { borderColor: passed ? C.success : C.danger }]}>
                <Text style={[styles.scorePercent, { color: passed ? C.success : C.danger }]}>
                  {percent}%
                </Text>
                <Text style={styles.scoreLabel}>{score} из {total} верно</Text>
                <Text style={[styles.scoreVerdict, { color: passed ? C.success : C.danger }]}>
                  {passed ? '✅ Тест пройден' : '❌ Тест не пройден'}
                </Text>
                <Text style={[styles.scoreVerdict, { color: C.textSecondary }]}>⏱ {formatTime(totalTime)}</Text>
                {userName ? <Text style={[styles.scoreMeta, { marginTop: 4 }]}>👤 {userName}</Text> : null}
              </Card>

              {results.map((item, i) => {
                if (!item) return null;
                return (
                  <View
                    key={i}
                    style={[styles.resultRow, { borderLeftColor: item.correct ? C.success : C.danger }]}
                  >
                    <View style={styles.resultHeader}>
                      <Text style={styles.resultNum}>{i + 1}</Text>
                      <Text style={[styles.resultMark, { color: item.correct ? C.success : C.danger }]}>
                        {item.correct ? '✅' : '❌'}
                      </Text>
                      <Text style={styles.resultTime}>⏱ {formatTime(item.time)}</Text>
                    </View>
                    <Text style={styles.resultQ}>{item.q}</Text>
                    {!item.correct && (
                      <>
                        <Text style={[styles.resultQ, { color: C.danger, marginTop: 4 }]}>
                          Ваш ответ: {String(item.userAnswer || '—')}
                        </Text>
                        <Text style={[styles.resultQ, { color: C.success, marginTop: 2 }]}>
                          Правильный ответ: {(() => {
                            const q = questions[i];
                            if (!q) return '—';
                            if (q.type === 'multi') {
                              return (q.a || []).map(idx => q.opts[parseInt(idx, 10)]).join(', ');
                            }
                            return String(q.a);
                          })()}
                        </Text>
                      </>
                    )}
                  </View>
                );
              })}
            </ScrollView>

            <View style={styles.resultsActions}>


              <Btn onPress={handleShareResultStatus} style={{ marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="share-social" size={20} color="#fff" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#fff', fontWeight: '700' }}>Поделиться результатом</Text>
                </View>
              </Btn>

              <Btn
                label="К списку тестов"
                variant="black"
                style={{ borderColor: C.accent }}
                onPress={() => {
                  refreshStudentLibrary();
                  setScreen('student-library');
                }}
              />
            </View>
          </View>
        );
      }



      if (screen === 'add-test') {
        return (
          <View style={safeStyle}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10 }}>
              {renderHeader(
                "Загрузка тестов",
                () => { setScreen('student-library'); }
              )}
            </View>

            <KeyboardAvoidingView
              style={styles.flex}
              behavior="padding"
            >
              <View style={[L.halfBottom, { justifyContent: 'center' }]}>
                <Text style={[styles.welcomeDesc, { marginBottom: 20 }]}>
                  Вы можете импортировать файл .dat с вашего устройства или загрузить его по прямой ссылке.
                </Text>

                <Btn
                  label="📄 Импортировать с устройства (.dat)"
                  onPress={handleFileImport}
                />

                <View style={L.divider}>
                  <View style={L.dividerLine} />
                  <Text style={L.dividerText}>ИЛИ</Text>
                  <View style={L.dividerLine} />
                </View>

                <View style={{ gap: 8 }}>
                  <TextInput
                    style={styles.input}
                    placeholder="https://example.com/quiz.dat"
                    placeholderTextColor={C.textDisabled}
                    value={fileUrl}
                    onChangeText={setFileUrl}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                  <Btn
                    label="🔗 Загрузить по ссылке"
                    onPress={() => handleUrlImport(fileUrl)}
                    disabled={!fileUrl.trim()}
                  />
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        );
      }

      if (screen === 'cloud-manager') {
        return (
          <View style={safeStyle}>
            <StatusBar barStyle="light-content" backgroundColor={C.bg} />
            {renderHeader(
              "Облако (GitHub)",
              () => setScreen('teacher-library')
            )}
            {!teacherProfile?.token ? (
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
                <Ionicons name="cloud-offline-outline" size={80} color={C.textDisabled} />
                <Text style={[styles.welcomeTitle, { marginTop: 20 }]}>Вход не выполнен</Text>
                <Text style={[styles.welcomeDesc, { marginBottom: 30 }]}>
                  Для управления облачными тестами необходимо авторизоваться в GitHub через настройки вашего профиля.
                </Text>
                <Btn
                  label="Перейти в профиль"
                  onPress={() => setScreen('teacher-profile')}
                  variant="gold"
                  style={{ paddingHorizontal: 32 }}
                />
              </View>
            ) : (
              <View style={L.libraryWrap}>
                <Text style={[styles.welcomeDesc, { marginBottom: 16, textAlign: 'left' }]}>
                  Здесь отображаются все тесты, находящиеся в репозитории GitHub. Вы можете удалить их отсюда, даже если у вас нет локальной копии. При редактировании файла на этом экране он будет автоматически перезаписан в облаке.
                </Text>
                <FlatList
                  data={cloudRegistry.filter(item => item.authorId === teacherProfile?.owner)}
                  keyExtractor={(item) => item.id}
                  ListEmptyComponent={<Text style={styles.welcomeDesc}>В облаке пусто.</Text>}
                  renderItem={({ item }) => {
                    if (!item || !item.id || !item.title) return null;
                    return (
                      <View style={styles.libraryRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.libraryTitle}>{item.title}</Text>
                          <Text style={styles.libraryMeta}>
                            ID: {item.id} | Вопросов: {item.qCount}
                          </Text>
                        </View>
                        <TouchableOpacity
                          onPress={() => handleOpenCloudFileEditor(item)}
                          style={styles.fileActionBtn}
                        >
                          <Ionicons name="create-outline" size={24} color={C.accent} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleUnpublishFromCloud({ name: item.fileName })}
                          style={[styles.deleteBtn, { opacity: loading ? 0.5 : 1 }]}
                          disabled={!!loading}
                          accessibilityState={{ disabled: !!loading }}
                        >
                          {loading ? (
                            <ActivityIndicator size="small" color="#fff" />
                          ) : (
                            <Text style={styles.deleteBtnText}>🗑</Text>
                          )}
                        </TouchableOpacity>
                      </View>
                    );
                  }}
                />
              </View>
            )}
          </View>
        );
      }
      return null;
    } catch (error) {
      console.error("Render Error:", error);
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24, backgroundColor: '#1a1a2e' }}>
          <Text style={{ color: '#ff4d4d', fontSize: 16, fontWeight: '700', marginBottom: 8 }}>🔴 Ошибка рендера (screen: "{screen}")</Text>
          <Text style={{ color: '#fff', fontSize: 13, textAlign: 'center' }}>{error.message}</Text>
        </View>
      );
    }
  };

  return (
    <View style={{ flex: 1 }}>
      {renderContent()}
      <HelpModal
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
        type={helpType}
        config={config}
      />
      {renderSmartActionModal()}
    </View>
  );
}

// ─────────────────────────────────────────────
// LOCAL STYLES
// ─────────────────────────────────────────────
const L = StyleSheet.create({
  halfBottom: {
    flex: 1,
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 32,
  },
  libraryWrap: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 24,
  },
  backBtn: {
    paddingVertical: 10,
    paddingRight: 16,
    minWidth: 90,
    justifyContent: 'center',
  },
  backBtnText: {
    color: C.accent,
    fontSize: 20,
    fontWeight: '700',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.textPrimary,
    textAlign: 'center',
  },
  quizBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  navBtn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  navBtnText: {
    color: C.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  abortBtn: {
    marginTop: 8,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: C.danger,
    backgroundColor: 'transparent',
  },
  abortBtnText: {
    color: C.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  divider: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
  },
  dividerText: {
    marginHorizontal: 10,
    color: C.textDisabled,
    fontSize: 12,
  },
});