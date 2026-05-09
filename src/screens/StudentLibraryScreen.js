import React from 'react';
import { View, Text, TextInput, TouchableOpacity, SectionList, RefreshControl, Animated, StatusBar } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C } from '../constants';
import { styles } from '../styles';
import { Btn } from '../components/Btn';

export default function StudentLibraryScreen({
  safeStyle,
  renderHeader,
  setScreen,
  showHiddenTests,
  setShowHiddenTests,
  handleHideCompletedTests,
  handleManualSync,
  spin,
  librarySearch,
  setLibrarySearch,
  isRefreshing,
  handlePullToRefresh,
  groupedData,
  studentQuizStatus,
  permanentlyHiddenIds,
  checkForUpdates,
  setActionTargetTest,
  setActionModalVisible,
  handleShareFile,
  handleOpenStudentQuiz,
  handleViewStudentResults,
  stripDatExtension,
  formatUnlockTime,
  L
}) {
  return (
    <View style={safeStyle}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      {renderHeader(
        "Доступные тесты",
        () => setScreen('welcome'),
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <TouchableOpacity onPress={() => setShowHiddenTests(!showHiddenTests)} style={[styles.fileActionBtn, { borderColor: showHiddenTests ? C.accent : C.border, height: 24, paddingVertical: 0, justifyContent: 'center', marginRight: 8 }]}>
            <Ionicons name={showHiddenTests ? "eye-outline" : "eye-off-outline"} size={14} color={showHiddenTests ? C.accent : C.textSecondary} />
          </TouchableOpacity>

          <TouchableOpacity onPress={handleHideCompletedTests} style={[styles.fileActionBtn, { borderColor: C.accent, height: 24, paddingVertical: 0, justifyContent: 'center', marginRight: 8 }]}>
            <Ionicons name="checkmark-done-outline" size={14} color={C.accent} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleManualSync}
            style={[styles.fileActionBtn, { borderColor: C.success, height: 24, paddingVertical: 0, justifyContent: 'center', marginRight: 8 }]}
            activeOpacity={0.7}
          >
            <Animated.View style={{ transform: [{ rotate: spin }] }}>
              <Ionicons name="sync" size={14} color={C.success} />
            </Animated.View>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => setScreen('student-subscriptions')}
            style={[styles.fileActionBtn, { borderColor: C.accent, height: 24, paddingVertical: 0, justifyContent: 'center' }]}
          >
            <Text style={{ color: C.accent, fontWeight: '700', fontSize: 11 }}>Подписки</Text>
          </TouchableOpacity>
        </View>
      )}
      <View style={L.libraryWrap}>
        <View style={{ marginBottom: 16 }}>
          <TextInput
            style={[styles.input, { height: 46, marginBottom: 0, backgroundColor: C.surface }]}
            placeholder="🔍 Поиск тестов..."
            placeholderTextColor={C.textDisabled}
            value={librarySearch}
            onChangeText={setLibrarySearch}
            autoCorrect={false}
          />
        </View>
        <SectionList
          sections={groupedData}
          keyExtractor={(item) => item.path}
          stickySectionHeadersEnabled={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={handlePullToRefresh}
              tintColor={C.accent}
              colors={[C.accent]}
            />
          }
          renderSectionHeader={({ section: { title } }) => (
            <View style={{ backgroundColor: C.bg, paddingVertical: 8, marginTop: 8 }}>
              <Text style={{ color: C.textSecondary, fontWeight: '700', fontSize: 14 }}>{title}</Text>
            </View>
          )}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', marginTop: 40 }}>
              <Text style={styles.welcomeDesc}>У вас пока нет скачанных тестов.</Text>
              <Btn label="Обновить облако" onPress={checkForUpdates} style={{ marginTop: 12 }} />
            </View>
          }
          renderItem={({ item }) => {
            const status = studentQuizStatus[item.path] || {};
            const isLocked = status.isLocked;
            const isSystem = item.authorId === 'System';
            const isCompleted = !!(status.completedAt || (Array.isArray(status.results) && status.results.length > 0));
            const testId = item.authorId ? `${item.authorId}_${stripDatExtension(item.displayName)}` : stripDatExtension(item.displayName);
            const isHidden = permanentlyHiddenIds.includes(testId);

            return (
              <View style={[styles.libraryRow, isHidden && { opacity: 0.5 }]}>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={styles.libraryTitle}>
                      {item.authorId && !isSystem ? '☁️ ' : ''}{isSystem ? '🎓 ' : ''}{item.displayName}
                    </Text>
                    {isHidden && (
                      <View style={{ backgroundColor: C.border, paddingHorizontal: 4, borderRadius: 2, marginLeft: 6 }}>
                        <Text style={{ color: C.textSecondary, fontSize: 8, fontWeight: '700' }}>СКРЫТ</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ marginTop: 4 }}>
                    {(() => {
                      const correctCount = status.results?.filter(r => r.correct).length || 0;
                      const totalCount = item.questionCount || 1;
                      const hasResult = isCompleted;

                      if (!hasResult) {
                        if (status.hasProgress) {
                          return <Text style={{ color: C.warning, fontSize: 12, fontWeight: '700' }}>⏳ Не закончен</Text>;
                        }
                        return <Text style={{ color: C.textSecondary, fontSize: 12 }}>Не начат</Text>;
                      }
                      if (correctCount === totalCount && totalCount > 0) {
                        return <Text style={{ color: C.success, fontSize: 12, fontWeight: '700' }}>🌟 Отлично! {correctCount}/{totalCount}</Text>;
                      }
                      return <Text style={{ color: C.textSecondary, fontSize: 12 }}>📖 Пройдено: {correctCount}/{totalCount}</Text>;
                    })()}
                  </View>

                  <Text style={[styles.libraryMeta, { marginTop: 4, fontSize: 11 }]}>
                    Вопросов: {item.questionCount}
                  </Text>

                  {status.isOrphaned && (
                    <Text style={{ color: C.textSecondary, fontSize: 10, fontStyle: 'italic', marginTop: 2 }}>
                      (Удален из облака)
                    </Text>
                  )}
                  {isLocked && (
                    <Text style={{ color: C.danger, fontSize: 11, marginTop: 2 }}>
                      Доступен: {formatUnlockTime(isLocked)}
                    </Text>
                  )}
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  {/* 1. Посмотреть результат (появляется после прохождения) */}
                  {isCompleted ? (
                    <TouchableOpacity
                      onPress={() => handleViewStudentResults(item)}
                      style={[styles.fileActionBtn, { marginRight: 8, borderColor: C.accent }]}
                    >
                      <Ionicons name="list-outline" size={20} color={C.accent} />
                    </TouchableOpacity>
                  ) : null}

                  {/* 2. Кнопка пройти тест */}
                  <TouchableOpacity
                    onPress={() => handleOpenStudentQuiz(item)}
                    style={[
                      styles.fileActionBtn,
                      {
                        backgroundColor: isLocked ? C.border : (isSystem && !isCompleted ? C.accent : 'transparent'),
                        marginRight: (isSystem && !isCompleted) ? 0 : 8,
                        borderColor: (isSystem && !isCompleted) ? C.accent : C.border,
                        width: (isSystem && !isCompleted) ? 'auto' : 40,
                        paddingHorizontal: (isSystem && !isCompleted) ? 12 : 0,
                        flexDirection: 'row'
                      }
                    ]}
                    disabled={!!isLocked}
                  >
                    <Ionicons
                      name={status.hasProgress ? "play-circle-outline" : "chevron-forward-outline"}
                      size={20}
                      color={isLocked ? C.textDisabled : (isSystem && !isCompleted ? C.white : C.accent)}
                      style={(!status.hasProgress && !isSystem) ? { marginLeft: 2 } : {}}
                    />
                    {isSystem && !isCompleted && (
                      <Text style={{ color: C.white, fontSize: 13, fontWeight: '800', marginLeft: 6 }}>ЗАПУСТИТЬ</Text>
                    )}
                  </TouchableOpacity>

                  {/* 3. Кнопка поделиться файлом теста (скрыта для системы) */}
                  {!isSystem && (
                    <TouchableOpacity
                      onPress={() => handleShareFile(item)}
                      style={[styles.fileActionBtn, { marginRight: 8, borderColor: C.success }]}
                    >
                      <Ionicons name="share-outline" size={20} color={C.success} />
                    </TouchableOpacity>
                  )}

                  {/* 4. Смарт-кнопка управления (Modal) */}
                  {(() => {
                    const isCloud = !!item.authorId;
                    const isOrphaned = status.isOrphaned;

                    // Показываем кнопку управления (Hide) для системы только после прохождения.
                    // Для остальных облачных тестов - только если пройден или сирота.
                    // Для локальных - всегда.
                    const hideEllipsis = isSystem ? !isCompleted : (!isCompleted && !isOrphaned && isCloud);
                    if (hideEllipsis) return null;

                    return (
                      <TouchableOpacity
                        onPress={() => {
                          setActionTargetTest({ item, status, testId, isHidden });
                          setActionModalVisible(true);
                        }}
                        style={[styles.fileActionBtn, { borderColor: isHidden ? C.accent : C.border }]}
                      >
                        <Ionicons name="ellipsis-vertical" size={20} color={isHidden ? C.accent : C.textSecondary} />
                      </TouchableOpacity>
                    );
                  })()}
                </View>
              </View>
            );
          }}
        />
        <Btn
          label="Добавить тесты"
          onPress={() => { setScreen('add-test'); }}
          style={{ marginTop: 16 }}
        />
      </View>
    </View>
  );
}
