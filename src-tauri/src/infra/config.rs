//! 配置管理（对应架构文档附录 E.4）
//!
//! JSON 配置文件，存于 Tauri app_config_dir。
//! schema_version 支持版本迁移。
//! 使用 Mutex<AppConfig> 实现内部可变性，支持 Arc 共享访问。

use crate::infra::error::{AppError, AppResult, ErrorCode};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;

const SCHEMA_VERSION: u32 = 1;
const CONFIG_FILE: &str = "config.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppConfig {
    pub schema_version: u32,
    pub window: WindowConfig,
    pub layout: LayoutConfig,
    pub recent_roots: Vec<String>,
    pub last_root: Option<String>,
    pub preferences: Preferences,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowConfig {
    pub width: u32,
    pub height: u32,
    pub x: Option<i32>,
    pub y: Option<i32>,
    pub maximized: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LayoutConfig {
    pub sidebar_width: u32,
    pub splitter_ratio: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub language: Option<String>,
    pub scan_depth: u32,
    pub batch_concurrency: u32,
    pub restore_last_root: bool,
    pub log_level: String,
    /// Git 仓库节点高亮颜色（十六进制，如 #f04e23）
    pub repo_color: String,
    /// 打开目录时是否自动扫描 Git 仓库
    pub auto_scan_git: bool,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            schema_version: SCHEMA_VERSION,
            window: WindowConfig {
                width: 1280,
                height: 820,
                x: None,
                y: None,
                maximized: false,
            },
            layout: LayoutConfig {
                sidebar_width: 300,
                splitter_ratio: 0.3,
            },
            recent_roots: Vec::new(),
            last_root: None,
            preferences: Preferences {
                language: None,
                scan_depth: 3,
                batch_concurrency: 4,
                restore_last_root: true,
                log_level: "info".to_string(),
                repo_color: "#f04e23".to_string(),
                auto_scan_git: false,
            },
        }
    }
}

pub struct ConfigManager {
    config: Mutex<AppConfig>,
    path: PathBuf,
}

impl ConfigManager {
    /// 加载配置，文件不存在则用默认值创建
    pub fn load() -> AppResult<Self> {
        let path = Self::config_path()?;
        let config = if path.exists() {
            let content = std::fs::read_to_string(&path)?;
            let mut cfg: AppConfig = serde_json::from_str(&content).unwrap_or_default();
            Self::migrate(&mut cfg);
            cfg
        } else {
            AppConfig::default()
        };
        Ok(Self {
            config: Mutex::new(config),
            path,
        })
    }

