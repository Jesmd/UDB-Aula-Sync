import { useCallback, useEffect, useState } from 'preact/hooks';
import { loadSettings, saveSettings } from '../storage/settings';
import type { Settings } from '../storage/settings-schema';

export type SaveState = 'idle' | 'saved' | 'error';

export interface SettingsProps {
  readonly settings: Settings;
  /** Applies a change and saves at once (the page and the worker read it on change). */
  readonly update: (change: (current: Settings) => Settings) => void;
}

export function useSettings(): {
  settings: Settings | null;
  update: SettingsProps['update'];
  saveState: SaveState;
} {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');

  useEffect(() => {
    void loadSettings().then(setSettings);
  }, []);

  const update = useCallback<SettingsProps['update']>((change) => {
    setSettings((current) => {
      if (current === null) return current;
      const next = change(current);
      saveSettings(next).then(
        () => {
          setSaveState('saved');
        },
        () => {
          setSaveState('error');
        },
      );
      return next;
    });
  }, []);

  return { settings, update, saveState };
}
