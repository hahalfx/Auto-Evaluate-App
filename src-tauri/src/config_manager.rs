use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::command;
use crate::config::AppConfig;

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigUpdateRequest {
    pub section: String,
    pub key: String,
    pub value: serde_json::Value,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ConfigResponse {
    pub success: bool,
    pub message: String,
    pub data: Option<serde_json::Value>,
}

#[tauri::command]
pub async fn get_app_config() -> Result<AppConfig, String> {
    AppConfig::load()
        .map_err(|e| format!("Failed to load config: {}", e))
}

#[tauri::command]
pub async fn update_app_config(
    updates: Vec<ConfigUpdateRequest>,
) -> Result<ConfigResponse, String> {
    let mut config = AppConfig::load()
        .map_err(|e| format!("Failed to load config: {}", e))?;

    for update in updates {
        match update.section.as_str() {
            "xunfei" => {
                match update.key.as_str() {
                    "appid" => config.xunfei.appid = update.value.as_str().unwrap_or_default().to_string(),
                    "api_key" => config.xunfei.api_key = update.value.as_str().unwrap_or_default().to_string(),
                    "api_secret" => config.xunfei.api_secret = update.value.as_str().unwrap_or_default().to_string(),
                    _ => return Err(format!("Invalid xunfei config key: {}", update.key)),
                }
            },
            "openrouter" => {
                match update.key.as_str() {
                    "api_key" => config.openrouter.api_key = update.value.as_str().unwrap_or_default().to_string(),
                    "base_url" => config.openrouter.base_url = update.value.as_str().unwrap_or_default().to_string(),
                    _ => return Err(format!("Invalid openrouter config key: {}", update.key)),
                }
            },
            "app" => {
                match update.key.as_str() {
                    "log_level" => config.app.log_level = update.value.as_str().unwrap_or_default().to_string(),
                    "max_concurrent_tasks" => {
                        if let Some(value) = update.value.as_u64() {
                            config.app.max_concurrent_tasks = value as usize;
                        }
                    },
                    "timeout_seconds" => {
                        if let Some(value) = update.value.as_u64() {
                            config.app.timeout_seconds = value;
                        }
                    },
                    _ => return Err(format!("Invalid app config key: {}", update.key)),
                }
            },
            _ => return Err(format!("Invalid config section: {}", update.section)),
        }
    }

    config.save()
        .map_err(|e| format!("Failed to save config: {}", e))?;

    Ok(ConfigResponse {
        success: true,
        message: "Configuration updated successfully".to_string(),
        data: None,
    })
}

#[tauri::command]
pub async fn reset_app_config() -> Result<ConfigResponse, String> {
    let config = AppConfig::default();
    config.save()
        .map_err(|e| format!("Failed to reset config: {}", e))?;

    Ok(ConfigResponse {
        success: true,
        message: "Configuration reset to defaults".to_string(),
        data: None,
    })
}

#[tauri::command]
pub async fn get_config_directory() -> Result<String, String> {
    let config_dir = AppConfig::get_config_dir()
        .map_err(|e| format!("Failed to get config directory: {}", e))?;
    
    Ok(config_dir.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn export_config() -> Result<String, String> {
    let config = AppConfig::load()
        .map_err(|e| format!("Failed to load config: {}", e))?;
    
    let config_json = serde_json::to_string_pretty(&config)
        .map_err(|e| format!("Failed to serialize config: {}", e))?;
    
    Ok(config_json)
}

#[tauri::command]
pub async fn import_config(config_json: String) -> Result<ConfigResponse, String> {
    let config: AppConfig = serde_json::from_str(&config_json)
        .map_err(|e| format!("Invalid config format: {}", e))?;
    
    config.save()
        .map_err(|e| format!("Failed to save imported config: {}", e))?;
    
    Ok(ConfigResponse {
        success: true,
        message: "Configuration imported successfully".to_string(),
        data: None,
    })
}

#[tauri::command]
pub async fn validate_config() -> Result<ConfigResponse, String> {
    let config = AppConfig::load()
        .map_err(|e| format!("Failed to load config: {}", e))?;

    let mut errors = Vec::new();

    if config.xunfei.appid.is_empty() {
        errors.push("Xunfei APPID is required");
    }
    if config.xunfei.api_key.is_empty() {
        errors.push("Xunfei API Key is required");
    }
    if config.xunfei.api_secret.is_empty() {
        errors.push("Xunfei API Secret is required");
    }

    if config.openrouter.api_key.is_empty() {
        errors.push("OpenRouter API Key is recommended");
    }

    if errors.is_empty() {
        Ok(ConfigResponse {
            success: true,
            message: "Configuration is valid".to_string(),
            data: Some(serde_json::to_value(config).unwrap()),
        })
    } else {
        Ok(ConfigResponse {
            success: false,
            message: format!("Configuration validation failed: {}", errors.join(", ")),
            data: Some(serde_json::to_value(errors).unwrap()),
        })
    }
}

// Frontend utility functions
#[tauri::command]
pub async fn get_config_value(section: String, key: String) -> Result<String, String> {
    let config = AppConfig::load()
        .map_err(|e| format!("Failed to load config: {}", e))?;

    let value = match section.as_str() {
        "xunfei" => match key.as_str() {
            "appid" => &config.xunfei.appid,
            "api_key" => &config.xunfei.api_key,
            "api_secret" => &config.xunfei.api_secret,
            _ => return Err(format!("Invalid xunfei key: {}", key)),
        },
        "openrouter" => match key.as_str() {
            "api_key" => &config.openrouter.api_key,
            "base_url" => &config.openrouter.base_url,
            _ => return Err(format!("Invalid openrouter key: {}", key)),
        },
        "app" => match key.as_str() {
            "log_level" => &config.app.log_level,
            "max_concurrent_tasks" => return Ok(config.app.max_concurrent_tasks.to_string()),
            "timeout_seconds" => return Ok(config.app.timeout_seconds.to_string()),
            _ => return Err(format!("Invalid app key: {}", key)),
        },
        _ => return Err(format!("Invalid section: {}", section)),
    };

    Ok(value.clone())
}

#[tauri::command]
pub async fn set_config_value(
    section: String,
    key: String,
    value: String,
) -> Result<ConfigResponse, String> {
    let update = ConfigUpdateRequest {
        section,
        key,
        value: serde_json::Value::String(value),
    };
    
    update_app_config(vec![update]).await
}

// Migration utility for old .env files
#[tauri::command]
pub async fn migrate_from_env() -> Result<ConfigResponse, String> {
    let mut config = AppConfig::default();
    let mut migrated = false;

    // Check for legacy environment variables
    if let Ok(appid) = std::env::var("XUN_FEI_APPID") {
        config.xunfei.appid = appid;
        migrated = true;
    }
    if let Ok(api_key) = std::env::var("XUN_FEI_API_KEY") {
        config.xunfei.api_key = api_key;
        migrated = true;
    }
    if let Ok(api_secret) = std::env::var("XUN_FEI_API_SECRET") {
        config.xunfei.api_secret = api_secret;
        migrated = true;
    }
    if let Ok(api_key) = std::env::var("OPENROUTER_API_KEY") {
        config.openrouter.api_key = api_key;
        migrated = true;
    }

    if migrated {
        config.save()
            .map_err(|e| format!("Failed to save migrated config: {}", e))?;
        
        Ok(ConfigResponse {
            success: true,
            message: "Configuration migrated from environment variables".to_string(),
            data: None,
        })
    } else {
        Ok(ConfigResponse {
            success: false,
            message: "No environment variables found to migrate".to_string(),
            data: None,
        })
    }
}

// Initialize configuration system
pub fn init_config_system() {
    // Ensure config directory exists
    if let Ok(config_dir) = AppConfig::get_config_dir() {
        let _ = std::fs::create_dir_all(config_dir);
    }
}