    /// 保存配置到磁盘
    pub fn save(&self) -> AppResult<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)?;
        }
        let cfg = self.config.lock().unwrap();
        let content = serde_json::to_string_pretty(&*cfg)?;
        std::fs::write(&self.path, content)?;
        Ok(())
    }

    /// 只读快照
    pub fn get(&self) -> AppConfig {
        self.config.lock().unwrap().clone()
    }

    /// 添加最近打开的根目录并持久化
    pub fn add_recent_root_and_save(&self, root: &str) -> AppResult<()> {
        let mut cfg = self.config.lock().unwrap();
        cfg.recent_roots.retain(|r| r != root);
        cfg.recent_roots.insert(0, root.to_string());
        if cfg.recent_roots.len() > 10 {
            cfg.recent_roots.truncate(10);
        }
        cfg.last_root = Some(root.to_string());
        drop(cfg);
        self.save()
    }

    /// 设置界面语言
    pub fn set_language(&self, lang: Option<String>) {
        self.config.lock().unwrap().preferences.language = lang;
    }

    /// 获取内部 Mutex 锁（用于批量字段写入）
    pub fn inner_lock(&self) -> std::sync::MutexGuard<'_, AppConfig> {
        self.config.lock().unwrap()
    }

    fn config_path() -> AppResult<PathBuf> {
        let dir = dirs::config_dir().ok_or_else(|| {
            AppError::new(ErrorCode::Internal, "errors.internal", "无法确定配置目录")
        })?;
        Ok(dir.join("GitExplore").join(CONFIG_FILE))
    }

    /// 版本迁移
    fn migrate(cfg: &mut AppConfig) {
        if cfg.schema_version < SCHEMA_VERSION {
            cfg.schema_version = SCHEMA_VERSION;
        }
        if cfg.preferences.scan_depth == 0 {
            cfg.preferences.scan_depth = 3;
        }
        if cfg.preferences.batch_concurrency == 0 {
            cfg.preferences.batch_concurrency = 4;
        }
        if cfg.preferences.repo_color.is_empty() {
            cfg.preferences.repo_color = "#f04e23".to_string();
        }
        // auto_scan_git 默认 false，无需额外迁移
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_config_manager(prefix: &str) -> ConfigManager {
        let dir = std::env::temp_dir().join(format!("ge-test-{}-{}", prefix, uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let path = dir.join(CONFIG_FILE);
        // 确保不会去读系统配置目录
        ConfigManager {
            config: Mutex::new(AppConfig::default()),
            path,
        }
    }

    #[test]
    fn default_config_has_correct_defaults() {
        let cfg = AppConfig::default();
        assert_eq!(cfg.preferences.scan_depth, 3);
        assert_eq!(cfg.preferences.batch_concurrency, 4);
        assert!(cfg.preferences.restore_last_root);
        assert_eq!(cfg.preferences.log_level, "info");
        assert_eq!(cfg.window.width, 1280);
        assert_eq!(cfg.window.height, 820);
        assert!(cfg.recent_roots.is_empty());
        assert!(cfg.last_root.is_none());
    }

    #[test]
    fn save_and_reload_roundtrip() {
        let mgr = temp_config_manager("roundtrip");
        {
            let mut cfg = mgr.inner_lock();
            cfg.preferences.scan_depth = 7;
            cfg.preferences.batch_concurrency = 2;
            cfg.preferences.language = Some("zh-CN".to_string());
        }
        mgr.save().unwrap();
        // re-read
        let raw = std::fs::read_to_string(&mgr.path).unwrap();
        let parsed: AppConfig = serde_json::from_str(&raw).unwrap();
        assert_eq!(parsed.preferences.scan_depth, 7);
        assert_eq!(parsed.preferences.batch_concurrency, 2);
        assert_eq!(parsed.preferences.language.as_deref(), Some("zh-CN"));
    }

    #[test]
    fn add_recent_root_dedup_and_cap() {
        let mgr = temp_config_manager("recent");
        for name in &["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k"] {
            mgr.add_recent_root_and_save(name).unwrap();
        }
        let cfg = mgr.get();
        assert_eq!(cfg.recent_roots.len(), 10, "should cap at 10");
        assert_eq!(cfg.recent_roots[0], "k", "most recent should be first");
        assert_eq!(cfg.last_root.as_deref(), Some("k"));

        // re-adding "k" stays at top
        mgr.add_recent_root_and_save("k").unwrap();
        let cfg2 = mgr.get();
        assert_eq!(cfg2.recent_roots[0], "k");
    }

    #[test]
    fn get_returns_snapshot() {
        let mgr = temp_config_manager("snapshot");
        let snap1 = mgr.get();
        {
            let mut cfg = mgr.inner_lock();
            cfg.preferences.scan_depth = 9;
        }
        let snap2 = mgr.get();
        assert_eq!(snap1.preferences.scan_depth, 3); // unchanged snapshot
        assert_eq!(snap2.preferences.scan_depth, 9); // new snapshot
    }

    #[test]
    fn migration_sets_defaults_on_zero_values() {
        let mut cfg = AppConfig::default();
        cfg.schema_version = 0;
        cfg.preferences.scan_depth = 0;
        cfg.preferences.batch_concurrency = 0;
        ConfigManager::migrate(&mut cfg);
        assert_eq!(cfg.schema_version, 1);
        assert_eq!(cfg.preferences.scan_depth, 3);
        assert_eq!(cfg.preferences.batch_concurrency, 4);
    }
}
