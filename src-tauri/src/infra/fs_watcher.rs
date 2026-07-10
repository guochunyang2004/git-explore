//! 文件系统监听（对应架构文档 4.1 / 5.4 fs:changed）
//!
//! 使用 notify 监听工作区变更，增量刷新 git 状态。
//! P2+ 阶段完善。

use std::path::Path;
use std::sync::mpsc::channel;

/// 文件系统监听器
/// 跨平台类型别名：各平台使用不同的 Debouncer 内部类型
#[cfg(target_os = "macos")]
type DebouncerType = notify_debouncer_full::Debouncer<
    notify::FsEventWatcher,
    notify_debouncer_full::FileIdMap,
>;

#[cfg(not(target_os = "macos"))]
type DebouncerType = notify_debouncer_full::Debouncer<
    notify::RecommendedWatcher,
    notify_debouncer_full::FileIdMap,
>;

pub struct FsWatcher {
    _debouncer: Option<DebouncerType>,
}

impl FsWatcher {
    pub fn new() -> Self {
        Self { _debouncer: None }
    }

    /// 开始监听指定目录
    /// P2+ 实现：通过 Tauri AppHandle emit fs:changed 事件
    pub fn watch(&mut self, _root: &Path) {
        // TODO P2: 接入 notify-debouncer-full，监听变更并 emit fs:changed
        let (_tx, _rx): (std::sync::mpsc::Sender<()>, _) = channel();
        let _ = _tx;
    }

    /// 停止监听
    pub fn stop(&mut self) {
        self._debouncer = None;
    }
}

impl Default for FsWatcher {
    fn default() -> Self {
        Self::new()
    }
}
