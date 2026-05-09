import React from 'react';
import { View, Text, Modal, ScrollView, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../constants';
import { styles } from '../styles';
import { Btn } from './Btn';

export const HelpModal = ({ visible, onClose, type = 'student', config = {} }) => {
  const isTeacher = type === 'teacher';
  const isTemplate = type === 'template';

  const getReadableCooldown = (ms) => {
    if (!ms || ms === 0) return "без ограничений";
    if (ms === 3600000) return "1 час";
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins} мин.`;
    const hours = Math.round((ms / 3600000) * 10) / 10;
    return `${hours} ч.`;
  };

  const cooldownText = getReadableCooldown(config.TEST_COOLDOWN_MS);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.helpCard}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              {isTemplate ? 'Шаблон CSV/TXT' : (isTeacher ? 'Справка: Режим учителя' : 'Справка: Режим ученика')}
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Ionicons name="close" size={24} color={C.textSecondary} />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {isTemplate ? (
              <View>
                <Text style={[styles.helpText, { fontWeight: '700', color: C.accent, marginBottom: 8 }]}>Формат строк (CSV/TXT):</Text>

                <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, marginBottom: 12 }}>
                  <Text style={{ fontWeight: '700', color: C.white, marginBottom: 4 }}>M — Множественный выбор</Text>
                  <Text style={{ color: C.textDisabled, fontSize: 12, fontStyle: 'italic', marginBottom: 4 }}>
                    M;Вопрос;Вариант1;Вариант2;...;ПравильныйНомер
                  </Text>
                  <Text style={{ color: C.textSecondary, fontSize: 13 }}>
                    Пример: <Text style={{ color: C.success }}>M;2+2=?;3;4;5;2</Text>
                  </Text>
                </View>

                <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 10, marginBottom: 12 }}>
                  <Text style={{ fontWeight: '700', color: C.white, marginBottom: 4 }}>T — Свободный ответ</Text>
                  <Text style={{ color: C.textDisabled, fontSize: 12, fontStyle: 'italic', marginBottom: 4 }}>
                    T;Вопрос;Подсказка;ПравильныйТекст
                  </Text>
                  <Text style={{ color: C.textSecondary, fontSize: 13 }}>
                    Пример: <Text style={{ color: C.success }}>T;Столица РФ;Город;Москва</Text>
                  </Text>
                </View>

                <Text style={[styles.helpText, { fontSize: 13, color: C.textDisabled, lineHeight: 18 }]}>
                  • Разделитель: <Text style={{ color: C.white, fontWeight: '700' }}>;</Text> (точка с запятой).{"\n"}
                  • В типе M номер правильного ответа начинается с <Text style={{ color: C.white, fontWeight: '700' }}>1</Text>.{"\n"}
                  • Сохраняйте файл в кодировке <Text style={{ color: C.white, fontWeight: '700' }}>UTF-8</Text>.
                </Text>
              </View>
            ) : isTeacher ? (
              <View>
                <Text style={styles.helpText}>
                  • <Text style={{ fontWeight: '700' }}>Профиль:</Text> Настройте GitHub-профиль для хранения ваших тестов. Вам понадобится: Username, Название репозитория (например, 'quizzes') и Personal Access Token (PAT).
                </Text>
                <Text style={styles.helpText}>
                  <Ionicons name="key-outline" size={14} color={C.accent} /> <Text style={{ fontWeight: '600', color: C.accent }}>Token:</Text> Создайте токен в настройках GitHub {"(Developer Settings -> Tokens)"} с правами <Text style={{ fontWeight: '700' }}>repo</Text>.
                </Text>
                <Text style={styles.helpText}>
                  • <Text style={{ fontWeight: '700' }}>Облако (GitHub API):</Text> Система синхронизирует тесты через ваш репозиторий. Все изменения в нём отслеживаются автоматически.
                </Text>
                <Text style={styles.helpText}>
                  • <Text style={{ fontWeight: '700' }}>Имена файлов:</Text> Используйте только латиницу и цифры. Кириллица запрещена для стабильности ссылок в облаке.
                </Text>
                <Text style={styles.helpText}>
                  • <Text style={{ fontWeight: '700' }}>Публикация:</Text> Тесты загружаются в ваш личный репозиторий. Ученики смогут скачивать их, если подпишутся на ваш Username.
                </Text>
                <Text style={styles.helpText}>
                  <Ionicons name="information-circle-outline" size={14} color={C.accent} /> <Text style={{ fontWeight: '600', color: C.accent }}>Форматы:</Text> Вы можете импортировать <Text style={{ fontWeight: '700' }}>CSV</Text> или <Text style={{ fontWeight: '700' }}>TXT</Text> файлы для автоматического шифрования в <Text style={{ color: C.success }}>.dat</Text>.
                </Text>
                <Text style={[styles.helpText, { marginTop: 8 }]}>
                  • <Text style={{ fontWeight: '700' }}>Управление:</Text> Вы можете редактировать тесты прямо в приложении. Облачные тесты обновляются на GitHub при сохранении.
                </Text>
              </View>
            ) : (
              <View>
                <Text style={styles.helpText}>
                  • <Text style={{ fontWeight: '700' }}>Подписки:</Text> Вы можете подписываться на разных учителей по их GitHub Username. Все тесты будут сгруппированы по авторам.
                </Text>
                <Text style={styles.helpText}>
                  • <Text style={{ fontWeight: '700' }}>Правила:</Text> Повторное прохождение доступно через: <Text style={{ fontWeight: '700', color: C.accent }}>{cooldownText}</Text>. Таймер обновляется автоматически.
                </Text>
                <Text style={styles.helpText}>
                  • <Text style={{ fontWeight: '700' }}>Прогресс:</Text> Приложение сохраняет ваш прогресс. Если вы выйдете, сможете продолжить с того же вопроса.
                </Text>
                <Text style={styles.helpText}>
                  • <Text style={{ fontWeight: '700' }}>Заполнение:</Text> Обязательно ответьте на все вопросы. В конце можно отправить отчет учителю.
                </Text>
              </View>
            )}
          </ScrollView>

          <Btn label="Понятно" onPress={onClose} style={{ marginTop: 20 }} />
        </View>
      </View>
    </Modal>
  );
};
