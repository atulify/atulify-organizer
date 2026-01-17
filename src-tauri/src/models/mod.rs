use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

// Predefined tag colors (available for future use)
#[allow(dead_code)]
pub const TAG_COLORS: &[&str] = &[
    "#E53E3E", // Red
    "#DD6B20", // Orange
    "#D69E2E", // Yellow
    "#38A169", // Green
    "#319795", // Teal
    "#3182CE", // Blue
    "#5A67D8", // Indigo
    "#805AD5", // Purple
    "#D53F8C", // Pink
    "#718096", // Gray
    "#8B5A2B", // Brown
    "#4A5568", // Slate
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Tag {
    pub id: String,
    pub name: String,
    pub color: String,
}

impl Tag {
    #[allow(dead_code)]
    pub fn new(name: String, color: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            name,
            color,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum LinkType {
    GithubIssue,
    GithubPr,
    Url,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResourceLink {
    pub id: String,
    pub url: String,
    pub label: String,
    pub link_type: LinkType,
}

impl ResourceLink {
    #[allow(dead_code)]
    pub fn new(url: String, label: String, link_type: LinkType) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            url,
            label,
            link_type,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TaskType {
    Regular,
    FlagRollout,
    PrReview,
    GithubIssue,
    DocReview,
}

impl Default for TaskType {
    fn default() -> Self {
        Self::Regular
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrApproval {
    pub username: String,
    pub approved_at: String, // ISO datetime
}

/// Represents a GitHub PR for the PRs view
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitHubPr {
    pub number: u64,
    pub title: String,
    pub url: String,
    pub author: String,
    pub created_at: String,
    pub approvals: Vec<PrApproval>,
    pub requested_reviewers: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Task {
    pub id: String,
    pub title: String,
    pub completed: bool,
    pub created_at: DateTime<Utc>,
    pub completed_at: Option<DateTime<Utc>>,
    pub scheduled_date: Option<NaiveDate>,
    pub tag_ids: Vec<String>,
    pub resource_links: Vec<ResourceLink>,
    pub archived: bool,
    #[serde(default)]
    pub task_type: TaskType,
    pub task_url: Option<String>,
    pub pr_approvals: Option<Vec<PrApproval>>,
}

impl Task {
    #[allow(dead_code)]
    pub fn new(title: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            completed: false,
            created_at: Utc::now(),
            completed_at: None,
            scheduled_date: None,
            tag_ids: Vec::new(),
            resource_links: Vec::new(),
            archived: false,
            task_type: TaskType::default(),
            task_url: None,
            pr_approvals: None,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Note {
    pub id: String,
    pub content: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub tag_ids: Vec<String>,
    pub linked_task_ids: Vec<String>,
    pub images: Vec<String>,
}

impl Note {
    #[allow(dead_code)]
    pub fn new(content: String) -> Self {
        let now = Utc::now();
        Self {
            id: Uuid::new_v4().to_string(),
            content,
            created_at: now,
            updated_at: now,
            tag_ids: Vec::new(),
            linked_task_ids: Vec::new(),
            images: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BragEntry {
    pub id: String,
    pub title: String,
    pub description: String,
    pub date: NaiveDate,
    pub images: Vec<String>,
    pub links: Vec<String>,
}

impl BragEntry {
    #[allow(dead_code)]
    pub fn new(title: String, description: String, date: NaiveDate) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            description,
            date,
            images: Vec::new(),
            links: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BragDoc {
    pub id: String,
    pub title: String,
    pub start_date: NaiveDate,
    pub end_date: NaiveDate,
    pub entries: Vec<BragEntry>,
}

impl BragDoc {
    #[allow(dead_code)]
    pub fn new(title: String, start_date: NaiveDate, end_date: NaiveDate) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            start_date,
            end_date,
            entries: Vec::new(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ScheduleType {
    OneOff,
    DailyWeekdays,
    Weekly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Notification {
    pub id: String,
    pub title: String,
    pub message: String,
    pub schedule_type: ScheduleType,
    pub time: String, // HH:MM format
    pub date: Option<NaiveDate>, // For one_off notifications
    pub day_of_week: Option<u8>, // 0-6 for weekly (Sunday = 0)
    pub enabled: bool,
}

impl Notification {
    #[allow(dead_code)]
    pub fn new(title: String, message: String, schedule_type: ScheduleType, time: String) -> Self {
        Self {
            id: Uuid::new_v4().to_string(),
            title,
            message,
            schedule_type,
            time,
            date: None,
            day_of_week: None,
            enabled: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Theme {
    Grove,
    Obsidian,
    MiamiNights,
}

impl Default for Theme {
    fn default() -> Self {
        Self::Obsidian
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Settings {
    pub theme: Theme,
    pub dark_mode: bool,
    pub launch_at_login: bool,
    pub user_name: String,
    pub onboarding_complete: bool,
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            theme: Theme::default(),
            dark_mode: true,
            launch_at_login: false,
            user_name: String::new(),
            onboarding_complete: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AppData {
    pub tags: Vec<Tag>,
    pub tasks: Vec<Task>,
    pub notes: Vec<Note>,
    pub brag_docs: Vec<BragDoc>,
    pub notifications: Vec<Notification>,
    pub settings: Settings,
}
