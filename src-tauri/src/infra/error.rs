//! 应用错误处理（对应架构文档附录 B.5 错误码 + C.1 错误传递链）
//!
//! 领域层不返回原始 git2 错误，统一映射到 ErrorCode + i18n key。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 面向前端的错误，序列化为 JSON 返回前端
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppError {
    pub code: ErrorCode,
    /// 面向用户的中文案
    pub message: String,
    /// i18n key，前端按当前语言渲染（附录 H.5 key 回传策略）
    pub message_key: String,
    /// i18n 插值参数
    pub params: HashMap<String, String>,
    /// 调试细节
    pub detail: Option<String>,
}

/// 错误码枚举（附录 B.5）
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum ErrorCode {
    NotFound,
    NotAGitRepo,
    AuthFailed,
    NetworkError,
    Conflict,
    InvalidPath,
    GitError,
    Cancelled,
    Internal,
}

impl AppError {
    pub fn new(code: ErrorCode, message_key: &str, message: &str) -> Self {
        Self {
            code,
            message: message.to_string(),
            message_key: message_key.to_string(),
            params: Default::default(),
            detail: None,
        }
    }

    pub fn with_param(mut self, key: &str, value: &str) -> Self {
        self.params.insert(key.to_string(), value.to_string());
        self
    }

    pub fn with_detail(mut self, detail: impl Into<String>) -> Self {
        self.detail = Some(detail.into());
        self
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{:?}: {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

/// 内部 Result 别名
pub type AppResult<T> = Result<T, AppError>;

// ============ 从底层错误转换 ============

impl From<git2::Error> for AppError {
    fn from(e: git2::Error) -> Self {
        let code = match e.code() {
            git2::ErrorCode::NotFound => ErrorCode::NotFound,
            _ if e.class() == git2::ErrorClass::Net => ErrorCode::AuthFailed,
            git2::ErrorCode::MergeConflict => ErrorCode::Conflict,
            _ => ErrorCode::GitError,
        };
        AppError::new(code, "errors.git_error", e.message())
            .with_detail(format!("{:?}", e))
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        let code = if e.kind() == std::io::ErrorKind::NotFound {
            ErrorCode::NotFound
        } else {
            ErrorCode::Internal
        };
        AppError::new(code, "errors.io_error", &e.to_string()).with_detail(format!("{:?}", e))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError::new(ErrorCode::Internal, "errors.internal", &e.to_string())
            .with_detail(format!("{:?}", e))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn basic_error_construction() {
        let e = AppError::new(ErrorCode::NotFound, "errors.not_found", "未找到");
        assert_eq!(e.code, ErrorCode::NotFound);
        assert_eq!(e.message, "未找到");
        assert_eq!(e.message_key, "errors.not_found");
        assert!(e.params.is_empty());
        assert!(e.detail.is_none());
    }

    #[test]
    fn error_with_param() {
        let e = AppError::new(ErrorCode::InvalidPath, "errors.invalid_path", "路径无效")
            .with_param("path", "/nope");
        assert_eq!(e.params.get("path").unwrap(), "/nope");
    }

    #[test]
    fn error_with_detail_chain() {
        let e = AppError::new(ErrorCode::GitError, "errors.git", "git 错误")
            .with_detail("refs/heads/main not found");
        assert_eq!(e.detail.unwrap(), "refs/heads/main not found");
    }

    #[test]
    fn io_notfound_maps_to_notfound() {
        let io_err = std::io::Error::from(std::io::ErrorKind::NotFound);
        let app_err: AppError = io_err.into();
        assert_eq!(app_err.code, ErrorCode::NotFound);
    }

    #[test]
    fn io_permission_maps_to_internal() {
        let io_err = std::io::Error::from(std::io::ErrorKind::PermissionDenied);
        let app_err: AppError = io_err.into();
        assert_eq!(app_err.code, ErrorCode::Internal);
    }

    #[test]
    fn json_error_maps_to_internal() {
        let json_err = serde_json::from_str::<serde_json::Value>("{").unwrap_err();
        let app_err: AppError = json_err.into();
        assert_eq!(app_err.code, ErrorCode::Internal);
    }

    #[test]
    fn error_display() {
        let e = AppError::new(ErrorCode::Cancelled, "errors.cancelled", "已取消");
        let s = e.to_string();
        assert!(s.contains("Cancelled"));
        assert!(s.contains("已取消"));
    }
}
