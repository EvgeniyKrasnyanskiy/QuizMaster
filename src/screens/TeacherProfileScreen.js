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
  loadConfig
}) {
  console.log('Profile Rendering', { hasProfile: !!teacherProfile });

  const [loading, setLoading] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [tempProfile, setTempProfile] = useState({
    owner: teacherProfile?.owner || '',
    repo: teacherProfile?.repo || '',
    token: teacherProfile?.token || ''
  });
  const [isEditing, setIsEditing] = useState(!teacherProfile);

  const isConnected = !!teacherProfile;

  const validateAndSaveProfile = async () => {
    const { owner, repo, token } = tempProfile;

    if (isConnected) {
      setLoading(true);
      try {
        const url = `https://api.github.com/repos/${owner}/${repo}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
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
        Alert.alert("Ошибка сети", e.message);
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
      // 1. Сохраняем профиль (токен и данные)
      const profileData = { owner, repo, token };
      await AsyncStorage.setItem(CACHE_KEYS.TEACHER_PROFILE, JSON.stringify(profileData));
      
      // 2. Обновляем глобальный стейт и дожидаемся обновления конфига
      setTeacherProfile(profileData);
      if (loadConfig) {
        await loadConfig();
      }

      // 3. Теперь проверяем сам репозиторий, используя уже сохраненные данные
      const url = `https://api.github.com/repos/${owner}/${repo}`;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
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
        const regTimeoutId = setTimeout(() => regController.abort(), API_TIMEOUT);
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

        Alert.alert("Успех", "Соединение установлено и проверено.");
        setIsEditing(false); // Закрываем режим редактирования после успеха
      } else if (response.status === 404) {
        Alert.alert("Ошибка", "Репозиторий не найден. Проверьте правильность Username и Repo.");
      } else if (response.status === 401) {
        Alert.alert("Ошибка", "Неверный GitHub Token. Проверьте права доступа (нужен scope 'repo').");
      } else {
        const err = await response.json().catch(() => ({ message: response.statusText }));
        throw new Error(err.message || "Ошибка проверки репозитория");
      }
    } catch (e) {
      Alert.alert("Ошибка валидации", e.message);
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
            await AsyncStorage.removeItem(CACHE_KEYS.TEACHER_PROFILE);
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
        {isConnected && !isEditing ? (
          <Card style={{ padding: 20, marginBottom: 20, borderLeftWidth: 4, borderLeftColor: C.success }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <View style={{ backgroundColor: 'rgba(76, 175, 80, 0.1)', padding: 8, borderRadius: 10, marginRight: 12 }}>
                  <Ionicons name="person-circle-outline" size={24} color={C.success} />
                </View>
                <View>
                  <Text style={{ color: C.textSecondary, fontSize: 12 }}>Активный профиль</Text>
                  <Text style={[styles.cardTitle, { fontSize: 18 }]}>{teacherProfile.owner}</Text>
                </View>
              </View>
              <TouchableOpacity 
                onPress={() => setIsEditing(true)}
                style={{ backgroundColor: 'rgba(255,255,255,0.05)', padding: 8, borderRadius: 8 }}
              >
                <Ionicons name="create-outline" size={20} color={C.accent} />
              </TouchableOpacity>
            </View>

            <View style={{ backgroundColor: 'rgba(255,255,255,0.03)', padding: 12, borderRadius: 12, marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                <Ionicons name="folder-outline" size={14} color={C.textDisabled} style={{ marginRight: 6 }} />
                <Text style={{ color: C.textDisabled, fontSize: 12 }}>Репозиторий:</Text>
              </View>
              <Text style={{ color: C.white, fontWeight: '600' }}>{teacherProfile.repo}</Text>
            </View>

            <Btn
              label="Проверить соединение"
              onPress={validateAndSaveProfile}
              loading={loading}
              variant="black"
              style={{ borderColor: C.success, borderWidth: 1 }}
              textStyle={{ color: C.success }}
            />
          </Card>
        ) : (
          <Card style={{ padding: 20, marginBottom: 20 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="settings-outline" size={24} color={C.accent} style={{ marginRight: 10 }} />
                <Text style={styles.cardTitle}>Настройки GitHub</Text>
              </View>
              {isConnected && (
                <TouchableOpacity onPress={() => setIsEditing(false)}>
                  <Text style={{ color: C.textSecondary, fontWeight: '600' }}>Отмена</Text>
                </TouchableOpacity>
              )}
            </View>

            <Text style={styles.label}>GitHub Username</Text>
            <TextInput
              style={styles.input}
              value={tempProfile.owner}
              onChangeText={(val) => setTempProfile(prev => ({ ...prev, owner: val }))}
              placeholder="Например: john_doe"
              placeholderTextColor={C.textDisabled}
              autoCapitalize="none"
            />

            <Text style={styles.label}>Название репозитория</Text>
            <TextInput
              style={styles.input}
              value={tempProfile.repo}
              onChangeText={(val) => setTempProfile(prev => ({ ...prev, repo: val }))}
              placeholder="Например: quiz-app-data"
              placeholderTextColor={C.textDisabled}
              autoCapitalize="none"
            />

            <Text style={styles.label}>GitHub Personal Token</Text>
            <TextInput
              style={styles.input}
              value={tempProfile.token}
              onChangeText={(val) => setTempProfile(prev => ({ ...prev, token: val }))}
              placeholder="ghp_..."
              placeholderTextColor={C.textDisabled}
              secureTextEntry
              autoCapitalize="none"
            />

            <Btn
              label="Сохранить и проверить"
              onPress={validateAndSaveProfile}
              loading={loading}
              style={{ marginTop: 20, backgroundColor: C.accent }}
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
        )}

        <Card style={{ padding: 20, borderStyle: 'dashed', backgroundColor: 'transparent', borderWidth: 1, borderColor: C.border }}>
          <Text style={[styles.welcomeDesc, { textAlign: 'center', fontSize: 13 }]}>
            Статистика публикаций и управление облачными тестами будут доступны после успешной настройки профиля.
          </Text>
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
                Создайте публичный репозиторий на GitHub с названием <Text style={{ fontWeight: '700', color: C.white }}>quiz-app-data</Text> (важно точное имя!).
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
                Введите ваш Username, название репозитория и полученный токен в форму настроек. Нажмите "Сохранить и проверить".
              </Text>

              <Btn label="Понятно" onPress={() => setHelpVisible(false)} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}
