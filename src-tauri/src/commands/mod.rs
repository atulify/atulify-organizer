use crate::models::{AppData, GitHubPr, PrApproval};
use crate::storage;
use once_cell::sync::Lazy;
use parking_lot::RwLock;
use serde::Deserialize;
use std::collections::{HashMap, HashSet};
use std::process::Command;
use std::time::{Duration, Instant};

// ============ GH Path Resolution ============

/// Find the gh binary in common locations or PATH
fn find_gh_path() -> Option<String> {
    // Common installation paths
    let common_paths = [
        "/opt/homebrew/bin/gh",      // Homebrew on Apple Silicon
        "/usr/local/bin/gh",         // Homebrew on Intel Mac / manual install
        "/usr/bin/gh",               // System install
        "/home/linuxbrew/.linuxbrew/bin/gh", // Linuxbrew
    ];

    // Check common paths first (faster than which)
    for path in &common_paths {
        if std::path::Path::new(path).exists() {
            return Some(path.to_string());
        }
    }

    // Fall back to `which gh`
    if let Ok(output) = Command::new("which").arg("gh").output() {
        if output.status.success() {
            let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
            if !path.is_empty() {
                return Some(path);
            }
        }
    }

    None
}

/// Cached gh path - computed once on first use
static GH_PATH: Lazy<Option<String>> = Lazy::new(find_gh_path);

fn get_gh_path() -> Result<&'static str, String> {
    GH_PATH.as_ref()
        .map(|s| s.as_str())
        .ok_or_else(|| "GitHub CLI (gh) not found. Please install it: https://cli.github.com/".to_string())
}

// ============ PR Cache ============

const CACHE_TTL_SECS: u64 = 600; // 10 minutes

#[derive(Clone)]
struct CachedPrData {
    prs: Vec<GitHubPr>,
    cached_at: Instant,
}

struct PrCache {
    high_priority: Option<CachedPrData>,
    medium_priority: Option<CachedPrData>,
    low_priority: Option<CachedPrData>,
    my_approved: Option<CachedPrData>,
    my_changes_requested: Option<CachedPrData>,
    my_needs_review: Option<CachedPrData>,
}

impl PrCache {
    fn new() -> Self {
        Self {
            high_priority: None,
            medium_priority: None,
            low_priority: None,
            my_approved: None,
            my_changes_requested: None,
            my_needs_review: None,
        }
    }

    fn is_valid(cached: &Option<CachedPrData>) -> bool {
        cached.as_ref()
            .map(|c| c.cached_at.elapsed() < Duration::from_secs(CACHE_TTL_SECS))
            .unwrap_or(false)
    }
}

static PR_CACHE: Lazy<RwLock<PrCache>> = Lazy::new(|| RwLock::new(PrCache::new()));

// ============ Response Types ============

