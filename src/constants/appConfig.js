import { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO } from '@env';
import * as FileSystem from 'expo-file-system/legacy';

export const APP_VERSION = '1.2.0';

export const COOLDOWN_SETTINGS = {
  HOURS: 1,
  MS: 1 * 60 * 60 * 1000,
};

export const API_TIMEOUT = 5000;

export const QUIZ_DIRS = {
  ROOT: `${FileSystem.documentDirectory}Quizzes/`,
  STUDENT: `${FileSystem.documentDirectory}Quizzes/Student/`,
  TEACHER: `${FileSystem.documentDirectory}Quizzes/Teacher/`,
};

export const CACHE_KEYS = {
  CONFIG: 'quiz-config-cache-v1',
  COMPLETED_IDS: 'completed-tests-ids',
  SEEN_TESTS: 'seen-tests',
  TRACKING: 'test_completions.json',
  SUBSCRIPTIONS: 'app-subscriptions',
  TEACHER_PROFILE: 'teacher-profile',
  HIDDEN_TESTS: 'hidden-tests',
};

export const FILES = {
  TRACKING_FILE: `${FileSystem.documentDirectory}${CACHE_KEYS.TRACKING}`,
};

export const GITHUB_CONFIG = {
  TOKEN: GITHUB_TOKEN,
  OWNER: GITHUB_OWNER,
  REPO: GITHUB_REPO,
  REGISTRY_PATH: 'registry.json',
  CLOUD_TESTS_DIR: 'tests',
  API_BASE: `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents`,
  CONFIG_URL: 'https://raw.githubusercontent.com/EvgeniyKrasnyanskiy/quiz-app-data/refs/heads/main/quiz-config.json',
};

export const MASTER_TEACHER = {
  id: 'master',
  name: 'Master-Teacher',
  owner: GITHUB_OWNER,
  repo: GITHUB_REPO,
  isMaster: true,
};

export const LOCAL_TEACHER_NAME = 'Тесты из памяти устройства';

export const API_ENDPOINTS = {
  GITHUB_API_BASE: GITHUB_CONFIG.API_BASE,
  CONFIG_URL: GITHUB_CONFIG.CONFIG_URL,
};

export const APP_METADATA = {
  VERSION: APP_VERSION,
  COOLDOWN: `${COOLDOWN_SETTINGS.HOURS}h`,
  MAX_FILE_SIZE: '512KB' // This is just for display, the actual limit is in DEFAULT_CONFIG
};

export const DEFAULT_ALLOWED_CONTENT_TYPES = [
  'text/plain',
  'text/csv',
  'application/octet-stream',
  'application/text',
];

export const SYNCABLE_CONFIG_KEYS = [
  'title',
  'welcomeDesc',
  'loadingDesc',
  'prestartText',
  'adminCode',
  'reportEmail',
  'allowedQuizHosts',
  'maxQuizFileBytes',
  'remoteFetchTimeoutMs',
  'TEST_COOLDOWN_MS',
];

export const DEFAULT_CONFIG = {
  title: 'Simple Quiz Platform',
  adminCode: '777',
  welcomeDesc: 'Профессиональная система тестирования знаний.',
  loadingDesc: 'Выберите файл теста (.dat) на устройстве или вставьте прямую ссылку для загрузки.',
  reportEmail: '',
  allowedQuizHosts: ['raw.githubusercontent.com', 'google.com'],
  maxQuizFileBytes: 524288,
  remoteFetchTimeoutMs: 5000,
  TEST_COOLDOWN_MS: 3600000,
};
