import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StatusBar, Alert, ActivityIndicator, Modal, Platform, ToastAndroid
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { styles } from '../styles';
import { C, CACHE_KEYS, API_TIMEOUT } from '../constants';

const Card = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

const ConfigItem = ({ label, value, editable, onChange, multiline, style, placeholder, keyboardType, secureTextEntry }) => (
  <View style={[{ marginBottom: 12 }, style]}>
    <Text style={[styles.label, { marginBottom: 4, fontSize: 12, color: C.textSecondary }]}>{label}</Text>
    {editable ? (
      <TextInput
        style={[styles.input, { marginBottom: 0, paddingVertical: multiline ? 8 : 4, height: multiline ? 80 : 40, backgroundColor: 'rgba(255,255,255,0.05)' }]}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        placeholder={placeholder}
        placeholderTextColor={C.textDisabled}
        keyboardType={keyboardType || 'default'}
        secureTextEntry={secureTextEntry}
      />
    ) : (
      <Text style={{ color: C.textPrimary, fontSize: 14, fontWeight: '500' }}>{secureTextEntry && value ? '••••' : (value || '—')}</Text>
    )}
  </View>
);

const Btn = ({ label, onPress, variant = 'primary', loading = false, style, textStyle }) => (
  <TouchableOpacity
    onPress={onPress}
    disabled={!!loading}
    accessibilityState={{ disabled: !!loading }}
    style={[
      styles.btn,
      variant === 'black' && { backgroundColor: '#111' },
      style
    ]}
  >
    {loading ? (
      <ActivityIndicator color="#fff" />
    ) : (
      <Text style={[styles.btnText, textStyle]}>{label}</Text>
    )}
  </TouchableOpacity>
);

