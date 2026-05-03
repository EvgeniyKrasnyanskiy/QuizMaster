// src/utils.js
import { SECURITY_CONFIG } from './constants';

const generateRandomKey = (length = 16) => {
  const charset = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += charset.charAt(Math.floor(Math.random() * charset.length));
  }
  return result;
};

// Базовый XOR (оставляем для совместимости внутри новых функций)
export const applyXOR = (input, key) => {
  let output = '';
  for (let i = 0; i < input.length; i++) {
    output += String.fromCharCode(input.charCodeAt(i) ^ key.charCodeAt(i % key.length));
  }
  return output;
};

const stringToHex = (str) => {
  let hex = '';
  for (let i = 0; i < str.length; i++) {
    hex += str.charCodeAt(i).toString(16).padStart(4, '0');
  }
  return hex;
};

const hexToString = (hex) => {
  let str = '';
  for (let i = 0; i < hex.length; i += 4) {
    str += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
  }
  return str;
};

// Новая версия ЭКСПОРТА (без передачи ключа снаружи)
export const encodeEncryptedPayload = (plainText) => {
  const dynamicPart = generateRandomKey(16);
  const fullKey = dynamicPart + SECURITY_CONFIG.SALT;
  const encrypted = applyXOR(plainText, fullKey);
  return stringToHex(dynamicPart) + stringToHex(encrypted);
};

// Новая версия ДЕШИФРОВАНИЯ (без передачи ключа снаружи)
export const decodeEncryptedPayload = (payload) => {
  const normalized = payload.trim();
  if (normalized.length < 64 || !/^[0-9a-f]+$/i.test(normalized)) {
    return normalized; 
  }
  try {
    const dynamicPart = hexToString(normalized.slice(0, 64));
    const fullKey = dynamicPart + SECURITY_CONFIG.SALT;
    const encryptedData = hexToString(normalized.slice(64));
    return applyXOR(encryptedData, fullKey);
  } catch (e) {
    console.error("Decoding error:", e);
    return normalized;
  }
};

export const formatTime = (sec) => {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
};

export const stripDatExtension = (name) => (name || '').replace(/\.dat$/i, '');

export const buildQuizProgressKey = (fileName, author = '') => {
  const prefix = author ? `${author}_` : '';
  return `quiz-progress:${prefix}${stripDatExtension(fileName)}`;
};
export const buildQuizStatusKey = (fileName, author = '') => {
  const prefix = author ? `${author}_` : '';
  return `quiz-status:${prefix}${stripDatExtension(fileName)}`;
};

export const formatNiceDate = (dateLike) => {
  if (!dateLike) return '—';
  const date = new Date(dateLike);
  if (Number.isNaN(date.getTime())) return '—';
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yy = String(date.getFullYear()).slice(-2);
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm}.${yy} ${hh}:${min}`;
};

export const getStoredQuizMeta = (fileName) => {
  const clean = stripDatExtension(fileName);
  const match = clean.match(/^(.*)_(\d{2})(\d{2})(\d{4})_(\d{2})(\d{2})(\d{2})$/);
  if (!match) {
    return { originalTitle: clean, createdAt: null };
  }
  const [, original, dd, mm, yyyy, hh, min, ss] = match;
  const createdAt = new Date(`${yyyy}-${mm}-${dd}T${hh}:${min}:${ss}`);
  return {
    originalTitle: original || clean,
    createdAt: Number.isNaN(createdAt.getTime()) ? null : createdAt.toISOString(),
  };
};

export const QUIZ_TEMPLATE = [
  'M;Пример вопроса с выбором;Вариант 1;Вариант 2;Вариант 3;Вариант 4;1',
  'T;Пример текстового вопроса;Введите краткий ответ;ответ',
].join('\n');

export const buildCleanReportText = ({
  title,
  testFileName,
  userName,
  totalTime,
  results,
  questionsLength,
}) => {
  const score = results.filter(r => r && r.correct).length;
  const total = questionsLength;
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;

  let text = 'РЕЗУЛЬТАТЫ ТЕСТИРОВАНИЯ\n';
  text += '-----------------------------\n';
  text += `Тест: ${title}\n`;
  text += `Файл: ${testFileName}\n`;
  text += `Студент: ${userName || 'Не указан'}\n`;
  text += `Дата: ${new Date().toLocaleString('ru-RU')}\n`;
  text += '-----------------------------\n';
  text += `Результат: ${score} / ${total} (${percent}%)\n`;
  text += `Статус: ${percent >= 60 ? 'ПРОЙДЕН' : 'НЕ ПРОЙДЕН'}\n`;
  text += `Время: ${formatTime(totalTime)}\n`;
  text += '-----------------------------\n\n';
  text += 'ДЕТАЛЬНЫЙ ЛОГ ОТВЕТОВ:\n\n';

  results.forEach((r, i) => {
    if (!r) return;
    text += `${i + 1}. ${r.q}\n`;
    text += `   Ответ: ${r.userAnswer || '—'}\n`;
    text += `   Итог: ${r.correct ? 'Верно' : 'Неверно'}\n`;
    text += `   Время: ${formatTime(r.time)}\n\n`;
  });

  return text;
};

// --- ПАРСЕР (обязательно должен быть экспортирован) ---
const splitSemicolonLine = (line) => {
  const parts = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const next = line[i + 1];
    if (char === '"') {
      if (inQuotes && next === '"') { current += '"'; i++; } 
      else { inQuotes = !inQuotes; }
      continue;
    }
    if (char === ';' && !inQuotes) {
      parts.push(current.trim());
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current.trim());
  return parts;
};

export const parseQuestions = (csvText) => {
  const normalized = (csvText || '').replace(/^\uFEFF/, '');
  const lines = normalized.split(/\r?\n/).map(l => l.trim()).filter(l => l !== '');

  return lines.map((line, index) => {
    // Агрессивная очистка от невидимых символов
    const cleanLine = line.replace(/[\x00-\x1F\x7F-\x9F]/g, "").trim();
    if (!cleanLine || cleanLine.startsWith('METADATA=')) {
      return null;
    }

    const parts = splitSemicolonLine(cleanLine);
    const rowType = parts[0];

    if (rowType === 'M') {
      if (parts.length < 4 || !parts[1]) {
        console.log(`[PARSER] Skipping invalid M-line at ${index + 1}`);
        return null;
      }
      
      const options = [];
      for (let i = 2; i < parts.length - 1; i++) {
        if (parts[i]) options.push(parts[i]);
      }

      if (options.length < 2) return null;

      const answers = (parts[parts.length - 1] || "").split(',')
        .map(v => v.trim())
        .filter(Boolean)
        .map(v => {
          const val = parseInt(v, 10);
          return isNaN(val) ? null : String(val - 1);
        })
        .filter(v => v !== null);

      if (answers.length === 0) return null;
      return { type: 'multi', q: parts[1], opts: options, a: [...new Set(answers)] };
    }

    if (rowType === 'T') {
      if (parts.length < 4 || !parts[1] || typeof parts[3] !== 'string' || parts[3].trim() === '') {
        return null;
      }
      return { type: 'text', q: parts[1], hint: parts[2], a: parts[3] };
    }

    // Просто пропускаем неизвестные типы строк (например, пустые или комментарии)
    return null;
  }).filter(Boolean);
};