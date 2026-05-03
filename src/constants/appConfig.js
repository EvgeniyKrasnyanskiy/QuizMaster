import { GITHUB_TOKEN, GITHUB_OWNER, GITHUB_REPO, APP_SALT as _APP_SALT, ADMIN_CODE } from '@env';
export const APP_SALT = _APP_SALT;
import * as FileSystem from 'expo-file-system/legacy';

export const APP_VERSION = '1.2.0';
export const FALLBACK_APP_SALT = 'Quiz_Secure_Salt_v20260428';

export const COOLDOWN_SETTINGS = {
  HOURS: 1,
  MS: 1 * 60 * 60 * 1000,
};

export const API_TIMEOUT = 10000;

const _QUIZ_DIRS = {
  get ROOT() { return `${FileSystem.documentDirectory || ''}Quizzes/`; },
  get STUDENT() { return `${FileSystem.documentDirectory || ''}Quizzes/Student/`; },
  get TEACHER() { return `${FileSystem.documentDirectory || ''}Quizzes/Teacher/`; },
  get DOWNLOADS() { return `${FileSystem.documentDirectory || ''}Quizzes/Downloads/`; },
};
export { _QUIZ_DIRS as QUIZ_DIRS };

const _CACHE_KEYS = {
  CONFIG: 'quiz-config-cache-v1',
  COMPLETED_IDS: 'completed-tests-ids',
  SEEN_TESTS: 'seen-tests',
  TRACKING: 'test_completions.json',
  SUBSCRIPTIONS: 'app-subscriptions',
  TEACHER_PROFILE: 'teacher-profile',
  HIDDEN_TESTS: 'hidden-tests',
};
export { _CACHE_KEYS as CACHE_KEYS };

const _FILES = {
  get TRACKING_FILE() { return `${FileSystem.documentDirectory || ''}/${_CACHE_KEYS.TRACKING}`; },
};
export { _FILES as FILES };

const _GITHUB_CONFIG = {
  get TOKEN() { return GITHUB_TOKEN || ''; },
  get OWNER() { return GITHUB_OWNER || ''; },
  get REPO() { return GITHUB_REPO || ''; },
  get REGISTRY_PATH() { return 'registry.json'; },
  get CLOUD_TESTS_DIR() { return 'tests'; },
  get disabled() { return false; },
  get API_BASE() {
    return `https://api.github.com/repos/${this.OWNER || ''}/${this.REPO || ''}/contents`;
  },
  get CONFIG_URL() {
    return 'https://raw.githubusercontent.com/EvgeniyKrasnyanskiy/quiz-app-data/refs/heads/main/quiz-config.json';
  },
};
export { _GITHUB_CONFIG as GITHUB_CONFIG };

const _MASTER_TEACHER = {
  id: 'master',
  name: 'Master-Teacher',
  get owner() { return GITHUB_OWNER; },
  get repo() { return GITHUB_REPO; },
  get password() { return '777'; },
  isMaster: true,
};
export { _MASTER_TEACHER as MASTER_TEACHER };

export const LOCAL_TEACHER_NAME = 'Тесты из памяти устройства';

const _API_ENDPOINTS = {
  get GITHUB_API_BASE() { return _GITHUB_CONFIG.API_BASE; },
  get CONFIG_URL() { return _GITHUB_CONFIG.CONFIG_URL; },
};
export { _API_ENDPOINTS as API_ENDPOINTS };

const _SECURITY_CONFIG = {
  get SALT() { return APP_SALT || FALLBACK_APP_SALT; },
  get ADMIN_CODE() { return ADMIN_CODE || '777'; },
};
export { _SECURITY_CONFIG as SECURITY_CONFIG };

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
  get adminCode() { return _SECURITY_CONFIG.ADMIN_CODE; },
  welcomeDesc: 'Профессиональная система тестирования знаний.',
  loadingDesc: 'Выберите файл теста (.dat) на устройстве или вставьте прямую ссылку для загрузки.',
  reportEmail: '',
  allowedQuizHosts: ['raw.githubusercontent.com', 'google.com'],
  maxQuizFileBytes: 524288,
  remoteFetchTimeoutMs: 10000,
  TEST_COOLDOWN_MS: 3600000,
  disabled: false,
};

export const MASTER_SOURCE_URL = 'https://raw.githubusercontent.com/EvgeniyKrasnyanskiy/quiz-app-data/refs/heads/main/tests/';
