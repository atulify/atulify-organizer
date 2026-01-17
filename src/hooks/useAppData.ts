import { invoke } from '@tauri-apps/api/core';
import { useState, useEffect, useCallback } from 'react';
import type { AppData } from '../types';

const defaultAppData: AppData = {
  tags: [],
  tasks: [],
  notes: [],
  brag_docs: [],
  notifications: [],
  settings: {
    theme: 'obsidian',
    dark_mode: true,
    launch_at_login: false,
    user_name: '',
    onboarding_complete: false,
  },
};

export function useAppData() {
  const [data, setData] = useState<AppData>(defaultAppData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const appData = await invoke<AppData>('get_all_data');
      setData(appData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      console.error('Failed to load data:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  const saveData = useCallback(async (newData: AppData) => {
    try {
      await invoke('save_all_data', { data: newData });
      setData(newData);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      console.error('Failed to save data:', e);
      throw e;
    }
  }, []);

  const updateData = useCallback(
    async (updater: (prev: AppData) => AppData) => {
      const newData = updater(data);
      await saveData(newData);
    },
    [data, saveData]
  );

  useEffect(() => {
    loadData();
  }, [loadData]);

  return {
    data,
    loading,
    error,
    loadData,
    saveData,
    updateData,
  };
}

export async function createBackup(): Promise<string> {
  return invoke<string>('create_backup');
}

export async function getBackups(): Promise<string[]> {
  return invoke<string[]>('get_backups');
}

export async function restoreBackup(backupName: string): Promise<AppData> {
  return invoke<AppData>('restore_backup', { backupName });
}

export async function saveImage(
  filename: string,
  data: number[]
): Promise<string> {
  return invoke<string>('save_image', { filename, data });
}

export async function deleteImage(filename: string): Promise<void> {
  return invoke('delete_image', { filename });
}

export async function getAppDataPath(): Promise<string> {
  return invoke<string>('get_app_data_path');
}
