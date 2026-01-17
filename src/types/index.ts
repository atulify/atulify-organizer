// Predefined tag colors
export const TAG_COLORS = [
  '#E53E3E', // Red
  '#DD6B20', // Orange
  '#D69E2E', // Yellow
  '#38A169', // Green
  '#319795', // Teal
  '#3182CE', // Blue
  '#5A67D8', // Indigo
  '#805AD5', // Purple
  '#D53F8C', // Pink
  '#718096', // Gray
  '#8B5A2B', // Brown
  '#4A5568', // Slate
] as const;

export interface Tag {
  id: string;
  name: string;
  color: string;
}

export type LinkType = 'github_issue' | 'github_pr' | 'url';

export interface ResourceLink {
  id: string;
  url: string;
  label: string;
  link_type: LinkType;
}

export type TaskType = 'regular' | 'flag_rollout' | 'pr_review' | 'github_issue' | 'doc_review';

export interface PrApproval {
  username: string;
  approved_at: string; // ISO datetime
}

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  created_at: string; // ISO datetime
  completed_at: string | null;
  scheduled_date: string | null; // YYYY-MM-DD
  tag_ids: string[];
  resource_links: ResourceLink[];
  archived: boolean;
  task_type: TaskType;
  task_url: string | null; // URL for flag_rollout and pr_review types
  pr_approvals?: PrApproval[]; // Approvals for pr_review tasks
}

export interface Note {
  id: string;
  content: string;
  created_at: string;
  updated_at: string;
  tag_ids: string[];
  linked_task_ids: string[];
  images: string[];
}

export interface BragEntry {
  id: string;
  title: string;
  description: string;
  date: string; // YYYY-MM-DD
  images: string[];
  links: string[];
}

export interface BragDoc {
  id: string;
  title: string;
  start_date: string;
  end_date: string;
  entries: BragEntry[];
}

export type ScheduleType = 'one_off' | 'daily_weekdays' | 'weekly';

export interface Notification {
  id: string;
  title: string;
  message: string;
  schedule_type: ScheduleType;
  time: string; // HH:MM
  date: string | null; // YYYY-MM-DD for one_off
  day_of_week: number | null; // 0-6 for weekly (Sunday = 0)
  enabled: boolean;
}

export type Theme = 'grove' | 'obsidian' | 'miami_nights';

export interface Settings {
  theme: Theme;
  dark_mode: boolean;
  launch_at_login: boolean;
  user_name: string;
  onboarding_complete: boolean;
}

export interface AppData {
  tags: Tag[];
  tasks: Task[];
  notes: Note[];
  brag_docs: BragDoc[];
  notifications: Notification[];
  settings: Settings;
}

// View types
export type ViewType =
  | 'today'
  | 'tasks'
  | 'backlog'
  | 'prs'
  | 'my-prs'
  | 'notes'
  | 'brag-doc'
  | 'notifications'
  | 'settings';
