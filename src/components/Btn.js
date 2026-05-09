import React from 'react';
import { TouchableOpacity, Text } from 'react-native';
import { C } from '../constants';
import { styles } from '../styles';

export const Btn = ({ label, onPress, disabled, variant = 'primary', style, textStyle, children }) => {
  const bgColor =
    disabled ? C.border :
      variant === 'primary' ? C.accent :
        variant === 'success' ? C.success :
          variant === 'danger' ? C.danger :
            variant === 'ghost' ? 'transparent' :
              variant === 'black' ? '#111' :
                variant === 'gold' ? '#FFD700' : C.surfaceHigh;

  const borderColor = variant === 'ghost' ? C.border : (variant === 'black' ? '#FFD700' : (variant === 'gold' ? '#FFA700' : (variant === 'primary' ? '#4A80F0' : 'transparent')));
  const borderWidth = (variant === 'ghost' || variant === 'black' || variant === 'gold' || variant === 'primary') ? 1 : 0;

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={!!disabled}
      accessibilityState={{ disabled: !!disabled }}
      activeOpacity={0.75}
      style={[
        styles.btn,
        { backgroundColor: bgColor, borderColor, borderWidth },
        style,
      ]}
    >
      {children || (
        <Text style={[styles.btnText, { color: disabled ? C.textDisabled : (variant === 'gold' ? '#111' : C.white) }, textStyle]}>
          {label}
        </Text>
      )}
    </TouchableOpacity>
  );
};
