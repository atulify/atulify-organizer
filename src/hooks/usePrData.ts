import { useState, useCallback, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';

export interface PrApproval {
  username: string;
  approved_at: string;
}

export interface GitHubPr {
  number: number;
  title: string;
  url: string;
  author: string;
  created_at: string;
  approvals: PrApproval[];
  requested_reviewers: string[];
}

// Simplified state structure using nested objects to reduce re-renders
interface PrCategoryState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

export interface PrReviewsState {
  highPriority: PrCategoryState<GitHubPr>;
  mediumPriority: PrCategoryState<GitHubPr>;
  lowPriority: PrCategoryState<GitHubPr>;
  lastRefresh: Date | null;
  hasFetched: boolean;
}

export interface MyPrsState {
  approved: PrCategoryState<GitHubPr>;
  changesRequested: PrCategoryState<GitHubPr>;
  needsReview: PrCategoryState<GitHubPr>;
  lastRefresh: Date | null;
  hasFetched: boolean;
}

const initialCategoryState = <T>(): PrCategoryState<T> => ({
  data: [],
  loading: false,
  error: null,
});

export function usePrData() {
  // PR Reviews state - consolidated structure
  const [prReviews, setPrReviews] = useState<PrReviewsState>({
    highPriority: initialCategoryState(),
    mediumPriority: initialCategoryState(),
    lowPriority: initialCategoryState(),
    lastRefresh: null,
    hasFetched: false,
  });

  // My PRs state - consolidated structure
  const [myPrs, setMyPrs] = useState<MyPrsState>({
    approved: initialCategoryState(),
    changesRequested: initialCategoryState(),
    needsReview: initialCategoryState(),
    lastRefresh: null,
    hasFetched: false,
  });

  // Track if initial fetch has been done
  const prReviewsInitialFetch = useRef(false);
  const myPrsInitialFetch = useRef(false);

  // Generic fetch helper with force_refresh support
  const fetchCategory = useCallback(async <T>(
    command: string,
    forceRefresh: boolean = false
  ): Promise<T[]> => {
    return await invoke<T[]>(command, { forceRefresh });
  }, []);

  // PR Reviews fetch functions with force_refresh support
  const fetchHighPriority = useCallback(async (forceRefresh: boolean = false) => {
    setPrReviews(prev => ({
      ...prev,
      highPriority: { ...prev.highPriority, loading: true, error: null }
    }));
    try {
      const prs = await fetchCategory<GitHubPr>('fetch_high_priority_prs', forceRefresh);
      setPrReviews(prev => ({
        ...prev,
        highPriority: { data: prs, loading: false, error: null }
      }));
    } catch (err) {
      setPrReviews(prev => ({
        ...prev,
        highPriority: { ...prev.highPriority, error: String(err), loading: false }
      }));
    }
  }, [fetchCategory]);

  const fetchMediumPriority = useCallback(async (forceRefresh: boolean = false) => {
    setPrReviews(prev => ({
      ...prev,
      mediumPriority: { ...prev.mediumPriority, loading: true, error: null }
    }));
    try {
      const prs = await fetchCategory<GitHubPr>('fetch_medium_priority_prs', forceRefresh);
      setPrReviews(prev => ({
        ...prev,
        mediumPriority: { data: prs, loading: false, error: null }
      }));
    } catch (err) {
      setPrReviews(prev => ({
        ...prev,
        mediumPriority: { ...prev.mediumPriority, error: String(err), loading: false }
      }));
    }
  }, [fetchCategory]);

  const fetchLowPriority = useCallback(async (forceRefresh: boolean = false) => {
    setPrReviews(prev => ({
      ...prev,
      lowPriority: { ...prev.lowPriority, loading: true, error: null }
    }));
    try {
      const prs = await fetchCategory<GitHubPr>('fetch_low_priority_prs', forceRefresh);
      setPrReviews(prev => ({
        ...prev,
        lowPriority: { data: prs, loading: false, error: null }
      }));
    } catch (err) {
      setPrReviews(prev => ({
        ...prev,
        lowPriority: { ...prev.lowPriority, error: String(err), loading: false }
      }));
    }
  }, [fetchCategory]);

  const fetchAllPrReviews = useCallback(async (forceRefresh: boolean = false) => {
    await Promise.all([
      fetchHighPriority(forceRefresh),
      fetchMediumPriority(forceRefresh),
      fetchLowPriority(forceRefresh)
    ]);
    setPrReviews(prev => ({ ...prev, lastRefresh: new Date(), hasFetched: true }));
  }, [fetchHighPriority, fetchMediumPriority, fetchLowPriority]);

  // My PRs fetch functions with force_refresh support
  const fetchApproved = useCallback(async (forceRefresh: boolean = false) => {
    setMyPrs(prev => ({
      ...prev,
      approved: { ...prev.approved, loading: true, error: null }
    }));
    try {
      const prs = await fetchCategory<GitHubPr>('fetch_my_approved_prs', forceRefresh);
      setMyPrs(prev => ({
        ...prev,
        approved: { data: prs, loading: false, error: null }
      }));
    } catch (err) {
      setMyPrs(prev => ({
        ...prev,
        approved: { ...prev.approved, error: String(err), loading: false }
      }));
    }
  }, [fetchCategory]);

  const fetchChangesRequested = useCallback(async (forceRefresh: boolean = false) => {
    setMyPrs(prev => ({
      ...prev,
      changesRequested: { ...prev.changesRequested, loading: true, error: null }
    }));
    try {
      const prs = await fetchCategory<GitHubPr>('fetch_my_changes_requested_prs', forceRefresh);
      setMyPrs(prev => ({
        ...prev,
        changesRequested: { data: prs, loading: false, error: null }
      }));
    } catch (err) {
      setMyPrs(prev => ({
        ...prev,
        changesRequested: { ...prev.changesRequested, error: String(err), loading: false }
      }));
    }
  }, [fetchCategory]);

  const fetchNeedsReview = useCallback(async (forceRefresh: boolean = false) => {
    setMyPrs(prev => ({
      ...prev,
      needsReview: { ...prev.needsReview, loading: true, error: null }
    }));
    try {
      const prs = await fetchCategory<GitHubPr>('fetch_my_needs_review_prs', forceRefresh);
      setMyPrs(prev => ({
        ...prev,
        needsReview: { data: prs, loading: false, error: null }
      }));
    } catch (err) {
      setMyPrs(prev => ({
        ...prev,
        needsReview: { ...prev.needsReview, error: String(err), loading: false }
      }));
    }
  }, [fetchCategory]);

  const fetchAllMyPrs = useCallback(async (forceRefresh: boolean = false) => {
    await Promise.all([
      fetchApproved(forceRefresh),
      fetchChangesRequested(forceRefresh),
      fetchNeedsReview(forceRefresh)
    ]);
    setMyPrs(prev => ({ ...prev, lastRefresh: new Date(), hasFetched: true }));
  }, [fetchApproved, fetchChangesRequested, fetchNeedsReview]);

  // Force refresh all (invalidates cache and fetches fresh data)
  const forceRefreshAll = useCallback(async () => {
    await Promise.all([
      fetchAllPrReviews(true),
      fetchAllMyPrs(true)
    ]);
  }, [fetchAllPrReviews, fetchAllMyPrs]);

  // Invalidate cache without fetching (useful when you know data changed)
  const invalidateCache = useCallback(async (category?: string) => {
    try {
      await invoke('invalidate_pr_cache', { category });
    } catch (err) {
      console.error('Failed to invalidate cache:', err);
    }
  }, []);

  // Initial fetch on app startup (uses cache if available)
  useEffect(() => {
    if (!prReviewsInitialFetch.current) {
      prReviewsInitialFetch.current = true;
      fetchAllPrReviews(false); // Use cached data if available
    }
    if (!myPrsInitialFetch.current) {
      myPrsInitialFetch.current = true;
      fetchAllMyPrs(false); // Use cached data if available
    }
  }, [fetchAllPrReviews, fetchAllMyPrs]);

  // Hourly refresh with force_refresh to get fresh data
  useEffect(() => {
    const now = new Date();
    const msUntilNextHour = (60 - now.getMinutes()) * 60 * 1000 - now.getSeconds() * 1000 - now.getMilliseconds();

    const initialTimeout = setTimeout(() => {
      fetchAllPrReviews(true); // Force refresh on hourly interval
      fetchAllMyPrs(true);
      const interval = setInterval(() => {
        fetchAllPrReviews(true);
        fetchAllMyPrs(true);
      }, 60 * 60 * 1000);
      return () => clearInterval(interval);
    }, msUntilNextHour);

    return () => clearTimeout(initialTimeout);
  }, [fetchAllPrReviews, fetchAllMyPrs]);

  // Backward-compatible return object with flattened properties
  return {
    // PR Reviews - flattened for backward compatibility
    prReviews: {
      highPriority: prReviews.highPriority.data,
      mediumPriority: prReviews.mediumPriority.data,
      lowPriority: prReviews.lowPriority.data,
      loadingHigh: prReviews.highPriority.loading,
      loadingMedium: prReviews.mediumPriority.loading,
      loadingLow: prReviews.lowPriority.loading,
      errorHigh: prReviews.highPriority.error,
      errorMedium: prReviews.mediumPriority.error,
      errorLow: prReviews.lowPriority.error,
      lastRefresh: prReviews.lastRefresh,
      hasFetched: prReviews.hasFetched,
    },
    fetchHighPriority: () => fetchHighPriority(false),
    fetchMediumPriority: () => fetchMediumPriority(false),
    fetchLowPriority: () => fetchLowPriority(false),
    fetchAllPrReviews: () => fetchAllPrReviews(false),

    // My PRs - flattened for backward compatibility
    myPrs: {
      approved: myPrs.approved.data,
      changesRequested: myPrs.changesRequested.data,
      needsReview: myPrs.needsReview.data,
      loadingApproved: myPrs.approved.loading,
      loadingChangesRequested: myPrs.changesRequested.loading,
      loadingNeedsReview: myPrs.needsReview.loading,
      errorApproved: myPrs.approved.error,
      errorChangesRequested: myPrs.changesRequested.error,
      errorNeedsReview: myPrs.needsReview.error,
      lastRefresh: myPrs.lastRefresh,
      hasFetched: myPrs.hasFetched,
    },
    fetchApproved: () => fetchApproved(false),
    fetchChangesRequested: () => fetchChangesRequested(false),
    fetchNeedsReview: () => fetchNeedsReview(false),
    fetchAllMyPrs: () => fetchAllMyPrs(false),

    // New force refresh functions
    forceRefreshAll,
    forceRefreshPrReviews: () => fetchAllPrReviews(true),
    forceRefreshMyPrs: () => fetchAllMyPrs(true),
    invalidateCache,
  };
}
