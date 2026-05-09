import React from 'react';
import { View, Text, TouchableOpacity, FlatList, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../constants';
import { styles } from '../styles';
import { Btn } from '../components/Btn';

export default function TeacherLibraryScreen({
  safeStyle,
  renderHeader,
  setScreen,
  setLoading,
  fetchCloudRegistry,
  setCloudRegistry,
  teacherLibraryFiles,
  cloudRegistry,
  teacherProfile,
  handleOpenTeacherFileEditor,
  handleUnpublishFromCloud,
  handlePublishToCloud,
  handleShareFile,
  handleDeleteLibraryFile,
  handleCreateTeacherQuiz,
  handleEncryptAndSave,
  handleDeleteAllFiles,
  SafeDirs,
  stripDatExtension,
  formatNiceDate,
  L
}) {
  return (
    <View style={safeStyle}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {renderHeader(
        "На устройстве",
        () => setScreen('teacher'),
        <TouchableOpacity
          onPress={async () => {
            setScreen('cloud-manager');
            setLoading(true);
            try {
              const registry = await fetchCloudRegistry();
              setCloudRegistry(registry);
            } finally {
              setLoading(false);
            }
          }}
          style={styles.headerBack}
        >
          <Ionicons name="cloud-outline" size={22} color={C.accent} />
          <Text style={styles.headerBackText}> Облако</Text>
        </TouchableOpacity>
      )}
      <View style={L.libraryWrap}>
        <Text style={[styles.welcomeDesc, { marginBottom: 12, textAlign: 'left', fontSize: 13 }]}>
          Локальные тесты. Если тест уже есть в облаке, изменения в редакторе автоматически обновят его и в облаке GitHub.
        </Text>
        <FlatList
          data={teacherLibraryFiles}
          keyExtractor={(item) => item.path}
          initialNumToRender={10}
          maxToRenderPerBatch={10}
          windowSize={5}
          ListEmptyComponent={<Text style={styles.welcomeDesc}>Нет сохраненных тестов.</Text>}
          renderItem={({ item }) => (
            <View style={styles.libraryRow}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={styles.libraryTitle}>{item.displayName}</Text>
                  {cloudRegistry?.some?.(c => c.id === stripDatExtension(item.name)) && (
                    <Text style={{ marginLeft: 6 }}>☁️</Text>
                  )}
                </View>
                <Text style={[styles.libraryMeta, { color: C.accent, fontWeight: '600' }]}>
                  Вопросов: {item.questionCount || 0}{"\n"}Размер: {item.size < 1024 ? '< 1' : Math.round(item.size / 1024)} KB
                </Text>
                <Text style={[styles.libraryMeta, { fontSize: 11, marginTop: 2 }]}>
                  Создан: {formatNiceDate(item.createdAt || item.mtime * 1000)}
                </Text>
              </View>
              {item.canEdit && (
                <TouchableOpacity onPress={() => handleOpenTeacherFileEditor(item)} style={styles.fileActionBtn}>
                  <Ionicons name="create-outline" size={24} color={C.accent} />
                </TouchableOpacity>
              )}
              {item.canEdit && teacherProfile?.token && (
                <TouchableOpacity
                  onPress={() => {
                    const isPublished = cloudRegistry?.some?.(c => c.id === stripDatExtension(item.name));
                    if (isPublished) {
                      handleUnpublishFromCloud(item);
                    } else {
                      handlePublishToCloud(item);
                    }
                  }}
                  style={[styles.fileActionBtn, { backgroundColor: cloudRegistry?.some?.(c => c.id === stripDatExtension(item.name)) ? '#111' : '#FFD700', borderWidth: 0 }]}
                >
                  <Ionicons
                    name={cloudRegistry?.some?.(c => c.id === stripDatExtension(item.name)) ? "cloud-offline-outline" : "cloud-upload-outline"}
                    size={22}
                    color={cloudRegistry?.some?.(c => c.id === stripDatExtension(item.name)) ? "#fff" : "#000"}
                  />
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => handleShareFile(item, true)} style={styles.fileActionBtn}>
                <Ionicons name="share-outline" size={24} color={C.accent} />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => handleDeleteLibraryFile(item, 'teacher')} style={styles.deleteBtn}>
                <Text style={styles.deleteBtnText}>🗑</Text>
              </TouchableOpacity>
            </View>
          )}
        />
        <Btn label="📝 Создать тест" onPress={handleCreateTeacherQuiz} variant="gold" style={{ marginTop: 12 }} />
        <Btn label="📥 Импортировать файл" onPress={handleEncryptAndSave} variant="black" style={{ marginTop: 10, borderColor: '#FFD700' }} />
        <Btn label="🗑 Удалить все" onPress={() => handleDeleteAllFiles([SafeDirs.TEACHER, SafeDirs.DOWNLOADS], 'teacher')} variant="black" style={{ marginTop: 10, borderColor: C.danger }} />
      </View>
    </View>
  );
}
