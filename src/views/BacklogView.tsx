import { useState, useMemo } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { ask } from '@tauri-apps/plugin-dialog';
import { Button, Modal } from '../components';
import type { AppData, Task, Tag, ResourceLink, LinkType, TaskType, PrApproval } from '../types';
import './Views.css';
import './BacklogView.css';

interface BacklogViewProps {
  data: AppData;
  onDataChange: (data: AppData) => void;
}

export function BacklogView({ data, onDataChange }: BacklogViewProps) {
  const [showAddTask, setShowAddTask] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [schedulingTask, setSchedulingTask] = useState<Task | null>(null);
  const [scheduleDate, setScheduleDate] = useState('');
  const [filterTagIds, setFilterTagIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Task form state
  const [taskTitle, setTaskTitle] = useState('');
  const [taskTagIds, setTaskTagIds] = useState<string[]>([]);
  const [taskLinks, setTaskLinks] = useState<ResourceLink[]>([]);
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('regular');
  const [taskUrl, setTaskUrl] = useState('');

  // Get backlog tasks (no scheduled date, not completed, not archived)
  const backlogTasks = useMemo(() => {
    let tasks = data.tasks.filter(
      (task) => !task.scheduled_date && !task.completed && !task.archived
    );

    // Apply search
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      tasks = tasks.filter((task) => task.title.toLowerCase().includes(query));
    }

    // Apply tag filter
    if (filterTagIds.length > 0) {
      tasks = tasks.filter((task) =>
        filterTagIds.some((tagId) => task.tag_ids.includes(tagId))
      );
    }

    // Sort by creation date (newest first)
    tasks.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return tasks;
  }, [data.tasks, searchQuery, filterTagIds]);

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
      const newTask: Task = {
        id: crypto.randomUUID(),
        title: finalTitle,
        completed: false,
        created_at: now,
        completed_at: null,
        scheduled_date: null, // Backlog task
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

  // Schedule task
  const handleOpenSchedule = (task: Task) => {
    setSchedulingTask(task);
    setScheduleDate(new Date().toISOString().split('T')[0]);
  };

  const handleScheduleTask = () => {
    if (!schedulingTask || !scheduleDate) return;

    onDataChange({
      ...data,
      tasks: data.tasks.map((task) =>
        task.id === schedulingTask.id
          ? { ...task, scheduled_date: scheduleDate }
          : task
      ),
    });

    setSchedulingTask(null);
    setScheduleDate('');
  };

  // Schedule for today
  const handleScheduleToday = (taskId: string) => {
    const today = new Date().toISOString().split('T')[0];
    onDataChange({
      ...data,
      tasks: data.tasks.map((task) =>
        task.id === taskId
          ? { ...task, scheduled_date: today }
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

  // Reorder task (move up or down in the backlog)
  const handleMoveTask = (taskId: string, direction: 'up' | 'down') => {
    // Get all backlog task IDs in current order
    const backlogTaskIds = backlogTasks.map((t) => t.id);
    const currentIndex = backlogTaskIds.indexOf(taskId);

    if (currentIndex === -1) return;
    if (direction === 'up' && currentIndex === 0) return;
    if (direction === 'down' && currentIndex === backlogTaskIds.length - 1) return;

    const newIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    // Swap the created_at timestamps to change order (since we sort by created_at descending)
    const task1 = backlogTasks[currentIndex];
    const task2 = backlogTasks[newIndex];

    onDataChange({
      ...data,
      tasks: data.tasks.map((task) => {
        if (task.id === task1.id) {
          return { ...task, created_at: task2.created_at };
        }
        if (task.id === task2.id) {
          return { ...task, created_at: task1.created_at };
        }
        return task;
      }),
    });
  };

  return (
    <div className="view backlog-view">
      <div className="view-header">
        <div className="view-header-content">
          <div>
            <h1 className="view-title">Backlog</h1>
            <p className="view-subtitle">
              {backlogTasks.length} unscheduled task{backlogTasks.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button onClick={handleOpenAddTask}>+ Add Task</Button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="backlog-toolbar">
        <input
          type="text"
          placeholder="Search backlog..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="form-input backlog-search"
        />
        {data.tags.length > 0 && (
          <div className="backlog-filters">
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
      </div>

      <div className="view-content">
        {backlogTasks.length === 0 ? (
          <div className="empty-state">
            <p>
              {searchQuery || filterTagIds.length > 0
                ? 'No matching tasks'
                : 'Your backlog is empty'}
            </p>
            {!searchQuery && filterTagIds.length === 0 && (
              <Button
                variant="secondary"
                size="sm"
                onClick={handleOpenAddTask}
                style={{ marginTop: '12px' }}
              >
                Add a Task
              </Button>
            )}
          </div>
        ) : (
          <div className="backlog-list">
            {backlogTasks.map((task, index) => (
              <BacklogTaskCard
                key={task.id}
                task={task}
                tags={data.tags}
                onEdit={() => handleOpenEditTask(task)}
                onSchedule={() => handleOpenSchedule(task)}
                onScheduleToday={() => handleScheduleToday(task.id)}
                onDelete={() => handleDeleteTask(task.id)}
                onMoveUp={() => handleMoveTask(task.id, 'up')}
                onMoveDown={() => handleMoveTask(task.id, 'down')}
                isFirst={index === 0}
                isLast={index === backlogTasks.length - 1}
              />
            ))}
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
        title={editingTask ? 'Edit Task' : 'Add to Backlog'}
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
              {editingTask ? 'Save Changes' : 'Add to Backlog'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Schedule Task Modal */}
      <Modal
        isOpen={!!schedulingTask}
        onClose={() => {
          setSchedulingTask(null);
          setScheduleDate('');
        }}
        title="Schedule Task"
        size="sm"
      >
        <div className="schedule-form">
          <p className="schedule-task-title">{schedulingTask?.title}</p>
          <div className="form-group">
            <label className="form-label">Select Date</label>
            <input
              type="date"
              value={scheduleDate}
              onChange={(e) => setScheduleDate(e.target.value)}
              className="form-input"
              min={new Date().toISOString().split('T')[0]}
            />
          </div>
          <div className="form-actions">
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setSchedulingTask(null);
                setScheduleDate('');
              }}
            >
              Cancel
            </Button>
            <Button type="button" onClick={handleScheduleTask} disabled={!scheduleDate}>
              Schedule
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

// Backlog Task Card Component
interface BacklogTaskCardProps {
  task: Task;
  tags: Tag[];
  onEdit: () => void;
  onSchedule: () => void;
  onScheduleToday: () => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}

function BacklogTaskCard({
  task,
  tags,
  onEdit,
  onSchedule,
  onScheduleToday,
  onDelete,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: BacklogTaskCardProps) {
  const taskTags = tags.filter((tag) => task.tag_ids.includes(tag.id));
  const taskType = task.task_type || 'regular';

  const formatCreatedDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  return (
    <div className={`backlog-card ${taskType !== 'regular' ? `task-type-${taskType}` : ''}`}>
      {/* Reorder buttons */}
      <div className="backlog-reorder">
        <button
          className="backlog-reorder-btn"
          onClick={onMoveUp}
          disabled={isFirst}
          aria-label="Move up"
        >
          ↑
        </button>
        <button
          className="backlog-reorder-btn"
          onClick={onMoveDown}
          disabled={isLast}
          aria-label="Move down"
        >
          ↓
        </button>
      </div>
      <div className="backlog-card-content">
        <div className="backlog-card-header">
          <span className="backlog-card-title">{task.title}</span>
          {taskType !== 'regular' && (
            <span className={`task-type-badge ${taskType}`}>
              {taskType === 'flag_rollout' ? 'Flag' : taskType === 'pr_review' ? 'PR' : taskType === 'github_issue' ? 'Issue' : 'Doc'}
            </span>
          )}
        </div>
        {taskTags.length > 0 && (
          <div className="backlog-card-tags">
            {taskTags.map((tag) => (
              <span
                key={tag.id}
                className="backlog-card-tag"
                style={{ backgroundColor: tag.color + '20', color: tag.color }}
              >
                {tag.name}
              </span>
            ))}
          </div>
        )}
        {task.task_url && (
          <div className="backlog-card-url">
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
          <div className="backlog-card-links">
            {task.resource_links.map((link) => (
              <a
                key={link.id}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="backlog-card-link"
              >
                {link.link_type === 'github_issue' ? '🔴' :
                 link.link_type === 'github_pr' ? '🟢' : '🔗'} {link.label}
              </a>
            ))}
          </div>
        )}
        <span className="backlog-card-date">Added {formatCreatedDate(task.created_at)}</span>
      </div>
      <div className="backlog-card-actions">
        <button className="backlog-action-btn primary" onClick={onScheduleToday}>
          Today
        </button>
        <button className="backlog-action-btn" onClick={onSchedule}>
          Schedule
        </button>
        <button className="backlog-action-btn" onClick={onEdit}>
          Edit
        </button>
        <button className="backlog-action-btn danger" onClick={onDelete}>
          Delete
        </button>
      </div>
    </div>
  );
}
