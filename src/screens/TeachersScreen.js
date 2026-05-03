import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StatusBar, Alert, ActivityIndicator, FlatList, StyleSheet, Vibration, Platform
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { styles } from '../styles';
import { C, CACHE_KEYS, GITHUB_CONFIG, MASTER_TEACHER, API_TIMEOUT } from '../constants';

const Card = ({ children, style }) => (
  <View style={[styles.card, style]}>{children}</View>
);

const Btn = ({ label, onPress, variant = 'primary', loading = false, style, children }) => (
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
      children || <Text style={styles.btnText}>{label}</Text>
    )}
  </TouchableOpacity>
);

export default function TeachersScreen({
  subscriptions,
  setSubscriptions,
  teacherProfile,
  onBack
}) {
  const [newTeacher, setNewTeacher] = useState('');
  const [loading, setLoading] = useState(false);
  const [lastActionTime, setLastActionTime] = useState(0);

  const checkActionCooldown = () => {
    const now = Date.now();
    if (now - lastActionTime < 1500) return false;
    setLastActionTime(now);
    return true;
  };

  const addTeacher = async () => {
    let input = newTeacher.trim();
    if (!input) {
      Alert.alert("Ошибка", "Введите GitHub Username учителя или 'username/repo'.");
      return;
    }

    let username = input;
    let repoName = GITHUB_CONFIG.DEFAULT_REPO_NAME;

    if (input.includes('/')) {
      const parts = input.split('/');
      username = parts[0].trim();
      repoName = parts[1].trim() || GITHUB_CONFIG.DEFAULT_REPO_NAME;
    }

    if (!username) {
      Alert.alert("Ошибка", "Некорректное имя пользователя.");
      return;
    }

    if (subscriptions.some(s => s.owner.toLowerCase() === username.toLowerCase() && s.repo.toLowerCase() === repoName.toLowerCase())) {
      Alert.alert("Уже в подписках", "Вы уже подписаны на этот репозиторий.");
      return;
    }

    if (!checkActionCooldown()) return;

    setLoading(true);
    try {
      const url = `https://api.github.com/repos/${username}/${repoName}`;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT);
      
      let response;
      try {
        response = await fetch(url, { signal: controller.signal });
      } finally {
        clearTimeout(timeoutId);
      }

      if (response.status === 200) {
        const isOwner = teacherProfile?.owner === username && teacherProfile?.repo === repoName;
        
        const teacherData = {
          id: `${username}_${repoName}`,
          name: username,
          owner: username,
          repo: repoName,
          isMaster: false,
          isOwner: isOwner,
          disabled: false
        };

        const nextSubs = [...subscriptions, teacherData];
        await AsyncStorage.setItem(CACHE_KEYS.SUBSCRIPTIONS, JSON.stringify(nextSubs));
        setSubscriptions(nextSubs);
        setNewTeacher('');
        Vibration.vibrate(100);
        Alert.alert("Успех", `Подписка на @${username}/${repoName} успешно добавлена. ${isOwner ? '(Ваш репозиторий)' : '(Только чтение)'}`);
      } else {
        Alert.alert("Ошибка", `Репозиторий "${repoName}" у пользователя @${username} не найден. Проверьте правильность имени.`);
      }
    } catch (e) {
      Alert.alert("Ошибка сети", "Не удалось проверить учителя. Проверьте интернет-соединение.");
    } finally {
      setLoading(false);
    }
  };

  const removeTeacher = async (teacher) => {
    if (!checkActionCooldown()) return;
    if (teacher.isMaster) {
      Alert.alert("Запрещено", "Мастера тестов нельзя удалить.");
      return;
    }

    Alert.alert(
      "Удаление",
      `Вы действительно хотите отписаться от @${teacher.owner}? Все его тесты останутся на устройстве, но перестанут обновляться.`,
      [
        { text: "Отмена", style: "cancel" },
        {
          text: "Отписаться",
          style: "destructive",
          onPress: async () => {
            Vibration.vibrate(100);
            const nextSubs = subscriptions.filter(s => s.owner !== teacher.owner);
            await AsyncStorage.setItem(CACHE_KEYS.SUBSCRIPTIONS, JSON.stringify(nextSubs));
            setSubscriptions(nextSubs);
          }
        }
      ]
    );
  };

  const toggleTeacherStatus = async (teacher, disable) => {
    if (!checkActionCooldown()) return;

    Vibration.vibrate(50); // Small hit
    const nextSubs = subscriptions.map(s => {
      if (s.owner === teacher.owner) {
        return { ...s, disabled: disable };
      }
      return s;
    });
    await AsyncStorage.setItem(CACHE_KEYS.SUBSCRIPTIONS, JSON.stringify(nextSubs));
    setSubscriptions(nextSubs);

    // "Hit" confirmation (feedback)
    if (Platform.OS === 'android') {
      const { ToastAndroid } = require('react-native');
      ToastAndroid.show(`Подписка ${disable ? 'отключена' : 'активирована'}`, ToastAndroid.SHORT);
    }
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
        {/* Абсолютный заголовок — мертво по центру */}
        <Text style={[styles.headerTitle, { position: 'absolute', left: 0, right: 0, textAlign: 'center', zIndex: 0, fontSize: 22, fontWeight: 'bold' }]}>
          Подписки
        </Text>

        {/* Левая часть — кнопка Назад */}
        <View style={{ flex: 1, alignItems: 'flex-start', zIndex: 1 }}>
          <TouchableOpacity onPress={onBack} style={styles.headerBack}>
            <Ionicons name="chevron-back" size={24} color={C.accent} />
            <Text style={styles.headerBackText}>Назад</Text>
          </TouchableOpacity>
        </View>

        {/* Правая часть — пустая */}
        <View style={{ flex: 1 }} />
      </View>

      <View style={{ padding: 20, flex: 1 }}>
        <Card style={{ marginBottom: 20, padding: 12 }}>
          <Text style={styles.label}>Добавить учителя</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: C.surfaceHigh, borderRadius: 12, paddingRight: 8 }}>
            <TextInput
              style={[styles.input, { flex: 1, marginBottom: 0, borderWidth: 0, backgroundColor: 'transparent' }]}
              placeholder="Username или Username/Repo"
              placeholderTextColor={C.textDisabled}
              value={newTeacher}
              onChangeText={setNewTeacher}
              autoCapitalize="none"
            />
            <TouchableOpacity
              onPress={addTeacher}
              disabled={!!loading}
              accessibilityState={{ disabled: !!loading }}
              style={{ width: 44, height: 44, backgroundColor: C.accent, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
            >
              {loading ? <ActivityIndicator size="small" color="#fff" /> : <Ionicons name="person-add-outline" size={20} color="#fff" />}
            </TouchableOpacity>
          </View>
        </Card>

        <Text style={[styles.label, { marginBottom: 12 }]}>Ваши подписки</Text>
        <FlatList
          data={subscriptions}
          keyExtractor={(item, index) => item.id || item.owner || index.toString()}
          renderItem={({ item }) => (
            <View style={[styles.libraryRow, { backgroundColor: C.surface, borderRadius: 16, padding: 16, marginBottom: 12, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }]}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.libraryTitle, { color: C.textPrimary, fontSize: 16 }]}>@{item.owner}</Text>
                <Text style={[styles.libraryMeta, { color: item.isMaster ? C.accent : C.textSecondary }]}>
                  {item.isMaster ? '★ Мастер тестов' : `Репозиторий: ${item.repo}`}
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  onPress={() => toggleTeacherStatus(item, !item.disabled)}
                  style={{ padding: 8 }}
                >
                  <Ionicons 
                    name={item.disabled ? "notifications-off-outline" : "notifications"} 
                    size={22} 
                    color={item.disabled ? C.textSecondary : C.success} 
                  />
                </TouchableOpacity>

                {(!item.isMaster && item.id !== MASTER_TEACHER?.owner) ? (
                  <TouchableOpacity
                    onPress={() => removeTeacher(item)}
                    style={{ padding: 8 }}
                  >
                    <Ionicons name="trash-outline" size={22} color={C.danger} />
                  </TouchableOpacity>
                ) : (
                  <View style={{ padding: 8, opacity: 0.3 }}>
                    <Ionicons name="trash-outline" size={22} color={C.danger} />
                  </View>
                )}
              </View>
            </View>
          )}
        />
      </View>
    </View>
  );
}
