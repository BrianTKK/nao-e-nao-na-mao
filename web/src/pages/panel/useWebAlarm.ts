import { useCallback, useEffect, useRef, useState } from 'react';
import type { Alert } from '@nenm/shared';
import { dataSource } from '../../data/source';

const STORAGE_KEY = 'mariana.panel.alarm';
const BEEP_EVERY_MS = 2500;

const store = {
  get(): boolean {
    try {
      return localStorage.getItem(STORAGE_KEY) === 'on';
    } catch {
      return false;
    }
  },
  set(on: boolean) {
    try {
      localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
    } catch {
      // armazenamento bloqueado: vale só nesta aba
    }
  },
};

export interface WebAlarm {
  /** Som ligado por quem coordena (fica lembrado neste navegador). */
  enabled: boolean;
  /** O navegador ainda espera um toque na página para liberar o som. */
  needsTap: boolean;
  notifications: NotificationPermission | 'unsupported';
  toggle: () => void;
  /** Última frase para o leitor de tela ("Alerta novo: Banheiro feminino"). */
  announcement: string;
  ringingCount: number;
}

/**
 * Alarme do painel: com o som ligado, toca um bipe de dois tons a cada 2,5 s
 * enquanto houver alerta que ninguém viu, e mostra o aviso do navegador
 * (Notification) a cada alerta novo, mesmo com a aba em segundo plano.
 * O navegador só deixa tocar som depois de um toque na página: por isso o
 * som começa desligado e liga pelo botão.
 */
export function useWebAlarm(active: boolean): WebAlarm {
  const [enabled, setEnabled] = useState(store.get);
  const [needsTap, setNeedsTap] = useState(false);
  const [notifications, setNotifications] = useState<WebAlarm['notifications']>(() =>
    typeof Notification === 'undefined' ? 'unsupported' : Notification.permission,
  );
  const [announcement, setAnnouncement] = useState('');
  const [ringing, setRinging] = useState<Alert[]>([]);
  const ctx = useRef<AudioContext | null>(null);

  const audio = useCallback(() => {
    if (!ctx.current && typeof AudioContext !== 'undefined') ctx.current = new AudioContext();
    return ctx.current;
  }, []);

  // Som lembrado de outra visita: espera o primeiro toque na página para liberar.
  useEffect(() => {
    if (!enabled) return;
    const a = audio();
    if (!a || a.state === 'running') return;
    setNeedsTap(true);
    const unlock = () => {
      a.resume().then(() => setNeedsTap(false)).catch(() => {});
    };
    document.addEventListener('pointerdown', unlock, { once: true });
    document.addEventListener('keydown', unlock, { once: true });
    return () => {
      document.removeEventListener('pointerdown', unlock);
      document.removeEventListener('keydown', unlock);
    };
  }, [enabled, audio]);

  // Lista ao vivo dos alertas abertos; toca o que for novo (ninguém viu).
  useEffect(() => {
    if (!active) return;
    let first = true;
    let known = new Set<string>();
    const shown = new Map<string, Notification>();
    const stop = dataSource.staff.watchActiveAlerts((list) => {
      const open = list.filter((a) => a.status === 'open');
      setRinging(open);
      const fresh = first ? [] : open.filter((a) => !known.has(a.id));
      known = new Set(open.map((a) => a.id));
      first = false;
      if (fresh.length > 0) setAnnouncement(`Alerta novo: ${fresh.map((a) => a.spotLabel).join(', ')}`);
      for (const a of fresh) {
        if (typeof Notification === 'undefined' || Notification.permission !== 'granted') continue;
        try {
          const n = new Notification(`Alerta · ${a.spotLabel}`, { body: 'Ninguém viu ainda. Abra o painel para atender.', tag: a.id, requireInteraction: true });
          n.onclick = () => {
            window.focus();
            n.close();
          };
          shown.set(a.id, n);
        } catch {
          // alguns navegadores só aceitam aviso pelo service worker
        }
      }
      // Fecha o aviso do que alguém já viu.
      for (const [id, n] of shown) {
        if (!known.has(id)) {
          n.close();
          shown.delete(id);
        }
      }
    });
    return () => {
      stop();
      for (const n of shown.values()) n.close();
      shown.clear();
    };
  }, [active]);

  // Bipe repetido enquanto houver alerta tocando.
  useEffect(() => {
    if (!enabled || ringing.length === 0) return;
    const beep = () => {
      const a = audio();
      if (!a || a.state !== 'running') return;
      const t = a.currentTime;
      for (const [i, freq] of [880, 660, 880].entries()) {
        const osc = a.createOscillator();
        const gain = a.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, t + i * 0.22);
        gain.gain.exponentialRampToValueAtTime(0.25, t + i * 0.22 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.22 + 0.2);
        osc.connect(gain).connect(a.destination);
        osc.start(t + i * 0.22);
        osc.stop(t + i * 0.22 + 0.21);
      }
    };
    beep();
    const timer = window.setInterval(beep, BEEP_EVERY_MS);
    return () => window.clearInterval(timer);
  }, [enabled, ringing.length, audio]);

  const toggle = useCallback(() => {
    const next = !enabled;
    setEnabled(next);
    store.set(next);
    if (next) {
      // O clique no botão é o toque que libera o som.
      audio()?.resume().then(() => setNeedsTap(false)).catch(() => {});
      if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
        Notification.requestPermission().then(setNotifications).catch(() => {});
      }
    }
  }, [enabled, audio]);

  return { enabled, needsTap, notifications, toggle, announcement, ringingCount: ringing.length };
}
