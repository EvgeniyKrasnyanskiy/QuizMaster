import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import WelcomeScreen from '../WelcomeScreen';

// Mocking icons and styles
jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

jest.mock('../../styles', () => ({
  styles: {
    flex: {},
    logoCircle: {},
    welcomeTitle: {},
    welcomeDesc: {},
    label: {},
    input: {},
    helpBtn: {},
    helpBtnText: {}
  }
}));

describe('WelcomeScreen Component', () => {
  const defaultProps = {
    safeStyle: {},
    insets: { top: 0 },
    config: { title: 'Test Title', welcomeDesc: 'Test Desc' },
    newTestsCount: 0,
    userName: '',
    handleNameChange: jest.fn(),
    handleContinueStudent: jest.fn(),
    handleExitApp: jest.fn(),
    setHelpType: jest.fn(),
    setHelpVisible: jest.fn(),
    L: { halfBottom: {} }
  };

  it('should render title and description from config', () => {
    const { getByText } = render(<WelcomeScreen {...defaultProps} />);
    expect(getByText('Test Title')).toBeTruthy();
    expect(getByText('Test Desc')).toBeTruthy();
  });

  it('should call handleNameChange when text is entered', () => {
    const { getByPlaceholderText } = render(<WelcomeScreen {...defaultProps} />);
    const input = getByPlaceholderText('Введите ваше имя...');
    
    fireEvent.changeText(input, 'John Doe');
    expect(defaultProps.handleNameChange).toHaveBeenCalledWith('John Doe');
  });

  it('should show new tests count badge when count > 0', () => {
    const { getByText } = render(<WelcomeScreen {...defaultProps} newTestsCount={5} />);
    expect(getByText(/Появились новые задания \(5\)/)).toBeTruthy();
  });

  it('should call handleContinueStudent when Enter button is pressed', () => {
    const { getByText } = render(<WelcomeScreen {...defaultProps} userName="John" />);
    const loginButton = getByText('Войти');
    
    fireEvent.press(loginButton);
    expect(defaultProps.handleContinueStudent).toHaveBeenCalled();
  });
});