export default function TeacherProfileScreen({
  teacherProfile,
  setTeacherProfile,
  onBack,
  title,
  apiTimeout,
  config,
  updateConfig,
  loadConfig
}) {
  const [loading, setLoading] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [configLoading, setConfigLoading] = useState(false);

  const [tempProfile, setTempProfile] = useState({
    owner: teacherProfile?.owner || '',
    repo: teacherProfile?.repo || '',
    token: teacherProfile?.token || ''
  });

  const [tempConfig, setTempConfig] = useState({ ...config });

  const isMasterAdmin = teacherProfile?.owner === 'EvgeniyKrasnyanskiy';
  const isConnected = !!teacherProfile;

  const validateAndSaveProfile = async () => {
    const { owner, repo, token } = tempProfile;

    if (isConnected) {
      setLoading(true);
      try {
        const url = `https://api.github.com/repos/${owner}/${repo}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), apiTimeout || API_TIMEOUT);
        let response;
        try {
          response = await fetch(url, {
            method: 'GET',
            headers: {
              'Authorization': `token ${token}`,
              'Accept': 'application/vnd.github.v3+json',
            },
            signal: controller.signal
          });
        } finally {
          clearTimeout(timeoutId);
        }
        if (response.status === 200) {
          if (Platform.OS === 'android') {
            ToastAndroid.show("Соединение активно ✅", ToastAndroid.SHORT);
          } else {
            Alert.alert("Статус", "Соединение активно и проверено ✅");
          }
        } else {
          Alert.alert("Ошибка", "Не удалось подтвердить соединение. Возможно, токен отозван.");
          handleReset(); // Предлагаем сбросить, если соединение протухло
        }
      } catch (e) {
        const msg = e.name === 'AbortError' ? 'Request timed out. Please check your internet connection.' : e.message;
        Alert.alert("Ошибка сети", msg);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!owner || !repo || !token) {
      Alert.alert("Ошибка", "Все поля (Username, Repo, Token) обязательны для заполнения.");
      return;
    }

    setLoading(true);
    try {
      // 1. Проверяем сам репозиторий
      const url = `https://api.github.com/repos/${owner}/${repo}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), apiTimeout || API_TIMEOUT);
      let response;
      try {
        response = await fetch(url, {
          method: 'GET',
          headers: {
            'Authorization': `token ${token}`,
            'Accept': 'application/vnd.github.v3+json',
          },
          signal: controller.signal
        });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 200) {
        // 2. Проверяем наличие registry.json (как требует инструкция)
        const regUrl = `https://api.github.com/repos/${owner}/${repo}/contents/registry.json`;
        const regController = new AbortController();
        const regTimeoutId = setTimeout(() => regController.abort(), apiTimeout || API_TIMEOUT);
        let regRes;
        try {
          regRes = await fetch(regUrl, {
            method: 'GET',
            headers: {
              'Authorization': `token ${token}`,
              'Accept': 'application/vnd.github.v3+json',
            },
            signal: regController.signal
          });
        } finally {
          clearTimeout(regTimeoutId);
        }

        if (regRes.status !== 200) {
          Alert.alert(
            "Внимание",
            "Репозиторий найден, но файл 'registry.json' отсутствует. Пожалуйста, создайте его согласно инструкции (кнопка '?' в углу)."
          );
          // Но мы всё равно можем сохранить, если репозиторий существует
        }

        const profileData = { owner, repo, token };
        setTeacherProfile(profileData);
        Alert.alert("Успех", "Соединение установлено и проверено.", [{ text: "OK", onPress: () => onBack() }]);
      } else if (response.status === 404) {
        Alert.alert("Ошибка", "Репозиторий не найден. Проверьте правильность Username и Repo.");
      } else if (response.status === 401) {
        Alert.alert("Ошибка", "Неверный GitHub Token. Проверьте права доступа (нужен scope 'repo').");
      } else {
        const err = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(err.message || "Ошибка проверки репозитория");
      }
    } catch (e) {
      const msg = e.name === 'AbortError' ? 'Request timed out. Please check your internet connection.' : e.message;
      Alert.alert("Ошибка валидации", msg);
    } finally {
      setLoading(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      "Сбросить настройки?",
      "Это удалит ваши данные авторизации из приложения. Вы сможете ввести новые данные.",
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Сбросить",
          style: "destructive",
          onPress: async () => {
            setTeacherProfile(null);
            setTempProfile({ owner: '', repo: '', token: '' });
          }
        }
      ]
    );
  };

  const insets = useSafeAreaInsets();

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {/* Standard Header */}
      <View style={[
        styles.headerContainer,
        { paddingTop: insets.top + 45, minHeight: 60 + insets.top, flexDirection: 'row', alignItems: 'center' }
      ]}>
        <Text style={[styles.headerTitle, { position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: 0, fontSize: 22, fontWeight: 'bold' }]}>
          {title || "Профиль учителя"}
        </Text>
        <View style={{ flex: 1, alignItems: 'flex-start', zIndex: 1 }}>
          <TouchableOpacity onPress={onBack} style={styles.headerBack}>
            <Ionicons name="chevron-back" size={24} color={C.accent} />
            <Text style={styles.headerBackText}>Назад</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end', zIndex: 1 }}>
          <TouchableOpacity onPress={() => setHelpVisible(true)} style={styles.helpBtn}>
            <Text style={styles.helpBtnText}>?</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingTop: 10 }}>
        <Card style={{ padding: 20, marginBottom: 20 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20 }}>
            <Ionicons name="settings-outline" size={24} color={C.accent} style={{ marginRight: 10 }} />
            <Text style={styles.cardTitle}>Настройки GitHub</Text>
          </View>

          <Text style={styles.label}>GitHub Username</Text>
          <TextInput
            style={[styles.input, isConnected && { backgroundColor: 'rgba(255,255,255,0.03)', color: C.textDisabled }]}
            value={tempProfile.owner}
            onChangeText={(val) => setTempProfile(prev => ({ ...prev, owner: val }))}
            placeholder="Например: john_doe"
            placeholderTextColor={C.textDisabled}
            autoCapitalize="none"
            editable={!isConnected}
          />

          <Text style={styles.label}>Название репозитория</Text>
          <TextInput
            style={[styles.input, isConnected && { backgroundColor: 'rgba(255,255,255,0.03)', color: C.textDisabled }]}
            value={tempProfile.repo}
            onChangeText={(val) => setTempProfile(prev => ({ ...prev, repo: val }))}
            placeholder="Например: quiz-app-data"
            placeholderTextColor={C.textDisabled}
            autoCapitalize="none"
            editable={!isConnected}
          />

          <Text style={styles.label}>GitHub Personal Token</Text>
          <TextInput
            style={[styles.input, isConnected && { backgroundColor: 'rgba(255,255,255,0.03)', color: C.textDisabled }]}
            value={tempProfile.token}
            onChangeText={(val) => setTempProfile(prev => ({ ...prev, token: val }))}
            placeholder="ghp_..."
            placeholderTextColor={C.textDisabled}
            secureTextEntry
            autoCapitalize="none"
            editable={!isConnected}
          />

          <Btn
            label={isConnected ? "Проверить соединение" : "Сохранить и проверить"}
            onPress={validateAndSaveProfile}
            loading={loading}
            style={{ marginTop: 20, backgroundColor: isConnected ? C.success : C.accent }}
          />

          {isConnected && (
            <Btn
              label="Сбросить настройки"
              onPress={handleReset}
              variant="black"
              style={{ marginTop: 12, borderColor: C.danger, borderWidth: 1 }}
              textStyle={{ color: C.white }}
            />
          )}

          <Text style={[styles.cardDesc, { marginTop: 16, fontSize: 12, opacity: 0.7 }]}>
            Настройки будут проверены через GitHub API перед сохранением. Токен используется только для работы с вашим репозиторием.
          </Text>
        </Card>

        <Card style={{ padding: 20, borderStyle: 'dashed', backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border }}>
          <Text style={[styles.welcomeDesc, { textAlign: 'center', fontSize: 13 }]}>
            Статистика публикаций и управление облачными тестами будут доступны после успешной настройки профиля.
          </Text>
        </Card>

        {/* ── Текущая конфигурация (Remote Config) ── */}
        <Card style={{ padding: 20, marginTop: 20, marginBottom: 40 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="cloud-download-outline" size={24} color={C.accent} style={{ marginRight: 10 }} />
              <Text style={styles.cardTitle}>Текущая конфигурация</Text>
            </View>
            {isMasterAdmin && !isEditingConfig && (
              <TouchableOpacity onPress={() => { setTempConfig({ ...config }); setIsEditingConfig(true); }} style={{ padding: 5 }}>
                <Text style={{ color: C.accent, fontWeight: '700' }}>Редактировать</Text>
              </TouchableOpacity>
            )}
          </View>

          <View style={{ gap: 12 }}>
            <ConfigItem
              label="Заголовок приложения"
              value={tempConfig.title}
              editable={isEditingConfig}
              onChange={(v) => setTempConfig(p => ({ ...p, title: v }))}
            />
            <ConfigItem
              label="Описание (Welcome)"
              value={tempConfig.welcomeDesc}
              editable={isEditingConfig}
              multiline
              onChange={(v) => setTempConfig(p => ({ ...p, welcomeDesc: v }))}
            />
            <ConfigItem
              label="Email для отчетов"
              value={tempConfig.reportEmail}
              editable={isEditingConfig}
              placeholder="не задан"
              onChange={(v) => setTempConfig(p => ({ ...p, reportEmail: v }))}
            />
            <ConfigItem
              label="Код доступа (Админ)"
              value={tempConfig.adminCode}
              editable={isEditingConfig}
              secureTextEntry
              onChange={(v) => setTempConfig(p => ({ ...p, adminCode: v }))}
            />
            <ConfigItem
              label="Текст загрузки"
              value={tempConfig.loadingDesc}
              editable={isEditingConfig}
              onChange={(v) => setTempConfig(p => ({ ...p, loadingDesc: v }))}
            />
            <ConfigItem
              label="Текст перед стартом"
              value={tempConfig.prestartText}
              editable={isEditingConfig}
              multiline
              onChange={(v) => setTempConfig(p => ({ ...p, prestartText: v }))}
            />
            <ConfigItem
              label="Разрешенные хосты (через запятую)"
              value={Array.isArray(tempConfig.allowedQuizHosts) ? tempConfig.allowedQuizHosts.join(', ') : ''}
              editable={isEditingConfig}
              onChange={(v) => setTempConfig(p => ({ ...p, allowedQuizHosts: v.split(',').map(h => h.trim()).filter(Boolean) }))}
            />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <ConfigItem
                label="Timeout (ms)"
                value={String(tempConfig.remoteFetchTimeoutMs)}
                editable={isEditingConfig}
                style={{ flex: 1 }}
                keyboardType="numeric"
                onChange={(v) => setTempConfig(p => ({ ...p, remoteFetchTimeoutMs: parseInt(v, 10) || 0 }))}
              />
              <ConfigItem
                label="Cooldown (ms)"
                value={String(tempConfig.TEST_COOLDOWN_MS)}
                editable={isEditingConfig}
                style={{ flex: 1 }}
                keyboardType="numeric"
                onChange={(v) => setTempConfig(p => ({ ...p, TEST_COOLDOWN_MS: parseInt(v, 10) || 0 }))}
              />
            </View>
            <ConfigItem
              label="Макс. размер файла (байт)"
              value={String(tempConfig.maxQuizFileBytes)}
              editable={isEditingConfig}
              keyboardType="numeric"
              onChange={(v) => setTempConfig(p => ({ ...p, maxQuizFileBytes: parseInt(v, 10) || 0 }))}
            />
          </View>

          {isEditingConfig ? (
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
              <Btn
                label="Отмена"
                variant="black"
                style={{ flex: 1, borderColor: C.border }}
                onPress={() => setIsEditingConfig(false)}
              />
              <Btn
                label="Сохранить"
                style={{ flex: 1, backgroundColor: C.success }}
                loading={configLoading}
                onPress={async () => {
                  setConfigLoading(true);
                  const success = await updateConfig(tempConfig);
                  setConfigLoading(false);
                  if (success) {
                    setIsEditingConfig(false);
                    Alert.alert("Успех", "Конфигурация обновлена локально. Не забудьте обновить JSON в репозитории для синхронизации у всех пользователей.");
                  } else {
                    Alert.alert("Ошибка", "Не удалось сохранить конфигурацию.");
                  }
                }}
              />
            </View>
          ) : (
            <Btn
              label="Обновить из облака"
              variant="ghost"
              style={{ marginTop: 20, borderColor: C.accent, borderWidth: 1 }}
              textStyle={{ color: C.accent }}
              onPress={() => loadConfig()}
            />
          )}

          {!isMasterAdmin && (
            <Text style={{ marginTop: 15, fontSize: 11, color: C.textDisabled, fontStyle: 'italic', textAlign: 'center' }}>
              Редактирование доступно только для администратора (EvgeniyKrasnyanskiy)
            </Text>
          )}
        </Card>
      </ScrollView>

      {/* Help Modal */}
      <Modal
        visible={helpVisible}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setHelpVisible(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'center', padding: 20 }}>
          <View style={{ backgroundColor: C.bg, borderRadius: 20, padding: 25, borderWidth: 1, borderColor: C.border }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <Text style={[styles.cardTitle, { color: C.accent }]}>Инструкция для учителя</Text>
              <TouchableOpacity onPress={() => setHelpVisible(false)}>
                <Ionicons name="close" size={24} color={C.textSecondary} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={[styles.cardDesc, { color: C.white, marginBottom: 15 }]}>
                Чтобы публиковать тесты в облако, выполните следующие шаги:
              </Text>

              <Text style={[styles.label, { color: C.accent }]}>1. Создайте репозиторий</Text>
              <Text style={[styles.cardDesc, { marginBottom: 15 }]}>
                Создайте публичный репозиторий на GitHub. Название <Text style={{ fontWeight: '700', color: C.white }}>quiz-app-data</Text> является стандартным, но вы можете использовать любое другое.
              </Text>

              <Text style={[styles.label, { color: C.accent }]}>2. Инициализируйте реестр</Text>
              <Text style={[styles.cardDesc, { marginBottom: 15 }]}>
                Создайте в корне репозитория файл <Text style={{ fontWeight: '700', color: C.white }}>registry.json</Text> с содержимым:{" "}
                <Text style={{ fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontSize: 12, backgroundColor: 'rgba(255,255,255,0.05)' }}>
                  {"[]\n"}
                </Text>
              </Text>

              <Text style={[styles.label, { color: C.accent }]}>3. Получите Токен доступа</Text>
              <Text style={[styles.cardDesc, { marginBottom: 15 }]}>
                Перейдите в Settings → Developer settings → Personal access tokens → Tokens (classic).{"\n"}
                Создайте новый токен с правами <Text style={{ fontWeight: '700', color: C.white }}>repo</Text>.
              </Text>

              <Text style={[styles.label, { color: C.accent }]}>4. Подключитесь</Text>
              <Text style={[styles.cardDesc, { marginBottom: 20 }]}>
                Введите ваш Username, название репозитория (по умолчанию 'quiz-app-data') и полученный токен в форму настроек. Нажмите "Сохранить и проверить".
              </Text>

              <Btn label="Понятно" onPress={() => setHelpVisible(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
