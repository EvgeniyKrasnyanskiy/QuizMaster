import { useState, useCallback } from 'react';
import { Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CACHE_KEYS, QUIZ_DIRS } from '../constants';
import { 
  stripDatExtension, 
  getStoredQuizMeta, 
  buildQuizStatusKey, 
  buildQuizProgressKey,
  decodeEncryptedPayload,
  encodeEncryptedPayload,
  QUIZ_TEMPLATE
} from '../utils';

const SafeDirs = QUIZ_DIRS || { ROOT: '', STUDENT: '', TEACHER: '', DOWNLOADS: '' };

export const useLibraryManager = ({ config, teacherProfile, subscriptions, setLoading }) => {
  const [studentLibraryFiles, setStudentLibraryFiles] = useState([]);
  const [teacherLibraryFiles, setTeacherLibraryFiles] = useState([]);

  const ensureQuizDirectories = async () => {
    try {
      for (const dir of Object.values(SafeDirs)) {
        if (!dir) continue;
        const dirInfo = await FileSystem.getInfoAsync(dir);
        if (!dirInfo.exists) {
          await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        }
      }
    } catch (error) {
      console.warn("Failed to create directories:", error);
    }
  };

  const getActiveTeacherDir = useCallback(() => {
    const owner = teacherProfile?.owner || 'local';
    return `${SafeDirs.TEACHER}${owner}/`;
  }, [teacherProfile]);

  const initDemoQuiz = async () => {
    try {
      const demoPath = SafeDirs.STUDENT + 'demo_test.dat';
      const demoInfo = await FileSystem.getInfoAsync(demoPath);
      if (!demoInfo.exists) {
        const demoContent = [
          'METADATA=title:Демонстрационный тест;author:System',
          'M;Какая планета третья от Солнца?;Венера;Земля;Марс;Юпитер;2',
          'T;Сколько будет 2 + 2 * 2?;Подсказка: сначала умножение;6',
          'M;Выберите цвета светофора;Красный;Синий;Желтый;Зеленый;1,3,4'
        ].join('\n');
        
        // Use encodeEncryptedPayload to safely encrypt
        const encrypted = encodeEncryptedPayload(demoContent);
        await FileSystem.writeAsStringAsync(demoPath, encrypted);
      }
    } catch (error) {
      console.warn("Failed to init demo quiz:", error);
    }
  };

  const refreshStudentLibrary = useCallback(async () => {
    try {
      const studentFilesRaw = await FileSystem.readDirectoryAsync(SafeDirs.STUDENT);
      const studentFiles = studentFilesRaw.filter(f => f.endsWith('.dat'));

      const library = [];
      const now = Date.now();
      const statusMap = {};
      const completedIdsRaw = await AsyncStorage.getItem(CACHE_KEYS.COMPLETED_IDS);
      let completedIds = completedIdsRaw ? JSON.parse(completedIdsRaw) : [];
      let completedUpdated = false;

      // 1. Local Student Files
      for (const file of studentFiles) {
        const path = SafeDirs.STUDENT + file;
        const info = await FileSystem.getInfoAsync(path);
        const meta = getStoredQuizMeta(file);

        let status = null;
        try {
          const statusRaw = await AsyncStorage.getItem(buildQuizStatusKey(file));
          if (statusRaw) status = JSON.parse(statusRaw);
        } catch { }

        statusMap[path] = status || {};

        if (status?.completedAt) {
          const id = `System_${stripDatExtension(file)}`;
          if (!completedIds.includes(id)) {
            completedIds.push(id);
            completedUpdated = true;
          }
        }

        library.push({
          name: file,
          displayName: meta.originalTitle,
          path,
          size: info.size,
          mtime: info.modificationTime,
          createdAt: meta.createdAt,
          authorId: 'System' // Demo test is system
        });
      }

      // 2. Downloaded (Cloud) Files
      const downloadsDirInfo = await FileSystem.getInfoAsync(SafeDirs.DOWNLOADS);
      if (downloadsDirInfo.exists) {
        const authorFolders = await FileSystem.readDirectoryAsync(SafeDirs.DOWNLOADS);
        const subIds = (subscriptions || []).map(s => s.owner.toLowerCase());

        for (const authorFolder of authorFolders) {
          if (!subIds.includes(authorFolder.toLowerCase())) continue;

          const authorDir = `${SafeDirs.DOWNLOADS}${authorFolder}/`;
          const dirInfo = await FileSystem.getInfoAsync(authorDir);
          if (!dirInfo.isDirectory) continue;

          const files = await FileSystem.readDirectoryAsync(authorDir);
          for (const file of files) {
            if (!file.endsWith('.dat')) continue;

            const path = authorDir + file;
            const info = await FileSystem.getInfoAsync(path);
            const meta = getStoredQuizMeta(file);

            let status = null;
            try {
              const statusRaw = await AsyncStorage.getItem(buildQuizStatusKey(file, authorFolder));
              if (statusRaw) status = JSON.parse(statusRaw);
            } catch { }

            if (status) {
              const COOLDOWN_MS = config?.TEST_COOLDOWN_MS || 0;
              if (status.completedAt && COOLDOWN_MS > 0 && (now - status.completedAt < COOLDOWN_MS)) {
                status.isLocked = status.completedAt + COOLDOWN_MS;
              } else {
                status.isLocked = false;
              }
            } else {
              status = { isLocked: false };
            }

            try {
              const progressRaw = await AsyncStorage.getItem(buildQuizProgressKey(file, authorFolder));
              status.hasProgress = !!progressRaw;
            } catch { }

            statusMap[path] = status;

            if (status.completedAt || (Array.isArray(status.results) && status.results.length > 0)) {
              const id = `${authorFolder}_${stripDatExtension(file)}`;
              if (!completedIds.includes(id)) {
                completedIds.push(id);
                completedUpdated = true;
              }
            }

            library.push({
              name: file,
              displayName: meta.originalTitle,
              path,
              size: info.size,
              mtime: info.modificationTime,
              createdAt: meta.createdAt,
              authorId: authorFolder
            });
          }
        }
      }

      if (completedUpdated) {
        await AsyncStorage.setItem(CACHE_KEYS.COMPLETED_IDS, JSON.stringify(completedIds));
      }

      const sorted = library.sort((a, b) => {
        const tA = new Date(a.createdAt || a.mtime * 1000).getTime();
        const tB = new Date(b.createdAt || b.mtime * 1000).getTime();
        return tB - tA;
      });

      setStudentLibraryFiles(sorted);
      return sorted;
    } catch (error) {
      console.warn('Failed to load student files:', error);
      return [];
    }
  }, [config, subscriptions]);

  const refreshTeacherLibrary = useCallback(async () => {
    try {
      const dir = getActiveTeacherDir();
      const dirInfo = await FileSystem.getInfoAsync(dir);
      if (!dirInfo.exists) {
        await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
        setTeacherLibraryFiles([]);
        return [];
      }

      const rawFiles = await FileSystem.readDirectoryAsync(dir);
      const datFiles = rawFiles.filter(f => f.endsWith('.dat'));
      const library = [];

      for (const file of datFiles) {
        const path = dir + file;
        const info = await FileSystem.getInfoAsync(path);
        const meta = getStoredQuizMeta(file);

        let qCount = 0;
        try {
          const content = await FileSystem.readAsStringAsync(path);
          const decrypted = decodeEncryptedPayload(content);
          // Simple count for performance
          qCount = decrypted.split('\n').filter(l => l.startsWith('M;') || l.startsWith('T;')).length;
        } catch { }

        library.push({
          name: file,
          displayName: meta.originalTitle,
          path,
          size: info.size,
          mtime: info.modificationTime,
          createdAt: meta.createdAt,
          canEdit: true,
          questionCount: qCount
        });
      }

      const sorted = library.sort((a, b) => {
        const tA = new Date(a.createdAt || a.mtime * 1000).getTime();
        const tB = new Date(b.createdAt || b.mtime * 1000).getTime();
        return tB - tA;
      });
      setTeacherLibraryFiles(sorted);
      return sorted;
    } catch (error) {
      console.warn('Failed to load teacher files:', error);
      return [];
    }
  }, [getActiveTeacherDir]);

  return {
    studentLibraryFiles,
    teacherLibraryFiles,
    ensureQuizDirectories,
    initDemoQuiz,
    refreshStudentLibrary,
    refreshTeacherLibrary,
    getActiveTeacherDir
  };
};
