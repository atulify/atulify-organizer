import { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { Button, Modal } from '../components';
import type { AppData, Task, Tag, ResourceLink, LinkType, TaskType, PrApproval } from '../types';
import './Views.css';
import './TasksView.css';

interface TasksViewProps {
  data: AppData;
  onDataChange: (data: AppData) => void;
}

export function TasksView({ data, onDataChange }: TasksViewProps) {
  const [selectedDate, setSelectedDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);

  // Task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTagIds, setTaskTagIds] = useState<string[]>([]);
  const [taskLinks, setTaskLinks] = useState<ResourceLink[]>([]);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('regular');
  const [taskUrl, setTaskUrl] = useState('');

  // Get tasks for selected date
  const { activeTasks, archivedTasks } = useMemo(() => {
    let tasks = data.tasks.filter((task) => task.scheduled_date === selectedDate);

    // Apply tag filter
    if (filterTagIds.length > 0) {
      tasks = tasks.filter((task) =>
        filterTagIds.some((tagId) => task.tag_ids.includes(tagId))
      );
    }

    const active = tasks.filter((task) => !task.archived);
    const archived = tasks.filter((task) => task.archived);

    // Sort: incomplete first, then by creation date
    active.sort((a, b) => {
      if (a.completed !== b.completed) return a.completed ? 1 : -1;
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
    });

    return { activeTasks: active, archivedTasks: archived };
  }, [data.tasks, selectedDate, filterTagIds]);

  // Date navigation
  const goToDate = (offset: number) => {
    const date = new Date(selectedDate + 'T00:00:00');
    date.setDate(date.getDate() + offset);
    setSelectedDate(date.toISOString().split('T')[0]);
  };

  const goToToday = () => {
    setSelectedDate(new Date().toISOString().split('T')[0]);
  };

  const isToday = selectedDate === new Date().toISOString().split('T')[0];

  // Format date for display
  const formatDateDisplay = (dateStr: string) => {
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.getTime() === today.getTime()) return 'Today';
    if (date.getTime() === yesterday.getTime()) return 'Yesterday';
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';

    return date.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    });
  };

  // Reset form
  const resetForm = () => {
    setTaskTitle('');
    setTaskTagIds([]);
    setTaskLinks([]);
    setNewLinkUrl('');
    setNewLinkLabel('');
    setTaskType('regular');
    setTaskUrl('');
  };

  // Open add task modal
  const handleOpenAddTask = () => {
    resetForm();
    setShowAddTask(true);
  };

  // Open edit task modal
  const handleOpenEditTask = (task: Task) => {
    setEditingTask(task);
    setTaskTitle(task.title);
    setTaskTagIds([...task.tag_ids]);
    setTaskLinks([...task.resource_links]);
    setTaskType(task.task_type || 'regular');
    setTaskUrl(task.task_url || '');
  };

  // Fetch PR info (title and approvals) using gh CLI via Tauri command
  const fetchPrInfo = async (url: string): Promise<{ title: string; approvals: PrApproval[] } | null> => {
    try {
      const result = await invoke<[string, PrApproval[]]>('fetch_pr_info', { url });
      return { title: result[0], approvals: result[1] };
    } catch (err) {
      console.error('Failed to fetch PR info:', err);
      return null;
    }
  };

  // Fetch GitHub issue title using gh CLI via Tauri command
  const fetchIssueInfo = async (url: string): Promise<string | null> => {
    try {
      const title = await invoke<string>('fetch_issue_info', { url });
      return title;
    } catch (err) {
      console.error('Failed to fetch issue info:', err);
      return null;
    }
  };

  // Save task (create or update)
  const handleSaveTask = async () => {
    const now = new Date().toISOString();
    const urlValue = (taskType === 'flag_rollout' || taskType === 'pr_review' || taskType === 'github_issue' || taskType === 'doc_review') && taskUrl.trim()
      ? taskUrl.trim()
      : null;

    // For PR review and GitHub issue tasks, require URL; for others require title
    if (taskType === 'pr_review' || taskType === 'github_issue') {
      if (!urlValue) return;
    } else {
      if (!taskTitle.trim()) return;
    }

    // Fetch title and approvals based on task type
    let finalTitle = taskTitle.trim();
    let prApprovals: PrApproval[] | undefined;
    if (taskType === 'pr_review' && urlValue) {
      const prInfo = await fetchPrInfo(urlValue);
      if (prInfo) {
        finalTitle = prInfo.title;
        prApprovals = prInfo.approvals;
      }
    } else if (taskType === 'github_issue' && urlValue) {
      const issueTitle = await fetchIssueInfo(urlValue);
      if (issueTitle) {
        finalTitle = issueTitle;
      }
    }

    if (editingTask) {
      // Update existing task
      onDataChange({
        ...data,
        tasks: data.tasks.map((task) =>
          task.id === editingTask.id
            ? {
                ...task,
                title: finalTitle,
                tag_ids: taskTagIds,
                resource_links: taskLinks,
                task_type: taskType,
                task_url: urlValue,
                pr_approvals: prApprovals,
              }
            : task
        ),
      });
      setEditingTask(null);
    } else {
      // Create new task
      const newTask: Task = {
        id: crypto.randomUUID(),
        title: finalTitle,
        completed: false,
        created_at: now,
        completed_at: null,
        scheduled_date: selectedDate,
        tag_ids: taskTagIds,
        resource_links: taskLinks,
        archived: false,
        task_type: taskType,
        task_url: urlValue,
        pr_approvals: prApprovals,
      };

      onDataChange({
        ...data,
        tasks: [...data.tasks, newTask],
      });
      setShowAddTask(false);
    }

    resetForm();
  };

  // Toggle task completion
  const handleToggleComplete = (taskId: string) => {
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

  // Move task to backlog
  const handleMoveToBacklog = (taskId: string) => {
    onDataChange({
      ...data,
      tasks: data.tasks.map((task) =>
        task.id === taskId
          ? { ...task, scheduled_date: null }
          : task
      ),
    });
  };

  // Archive task
  const handleArchiveTask = (taskId: string) => {
    onDataChange({
      ...data,
      tasks: data.tasks.map((task) =>
        task.id === taskId
          ? { ...task, archived: true }
          : task
      ),
    });
  };

  // Delete task
  const handleDeleteTask = async (taskId: string) => {
    const confirmed = await ask('Delete this task?', { title: 'Confirm Delete', kind: 'warning' });
    if (!confirmed) return;
    onDataChange({
      ...data,
      tasks: data.tasks.filter((task) => task.id !== taskId),
    });
    if (editingTask?.id === taskId) {
      setEditingTask(null);
    }
  };

  // Add resource link
  const handleAddLink = () => {
    if (!newLinkUrl.trim()) return;

    // Detect link type
    let linkType: LinkType = 'url';
    if (newLinkUrl.includes('github.com') && newLinkUrl.includes('/issues/')) {
      linkType = 'github_issue';
    } else if (newLinkUrl.includes('github.com') && newLinkUrl.includes('/pull/')) {
      linkType = 'github_pr';
    }

    const newLink: ResourceLink = {
      id: crypto.randomUUID(),
      url: newLinkUrl.trim().startsWith('http') ? newLinkUrl.trim() : `https://${newLinkUrl.trim()}`,
      label: newLinkLabel.trim() || new URL(newLinkUrl.trim().startsWith('http') ? newLinkUrl.trim() : `https://${newLinkUrl.trim()}`).hostname,
      link_type: linkType,
    };

    setTaskLinks([...taskLinks, newLink]);
    setNewLinkUrl('');
    setNewLinkLabel('');
  };

  // Remove resource link
  const handleRemoveLink = (linkId: string) => {
    setTaskLinks(taskLinks.filter((link) => link.id !== linkId));
  };

  // Toggle tag on task
  const toggleTaskTag = (tagId: string) => {
    setTaskTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  // Toggle tag filter
  const toggleFilterTag = (tagId: string) => {
    setFilterTagIds((prev) =>
      prev.includes(tagId)
        ? prev.filter((id) => id !== tagId)
        : [...prev, tagId]
    );
  };

  return (
    <div className="view tasks-view">
      <div className="view-header">
        <div className="view-header-content">
          <div>
            <h1 className="view-title">Tasks</h1>
            <p className="view-subtitle">Manage your daily tasks</p>
          </div>
        </div>
      </div>

      {/* Date Navigation */}
      <div className="tasks-date-nav">
        <button className="date-nav-btn" onClick={() => goToDate(-1)}>
          &larr;
        </button>
        <div className="date-nav-center">
          <span className="date-nav-label">{formatDateDisplay(selectedDate)}</span>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            className="date-nav-picker"
          />
        </div>
        <button className="date-nav-btn" onClick={() => goToDate(1)}>
          &rarr;
        </button>
        {!isToday && (
          <button className="date-nav-today" onClick={goToToday}>
            Today
          </button>
        )}
      </div>

      {/* Tag Filters */}
      {data.tags.length > 0 && (
        <div className="tasks-filters">
          {data.tags.map((tag) => (
            <button
              key={tag.id}
              className={`tag-filter-btn ${filterTagIds.includes(tag.id) ? 'active' : ''}`}
              style={{ '--tag-color': tag.color } as React.CSSProperties}
              onClick={() => toggleFilterTag(tag.id)}
            >
              {tag.name}
            </button>
          ))}
        </div>
      )}

      <div className="view-content">
        {/* Add Task Button */}
        <div className="tasks-add-row">
          <Button onClick={handleOpenAddTask}>+ Add Task</Button>
        </div>

        {/* Active Tasks */}
        {activeTasks.length === 0 ? (
          <div className="empty-state">
            <p>No tasks for this day</p>
          </div>
        ) : (
          <div className="tasks-list">
            {activeTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                tags={data.tags}
                onToggleComplete={() => handleToggleComplete(task.id)}
                onEdit={() => handleOpenEditTask(task)}
                onMoveToBacklog={() => handleMoveToBacklog(task.id)}
                onArchive={() => handleArchiveTask(task.id)}
                onDelete={() => handleDeleteTask(task.id)}
                data={data}
                onDataChange={onDataChange}
              />
            ))}
          </div>
        )}

        {/* Archived Tasks */}
        {archivedTasks.length > 0 && (
          <div className="tasks-archived-section">
            <button
              className="tasks-archived-toggle"
              onClick={() => setShowArchived(!showArchived)}
            >
              <span>Archived ({archivedTasks.length})</span>
              <span>{showArchived ? '−' : '+'}</span>
            </button>
            {showArchived && (
              <div className="tasks-list archived">
                {archivedTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    tags={data.tags}
                    onToggleComplete={() => handleToggleComplete(task.id)}
                    onDelete={() => handleDeleteTask(task.id)}
                    isArchived
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add/Edit Task Modal */}
      <Modal
        isOpen={showAddTask || !!editingTask}
        onClose={() => {
          setShowAddTask(false);
          setEditingTask(null);
          resetForm();
        }}
        title={editingTask ? 'Edit Task' : 'Add Task'}
        size="md"
      >
        <div className="task-form">
          {/* Task Type - moved to top for PR Review flow */}
          <div className="form-group">
            <label className="form-label">Task Type</label>
            <div className="task-type-buttons">
              <button
                type="button"
                className={`task-type-btn ${taskType === 'regular' ? 'active' : ''}`}
                onClick={() => setTaskType('regular')}
              >
                Regular
              </button>
              <button
                type="button"
                className={`task-type-btn flag-rollout ${taskType === 'flag_rollout' ? 'active' : ''}`}
                onClick={() => setTaskType('flag_rollout')}
              >
                Flag Rollout
              </button>
              <button
                type="button"
                className={`task-type-btn pr-review ${taskType === 'pr_review' ? 'active' : ''}`}
                onClick={() => setTaskType('pr_review')}
              >
                PR Review
              </button>
              <button
                type="button"
                className={`task-type-btn github-issue ${taskType === 'github_issue' ? 'active' : ''}`}
                onClick={() => setTaskType('github_issue')}
              >
                Issue
              </button>
              <button
                type="button"
                className={`task-type-btn doc-review ${taskType === 'doc_review' ? 'active' : ''}`}
                onClick={() => setTaskType('doc_review')}
              >
                Doc
              </button>
            </div>
          </div>

          {/* Title - hidden for PR Review and GitHub Issue tasks */}
          {taskType !== 'pr_review' && taskType !== 'github_issue' && (
            <div className="form-group">
              <label className="form-label">Title *</label>
              <input
                type="text"
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                placeholder="What do you need to do?"
                className="form-input"
                autoFocus
              />
            </div>
          )}

          {/* Task URL (for flag_rollout, pr_review, github_issue, and doc_review) */}
          {(taskType === 'flag_rollout' || taskType === 'pr_review' || taskType === 'github_issue' || taskType === 'doc_review') && (
            <div className="form-group">
              <label className="form-label">
                {taskType === 'flag_rollout' ? 'Flag URL' : taskType === 'pr_review' ? 'PR URL' : taskType === 'github_issue' ? 'Issue URL' : 'Doc URL'} {taskType !== 'doc_review' ? '*' : ''}
              </label>
              <input
                type="url"
                value={taskUrl}
                onChange={(e) => setTaskUrl(e.target.value)}
                placeholder={taskType === 'flag_rollout' ? 'https://...' : taskType === 'pr_review' ? 'https://github.com/.../pull/...' : taskType === 'github_issue' ? 'https://github.com/.../issues/...' : 'https://...'}
                className="form-input"
              />
            </div>
          )}

          {/* Tags */}
          <div className="form-group">
            <label className="form-label">Tags</label>
            <div className="task-form-tags">
              {data.tags.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  className={`task-tag-btn ${taskTagIds.includes(tag.id) ? 'active' : ''}`}
                  style={{ '--tag-color': tag.color } as React.CSSProperties}
                  onClick={() => toggleTaskTag(tag.id)}
                >
                  {tag.name}
                </button>
              ))}
              {data.tags.length === 0 && (
                <span className="no-tags-hint">Create tags in Notes view</span>
              )}
            </div>
          </div>

          {/* Resource Links */}
          <div className="form-group">
            <label className="form-label">Links</label>
            {taskLinks.length > 0 && (
              <div className="task-links-list">
                {taskLinks.map((link) => (
                  <div key={link.id} className="task-link-item">
                    <span className="task-link-type">
                      {link.link_type === 'github_issue' ? 'Issue' :
                       link.link_type === 'github_pr' ? 'PR' : 'Link'}
                    </span>
                    <a href={link.url} target="_blank" rel="noopener noreferrer">
                      {link.label}
                    </a>
                    <button
                      type="button"
                      className="task-link-remove"
                      onClick={() => handleRemoveLink(link.id)}
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="task-link-add">
              <input
                type="text"
                value={newLinkUrl}
                onChange={(e) => setNewLinkUrl(e.target.value)}
                placeholder="https://..."
                className="form-input"
              />
              <input
                type="text"
                value={newLinkLabel}
                onChange={(e) => setNewLinkLabel(e.target.value)}
                placeholder="Label (optional)"
                className="form-input"
              />
              <Button type="button" variant="secondary" size="sm" onClick={handleAddLink}>
                Add
              </Button>
            </div>
          </div>

          <div className="form-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setShowAddTask(false);
                setEditingTask(null);
                resetForm();
              }}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleSaveTask}
              disabled={(taskType === 'pr_review' || taskType === 'github_issue') ? !taskUrl.trim() : !taskTitle.trim()}
            >
              {editingTask ? 'Save Changes' : 'Add Task'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Task Card Component
interface TaskCardProps {
  task: Task;
  tags: Tag[];
  onToggleComplete: () => void;
  onEdit?: () => void;
  onMoveToBacklog?: () => void;
  onArchive?: () => void;
  onDelete: () => void;
  isArchived?: boolean;
  onDataChange?: (data: AppData) => void;
  data?: AppData;
}

function TaskCard({
  task,
  tags,
  onToggleComplete,
  onEdit,
  onMoveToBacklog,
  onArchive,
  onDelete,
  isArchived,
  onDataChange,
  data,
}: TaskCardProps) {
  const taskTags = tags.filter((tag) => task.tag_ids.includes(tag.id));
  const taskType = task.task_type || 'regular';

  // Handle Claude button click for PR Review tasks
  const handleCodeReview = async () => {
    if (!task.task_url) return;

    try {
      await invoke('run_code_review', { url: task.task_url });

      // Mark task as completed
      if (onDataChange && data) {
        const now = new Date().toISOString();
        onDataChange({
          ...data,
          tasks: data.tasks.map((t) =>
            t.id === task.id
              ? { ...t, completed: true, completed_at: now }
              : t
          ),
        });
      }
    } catch (err) {
      console.error('Failed to run code review:', err);
    }
  };

  return (
    <div className={`task-card ${task.completed ? 'completed' : ''} ${isArchived ? 'archived' : ''} ${taskType !== 'regular' ? `task-type-${taskType}` : ''}`}>
      {taskType !== 'regular' && (
        <span className={`task-type-badge ${taskType}`}>
          {taskType === 'flag_rollout' ? 'Flag' : taskType === 'pr_review' ? 'PR' : taskType === 'github_issue' ? 'Issue' : 'Doc'}
        </span>
      )}
      {taskType === 'pr_review' && task.task_url && !task.completed ? (
        <button
          className="task-claude-btn"
          onClick={handleCodeReview}
          aria-label="Run code review"
          title="Run code review in terminal"
        >
          <img src="/claude.png" alt="Claude" className="claude-icon" />
        </button>
      ) : (
        <button
          className={`task-checkbox ${task.completed ? 'checked' : ''}`}
          onClick={onToggleComplete}
          aria-label={task.completed ? 'Mark incomplete' : 'Mark complete'}
        />
      )}
      <div className="task-card-content">
        <div className="task-card-header">
          <span className={`task-card-title ${task.completed ? 'completed' : ''}`}>
            {task.title}
          </span>
        </div>
        {taskTags.length > 0 && (
          <div className="task-card-tags">
            {taskTags.map((tag) => (
              <span
                key={tag.id}
                className="task-card-tag"
                style={{ backgroundColor: tag.color + '20', color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
        {task.task_url && (
          <div className="task-card-url">
            <a href={task.task_url} target="_blank" rel="noopener noreferrer">
              {taskType === 'pr_review'
                ? (() => {
                    const match = task.task_url.match(/(?:github\.com\/([^/]+)\/([^/]+)\/pull\/(\d+)|graphite\.com\/github\/pr\/([^/]+)\/([^/]+)\/(\d+))/);
                    if (match) {
                      const [org, repo, num] = match[1] ? [match[1], match[2], match[3]] : [match[4], match[5], match[6]];
                      return `${org}/${repo}/${num}`;
                    }
                    return task.task_url;
                  })()
                : taskType === 'github_issue'
                  ? (() => {
                      const match = task.task_url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)/);
                      if (match) {
                        return `${match[1]}/${match[2]}#${match[3]}`;
                      }
                      return task.task_url;
                    })()
                  : taskType === 'flag_rollout'
                    ? (() => {
                        // Extract flag name from URL like /flags/flag_name
                        const match = task.task_url.match(/\/flags\/([^/?]+)/);
                        return match ? match[1] : new URL(task.task_url).pathname.split('/').pop() || task.task_url;
                      })()
                    : taskType === 'doc_review'
                      ? (() => {
                          try {
                            const url = new URL(task.task_url);
                            return url.hostname;
                          } catch {
                            return task.task_url;
                          }
                        })()
                      : `🔗 ${new URL(task.task_url).pathname.slice(0, 40)}...`
              }
            </a>
          </div>
        )}
        {task.pr_approvals && task.pr_approvals.length > 0 && (
          <div className="task-card-approvals">
            {task.pr_approvals.map((approval) => (
              <span key={approval.username} className="task-card-approval">
                <span className="approval-checkmark">✓</span>
                {approval.username}
              </span>
            ))}
          </div>
        )}
        {task.resource_links.length > 0 && (
          <div className="task-card-links">
            {task.resource_links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="task-card-link"
              >
                {link.link_type === 'github_issue' ? '🔴' :
                 link.link_type === 'github_pr' ? '🟢' : '🔗'} {link.label}
              </a>
            ))}
          </div>
        )}
      </div>
      <div className="task-card-actions">
        {!isArchived && onEdit && (
          <button className="task-action-btn" onClick={onEdit}>Edit</button>
        )}
        {!isArchived && onMoveToBacklog && !task.completed && (
          <button className="task-action-btn" onClick={onMoveToBacklog}>Backlog</button>
        )}
        {!isArchived && onArchive && task.completed && (
          <button className="task-action-btn" onClick={onArchive}>Archive</button>
        )}
        <button className="task-action-btn danger" onClick={onDelete}>Delete</button>
      </div>
    </div>
  );
}
