import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AccessibilityInfo } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'nenm.reduceMotion';

interface MotionState {
  /** Verdadeiro se o sistema ou o próprio app pediram menos movimento. */
  reduceMotion: boolean;
  systemReduceMotion: boolean;
  /** Escolha feita na tela de Ajustes ("Reduzir movimento"). */
  appReduceMotion: boolean;
  setAppReduceMotion: (v: boolean) => void;
}

const MotionContext = createContext<MotionState>({
  reduceMotion: false,
  systemReduceMotion: false,
  appReduceMotion: false,
  setAppReduceMotion: () => {},
});

export function MotionProvider({ children }: { children: ReactNode }) {
  const [system, setSystem] = useState(false);
  const [app, setApp] = useState(false);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setSystem).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setSystem);
    AsyncStorage.getItem(KEY)
      .then((v) => setApp(v === '1'))
      .catch(() => {});
    return () => sub.remove();
  }, []);

  const value = useMemo<MotionState>(
    () => ({
      reduceMotion: system || app,
      systemReduceMotion: system,
      appReduceMotion: app,
      setAppReduceMotion: (v) => {
        setApp(v);
        AsyncStorage.setItem(KEY, v ? '1' : '0').catch(() => {});
      },
    }),
    [system, app],
  );

  return <MotionContext.Provider value={value}>{children}</MotionContext.Provider>;
}

export const useMotion = () => useContext(MotionContext);
