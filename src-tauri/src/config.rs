use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::fs;
use anyhow::Result;
use std::env;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppConfig {
    #[serde(default)]
    pub xunfei: XunfeiConfig,
    #[serde(default)]
    pub openrouter: OpenRouterConfig,
    #[serde(default)]
    pub app: AppSettings,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct XunfeiConfig {
    #[serde(default)]
    pub appid: String,
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub api_secret: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct OpenRouterConfig {
    #[serde(default)]
    pub api_key: String,
    #[serde(default)]
    pub base_url: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AppSettings {
    #[serde(default)]
    pub log_level: String,
    #[serde(default)]
    pub max_concurrent_tasks: usize,
    #[serde(default)]
    pub timeout_seconds: u64,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            xunfei: XunfeiConfig::default(),
            openrouter: OpenRouterConfig::default(),
            app: AppSettings::default(),
        }
    }
}

impl Default for XunfeiConfig {
    fn default() -> Self {
        Self {
            appid: String::new(),
            api_key: String::new(),
            api_secret: String::new(),
        }
    }
}

impl Default for OpenRouterConfig {
    fn default() -> Self {
        Self {
            api_key: String::new(),
            base_url: String::new(),
        }
    }
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            log_level: String::new(),
            max_concurrent_tasks: 0,
            timeout_seconds: 0,
        }
    }
}

impl AppConfig {
    pub fn load() -> Result<Self> {
        // Priority 1: CLI argument
        if let Ok(config_path) = env::var("TAURI_CONFIG_FILE") {
            return Self::load_from_file(PathBuf::from(config_path));
        }

        // Priority 2: User config file
        let config_dir = Self::get_config_dir()?;
        let config_file = config_dir.join("app_config.json");
        
        if config_file.exists() {
            return Self::load_from_file(config_file);
        }

        // Priority 3: Environment variables
        let config = Self::load_from_env()?;

        // Priority 4: Create default config file if none exists
        config.save()?;
        
        Ok(config)
    }

    pub fn load_from_file(path: PathBuf) -> Result<Self> {
        let content = fs::read_to_string(path)?;
        let config: AppConfig = serde_json::from_str(&content)?;
        Ok(config)
    }

    pub fn load_from_env() -> Result<Self> {
        let mut config = AppConfig::default();

        // Xunfei configuration from environment
        if let Ok(appid) = env::var("XUN_FEI_APPID") {
            config.xunfei.appid = appid;
        }
        if let Ok(api_key) = env::var("XUN_FEI_API_KEY") {
            config.xunfei.api_key = api_key;
        }
        if let Ok(api_secret) = env::var("XUN_FEI_API_SECRET") {
            config.xunfei.api_secret = api_secret;
        }

        // OpenRouter configuration from environment
        if let Ok(api_key) = env::var("OPENROUTER_API_KEY") {
            config.openrouter.api_key = api_key;
        }

        // App settings from environment
        if let Ok(log_level) = env::var("LOG_LEVEL") {
            config.app.log_level = log_level;
        }

        Ok(config)
    }

    pub fn save(&self) -> Result<()> {
        let config_dir = Self::get_config_dir()?;
        fs::create_dir_all(&config_dir)?;
        
        let config_file = config_dir.join("app_config.json");
        let content = serde_json::to_string_pretty(self)?;
        fs::write(config_file, content)?;
        
        Ok(())
        
    }

    pub fn get_config_dir() -> Result<PathBuf> {
        // Use the same approach as the database - use app local data directory
        // This matches the pattern used in lib.rs for database storage
        #[cfg(not(test))]
        {
            // For production, use the actual Tauri app local data directory
            // This will be handled by the path resolver
            let app_data_dir = dirs::data_local_dir()
                .ok_or_else(|| anyhow::anyhow!("Failed to determine local data directory"))?
                .join("automation-validator");
            
            Ok(app_data_dir.join("config"))
        }
        
        #[cfg(test)]
        {
            // For testing, use a temporary directory
            let test_dir = std::env::temp_dir().join("automation-validator-test");
            std::fs::create_dir_all(&test_dir).ok();
            Ok(test_dir.join("config"))
        }
    }

    pub fn get_data_dir() -> Result<PathBuf> {
        #[cfg(not(test))]
        {
            let app_data_dir = dirs::data_local_dir()
                .ok_or_else(|| anyhow::anyhow!("Failed to determine local data directory"))?
                .join("automation-validator");
            
            Ok(app_data_dir)
        }
        
        #[cfg(test)]
        {
            let test_dir = std::env::temp_dir().join("automation-validator-test");
            std::fs::create_dir_all(&test_dir).ok();
            Ok(test_dir)
        }
    }
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_config_defaults() {
        let config = AppConfig::default();
        assert!(!config.xunfei.appid.is_empty());
        assert!(!config.xunfei.api_key.is_empty());
        assert!(!config.xunfei.api_secret.is_empty());
    }

    #[test]
    fn test_config_serialization() {
        let config = AppConfig::default();
        let serialized = serde_json::to_string(&config).unwrap();
        let deserialized: AppConfig = serde_json::from_str(&serialized).unwrap();
        assert_eq!(config.xunfei.appid, deserialized.xunfei.appid);
    }
}