#[derive(Debug, Deserialize)]
struct GhReviewUser {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GhReviewResponse {
    state: String,
    user: Option<GhReviewUser>,
    submitted_at: Option<String>,
}

/// Parse a PR URL (GitHub or Graphite) and return (org, repo, pr_number)
fn parse_pr_url(url: &str) -> Option<(String, String, String)> {
    let clean_url = url.split('?').next().unwrap_or(url).trim_end_matches('/');

    // GitHub: https://github.com/org/repo/pull/123
    if let Some(caps) = clean_url.strip_prefix("https://github.com/") {
        let parts: Vec<&str> = caps.split('/').collect();
        if parts.len() >= 4 && parts[2] == "pull" {
            let pr_num = parts[3].split('/').next().unwrap_or(parts[3]);
            return Some((parts[0].to_string(), parts[1].to_string(), pr_num.to_string()));
        }
    }

    // Graphite URLs
    for domain in &["https://app.graphite.dev/github/pr/", "https://app.graphite.com/github/pr/"] {
        if let Some(caps) = clean_url.strip_prefix(domain) {
            let parts: Vec<&str> = caps.split('/').collect();
            if parts.len() >= 3 {
                let pr_num = parts[2].split('/').next().unwrap_or(parts[2]);
                return Some((parts[0].to_string(), parts[1].to_string(), pr_num.to_string()));
            }
        }
    }
    None
}

#[tauri::command]
pub fn fetch_pr_info(url: String) -> Result<(String, Vec<PrApproval>), String> {
    let (org, repo, pr_num) = parse_pr_url(&url)
        .ok_or_else(|| "Invalid PR URL format".to_string())?;

    let gh_path = get_gh_path()?;

    let title_output = Command::new(gh_path)
        .args(["api", &format!("repos/{}/{}/pulls/{}", org, repo, pr_num), "--jq", ".title"])
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !title_output.status.success() {
        let stderr = String::from_utf8_lossy(&title_output.stderr);
        return Err(format!("Failed to fetch PR title: {}", stderr));
    }

    let title = String::from_utf8_lossy(&title_output.stdout).trim().to_string();

    let reviews_output = Command::new(gh_path)
        .args(["api", &format!("repos/{}/{}/pulls/{}/reviews", org, repo, pr_num)])
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    let mut approvals: Vec<PrApproval> = Vec::new();

    if reviews_output.status.success() {
        let reviews_json = String::from_utf8_lossy(&reviews_output.stdout);
        if let Ok(reviews) = serde_json::from_str::<Vec<GhReviewResponse>>(&reviews_json) {
            let mut approvals_map = std::collections::HashMap::new();
            for review in reviews {
                if review.state == "APPROVED" {
                    if let (Some(user), Some(submitted_at)) = (review.user, review.submitted_at) {
                        approvals_map.insert(user.login.clone(), PrApproval {
                            username: user.login,
                            approved_at: submitted_at,
                        });
                    }
                }
            }
            approvals = approvals_map.into_values().collect();
        }
    }

    Ok((title, approvals))
}

/// Parse a GitHub issue URL and return (org, repo, issue_number)
fn parse_issue_url(url: &str) -> Option<(String, String, String)> {
    let clean_url = url.split('?').next().unwrap_or(url).trim_end_matches('/');

    if let Some(caps) = clean_url.strip_prefix("https://github.com/") {
        let parts: Vec<&str> = caps.split('/').collect();
        if parts.len() >= 4 && parts[2] == "issues" {
            let issue_num = parts[3].split('/').next().unwrap_or(parts[3]);
            return Some((parts[0].to_string(), parts[1].to_string(), issue_num.to_string()));
        }
    }
    None
}

#[tauri::command]
pub fn fetch_issue_info(url: String) -> Result<String, String> {
    let (org, repo, issue_num) = parse_issue_url(&url)
        .ok_or_else(|| "Invalid GitHub issue URL format".to_string())?;

    let gh_path = get_gh_path()?;
    let title_output = Command::new(gh_path)
        .args(["api", &format!("repos/{}/{}/issues/{}", org, repo, issue_num), "--jq", ".title"])
        .output()
        .map_err(|e| format!("Failed to run gh command: {}", e))?;

    if !title_output.status.success() {
        let stderr = String::from_utf8_lossy(&title_output.stderr);
        return Err(format!("Failed to fetch issue title: {}", stderr));
    }

    let title = String::from_utf8_lossy(&title_output.stdout).trim().to_string();
    Ok(title)
}

#[tauri::command]
pub fn get_all_data() -> Result<AppData, String> {
    storage::load_data()
}

#[tauri::command]
pub fn save_all_data(data: AppData) -> Result<(), String> {
    storage::save_data(&data)
}

#[tauri::command]
pub fn create_backup() -> Result<String, String> {
    storage::create_backup()
}

#[tauri::command]
pub fn get_backups() -> Result<Vec<String>, String> {
    storage::get_backups()
}

#[tauri::command]
pub fn restore_backup(backup_name: String) -> Result<AppData, String> {
    storage::restore_backup(&backup_name)
}

#[tauri::command]
pub fn save_image(filename: String, data: Vec<u8>) -> Result<String, String> {
    storage::save_image(&filename, &data)
}

#[tauri::command]
pub fn delete_image(filename: String) -> Result<(), String> {
    storage::delete_image(&filename)
}

#[tauri::command]
pub fn get_app_data_path() -> Result<String, String> {
    Ok(storage::get_app_dir().to_string_lossy().to_string())
}

#[tauri::command]
pub fn run_code_review(url: String) -> Result<(), String> {
    let script = format!(
        r#"tell application "Terminal"
            set targetWindow to missing value

            repeat with w in windows
                try
                    if name of w contains "Claude Code Review" then
                        set targetWindow to w
                        exit repeat
                    end if
                end try
            end repeat

            if targetWindow is not missing value then
                set index of targetWindow to 1
                activate
                delay 0.3
                tell application "System Events"
                    tell process "Terminal"
                        keystroke "t" using command down
                    end tell
                end tell
                delay 0.3
                do script "devx claude -p \"/review {}\" --max-budget-usd 2.00" in front window
            else
                activate
                do script "devx claude -p \"/review {}\" --max-budget-usd 2.00"
                delay 0.3
                set custom title of front window to "Claude Code Review"
            end if
        end tell"#,
        url, url
    );

    Command::new("osascript")
        .arg("-e")
        .arg(&script)
        .spawn()
        .map_err(|e| format!("Failed to open terminal: {}", e))?;

    Ok(())
}

// ============ PR Fetching Commands (Optimized) ============

const REPO: &str = "shop/world";
const USER: &str = "atulify";
const TEAM_SLUG: &str = "shop/delivery_predictions_platform";

#[derive(Debug, Deserialize)]
struct GhPrSearchItem {
    number: u64,
    title: String,
    url: String,
    author: GhPrAuthor,
    #[serde(rename = "createdAt")]
    created_at: String,
}

#[derive(Debug, Deserialize)]
struct GhPrAuthor {
    login: String,
}

// ============ GraphQL Batched Fetching ============

#[derive(Debug, Deserialize)]
struct GraphQlResponse {
    data: Option<GraphQlData>,
}

#[derive(Debug, Deserialize)]
struct GraphQlData {
    repository: Option<GraphQlRepository>,
}

#[derive(Debug, Deserialize)]
struct GraphQlRepository {
    #[serde(flatten)]
    pull_requests: HashMap<String, Option<GraphQlPullRequest>>,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)]
