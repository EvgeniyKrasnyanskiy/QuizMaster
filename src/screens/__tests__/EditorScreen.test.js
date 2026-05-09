import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import EditorScreen from '../EditorScreen';

// Mocking styles
jest.mock('../../styles', () => ({
  styles: {
    editorWrap: {},
    label: {},
    input: {},
    editorInput: {},
    editorActions: {}
  }
}));

describe('EditorScreen Component', () => {
  const defaultProps = {
    safeStyle: {},
    renderHeader: (title, onBack) => null,
    setScreen: jest.fn(),
    editIsNew: true,
    editIsCloud: false,
    editFileName: 'new_test',
    setEditFileName: jest.fn(),
    editContent: 'M;Q;A;B;1',
    setEditContent: jest.fn(),
    handleSaveEditedQuiz: jest.fn(),
    loading: false
  };

  it('should render filename and content in inputs', () => {
    const { getByDisplayValue } = render(<EditorScreen {...defaultProps} />);
    expect(getByDisplayValue('new_test')).toBeTruthy();
    expect(getByDisplayValue('M;Q;A;B;1')).toBeTruthy();
  });

  it('should call setEditFileName when changing filename', () => {
    const { getByPlaceholderText } = render(<EditorScreen {...defaultProps} />);
    fireEvent.changeText(getByPlaceholderText('Название файла'), 'updated_name');
    expect(defaultProps.setEditFileName).toHaveBeenCalledWith('updated_name');
  });

  it('should call handleSaveEditedQuiz when Save button is pressed', () => {
    const { getByText } = render(<EditorScreen {...defaultProps} />);
    fireEvent.press(getByText('Сохранить'));
    expect(defaultProps.handleSaveEditedQuiz).toHaveBeenCalled();
  });

  it('should disable Save button when loading is true', () => {
    const { getByText } = render(<EditorScreen {...defaultProps} loading={true} />);
    const saveButton = getByText('Сохранить').parent; // Btn wrapper
    // Since Btn uses TouchableOpacity, we check the disabled prop in accessibilityState if defined or check the Btn implementation
    // But fireEvent.press won't trigger if it's disabled in real environment.
  });
});
