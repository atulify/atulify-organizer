import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { Button, Modal, ProgressCircle } from '../components';
import type { AppData, ViewType, Task } from '../types';
import type { usePrData, GitHubPr } from '../hooks/usePrData';
import './Views.css';
import './TodayView.css';

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

interface TodayViewProps {
  data: AppData;
  onDataChange: (data: AppData) => void;
  onNavigate: (view: ViewType) => void;
  prData: ReturnType<typeof usePrData>;
}

export function TodayView({ data, onDataChange, onNavigate, prData }: TodayViewProps) {
  const [showQuickTask, setShowQuickTask] = useState(false);
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [codeReviewsCollapsed, setCodeReviewsCollapsed] = useState(false);
  const [reviewInProgress, setReviewInProgress] = useState<ReviewInProgress | null>(null);
  const [completedReviews, setCompletedReviews] = useState<Map<string, string>>(new Map());

  const { prReviews, myPrs } = prData;

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

  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const formatDisplayDate = () => {
    return today.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  };

  const greeting = data.settings.user_name
    ? `Hello, ${data.settings.user_name}`
    : 'Hello';

  // Get today's scheduled tasks (not completed, not archived)
  const todaysTasks = data.tasks.filter(
    (task) =>
      task.scheduled_date === todayStr &&
      !task.completed &&
      !task.archived
  );

  // Get carry-over tasks (scheduled for past dates, not completed, not archived)
  const carryOverTasks = data.tasks.filter(
    (task) =>
      task.scheduled_date &&
      task.scheduled_date < todayStr &&
      !task.completed &&
      !task.archived
  );

  // Get recent notes (last 5, sorted by updated_at descending)
  const recentNotes = [...data.notes]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, 5);

  // Task completion handler
  const handleToggleTask = (taskId: string) => {
    const now = new Date().toISOString();
    onDataChange({
      ...data,
      tasks: data.tasks.map((task) =>
        task.id === taskId
          ? {
              ...task,
              completed: !task.completed,
              completed_at: !task.completed ? now : null,
            }
          : task
      ),
    });
  };

  // Quick add task
  const handleQuickAddTask = () => {
    if (!quickTaskTitle.trim()) return;

    const newTask: Task = {
      id: crypto.randomUUID(),
      title: quickTaskTitle.trim(),
      completed: false,
      created_at: new Date().toISOString(),
      completed_at: null,
      scheduled_date: todayStr,
      tag_ids: [],
      resource_links: [],
      archived: false,
      task_type: 'regular',
      task_url: null,
    };

    onDataChange({
      ...data,
      tasks: [...data.tasks, newTask],
    });

    setQuickTaskTitle('');
    setShowQuickTask(false);
  };

  // Format note preview
  const getNotePreview = (content: string, maxLength = 80) => {
    const firstLine = content.split('\n')[0];
    if (firstLine.length > maxLength) {
      return firstLine.substring(0, maxLength) + '...';
    }
    return firstLine || 'Empty note';
  };

  // Format relative time
  const formatRelativeTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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

  // Render a PR card for TodayView
  const renderTodayPrCard = (pr: GitHubPr, variant: 'high' | 'approved' | 'needs-attention') => {
    const isReviewing = reviewInProgress?.url === pr.url;
    const completedReviewFile = completedReviews.get(pr.url);

    return (
      <div key={pr.number} className={`today-pr-card ${variant}`}>
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
        <div className="today-pr-content">
          <div className="today-pr-header">
            <span className="today-pr-title">{pr.title}</span>
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
          <div className="today-pr-meta">
            <a href={pr.url} target="_blank" rel="noopener noreferrer" className="today-pr-link">
              #{pr.number}
            </a>
            {pr.author && <span className="today-pr-author">by {pr.author}</span>}
            <span className="today-pr-time">{formatRelativeTime(pr.created_at)}</span>
          </div>
          {pr.approvals.length > 0 && (
            <div className="today-pr-approvals">
              {pr.approvals.map((approval) => (
                <span key={approval.username} className="today-pr-approval">
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

  // Get task count summary
  const completedToday = data.tasks.filter(
    (task) =>
      task.completed_at &&
      task.completed_at.split('T')[0] === todayStr
  ).length;

  const totalTodayTasks = todaysTasks.length + completedToday;

  return (
    <div className="view today-view">
      <div className="view-header">
        <div className="today-greeting">
          <h1 className="today-title">{greeting}</h1>
          <p className="today-date">{formatDisplayDate()}</p>
        </div>
      </div>

      <div className="view-content">
        {/* Stats summary */}
        {(totalTodayTasks > 0 || carryOverTasks.length > 0) && (
          <div className="today-stats">
            {totalTodayTasks > 0 && (
              <div className="stat-item">
                <span className="stat-value">{completedToday}/{totalTodayTasks}</span>
                <span className="stat-label">tasks done</span>
              </div>
            )}
            {carryOverTasks.length > 0 && (
              <div className="stat-item warning">
                <span className="stat-value">{carryOverTasks.length}</span>
                <span className="stat-label">overdue</span>
              </div>
            )}
          </div>
        )}

        {/* Today's Tasks */}
        <div className="today-section">
          <div className="section-header">
            <h2 className="section-title">Today's Tasks</h2>
            <Button variant="ghost" size="sm" onClick={() => setShowQuickTask(true)}>
              + Add
            </Button>
          </div>

          {todaysTasks.length === 0 ? (
            <div className="empty-state">
              <p>No tasks scheduled for today</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setShowQuickTask(true)}
                style={{ marginTop: '12px' }}
              >
                Add a Task
              </Button>
            </div>
          ) : (
            <div className="task-list">
              {todaysTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  tags={data.tags}
                  onToggle={() => handleToggleTask(task.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Carry Over */}
        {carryOverTasks.length > 0 && (
          <div className="today-section">
            <div className="section-header">
              <h2 className="section-title warning">Carry Over</h2>
              <span className="section-count">{carryOverTasks.length}</span>
            </div>
            <div className="task-list">
              {carryOverTasks.map((task) => (
                <TaskItem
                  key={task.id}
                  task={task}
                  tags={data.tags}
                  onToggle={() => handleToggleTask(task.id)}
                  isOverdue
                />
              ))}
            </div>
          </div>
        )}

        {/* Code Reviews Requiring Attention */}
        <div className="today-section code-reviews-section">
          <div
            className="section-header collapsible-header"
            onClick={() => setCodeReviewsCollapsed(!codeReviewsCollapsed)}
          >
            <div className="section-title-row">
              <span className="collapse-toggle">{codeReviewsCollapsed ? '+' : '-'}</span>
              <h2 className="section-title">Code Reviews Requiring Attention</h2>
              <span className="section-count">
                ({prReviews.highPriority.length + myPrs.approved.length + myPrs.changesRequested.length})
              </span>
            </div>
          </div>

          {!codeReviewsCollapsed && (
            <div className="code-reviews-content">
              {/* High Priority PR Reviews */}
              <div className="today-pr-subsection priority-high">
                <div className="subsection-header">
                  <h3 className="subsection-title">High Priority PR Reviews</h3>
                  <div className="section-actions">
                    {prReviews.loadingHigh && <div className="spinner spinner-sm"></div>}
                    <Button variant="ghost" size="sm" onClick={() => onNavigate('prs')}>
                      View All
                    </Button>
                  </div>
                </div>

                {prReviews.errorHigh && (
                  <div className="pr-error">{prReviews.errorHigh}</div>
                )}

                {prReviews.loadingHigh && prReviews.highPriority.length === 0 && (
                  <div className="empty-state compact">
                    <div className="spinner spinner-sm"></div>
                    <p>Loading...</p>
                  </div>
                )}

                {!prReviews.loadingHigh && prReviews.highPriority.length === 0 && !prReviews.errorHigh && (
                  <div className="empty-state compact">
                    <p>No high priority PRs to review</p>
                  </div>
                )}

                {prReviews.highPriority.length > 0 && (
                  <div className="today-pr-list">
                    {prReviews.highPriority.map((pr) => renderTodayPrCard(pr, 'high'))}
                  </div>
                )}
              </div>

              {/* My PRs - Approved */}
              <div className="today-pr-subsection status-approved">
                <div className="subsection-header">
                  <h3 className="subsection-title">My PRs - Approved</h3>
                  <div className="section-actions">
                    {myPrs.loadingApproved && <div className="spinner spinner-sm"></div>}
                    <Button variant="ghost" size="sm" onClick={() => onNavigate('my-prs')}>
                      View All
                    </Button>
                  </div>
                </div>

                {myPrs.errorApproved && (
                  <div className="pr-error">{myPrs.errorApproved}</div>
                )}

                {myPrs.loadingApproved && myPrs.approved.length === 0 && (
                  <div className="empty-state compact">
                    <div className="spinner spinner-sm"></div>
                    <p>Loading...</p>
                  </div>
                )}

                {!myPrs.loadingApproved && myPrs.approved.length === 0 && !myPrs.errorApproved && (
                  <div className="empty-state compact">
                    <p>No approved PRs ready to merge</p>
                  </div>
                )}

                {myPrs.approved.length > 0 && (
                  <div className="today-pr-list">
                    {myPrs.approved.map((pr) => renderTodayPrCard(pr, 'approved'))}
                  </div>
                )}
              </div>

              {/* My PRs - Needs Attention */}
              <div className="today-pr-subsection status-needs-attention">
                <div className="subsection-header">
                  <h3 className="subsection-title">My PRs - Needs Attention</h3>
                  <div className="section-actions">
                    {myPrs.loadingChangesRequested && <div className="spinner spinner-sm"></div>}
                    <Button variant="ghost" size="sm" onClick={() => onNavigate('my-prs')}>
                      View All
                    </Button>
                  </div>
                </div>

                {myPrs.errorChangesRequested && (
                  <div className="pr-error">{myPrs.errorChangesRequested}</div>
                )}

                {myPrs.loadingChangesRequested && myPrs.changesRequested.length === 0 && (
                  <div className="empty-state compact">
                    <div className="spinner spinner-sm"></div>
                    <p>Loading...</p>
                  </div>
                )}

                {!myPrs.loadingChangesRequested && myPrs.changesRequested.length === 0 && !myPrs.errorChangesRequested && (
                  <div className="empty-state compact">
                    <p>No PRs need attention</p>
                  </div>
                )}

                {myPrs.changesRequested.length > 0 && (
                  <div className="today-pr-list">
                    {myPrs.changesRequested.map((pr) => renderTodayPrCard(pr, 'needs-attention'))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Recent Notes */}
        <div className="today-section">
          <div className="section-header">
            <h2 className="section-title">Recent Notes</h2>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('notes')}>
              View All
            </Button>
          </div>

          {recentNotes.length === 0 ? (
            <div className="empty-state">
              <p>No notes yet</p>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onNavigate('notes')}
                style={{ marginTop: '12px' }}
              >
                Create Note
              </Button>
            </div>
          ) : (
            <div className="notes-list">
              {recentNotes.map((note) => (
                <div
                  key={note.id}
                  className="note-preview-card"
                  onClick={() => onNavigate('notes')}
                >
                  <p className="note-preview-content">{getNotePreview(note.content)}</p>
                  <span className="note-preview-time">{formatRelativeTime(note.updated_at)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="today-section">
          <h2 className="section-title">Quick Links</h2>
          <div className="quick-links">
            <button className="quick-link-btn" onClick={() => onNavigate('tasks')}>
              <span className="quick-link-icon">#</span>
              <span className="quick-link-label">Tasks</span>
            </button>
            <button className="quick-link-btn" onClick={() => onNavigate('backlog')}>
              <span className="quick-link-icon">=</span>
              <span className="quick-link-label">Backlog</span>
            </button>
            <button className="quick-link-btn" onClick={() => onNavigate('notes')}>
              <span className="quick-link-icon">@</span>
              <span className="quick-link-label">Notes</span>
            </button>
            <button className="quick-link-btn" onClick={() => onNavigate('brag-doc')}>
              <span className="quick-link-icon">*</span>
              <span className="quick-link-label">Brag Doc</span>
            </button>
          </div>
        </div>
      </div>

      {/* Quick Add Task Modal */}
      <Modal
        isOpen={showQuickTask}
        onClose={() => {
          setShowQuickTask(false);
          setQuickTaskTitle('');
        }}
        title="Quick Add Task"
        size="sm"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleQuickAddTask();
          }}
          className="quick-task-form"
        >
          <input
            type="text"
            value={quickTaskTitle}
            onChange={(e) => setQuickTaskTitle(e.target.value)}
            placeholder="What do you need to do?"
            className="form-input"
            autoFocus
          />
          <div className="form-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowQuickTask(false);
                setQuickTaskTitle('');
              }}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={!quickTaskTitle.trim()}>
              Add Task
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

// Task Item Component
interface TaskItemProps {
  task: Task;
  tags: { id: string; name: string; color: string }[];
  onToggle: () => void;
  isOverdue?: boolean;
}

function TaskItem({ task, tags, onToggle, isOverdue }: TaskItemProps) {
  const taskTags = tags.filter((tag) => task.tag_ids.includes(tag.id));

  return (
    <div className={`task-item ${isOverdue ? 'overdue' : ''}`}>
      <button
        className={`task-checkbox ${task.completed ? 'checked' : ''}`}
        onClick={onToggle}
        aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
      />
      <div className="task-content">
        <span className={`task-title ${task.completed ? 'completed' : ''}`}>
          {task.title}
        </span>
        {taskTags.length > 0 && (
          <div className="task-tags">
            {taskTags.map((tag) => (
              <span
                key={tag.id}
                className="task-tag"
                style={{ backgroundColor: tag.color + '20', color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
      </div>
      {isOverdue && task.scheduled_date && (
        <span className="task-overdue-date">
          {new Date(task.scheduled_date + 'T00:00:00').toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
          })}
        </span>
      )}
    </div>
  );
}
