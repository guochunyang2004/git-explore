//! 基础设施层
//!
//! 第三方能力封装，对领域层提供 trait 抽象，便于测试替换。

pub mod config;
pub mod credential;
pub mod error;
pub mod fs_watcher;
pub mod git2_adapter;

pub use error::{AppError, AppResult, ErrorCode};
