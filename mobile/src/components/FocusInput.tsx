import { useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';
import { color, ui } from '@/theme/theme';

/** Campo de texto do app: borda de controle e, em foco, borda de foco (amarelo-claro) mais grossa. */
export function FocusInput({ style, onFocus, onBlur, ...props }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      placeholderTextColor={color.textMuted}
      {...props}
      style={[ui.input, style, focused && { borderColor: color.focus, borderWidth: 2 }]}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
    />
  );
}
