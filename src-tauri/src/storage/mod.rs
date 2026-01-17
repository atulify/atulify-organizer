use crate::models::AppData;
use chrono::{Duration, Local};
use std::fs;
use std::path::PathBuf;

const APP_DIR_NAME: &str = "atulify";
const DATA_FILE: &str = "data.json";
const IMAGES_DIR: &str = "images";
const BACKUPS_DIR: &str = "backups";
const BACKUP_RETENTION_DAYS: i64 = 7;

pub fn get_app_dir() -> PathBuf {
    let app_support = dirs::data_dir().expect("Could not find app support directory");
    app_support.join(APP_DIR_NAME)
}

pub fn get_data_path() -> PathBuf {
    get_app_dir().join(DATA_FILE)
}

pub fn get_images_dir() -> PathBuf {
    get_app_dir().join(IMAGES_DIR)
}

pub fn get_backups_dir() -> PathBuf {
    get_app_dir().join(BACKUPS_DIR)
}

pub fn ensure_directories() -> Result<(), String> {
    let app_dir = get_app_dir();
    let images_dir = get_images_dir();
    let backups_dir = get_backups_dir();

    fs::create_dir_all(&app_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&images_dir).map_err(|e| e.to_string())?;
    fs::create_dir_all(&backups_dir).map_err(|e| e.to_string())?;

    Ok(())
}

pub fn load_data() -> Result<AppData, String> {
    ensure_directories()?;

    let data_path = get_data_path();

    if !data_path.exists() {
        let default_data = AppData::default();
        save_data(&default_data)?;
        return Ok(default_data);
    }

    let contents = fs::read_to_string(&data_path).map_err(|e| e.to_string())?;

    match serde_json::from_str(&contents) {
        Ok(data) => Ok(data),
        Err(e) => {
            // Try to recover from backup
            if let Ok(backup_data) = restore_latest_backup() {
                eprintln!("Data file corrupted, restored from backup: {}", e);
                Ok(backup_data)
            } else {
                Err(format!("Failed to parse data file and no backup available: {}", e))
            }
        }
    }
}

pub fn save_data(data: &AppData) -> Result<(), String> {
    ensure_directories()?;

    let data_path = get_data_path();
    let contents = serde_json::to_string_pretty(data).map_err(|e| e.to_string())?;

    // Atomic write: write to temp file first, then rename
    // This prevents data corruption if the app crashes mid-write
    let temp_path = data_path.with_extension("json.tmp");

    fs::write(&temp_path, &contents).map_err(|e| format!("Failed to write temp file: {}", e))?;

    fs::rename(&temp_path, &data_path).map_err(|e| format!("Failed to rename temp file: {}", e))?;

    Ok(())
}

pub fn create_backup() -> Result<String, String> {
    ensure_directories()?;

    let data_path = get_data_path();
    if !data_path.exists() {
        return Err("No data file to backup".to_string());
    }

    let backups_dir = get_backups_dir();
    let date = Local::now().format("%Y-%m-%d").to_string();
    let backup_name = format!("data-{}.json", date);
    let backup_path = backups_dir.join(&backup_name);

    fs::copy(&data_path, &backup_path).map_err(|e| e.to_string())?;

    // Clean up old backups
    cleanup_old_backups()?;

    Ok(backup_name)
}

pub fn cleanup_old_backups() -> Result<(), String> {
    let backups_dir = get_backups_dir();
    let cutoff = Local::now() - Duration::days(BACKUP_RETENTION_DAYS);

    if let Ok(entries) = fs::read_dir(&backups_dir) {
        for entry in entries.flatten() {
            if let Ok(metadata) = entry.metadata() {
                if let Ok(modified) = metadata.modified() {
                    let modified_time: chrono::DateTime<Local> = modified.into();
                    if modified_time < cutoff {
                        let _ = fs::remove_file(entry.path());
                    }
                }
            }
        }
    }

    Ok(())
}

pub fn get_backups() -> Result<Vec<String>, String> {
    let backups_dir = get_backups_dir();
    let mut backups = Vec::new();

    if let Ok(entries) = fs::read_dir(&backups_dir) {
        for entry in entries.flatten() {
            if let Some(name) = entry.file_name().to_str() {
                if name.starts_with("data-") && name.ends_with(".json") {
                    backups.push(name.to_string());
                }
            }
        }
    }

    backups.sort_by(|a, b| b.cmp(a)); // Sort newest first
    Ok(backups)
}

pub fn restore_backup(backup_name: &str) -> Result<AppData, String> {
    let backups_dir = get_backups_dir();
    let backup_path = backups_dir.join(backup_name);

    if !backup_path.exists() {
        return Err(format!("Backup '{}' not found", backup_name));
    }

    let contents = fs::read_to_string(&backup_path).map_err(|e| e.to_string())?;
    let data: AppData = serde_json::from_str(&contents).map_err(|e| e.to_string())?;

    // Save restored data as current
    save_data(&data)?;

    Ok(data)
}

fn restore_latest_backup() -> Result<AppData, String> {
    let backups = get_backups()?;

    if let Some(latest) = backups.first() {
        restore_backup(latest)
    } else {
        Err("No backups available".to_string())
    }
}

pub fn save_image(filename: &str, data: &[u8]) -> Result<String, String> {
    ensure_directories()?;

    let images_dir = get_images_dir();
    let image_path = images_dir.join(filename);

    fs::write(&image_path, data).map_err(|e| e.to_string())?;

    Ok(image_path.to_string_lossy().to_string())
}

pub fn delete_image(filename: &str) -> Result<(), String> {
    let images_dir = get_images_dir();
    let image_path = images_dir.join(filename);

    if image_path.exists() {
        fs::remove_file(&image_path).map_err(|e| e.to_string())?;
    }

    Ok(())
}
