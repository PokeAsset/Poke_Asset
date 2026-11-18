export type Mode = 'dark' | 'light';

const dark = {
  bg: '#07090d',
  card: '#0d1117',
  panel: '#121821',
  border: '#1c232e',
  text: '#f1f5f9',
  muted: '#8b95a5',
  gold: '#dfb765',
  amber: '#f5b83d',
  orange: '#f58b4c',
  red: '#e8566f',
  pink: '#d0599b',
  purple: '#b66fd6',
  green: '#3ecf8e',
  giveBorder: '#5a2230',
  receiveBorder: '#134438',
  // tinted surfaces
  tintGold: '#1a1608',
  tintGoldBorder: '#6b5320',
  tintBlue: '#1b2230',
  tintSlot: '#111720',
  tintIcon: '#161b24',
  bubbleUser: '#2a2210',
  bubbleBot: '#141a24',
  noteBg: '#17130a',
  noteBorder: '#4a3c14',
  overlay: 'rgba(0,0,0,0.65)',
};

const light: typeof dark = {
  bg: '#f5f6f9',
  card: '#ffffff',
  panel: '#f0f2f6',
  border: '#dde1e8',
  text: '#10151d',
  muted: '#5d6676',
  gold: '#c9971f',
  amber: '#b97a00',
  orange: '#d66a1f',
  red: '#cc2f4a',
  pink: '#b43d85',
  purple: '#8f45b8',
  green: '#12935f',
  giveBorder: '#e9b4c0',
  receiveBorder: '#a9dcc6',
  tintGold: '#fdf3d8',
  tintGoldBorder: '#d9b45a',
  tintBlue: '#e4e9f2',
  tintSlot: '#eceff5',
  tintIcon: '#e9edf3',
  bubbleUser: '#fbefc9',
  bubbleBot: '#e9edf4',
  noteBg: '#fff7df',
  noteBorder: '#e2c26d',
  overlay: 'rgba(0,0,0,0.45)',
};

export const palettes: Record<Mode, typeof dark> = { dark, light };

/** Live colour object. applyTheme() rewrites it; screens re-mount to pick it up. */
export const colors: typeof dark = { ...dark };

let version = 0;
export let currentMode: Mode = 'dark';

export function applyTheme(mode: Mode) {
  Object.assign(colors, palettes[mode]);
  currentMode = mode;
  version += 1;
}

/**
 * Wraps a StyleSheet factory so styles are rebuilt after a theme change.
 * Use: const s = themed(() => StyleSheet.create({ ... }));
 */
export function themed<T extends object>(factory: () => T): T {
  let cache: T | null = null;
  let seen = -1;
  const get = (): T => {
    if (cache === null || seen !== version) {
      cache = factory();
      seen = version;
    }
    return cache;
  };
  return new Proxy({} as T, { get: (_t, key) => (get() as any)[key] });
}

// Colours used to fake the orange -> pink -> purple gradient on titles.
export const titleGradient = (): string[] => [colors.amber, colors.orange, colors.red, colors.pink, colors.purple];

export const radius = { sm: 12, md: 20, lg: 28, pill: 999 };
export const mono = 'Menlo';
