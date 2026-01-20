import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button, ProgressCircle } from '../components';
import type { usePrData, GitHubPr } from '../hooks/usePrData';
import './Views.css';
import './PrsView.css';

// LRU limit for completed reviews map
const MAX_COMPLETED_REVIEWS = 50;

interface CodeReviewCompleted {
  url: string;
  output_file: string;
  success: boolean;
  error: string | null;
}

interface ReviewInProgress {
  url: string;
  startTime: number;
}

interface MyPrsViewProps {
  prData: ReturnType<typeof usePrData>;
}

type PrioritySection = 'approved' | 'changes-requested' | 'needs-review';

export function MyPrsView({ prData }: MyPrsViewProps) {
  const {
    myPrs,
    fetchApproved,
    fetchChangesRequested,
    fetchNeedsReview,
    fetchAllMyPrs,
  } = prData;

  const [collapsedSections, setCollapsedSections] = useState<Set<PrioritySection>>(new Set());
  const [reviewInProgress, setReviewInProgress] = useState<ReviewInProgress | null>(null);
  const [completedReviews, setCompletedReviews] = useState<Map<string, string>>(new Map());

  // Listen for code review completion events
  useEffect(() => {
    const unlisten = listen<CodeReviewCompleted>('code-review::completed', (event) => {
      const { url, output_file, success, error } = event.payload;
      setReviewInProgress(null);
      if (success) {
        // Store the output file path with LRU bounding
        setCompletedReviews((prev) => {
          const newMap = new Map(prev);
          if (newMap.size >= MAX_COMPLETED_REVIEWS) {
            const oldestKey = newMap.keys().next().value;
            if (oldestKey) newMap.delete(oldestKey);
          }
          newMap.set(url, output_file);
          return newMap;
        });
      } else if (error) {
        console.error('Code review failed:', error);
      }
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // Toggle section collapse
  const toggleSection = (section: PrioritySection) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(section)) {
        next.delete(section);
      } else {
        next.add(section);
      }
      return next;
    });
  };

  // Handle Claude button click for a PR
  const handleCodeReview = async (pr: GitHubPr) => {
    setReviewInProgress({ url: pr.url, startTime: Date.now() });
    try {
      await invoke('run_code_review', { url: pr.url });
    } catch (err) {
      console.error('Failed to run code review:', err);
      setReviewInProgress(null);
    }
  };

  // Open completed review in Obsidian
  const openReview = (outputFile: string) => {
    const fileName = outputFile.split('/').pop()?.replace('.md', '') || '';
    const obsidianUri = `obsidian://open?vault=atul&file=pr-reviews/${fileName}`;
    window.open(obsidianUri, '_blank');
  };

  // Format relative time
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays}d ago`;
    } else if (diffHours > 0) {
      return `${diffHours}h ago`;
    } else {
      const diffMins = Math.floor(diffMs / (1000 * 60));
      return `${diffMins}m ago`;
    }
  };

  // Render a PR card
  const renderPrCard = (pr: GitHubPr) => {
    const isReviewing = reviewInProgress?.url === pr.url;
    const completedReviewFile = completedReviews.get(pr.url);

    return (
      <div key={pr.number} className="pr-card">
        <button
          className={`pr-claude-btn ${isReviewing ? 'reviewing' : ''}`}
          onClick={() => handleCodeReview(pr)}
          aria-label="Run code review"
          title={isReviewing ? 'Review in progress...' : 'Run code review'}
          disabled={isReviewing}
        >
          {isReviewing && reviewInProgress ? (
            <ProgressCircle startTime={reviewInProgress.startTime} size="sm" />
          ) : (
            <img src="/claude.png" alt="Claude" className="claude-icon" />
          )}
        </button>
        <div className="pr-card-content">
          <div className="pr-card-header">
            <span className="pr-card-title">{pr.title}</span>
            {completedReviewFile && (
              <button
                className="pr-review-link"
                onClick={() => openReview(completedReviewFile)}
                title="Open review in Obsidian"
              >
                View Review
              </button>
            )}
          </div>
          <div className="pr-card-meta">
            <a href={pr.url} target="_blank" rel="noopener noreferrer" className="pr-card-link">
              shop/world#{pr.number}
            </a>
            <span className="pr-card-time">{formatRelativeTime(pr.created_at)}</span>
          </div>
          {pr.approvals.length > 0 && (
            <div className="pr-card-approvals">
              {pr.approvals.map((approval) => (
                <span key={approval.username} className="pr-card-approval">
                  <span className="approval-checkmark">&#10003;</span>
                  {approval.username}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  // Render a section
  const renderSection = (
    title: string,
    section: PrioritySection,
    prs: GitHubPr[],
    loading: boolean,
    error: string | null,
    onRefresh: () => void,
    priorityClass: string
  ) => {
    const isCollapsed = collapsedSections.has(section);

    return (
      <div className={`prs-section ${priorityClass}`}>
        <div className="prs-section-header" onClick={() => toggleSection(section)}>
          <div className="prs-section-title-row">
            <span className="prs-section-toggle">{isCollapsed ? '+' : '-'}</span>
            <h2 className="prs-section-title">{title}</h2>
            <span className="prs-section-count">({prs.length})</span>
            {loading && <div className="spinner spinner-sm"></div>}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onRefresh();
            }}
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </Button>
        </div>
        {!isCollapsed && (
          <div className="prs-section-content">
            {error && <div className="prs-error">{error}</div>}
            {loading && prs.length === 0 && (
              <div className="prs-loading">
                <div className="spinner"></div>
                <span>Loading PRs...</span>
              </div>
            )}
            {!loading && prs.length === 0 && !error && (
              <div className="prs-empty">No PRs in this category</div>
            )}
            {prs.length > 0 && (
              <div className="prs-list">
                {prs.map((pr) => renderPrCard(pr))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  };

  const isLoading = myPrs.loadingApproved || myPrs.loadingChangesRequested || myPrs.loadingNeedsReview;

  return (
    <div className="view prs-view">
      <div className="view-header">
        <div className="view-header-content">
          <div>
            <h1 className="view-title">My PRs</h1>
            {myPrs.lastRefresh && (
              <p className="last-refresh">
                Last updated: {myPrs.lastRefresh.toLocaleTimeString()}
              </p>
            )}
          </div>
          <div className="view-header-actions">
            <Button onClick={fetchAllMyPrs} disabled={isLoading}>
              Refresh All
            </Button>
            <div className="github-profile">
              <img
                src="https://github.com/atulify.png"
                alt="atulify"
                className="github-avatar"
              />
            </div>
          </div>
        </div>
      </div>

      <div className="view-content">
        {renderSection(
          'Approved',
          'approved',
          myPrs.approved,
          myPrs.loadingApproved,
          myPrs.errorApproved,
          fetchApproved,
          'status-approved'
        )}

        {renderSection(
          'Needs Attention',
          'changes-requested',
          myPrs.changesRequested,
          myPrs.loadingChangesRequested,
          myPrs.errorChangesRequested,
          fetchChangesRequested,
          'status-needs-attention'
        )}

        {renderSection(
          'Need Reviews',
          'needs-review',
          myPrs.needsReview,
          myPrs.loadingNeedsReview,
          myPrs.errorNeedsReview,
          fetchNeedsReview,
          'status-needs-review'
        )}
      </div>
    </div>
  );
}
