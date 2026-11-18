import { createContext, useContext } from 'react';
import { Mode } from './theme';

export const ThemeModeCtx = createContext<{ mode: Mode; toggle: () => void }>({
  mode: 'dark',
  toggle: () => {},
});

export const useThemeMode = () => useContext(ThemeModeCtx);
