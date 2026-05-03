import { StyleSheet, Platform, StatusBar } from 'react-native';
import { C } from './constants';

export const styles = StyleSheet.create({
  // ─── Base ───────────────────────────────────────────────
  flex: { flex: 1 },
  safe: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ─── Welcome screen ─────────────────────────────────────
  logoCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: C.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  logoText: {
    fontSize: 36,
    fontWeight: '800',
    color: C.white,
  },
  welcomeTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: C.textPrimary,
    textAlign: 'center',
    marginBottom: 10,
  },
  welcomeDesc: {
    fontSize: 14,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  centralInputBlock: {
    width: '100%',
    paddingVertical: 10,
  },

  // ─── Form elements ──────────────────────────────────────
  label: {
    fontSize: 12,
    color: C.textSecondary,
    marginBottom: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  input: {
    height: 52,
    borderRadius: 12,
    backgroundColor: C.surfaceHigh,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    color: C.textPrimary,
    fontSize: 15,
    marginBottom: 16,
  },
  btn: {
    height: 54,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    flexDirection: 'row',
    // Shadow for premium look
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 4,
  },
  btnText: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },

  // ─── Card ───────────────────────────────────────────────
  card: {
    backgroundColor: C.surface,
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: C.border,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 8,
  },
  cardDesc: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 20,
  },

  // ─── Screen header ──────────────────────────────────────
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 20,
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
  },
  headerTitle: {
    position: 'absolute',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: 22,
    fontWeight: 'bold',
    color: C.textPrimary,
    zIndex: -1,
  },
  headerBack: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 70,
    zIndex: 10,
  },
  headerBackText: {
    color: C.accent,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: -4,
  },
  screenHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: C.textPrimary,
    flex: 1,
    textAlign: 'center',
    marginRight: 70,
  },
  backBtn: {
    paddingVertical: 4,
    paddingRight: 12,
    width: 70,
  },
  backBtnText: {
    color: C.accent,
    fontSize: 14,
    fontWeight: '600',
  },

  // ─── Teacher screen ─────────────────────────────────────
  teacherContent: {
    padding: 16,
    paddingBottom: 40,
  },
  codeHint: {
    marginTop: 12,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
    fontSize: 11,
    color: C.textSecondary,
    backgroundColor: C.bg,
    padding: 10,
    borderRadius: 8,
  },
  configLine: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 8,
  },
  configVal: {
    color: C.accent,
    fontWeight: '600',
  },
  warningText: {
    color: C.warning,
    fontSize: 12,
    marginTop: 8,
    lineHeight: 18,
  },
  libraryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 12,
    padding: 12,
    marginBottom: 10,
    gap: 8,
  },
  libraryMainBtn: {
    flex: 1,
  },
  libraryTitle: {
    color: C.textPrimary,
    fontSize: 14,
    fontWeight: '600',
  },
  libraryMeta: {
    color: C.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  fileActionBtn: {
    borderWidth: 1,
    borderColor: C.accent,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  fileActionText: {
    color: C.accent,
    fontSize: 12,
    fontWeight: '700',
  },
  deleteBtn: {
    borderWidth: 1,
    borderColor: C.danger,
    borderRadius: 8,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  deleteBtnText: {
    color: C.danger,
    fontSize: 12,
    fontWeight: '700',
  },
  editorWrap: {
    flex: 1,
    padding: 16,
  },
  editorInput: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    color: C.textPrimary,
    padding: 12,
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },
  editorActions: {
    marginTop: 12,
  },

  // ─── Loading screen ─────────────────────────────────────
  loadingIcon: {
    marginBottom: 20,
  },
  loadingActions: {
    width: '100%',
    marginTop: 32,
  },

  // ─── Quiz screen: top bar ───────────────────────────────
  quizTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
  },
  quizProgress: {
    flex: 1,
  },
  quizProgressLabel: {
    fontSize: 12,
    color: C.textSecondary,
    marginBottom: 6,
  },
  progressBarBg: {
    height: 4,
    backgroundColor: C.border,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: C.accent,
    borderRadius: 2,
  },
  timerBox: {
    backgroundColor: C.surfaceHigh,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.border,
  },
  timerText: {
    fontSize: 14,
    fontWeight: '700',
    color: C.warning,
    fontFamily: Platform.OS === 'ios' ? 'Courier New' : 'monospace',
  },

  // ─── Quiz screen: body ──────────────────────────────────
  quizBody: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  questionText: {
    fontSize: 18,
    fontWeight: '600',
    color: C.textPrimary,
    lineHeight: 28,
    marginBottom: 12,
  },
  hintText: {
    fontSize: 13,
    color: C.textSecondary,
    marginBottom: 16,
    fontStyle: 'italic',
  },

  // ─── Quiz screen: options (multi) ───────────────────────
  optionsContainer: {
    gap: 10,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: C.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: C.border,
    padding: 14,
    gap: 12,
  },
  optionSelected: {
    borderColor: C.accent,
    backgroundColor: C.accentSoft + '22',
  },
  optionCheck: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionCheckSelected: {
    borderColor: C.accent,
    backgroundColor: C.accent,
  },
  optionCheckMark: {
    color: C.white,
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    textAlignVertical: 'center',
    includeFontPadding: false,
    lineHeight: 20,
  },
  optionText: {
    flex: 1,
    fontSize: 15,
    color: C.textSecondary,
  },
  optionTextSelected: {
    color: C.textPrimary,
    fontWeight: '600',
  },

  // ─── Quiz screen: text answer ───────────────────────────
  answerInput: {
    height: 52,
    borderRadius: 12,
    backgroundColor: C.surface,
    borderWidth: 1,
    borderColor: C.border,
    paddingHorizontal: 16,
    color: C.textPrimary,
    fontSize: 15,
    marginTop: 8,
  },

  // ─── Quiz screen: bottom bar ────────────────────────────
  quizBottomBar: {
    padding: 16,
    paddingBottom: Platform.OS === 'android' ? 16 : 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },
  quizNavRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 0,
  },
  navBtn: {
    flex: 1,
  },

  // ─── Results screen ─────────────────────────────────────
  scoreCard: {
    alignItems: 'center',
    marginBottom: 20,
    borderWidth: 2,
  },
  scorePercent: {
    fontSize: 56,
    fontWeight: '800',
  },
  scoreLabel: {
    fontSize: 16,
    color: C.textPrimary,
    marginTop: 4,
    fontWeight: '600',
  },
  scoreVerdict: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
  },
  scoreMeta: {
    fontSize: 13,
    color: C.textSecondary,
    marginTop: 6,
  },
  resultRow: {
    backgroundColor: C.surface,
    borderRadius: 12,
    padding: 14,
    marginBottom: 10,
    borderLeftWidth: 4,
    borderWidth: 1,
    borderColor: C.border,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    gap: 8,
  },
  resultNum: {
    fontSize: 12,
    color: C.textDisabled,
    fontWeight: '600',
    width: 20,
  },
  resultMark: {
    fontSize: 14,
  },
  resultTime: {
    fontSize: 12,
    color: C.textSecondary,
    marginLeft: 'auto',
  },
  resultQ: {
    fontSize: 13,
    color: C.textSecondary,
    lineHeight: 19,
  },
  resultsActions: {
    padding: 16,
    paddingBottom: Platform.OS === 'android' ? 16 : 8,
    borderTopWidth: 1,
    borderTopColor: C.border,
    backgroundColor: C.bg,
  },

  // ─── Modal & Help ───────────────────────────────────────
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    padding: 20,
  },
  helpCard: {
    backgroundColor: C.surface,
    borderRadius: 20,
    padding: 24,
    maxHeight: '80%',
    borderWidth: 1,
    borderColor: C.border,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: C.textPrimary,
  },
  helpText: {
    fontSize: 14,
    color: C.textSecondary,
    lineHeight: 22,
    marginBottom: 16,
  },
  helpBtn: {
    width: 34,
    height: 34,
    borderWidth: 1,
    borderColor: C.border,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.surfaceHigh,
    zIndex: 100,
  },
  helpBtnText: {
    color: C.accent,
    fontSize: 18,
    fontWeight: '700',
  },

  // ─── Smart Action Modal ────────────────────────────────
  actionModalContent: {
    backgroundColor: C.surface,
    borderRadius: 24,
    padding: 24,
    borderWidth: 1,
    borderColor: C.border,
  },
  actionModalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: C.textPrimary,
    marginBottom: 20,
    textAlign: 'center',
  },
  actionOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    gap: 12,
  },
  actionOptionLast: {
    borderBottomWidth: 0,
  },
  actionOptionText: {
    fontSize: 16,
    fontWeight: '600',
    color: C.textPrimary,
  },
  actionOptionDanger: {
    color: C.danger,
  },
});
