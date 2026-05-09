import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import TeacherLibraryScreen from '../TeacherLibraryScreen';

// Mocking icons and styles
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('../../styles', () => ({
  styles: {
    fileActionBtn: {},
    headerBack: {},
    headerBackText: {},
    libraryWrap: {},
    libraryRow: {},
    libraryTitle: {},
    libraryMeta: {},
    welcomeDesc: {},
    deleteBtn: {},
    deleteBtnText: {}
  }
}));

describe('TeacherLibraryScreen Component', () => {
  const defaultProps = {
    safeStyle: {},
    renderHeader: (title, onBack, right) => right,
    setScreen: jest.fn(),
    setLoading: jest.fn(),
    fetchCloudRegistry: jest.fn().mockResolvedValue([]),
    setCloudRegistry: jest.fn(),
    teacherLibraryFiles: [
      { path: 'teacher/test1', name: 'test1.dat', displayName: 'My Quiz', size: 1024, questionCount: 10, canEdit: true }
    ],
    cloudRegistry: [],
    teacherProfile: { token: 'mock-token' },
    handleOpenTeacherFileEditor: jest.fn(),
    handleUnpublishFromCloud: jest.fn(),
    handlePublishToCloud: jest.fn(),
    handleShareFile: jest.fn(),
    handleDeleteLibraryFile: jest.fn(),
    handleCreateTeacherQuiz: jest.fn(),
    handleEncryptAndSave: jest.fn(),
    handleDeleteAllFiles: jest.fn(),
    SafeDirs: { TEACHER: 'teacher/', DOWNLOADS: 'downloads/' },
    stripDatExtension: (s) => s.replace('.dat', ''),
    formatNiceDate: (d) => '01.01.2026',
    L: { libraryWrap: {} }
  };

  it('should render quiz title and question count', () => {
    const { getByText } = render(<TeacherLibraryScreen {...defaultProps} />);
    expect(getByText('My Quiz')).toBeTruthy();
    expect(getByText(/Вопросов: 10/)).toBeTruthy();
  });

  it('should show cloud icon if quiz is in cloud registry', () => {
    const propsWithCloud = {
      ...defaultProps,
      cloudRegistry: [{ id: 'test1' }]
    };
    const { getByText } = render(<TeacherLibraryScreen {...propsWithCloud} />);
    expect(getByText('☁️')).toBeTruthy();
  });

  it('should call handleCreateTeacherQuiz when "Создать тест" is pressed', () => {
    const { getByText } = render(<TeacherLibraryScreen {...defaultProps} />);
    fireEvent.press(getByText('📝 Создать тест'));
    expect(defaultProps.handleCreateTeacherQuiz).toHaveBeenCalled();
  });

  it('should call fetchCloudRegistry when Cloud button in header is pressed', async () => {
    const { getByText } = render(<TeacherLibraryScreen {...defaultProps} />);
    fireEvent.press(getByText('Облако'));
    
    await waitFor(() => {
      expect(defaultProps.fetchCloudRegistry).toHaveBeenCalled();
      expect(defaultProps.setScreen).toHaveBeenCalledWith('cloud-manager');
    });
  });
});
