import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet, Text, View, TextInput, TouchableOpacity,
  Alert, ScrollView, KeyboardAvoidingView, Platform,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { styles } from '../styles';
import { C } from '../constants';
import { formatTime } from '../utils';

// Репликация локальных стилей L для QuizScreen
const L = StyleSheet.create({
  navBtn: {
    flex: 1,
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  navBtnText: {
    color: C.textSecondary,
    fontSize: 16,
    fontWeight: '600',
  },
  abortBtn: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FFA700',
    backgroundColor: '#FFD700',
  },
  abortBtnText: {
    color: '#111',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
});

export default function QuizScreen({
  questions,
  testFileName,
  userName,
  config,
  activeProgressKey,
  onFinish,
  onAbort,
  initialData = null
}) {
  const insets = useSafeAreaInsets();
  const safeStyle = { flex: 1, paddingTop: insets.top, paddingBottom: insets.bottom, backgroundColor: C.bg };

  const [currentIdx, setCurrentIdx] = useState(initialData?.currentIdx || 0);
  const [results, setResults] = useState(initialData?.results || new Array(questions.length).fill(null));
  const [totalTime, setTotalTime] = useState(initialData?.totalTime || 0);
  const [questionStartTime, setQuestionStartTime] = useState(initialData?.questionStartTime || 0);
  const [questionTimes, setQuestionTimes] = useState(initialData?.questionTimes || new Array(questions.length).fill(0));

  const [selectedAnswers, setSelectedAnswers] = useState([]);
  const [textInput, setTextInput] = useState('');

  const timerRef = useRef(null);

  // Восстановление ответов при смене вопроса
  useEffect(() => {
    const currentResponse = results[currentIdx];
    if (currentResponse !== null && currentResponse !== undefined) {
      if (questions[currentIdx].type === 'multi') {
        setSelectedAnswers(Array.isArray(currentResponse) ? [...currentResponse] : []);
        setTextInput('');
      } else {
        setTextInput(String(currentResponse));
        setSelectedAnswers([]);
      }
    } else {
      setSelectedAnswers([]);
      setTextInput('');
    }
    setQuestionStartTime(totalTime);
  }, [currentIdx]);

  // Таймер
  useEffect(() => {
    timerRef.current = setInterval(() => setTotalTime(prev => prev + 1), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Автосохранение прогресса (только при смене вопроса или ответа, не каждую секунду)
  useEffect(() => {
    if (!activeProgressKey || questions.length === 0) return;

    // NOTE: We do NOT store `questions` here — they are already on disk in the .dat file.
    // Storing them would serialize 50-100KB on every answer change unnecessarily.
    const payload = {
      currentIdx,
      results,
      totalTime,
      questionStartTime,
      questionTimes,
      testFileName,
      userName,
    };

    AsyncStorage.setItem(activeProgressKey, JSON.stringify(payload)).catch(() => {
      // Silent fail
    });
  }, [currentIdx, results]); // NOTE: totalTime intentionally excluded — saves on answer/navigation, not every second

  const finalizeResults = (rawResults, times) => {
    return questions.map((q, i) => {
      const answer = rawResults[i];
      if (answer === null || answer === undefined) {
        return {
          q: q.q,
          userAnswer: '—',
          correct: false,
          time: times[i] || 0
        };
      }

      let isCorrect = false;
      let formattedAnswer = '';

      if (q.type === 'multi') {
        const correctIndices = (Array.isArray(q.a) ? q.a : [q.a])
          .map(v => parseInt(v, 10))
          .filter(v => !isNaN(v));
        const selectedIndices = (Array.isArray(answer) ? answer : [])
          .map(idx => parseInt(idx, 10))
          .filter(v => !isNaN(v));

        // Full set comparison: both size and content must match exactly
        const correctSet = new Set(correctIndices);
        const selectedSet = new Set(selectedIndices);
        isCorrect = correctSet.size === selectedSet.size &&
          [...correctSet].every(v => selectedSet.has(v));

        formattedAnswer = selectedIndices.map(idx => q.opts[idx]).join(', ');
      } else {
        const userStr = String(answer || '').trim().toLowerCase();
        const correctStr = String(q.a || '').trim().toLowerCase();
        isCorrect = userStr === correctStr;
        formattedAnswer = String(answer).trim();
      }

      const qTime = times[i];
      return {
        q: q.q,
        userAnswer: formattedAnswer || '—',
        correct: isCorrect,
        time: Number.isFinite(qTime) ? qTime : 0
      };
    });
  };

  const toggleOption = (idx) => {
    setSelectedAnswers(prev => {
      const next = prev.includes(idx) ? prev.filter(i => i !== idx) : [...prev, idx];
      // Сбрасываем "зафиксированный" результат при изменении
      setResults(prevResults => {
        const nextRes = [...prevResults];
        nextRes[currentIdx] = null;
        return nextRes;
      });
      return next;
    });
  };

  const handleAnswer = () => {
    const currentQuestion = questions[currentIdx];
    const timeSpent = totalTime - questionStartTime;
    const currentResponse = currentQuestion.type === 'multi' ? [...selectedAnswers] : textInput;

    if (!currentResponse || (Array.isArray(currentResponse) && currentResponse.length === 0)) return;

    const updatedResults = [...results];
    updatedResults[currentIdx] = currentResponse;
    setResults(updatedResults);

    const updatedTimes = [...questionTimes];
    updatedTimes[currentIdx] = (updatedTimes[currentIdx] || 0) + timeSpent;
    setQuestionTimes(updatedTimes);

    const isLast = currentIdx === questions.length - 1;
    const firstEmptyIdx = updatedResults.findIndex(r => r === null);

    if (firstEmptyIdx !== -1) {
      if (isLast) {
        Alert.alert("Ответ принят", "Есть пропущенные вопросы. Перейти к ним?", [
          { text: "Перейти", onPress: () => setCurrentIdx(firstEmptyIdx) }
        ]);
      } else {
        // Умный переход: если следующий вопрос уже отвечен, прыгаем к первому неотвеченному
        if (updatedResults[currentIdx + 1] !== null) {
          setCurrentIdx(firstEmptyIdx);
        } else {
          setCurrentIdx(currentIdx + 1);
        }
      }
    } else {
      // Все вопросы отвечены -> автоматическое завершение
      const finalRaw = [...updatedResults];
      onFinish({
        results: finalizeResults(finalRaw, updatedTimes),
        rawAnswers: finalRaw,
        questions,
        totalTime,
        questionTimes: updatedTimes
      });
    }
  };

  const onSkipPress = () => {
    const firstEmptyIdx = results.findIndex(r => r === null);

    // Если всё отвечено, кнопка работает как "Финиш"
    if (firstEmptyIdx === -1) {
      const finalRaw = [...results];
      onFinish({
        results: finalizeResults(finalRaw, questionTimes),
        rawAnswers: finalRaw,
        questions,
        totalTime,
        questionTimes
      });
      return;
    }

    const isLast = currentIdx === questions.length - 1;
    if (isLast) {
      const hasOtherSkipped = results.some((r, i) => r === null && i !== currentIdx);
      if (hasOtherSkipped) {
        const nextEmpty = results.findIndex((r, i) => r === null && i !== currentIdx);
        setCurrentIdx(nextEmpty !== -1 ? nextEmpty : firstEmptyIdx);
      } else {
        if (results[currentIdx] === null) {
          Alert.alert(
            "Внимание",
            "Вы не ответили на последний вопрос. Завершить тест?",
            [
              { text: "Отмена", style: "cancel" },
              {
                text: "Завершить", style: "destructive", onPress: () => {
                  const finalRaw = [...results];
                  onFinish({
                    results: finalizeResults(finalRaw, questionTimes),
                    rawAnswers: finalRaw,
                    questions,
                    totalTime,
                    questionTimes
                  });
                }
              }
            ]
          );
        } else {
          const finalRaw = [...results];
          onFinish({
            results: finalizeResults(finalRaw, questionTimes),
            rawAnswers: finalRaw,
            questions,
            totalTime,
            questionTimes
          });
        }
      }
    } else {
      setCurrentIdx(currentIdx + 1);
    }
  };

  const handleBack = () => {
    if (currentIdx > 0) setCurrentIdx(currentIdx - 1);
  };

  const current = questions[currentIdx];
  if (!current) return null;

  const answeredCount = results.filter(r => r !== null).length;
  const progress = answeredCount / questions.length;
  const currentIsAnswered = results[currentIdx] !== null;
  const firstEmptyIdx = results.findIndex(r => r === null);
  const allAnswered = firstEmptyIdx === -1;

  return (
    <View style={safeStyle}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />

      <View style={styles.quizTopBar}>
        <View style={styles.quizProgress}>
          <Text style={styles.quizProgressLabel}>
            Вопрос {currentIdx + 1} / {questions.length}
          </Text>
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${progress * 100}%` }]} />
          </View>
        </View>
        <View style={styles.timerBox}>
          <Text style={styles.timerText}>{formatTime(totalTime)}</Text>
        </View>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView style={styles.quizBody} contentContainerStyle={{ paddingBottom: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.questionText}>{current.q}</Text>
          {current.type === 'text' && current.hint ? (
            <Text style={styles.hintText}>💡 {current.hint}</Text>
          ) : null}

          {current.type === 'multi' ? (
            <View style={styles.optionsContainer}>
              {current.opts.map((opt, i) => {
                const selected = selectedAnswers.includes(i);
                return (
                  <TouchableOpacity
                    key={i}
                    onPress={() => toggleOption(i)}
                    activeOpacity={0.8}
                    style={[styles.option, selected && styles.optionSelected]}
                  >
                    <View style={[styles.optionCheck, selected && styles.optionCheckSelected]}>
                      {selected && <Text style={styles.optionCheckMark}>✓</Text>}
                    </View>
                    <Text style={[styles.optionText, selected && styles.optionTextSelected]}>
                      {opt}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ) : (
            <TextInput
              style={styles.answerInput}
              placeholder="Введите ответ..."
              placeholderTextColor={C.textDisabled}
              value={textInput}
              onChangeText={setTextInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          )}
        </ScrollView>

        <View style={styles.quizBottomBar}>
          <View style={styles.quizNavRow}>
            <TouchableOpacity onPress={handleBack} disabled={currentIdx === 0} style={[L.navBtn, currentIdx === 0 && { opacity: 0.3 }]}>
              <Text style={L.navBtnText}>Назад</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleAnswer}
              style={[L.navBtn, { backgroundColor: C.accent, borderColor: '#4A80F0', flex: 2 }]}
            >
              <Text style={[L.navBtnText, { color: C.white }]}>
                {currentIsAnswered ? 'Обновить ответ' : 'Ответить'}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onSkipPress}
              style={[L.navBtn, allAnswered && { backgroundColor: C.success, borderColor: C.success }]}
            >
              <Text style={[L.navBtnText, allAnswered && { color: C.white }]}>
                {allAnswered ? '✅ Завершить' : (() => {
                  if (currentIdx === questions.length - 1) {
                    const hasOtherSkipped = results.some((r, i) => r === null && i !== currentIdx);
                    return hasOtherSkipped ? '↩️ К пропущенным' : 'Завершить';
                  }
                  return 'Вперёд';
                })()}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity onPress={onAbort} style={L.abortBtn}>
            <Text style={L.abortBtnText}>Прервать тест и выйти</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
