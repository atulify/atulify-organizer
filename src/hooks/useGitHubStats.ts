import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface GitHubStats {
  prs_merged_mtd: number;
  prs_merged_prev_month: number;
  prs_merged_prev_3_months: number;
  prs_approved_mtd: number;
  prs_approved_prev_month: number;
  prs_approved_prev_3_months: number;
}

export interface GitHubStatsState {
  stats: GitHubStats | null;
  loading: boolean;
  error: string | null;
  lastRefresh: Date | null;
}

export function useGitHubStats() {
  const [state, setState] = useState<GitHubStatsState>({
    stats: null,
    loading: false,
    error: null,
    lastRefresh: null,
  });

  const initialFetch = useRef(false);

  const fetchStats = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    try {
      const stats = await invoke<GitHubStats>('fetch_github_stats');
      setState({
        stats,
        loading: false,
        error: null,
        lastRefresh: new Date(),
      });
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: String(err),
      }));
    }
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!initialFetch.current) {
      initialFetch.current = true;
      fetchStats();
    }
  }, [fetchStats]);

  return {
    ...state,
    fetchStats,
  };
}
