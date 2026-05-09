import React from 'react';
import { View, Text, TextInput, StatusBar } from 'react-native';
import { C } from '../constants';
import { styles } from '../styles';
import { Btn } from '../components/Btn';

export default function EditorScreen({
  safeStyle,
  renderHeader,
  setScreen,
  editIsNew,
  editIsCloud,
  editFileName,
  setEditFileName,
  editContent,
  setEditContent,
  handleSaveEditedQuiz,
  loading
}) {
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
