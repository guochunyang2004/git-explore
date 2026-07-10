// 底部状态栏（对应架构文档 4.4 & mockup）
// 显示当前 git 上下文 / 分支 / 同步状态 / 变更统计 / 批量进度 / 选中项 / 路径
import { useTranslation } from "react-i18next";
import { GitBranchIcon, FileIcon, CommitIcon, PullIcon } from "@/components/icons";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { useWorkspaceStore, useGitReposStore, useBatchProgressStore } from "@/stores";

export function StatusBar() {
  const { t } = useTranslation();
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const currentDir = useWorkspaceStore((s) => s.currentDir);
  const selectedEntry = useWorkspaceStore((s) => s.selectedEntry);
  const repos = useGitReposStore((s) => s.repos);
  const batchTasks = useBatchProgressStore((s) => s.tasks);
  const batchVisible = useBatchProgressStore((s) => s.visible);

  // 根据当前路径推导所属 git 仓库
  const currentRepo = repos.find((r) => currentDir?.startsWith(r.path)) ?? null;
  const displayPath = currentDir ?? rootPath ?? "";

  // 批量进度汇总
  const doneCount = batchTasks.filter((t) => t.state === "success").length;
  const totalCount = batchTasks.length;

  // 选中项数（mock: 固定为 11 项对照 mockup）
  const entryCount = 11;
  const selectedCount = selectedEntry ? 1 : 0;

  return (
    <div className="statusbar">
      {/* 当前 git 仓库 */}
      <div className="sb-item sb-repo" title={t("statusbar:repo")}>
        <GitBranchIcon size={12} />
        {currentRepo ? currentRepo.name : (rootPath ? rootPath.split(/[\\/]/).pop() : "—")}
      </div>

      <span className="sb-divider" />

      {/* 分支 */}
      {currentRepo && (
        <>
          <div className="sb-item sb-branch">
            <GitBranchIcon size={12} />
            {t("statusbar:branch")}: <span className="b-name">{currentRepo.branch}</span>
          </div>
          <span className="sb-divider" />
          {/* 同步状态 */}
          <div className="sb-item">
            {currentRepo.ahead > 0 && <span className="sb-sync-ahead">↑{currentRepo.ahead} {t("statusbar:ahead")}</span>}
            {currentRepo.ahead > 0 && currentRepo.behind > 0 && <span style={{ color: "var(--text-tertiary)" }}>/</span>}
            {currentRepo.behind > 0 && <span className="sb-sync-behind">↓{currentRepo.behind} {t("statusbar:behind")}</span>}
            {currentRepo.ahead === 0 && currentRepo.behind === 0 && <span style={{ color: "var(--st-clean)" }}>✓</span>}
          </div>
          <span className="sb-divider" />
          {/* 变更统计 */}
          <div className="sb-item sb-changes">
            {t("statusbar:changes")}: <span className="num">{currentRepo.dirtyCount}</span> {t("statusbar:items")}
          </div>
          <span className="sb-divider" />
        </>
      )}

      {/* 批量进度 */}
      {batchVisible && totalCount > 0 && (
        <>
          <div className="sb-item" title={t("statusbar:batchProgress", { op: "pull" })}>
            <PullIcon size={12} style={{ color: "var(--git-orange)" }} />
            <span style={{ color: "var(--git-orange)", fontWeight: 600 }}>
              {t("statusbar:batchProgress", { op: "拉取" })}
            </span>
            <span style={{ color: "var(--accent)", fontWeight: 600 }}>{doneCount} / {totalCount}</span>
          </div>
          <span className="sb-divider" />
        </>
      )}

      {/* 选中计数 */}
      <div className="sb-item">
        <FileIcon size={12} />
        {t("statusbar:selected")} {selectedCount} {t("statusbar:items")} / {t("statusbar:items")} {entryCount} {t("statusbar:items")}
      </div>

      <div className="sb-spacer" />

      {/* 当前路径 */}
      <div className="sb-item" style={{ fontFamily: "'Cascadia Code','Consolas',monospace" }}>
        {displayPath}
      </div>

      <span className="sb-divider" />

      {/* Git 版本 */}
      <div className="sb-item">
        <CommitIcon size={12} />
        git 2.45.1
      </div>

      <span className="sb-divider" />

      {/* 语言切换器 */}
      <LanguageSwitcher />

      <span className="sb-divider" />

      {/* 就绪指示 */}
      <div className="sb-item sb-link">
        <CommitIcon size={12} />
        {t("statusbar:ready")}
      </div>
    </div>
  );
}