struct GraphQlPullRequest {
    number: u64,
    reviews: GraphQlReviews,
    #[serde(rename = "reviewRequests")]
    review_requests: GraphQlReviewRequests,
}

#[derive(Debug, Deserialize)]
struct GraphQlReviews {
    nodes: Vec<GraphQlReviewNode>,
}

#[derive(Debug, Deserialize)]
struct GraphQlReviewNode {
    state: String,
    author: Option<GraphQlAuthor>,
    #[serde(rename = "submittedAt")]
    submitted_at: Option<String>,
}

#[derive(Debug, Deserialize)]
struct GraphQlAuthor {
    login: String,
}

#[derive(Debug, Deserialize)]
struct GraphQlReviewRequests {
    nodes: Vec<GraphQlReviewRequestNode>,
}

#[derive(Debug, Deserialize)]
struct GraphQlReviewRequestNode {
    #[serde(rename = "requestedReviewer")]
    requested_reviewer: Option<GraphQlRequestedReviewer>,
}

#[derive(Debug, Deserialize)]
#[serde(untagged)]
enum GraphQlRequestedReviewer {
    User { login: String },
    Team { slug: String },
}

/// Batch fetch PR details (approvals + reviewers) using GraphQL
/// Returns a map of PR number -> (approvals, requested_reviewers)
fn batch_fetch_pr_details(pr_numbers: &[u64]) -> HashMap<u64, (Vec<PrApproval>, Vec<String>)> {
    if pr_numbers.is_empty() {
        return HashMap::new();
    }

    let gh_path = match get_gh_path() {
        Ok(p) => p,
        Err(_) => return HashMap::new(),
    };

    // Build GraphQL query for all PRs at once
    let pr_fragments: Vec<String> = pr_numbers
        .iter()
        .map(|num| {
            format!(
                r#"pr{num}: pullRequest(number: {num}) {{
                    number
                    reviews(last: 100) {{
                        nodes {{
                            state
                            author {{ login }}
                            submittedAt
                        }}
                    }}
                    reviewRequests(last: 20) {{
                        nodes {{
                            requestedReviewer {{
                                ... on User {{ login }}
                                ... on Team {{ slug }}
                            }}
                        }}
                    }}
                }}"#,
                num = num
            )
        })
        .collect();

    let query = format!(
        r#"query {{ repository(owner: "shop", name: "world") {{ {} }} }}"#,
        pr_fragments.join("\n")
    );

    let output = Command::new(gh_path)
        .args(["api", "graphql", "-f", &format!("query={}", query)])
        .output();

    let mut result: HashMap<u64, (Vec<PrApproval>, Vec<String>)> = HashMap::new();

    if let Ok(output) = output {
        if output.status.success() {
            let json_str = String::from_utf8_lossy(&output.stdout);
            if let Ok(response) = serde_json::from_str::<GraphQlResponse>(&json_str) {
                if let Some(data) = response.data {
                    if let Some(repo) = data.repository {
                        for (key, pr_opt) in repo.pull_requests {
                            if let Some(pr) = pr_opt {
                                // Extract approvals
                                let mut approvals_map: HashMap<String, PrApproval> = HashMap::new();
                                for review in &pr.reviews.nodes {
                                    if review.state == "APPROVED" {
                                        if let (Some(author), Some(submitted_at)) =
                                            (&review.author, &review.submitted_at)
                                        {
                                            approvals_map.insert(
                                                author.login.clone(),
                                                PrApproval {
                                                    username: author.login.clone(),
                                                    approved_at: submitted_at.clone(),
                                                },
                                            );
                                        }
                                    }
                                }

                                // Extract requested reviewers
                                let requested_reviewers: Vec<String> = pr.review_requests.nodes
                                    .iter()
                                    .filter_map(|node| {
                                        node.requested_reviewer.as_ref().map(|r| match r {
                                            GraphQlRequestedReviewer::User { login } => login.clone(),
                                            GraphQlRequestedReviewer::Team { slug } => format!("team:{}", slug),
                                        })
                                    })
                                    .collect();

                                // Parse the PR number from the key (e.g., "pr123" -> 123)
                                if let Some(num_str) = key.strip_prefix("pr") {
                                    if let Ok(num) = num_str.parse::<u64>() {
                                        result.insert(
                                            num,
                                            (approvals_map.into_values().collect(), requested_reviewers),
                                        );
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    result
}

/// Helper to convert a GhPrSearchItem to GitHubPr
fn to_github_pr(item: GhPrSearchItem, approvals: Vec<PrApproval>, requested_reviewers: Vec<String>) -> GitHubPr {
    GitHubPr {
        number: item.number,
        title: item.title,
        url: item.url,
        author: item.author.login,
        created_at: item.created_at,
        approvals,
        requested_reviewers,
    }
}

/// Invalidate cache for a specific category
#[tauri::command]
pub fn invalidate_pr_cache(category: Option<String>) -> Result<(), String> {
    let mut cache = PR_CACHE.write();
    match category.as_deref() {
        Some("high") => cache.high_priority = None,
        Some("medium") => cache.medium_priority = None,
        Some("low") => cache.low_priority = None,
        Some("approved") => cache.my_approved = None,
        Some("changes_requested") => cache.my_changes_requested = None,
        Some("needs_review") => cache.my_needs_review = None,
        _ => {
            // Invalidate all
            cache.high_priority = None;
            cache.medium_priority = None;
            cache.low_priority = None;
            cache.my_approved = None;
            cache.my_changes_requested = None;
            cache.my_needs_review = None;
        }
    }
    Ok(())
}

/// Fetch high priority PRs: PRs with 1 approval where I'm assigned as reviewer and I haven't approved
#[tauri::command]
pub async fn fetch_high_priority_prs(force_refresh: Option<bool>) -> Result<Vec<GitHubPr>, String> {
    // Check cache first
    if !force_refresh.unwrap_or(false) {
        let cache = PR_CACHE.read();
        if PrCache::is_valid(&cache.high_priority) {
            return Ok(cache.high_priority.as_ref().unwrap().prs.clone());
        }
    }

    tauri::async_runtime::spawn_blocking(|| {
        let gh_path = get_gh_path()?;

        let output = Command::new(gh_path)
            .args([
                "search", "prs",
                "--repo", REPO,
                "--state", "open",
                "--review-requested", USER,
                "--json", "number,title,url,author,createdAt",
                "--limit", "50",
            ])
            .output()
            .map_err(|e| format!("Failed to run gh command: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to search PRs: {}", stderr));
        }

        let json_str = String::from_utf8_lossy(&output.stdout);
        let prs: Vec<GhPrSearchItem> = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to parse PR JSON: {}", e))?;

        // Filter out my PRs
        let filtered_prs: Vec<GhPrSearchItem> = prs
            .into_iter()
            .filter(|pr| pr.author.login.to_lowercase() != USER.to_lowercase())
            .collect();

        // Batch fetch details for all PRs
        let pr_numbers: Vec<u64> = filtered_prs.iter().map(|p| p.number).collect();
        let details = batch_fetch_pr_details(&pr_numbers);

        let mut result: Vec<GitHubPr> = Vec::new();

        for pr in filtered_prs {
            let (approvals, requested_reviewers) = details
                .get(&pr.number)
                .cloned()
                .unwrap_or_default();

            // Only include if has exactly 1 approval and I haven't approved
            let i_approved = approvals.iter().any(|a| a.username.to_lowercase() == USER.to_lowercase());
            if approvals.len() == 1 && !i_approved {
                result.push(to_github_pr(pr, approvals, requested_reviewers));
            }
        }

        result.sort_by(|a, b| a.created_at.cmp(&b.created_at));

        // Update cache
        {
            let mut cache = PR_CACHE.write();
            cache.high_priority = Some(CachedPrData {
                prs: result.clone(),
                cached_at: Instant::now(),
            });
        }

        Ok(result)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Fetch medium priority PRs: PRs with 1 approval assigned to team slug
#[tauri::command]
pub async fn fetch_medium_priority_prs(force_refresh: Option<bool>) -> Result<Vec<GitHubPr>, String> {
    // Check cache first
    if !force_refresh.unwrap_or(false) {
        let cache = PR_CACHE.read();
        if PrCache::is_valid(&cache.medium_priority) {
            return Ok(cache.medium_priority.as_ref().unwrap().prs.clone());
        }
    }

    tauri::async_runtime::spawn_blocking(|| {
        let gh_path = get_gh_path()?;

        let output = Command::new(gh_path)
            .args([
                "search", "prs",
                "--repo", REPO,
                "--state", "open",
                "--review-requested", TEAM_SLUG,
                "--json", "number,title,url,author,createdAt",
                "--limit", "50",
            ])
            .output()
            .map_err(|e| format!("Failed to run gh command: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to search PRs: {}", stderr));
        }

        let json_str = String::from_utf8_lossy(&output.stdout);
        let prs: Vec<GhPrSearchItem> = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to parse PR JSON: {}", e))?;

        // Filter out my PRs
        let filtered_prs: Vec<GhPrSearchItem> = prs
            .into_iter()
            .filter(|pr| pr.author.login.to_lowercase() != USER.to_lowercase())
            .collect();

        // Batch fetch details
        let pr_numbers: Vec<u64> = filtered_prs.iter().map(|p| p.number).collect();
        let details = batch_fetch_pr_details(&pr_numbers);

        let mut result: Vec<GitHubPr> = Vec::new();

        for pr in filtered_prs {
            let (approvals, requested_reviewers) = details
                .get(&pr.number)
                .cloned()
                .unwrap_or_default();

            if approvals.len() == 1 {
                result.push(to_github_pr(pr, approvals, requested_reviewers));
            }
        }

        result.sort_by(|a, b| a.created_at.cmp(&b.created_at));

        // Update cache
        {
            let mut cache = PR_CACHE.write();
            cache.medium_priority = Some(CachedPrData {
                prs: result.clone(),
                cached_at: Instant::now(),
            });
        }

        Ok(result)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Fetch low priority PRs: PRs with 0 approvals assigned to me or team
#[tauri::command]
pub async fn fetch_low_priority_prs(force_refresh: Option<bool>) -> Result<Vec<GitHubPr>, String> {
    // Check cache first
    if !force_refresh.unwrap_or(false) {
        let cache = PR_CACHE.read();
        if PrCache::is_valid(&cache.low_priority) {
            return Ok(cache.low_priority.as_ref().unwrap().prs.clone());
        }
    }

    tauri::async_runtime::spawn_blocking(|| {
        let gh_path = get_gh_path()?;
        let mut all_prs: Vec<GitHubPr> = Vec::new();
        let mut seen_numbers: HashSet<u64> = HashSet::new();
        let mut all_pr_items: Vec<GhPrSearchItem> = Vec::new();

        // Get PRs where review is requested from me
        let output1 = Command::new(gh_path)
            .args([
                "search", "prs",
                "--repo", REPO,
                "--state", "open",
                "--review-requested", USER,
                "--json", "number,title,url,author,createdAt",
                "--limit", "50",
            ])
            .output()
            .map_err(|e| format!("Failed to run gh command: {}", e))?;

        if output1.status.success() {
            let json_str = String::from_utf8_lossy(&output1.stdout);
            if let Ok(prs) = serde_json::from_str::<Vec<GhPrSearchItem>>(&json_str) {
                for pr in prs {
                    if pr.author.login.to_lowercase() != USER.to_lowercase()
                        && !seen_numbers.contains(&pr.number)
                    {
                        seen_numbers.insert(pr.number);
                        all_pr_items.push(pr);
                    }
                }
            }
        }

        // Get PRs where review is requested from team
        let output2 = Command::new(gh_path)
            .args([
                "search", "prs",
                "--repo", REPO,
                "--state", "open",
                "--review-requested", TEAM_SLUG,
                "--json", "number,title,url,author,createdAt",
                "--limit", "50",
            ])
            .output()
            .map_err(|e| format!("Failed to run gh command: {}", e))?;

        if output2.status.success() {
            let json_str = String::from_utf8_lossy(&output2.stdout);
            if let Ok(prs) = serde_json::from_str::<Vec<GhPrSearchItem>>(&json_str) {
                for pr in prs {
                    if pr.author.login.to_lowercase() != USER.to_lowercase()
                        && !seen_numbers.contains(&pr.number)
                    {
                        seen_numbers.insert(pr.number);
                        all_pr_items.push(pr);
                    }
                }
            }
        }

        // Batch fetch details for all PRs at once
        let pr_numbers: Vec<u64> = all_pr_items.iter().map(|p| p.number).collect();
        let details = batch_fetch_pr_details(&pr_numbers);

        for pr in all_pr_items {
            let (approvals, requested_reviewers) = details
                .get(&pr.number)
                .cloned()
                .unwrap_or_default();

            if approvals.is_empty() {
                all_prs.push(to_github_pr(pr, approvals, requested_reviewers));
            }
        }

        all_prs.sort_by(|a, b| a.created_at.cmp(&b.created_at));

        // Update cache
        {
            let mut cache = PR_CACHE.write();
            cache.low_priority = Some(CachedPrData {
                prs: all_prs.clone(),
                cached_at: Instant::now(),
            });
        }

        Ok(all_prs)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// ============ My PRs Commands ============

/// Fetch my PRs that have at least 1 approval
#[tauri::command]
pub async fn fetch_my_approved_prs(force_refresh: Option<bool>) -> Result<Vec<GitHubPr>, String> {
    // Check cache first
    if !force_refresh.unwrap_or(false) {
        let cache = PR_CACHE.read();
        if PrCache::is_valid(&cache.my_approved) {
            return Ok(cache.my_approved.as_ref().unwrap().prs.clone());
        }
    }

    tauri::async_runtime::spawn_blocking(|| {
        let gh_path = get_gh_path()?;

        let output = Command::new(gh_path)
            .args([
                "search", "prs",
                "--repo", REPO,
                "--state", "open",
                "--author", USER,
                "--json", "number,title,url,author,createdAt",
                "--limit", "50",
            ])
            .output()
            .map_err(|e| format!("Failed to run gh command: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to search PRs: {}", stderr));
        }

        let json_str = String::from_utf8_lossy(&output.stdout);
        let prs: Vec<GhPrSearchItem> = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to parse PR JSON: {}", e))?;

        // Batch fetch details
        let pr_numbers: Vec<u64> = prs.iter().map(|p| p.number).collect();
        let details = batch_fetch_pr_details(&pr_numbers);

        let mut result: Vec<GitHubPr> = Vec::new();

        for pr in prs {
            let (approvals, requested_reviewers) = details
                .get(&pr.number)
                .cloned()
                .unwrap_or_default();

            if !approvals.is_empty() {
                result.push(to_github_pr(pr, approvals, requested_reviewers));
            }
        }

        result.sort_by(|a, b| a.created_at.cmp(&b.created_at));

        // Update cache
        {
            let mut cache = PR_CACHE.write();
            cache.my_approved = Some(CachedPrData {
                prs: result.clone(),
                cached_at: Instant::now(),
            });
        }

        Ok(result)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Fetch my PRs that have changes requested
#[tauri::command]
pub async fn fetch_my_changes_requested_prs(force_refresh: Option<bool>) -> Result<Vec<GitHubPr>, String> {
    // Check cache first
    if !force_refresh.unwrap_or(false) {
        let cache = PR_CACHE.read();
        if PrCache::is_valid(&cache.my_changes_requested) {
            return Ok(cache.my_changes_requested.as_ref().unwrap().prs.clone());
        }
    }

    tauri::async_runtime::spawn_blocking(|| {
        let gh_path = get_gh_path()?;

        let output = Command::new(gh_path)
            .args([
                "search", "prs",
                "--repo", REPO,
                "--state", "open",
                "--author", USER,
                "--review", "changes_requested",
                "--json", "number,title,url,author,createdAt",
                "--limit", "50",
            ])
            .output()
            .map_err(|e| format!("Failed to run gh command: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to search PRs: {}", stderr));
        }

        let json_str = String::from_utf8_lossy(&output.stdout);
        let prs: Vec<GhPrSearchItem> = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to parse PR JSON: {}", e))?;

        // Batch fetch details
        let pr_numbers: Vec<u64> = prs.iter().map(|p| p.number).collect();
        let details = batch_fetch_pr_details(&pr_numbers);

        let mut result: Vec<GitHubPr> = Vec::new();

        for pr in prs {
            let (approvals, requested_reviewers) = details
                .get(&pr.number)
                .cloned()
                .unwrap_or_default();
            result.push(to_github_pr(pr, approvals, requested_reviewers));
        }

        result.sort_by(|a, b| a.created_at.cmp(&b.created_at));

        // Update cache
        {
            let mut cache = PR_CACHE.write();
            cache.my_changes_requested = Some(CachedPrData {
                prs: result.clone(),
                cached_at: Instant::now(),
            });
        }

        Ok(result)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

/// Fetch my PRs that need reviews (0 approvals, no changes requested)
#[tauri::command]
pub async fn fetch_my_needs_review_prs(force_refresh: Option<bool>) -> Result<Vec<GitHubPr>, String> {
    // Check cache first
    if !force_refresh.unwrap_or(false) {
        let cache = PR_CACHE.read();
        if PrCache::is_valid(&cache.my_needs_review) {
            return Ok(cache.my_needs_review.as_ref().unwrap().prs.clone());
        }
    }

    tauri::async_runtime::spawn_blocking(|| {
        let gh_path = get_gh_path()?;

        let output = Command::new(gh_path)
            .args([
                "search", "prs",
                "--repo", REPO,
                "--state", "open",
                "--author", USER,
                "--json", "number,title,url,author,createdAt",
                "--limit", "50",
            ])
            .output()
            .map_err(|e| format!("Failed to run gh command: {}", e))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr);
            return Err(format!("Failed to search PRs: {}", stderr));
        }

        let json_str = String::from_utf8_lossy(&output.stdout);
        let prs: Vec<GhPrSearchItem> = serde_json::from_str(&json_str)
            .map_err(|e| format!("Failed to parse PR JSON: {}", e))?;

        // Batch fetch details
        let pr_numbers: Vec<u64> = prs.iter().map(|p| p.number).collect();
        let details = batch_fetch_pr_details(&pr_numbers);

        let mut result: Vec<GitHubPr> = Vec::new();

        for pr in prs {
            let (approvals, requested_reviewers) = details
                .get(&pr.number)
                .cloned()
                .unwrap_or_default();

            if approvals.is_empty() {
                result.push(to_github_pr(pr, approvals, requested_reviewers));
            }
        }

        result.sort_by(|a, b| a.created_at.cmp(&b.created_at));

        // Update cache
        {
            let mut cache = PR_CACHE.write();
            cache.my_needs_review = Some(CachedPrData {
                prs: result.clone(),
                cached_at: Instant::now(),
            });
        }

        Ok(result)
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}

// ============ GitHub Stats Commands ============

#[derive(Debug, Clone, serde::Serialize)]
pub struct GitHubStats {
    pub prs_merged_mtd: u32,
    pub prs_merged_prev_month: u32,
    pub prs_merged_prev_3_months: u32,
    pub prs_approved_mtd: u32,
    pub prs_approved_prev_month: u32,
    pub prs_approved_prev_3_months: u32,
}

fn get_date_ranges() -> (String, String, String, String, String) {
    use chrono::{Datelike, Duration, Local, NaiveDate};

    let today = Local::now().date_naive();
    let first_of_month = NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap();

    let prev_month = if today.month() == 1 {
        NaiveDate::from_ymd_opt(today.year() - 1, 12, 1).unwrap()
    } else {
        NaiveDate::from_ymd_opt(today.year(), today.month() - 1, 1).unwrap()
    };
    let prev_month_end = first_of_month - Duration::days(1);

    let three_months_ago = today - Duration::days(90);

    (
        first_of_month.format("%Y-%m-%d").to_string(),
        prev_month.format("%Y-%m-%d").to_string(),
        prev_month_end.format("%Y-%m-%d").to_string(),
        three_months_ago.format("%Y-%m-%d").to_string(),
        today.format("%Y-%m-%d").to_string(),
    )
}

fn count_prs_from_output(output: &std::process::Output) -> u32 {
    if !output.status.success() {
        return 0;
    }
    let json_str = String::from_utf8_lossy(&output.stdout);
    if let Ok(prs) = serde_json::from_str::<Vec<serde_json::Value>>(&json_str) {
        prs.len() as u32
    } else {
        0
    }
}

#[tauri::command]
pub async fn fetch_github_stats() -> Result<GitHubStats, String> {
    tauri::async_runtime::spawn_blocking(|| {
        let gh_path = get_gh_path()?;
        let (mtd_start, prev_month_start, prev_month_end, three_months_start, _today) = get_date_ranges();

        let prs_merged_mtd = Command::new(gh_path)
            .args([
                "search", "prs",
                "--repo", REPO,
                "--author", USER,
                "--merged",
                "--merged", &format!(">={}", mtd_start),
                "--json", "number",
                "--limit", "200",
            ])
            .output()
            .map(|o| count_prs_from_output(&o))
            .unwrap_or(0);

        let prs_merged_prev_month = Command::new(gh_path)
            .args([
                "search", "prs",
                "--repo", REPO,
                "--author", USER,
                "--merged",
                "--merged", &format!("{}..{}", prev_month_start, prev_month_end),
                "--json", "number",
                "--limit", "200",
            ])
            .output()
            .map(|o| count_prs_from_output(&o))
            .unwrap_or(0);

        let prs_merged_prev_3_months = Command::new(gh_path)
            .args([
                "search", "prs",
                "--repo", REPO,
                "--author", USER,
                "--merged",
                "--merged", &format!(">={}", three_months_start),
                "--json", "number",
                "--limit", "200",
            ])
            .output()
            .map(|o| count_prs_from_output(&o))
            .unwrap_or(0);

        let prs_approved_mtd = Command::new(gh_path)
            .args([
                "search", "prs",
                "--repo", REPO,
                "--reviewed-by", USER,
                "--merged",
                "--merged", &format!(">={}", mtd_start),
                "--json", "number",
                "--limit", "200",
            ])
            .output()
            .map(|o| count_prs_from_output(&o))
            .unwrap_or(0);

        let prs_approved_prev_month = Command::new(gh_path)
            .args([
                "search", "prs",
                "--repo", REPO,
                "--reviewed-by", USER,
                "--merged",
                "--merged", &format!("{}..{}", prev_month_start, prev_month_end),
                "--json", "number",
                "--limit", "200",
            ])
            .output()
            .map(|o| count_prs_from_output(&o))
            .unwrap_or(0);

        let prs_approved_prev_3_months = Command::new(gh_path)
            .args([
                "search", "prs",
                "--repo", REPO,
                "--reviewed-by", USER,
                "--merged",
                "--merged", &format!(">={}", three_months_start),
                "--json", "number",
                "--limit", "200",
            ])
            .output()
            .map(|o| count_prs_from_output(&o))
            .unwrap_or(0);

        Ok(GitHubStats {
            prs_merged_mtd,
            prs_merged_prev_month,
            prs_merged_prev_3_months,
            prs_approved_mtd,
            prs_approved_prev_month,
            prs_approved_prev_3_months,
        })
    })
    .await
    .map_err(|e| format!("Task failed: {}", e))?
}
