//! 文件状态聚合（对应架构文档 4.4）
//!
//! 合并工作区/暂存区/远端差异，按目录聚合状态。
//! P4 阶段完善。

use crate::types::FileStatus;

/// 聚合目录下所有文件的 git 状态
pub struct StatusAggregator;

impl StatusAggregator {
    pub fn new() -> Self { Self }

    /// 将扁平文件状态按目录层级聚合，返回目录级摘要
    pub fn aggregate_by_dir(&self, _statuses: &[FileStatus]) -> DirStatusSummary {
        DirStatusSummary::default()
    }
}

#[derive(Debug, Clone, Default)]
pub struct DirStatusSummary {
    pub modified: u32,
    pub added: u32,
    pub deleted: u32,
    pub untracked: u32,
    pub conflict: u32,
}

impl Default for StatusAggregator {
    fn default() -> Self { Self::new() }
}
