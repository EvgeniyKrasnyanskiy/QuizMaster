import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Btn } from '../Btn';

// Mocking styles to prevent errors if they rely on native features
jest.mock('../../styles', () => ({
  styles: {
    btn: {},
    btnText: {}
  }
}));

describe('Btn Component', () => {
  it('should render the label correctly', () => {
    const { getByText } = render(<Btn label="Click Me" />);
    expect(getByText('Click Me')).toBeTruthy();
  });

  it('should call onPress when pressed', () => {
    const onPressMock = jest.fn();
    const { getByText } = render(<Btn label="Press Me" onPress={onPressMock} />);
    
    fireEvent.press(getByText('Press Me'));
    expect(onPressMock).toHaveBeenCalledTimes(1);
  });

  it('should be disabled when the disabled prop is true', () => {
    const onPressMock = jest.fn();
    const { getByText } = render(<Btn label="Disabled" onPress={onPressMock} disabled={true} />);
    
    fireEvent.press(getByText('Disabled'));
    expect(onPressMock).not.toHaveBeenCalled();
  });
});
