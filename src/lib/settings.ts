import { useEffect, useState } from 'react';

export type ScrollMode = 'auto' | 'voice';

export interface PrompterSettings {
  fontSize: number; // px
  lineHeight: number; // multiplier
  margin: number; // side padding, % of width
  textColor: string;
  bgColor: string;
  align: 'left' | 'center';
  uppercase: boolean;
  speed: number; // 1–30, roughly lines-per-minute scaled
  mode: ScrollMode;
  mirrorX: boolean; // flip horizontally (beam-splitter glass)
  mirrorY: boolean; // flip vertically (upside-down mounts)
  guide: boolean; // reading-line marker
  guidePos: number; // % from the top of the screen
  countdown: number; // seconds before auto-scroll starts (0 = off)
  voiceLang: string;
}

export const DEFAULT_SETTINGS: PrompterSettings = {
  fontSize: 40,
  lineHeight: 1.45,
  margin: 6,
  textColor: '#ffffff',
  bgColor: '#000000',
  align: 'left',
  uppercase: false,
  speed: 10,
  mode: 'auto',
  mirrorX: false,
  mirrorY: false,
  guide: true,
  guidePos: 30,
  countdown: 3,
  voiceLang: typeof navigator !== 'undefined' ? navigator.language || 'en-US' : 'en-US',
};

export const COLOR_PRESETS: { name: string; text: string; bg: string }[] = [
  { name: 'Classic', text: '#ffffff', bg: '#000000' },
  { name: 'TACL', text: '#ffc933', bg: '#151513' },
  { name: 'Daylight', text: '#151513', bg: '#ffffff' },
  { name: 'Sunglow', text: '#151513', bg: '#ffc933' },
  { name: 'Soft', text: '#dadad2', bg: '#151513' },
  { name: 'Green', text: '#5dff7a', bg: '#000000' },
];

const KEY = 'tacl-teleprompt:settings';

function load(): PrompterSettings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<PrompterSettings>) } : DEFAULT_SETTINGS;
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/** Display settings are per device: each rig and room needs its own. */
export function usePrompterSettings() {
  const [settings, setSettings] = useState<PrompterSettings>(load);

  useEffect(() => {
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      /* storage full or blocked; settings still work for this session */
    }
  }, [settings]);

  const update = (patch: Partial<PrompterSettings>) => setSettings((s) => ({ ...s, ...patch }));
  const reset = () => setSettings({ ...DEFAULT_SETTINGS, voiceLang: settings.voiceLang });

  return { settings, update, reset };
}

/** Speed slider value → pixels per second, scaled to line height so speed feels the same at any font size. */
export function pixelsPerSecond(s: PrompterSettings) {
  const linePx = s.fontSize * s.lineHeight;
  return (s.speed / 15) * linePx;
}
