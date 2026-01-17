import { useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Button } from '../components';
import type { usePrData, GitHubPr } from '../hooks/usePrData';
import './Views.css';
import './PrsView.css';

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
    try {
      await invoke('run_code_review', { url: pr.url });
    } catch (err) {
      console.error('Failed to run code review:', err);
    }
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

  // Render a PR card with Claude button
  const renderPrCard = (pr: GitHubPr) => {
    return (
      <div key={pr.number} className="pr-card">
        <button
          className="pr-claude-btn"
          onClick={() => handleCodeReview(pr)}
          aria-label="Run code review"
          title="Run code review in terminal"
        >
          <img src="/claude.png" alt="Claude" className="claude-icon" />
        </button>
        <div className="pr-card-content">
          <div className="pr-card-header">
            <span className="pr-card-title">{pr.title}</span>
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
