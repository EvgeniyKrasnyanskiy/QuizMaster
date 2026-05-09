import React from 'react';
import { View, Text, TextInput, TouchableOpacity, KeyboardAvoidingView, StatusBar } from 'react-native';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { C, APP_VERSION } from '../constants';
import { styles } from '../styles';
import { Btn } from '../components/Btn';

export default function WelcomeScreen({
  safeStyle,
  insets,
  config,
  newTestsCount,
  userName,
  handleNameChange,
  handleContinueStudent,
  handleExitApp,
  setHelpType,
  setHelpVisible,
  L
}) {
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

            <Text style={styles.welcomeTitle}>{config?.title || 'Вход в систему'}</Text>
            <Text style={styles.welcomeDesc}>{config?.welcomeDesc}</Text>
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
