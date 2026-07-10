# GitExplore 架构设计

> 基于 Tauri 的 Git 目录管理工具，界面遵循 Windows Explorer 风格。
> **核心理念**：无需"添加仓库"，打开任意根目录后自动识别其中的 `.git` 目录，按文件树浏览并管理；支持文件树多选 git 仓库进行**批量操作**。
> 阶段：架构设计 + 静态展示（本文档 + `mockup/git-explore-ui.html`）

---

## 1. 项目定位

| 维度 | 说明 |
| --- | --- |
| 产品形态 | 桌面端原生应用（Tauri 2） |
| 目标用户 | 需要管理多个本地 Git 仓库的开发者 |
| 核心能力 | **打开根目录 → 自动识别 .git 仓库** → 文件树浏览 → 拉取/提交/推送、分支与历史、文件状态可视化 → **多仓库批量操作** |
| 交互范式 | 鼠标驱动，Windows Explorer 风格布局（菜单栏 / 工具栏 / 地址栏 / 树+列表双栏 / 状态栏） |

### 1.1 与传统 Git GUI 的区别

| 传统工具 | GitExplore |
| --- | --- |
| 需手动"添加仓库"/注册到列表 | 直接打开文件夹，自动发现 git 仓库 |
| 仓库列表与文件浏览分离 | 一棵文件树，git 仓库作为树节点自然呈现 |
| 切换仓库需点列表 | 浏览到任意 git 目录即自动切换上下文 |
| 逐个仓库操作 | 文件树多选 git 仓库，一键批量拉取/推送/提交/同步 |

---

## 2. 技术选型

### 2.1 整体栈

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 外壳 | **Tauri 2.x** | Rust 后端 + 系统 WebView，体积小、原生窗口、自定义标题栏 |
| 前端 | **React 18 + TypeScript + Vite** | 组件化 UI，HMR 开发体验 |
| 状态 | **Zustand** | 轻量状态管理，适合当前根目录/选中态/批量选中集/工作区状态 |
| 样式 | **原生 CSS + CSS Variables** | Fluent/Win11 视觉语言自实现，避免重型 UI 库 |
| Git 引擎 | **git2-rs (libgit2)** 为主 + **命令行 git** 兜底 | libgit2 性能好、易嵌入；复杂/新特性命令行兜底 |
| 并发 | **tokio**（异步任务池） | 批量操作并发执行多个仓库的 git 任务 |
| 配置存储 | **JSON 文件**（最近打开的根目录、偏好） | 轻量，无需数据库 |
| 文件监听 | **notify** crate | 监听工作区变更，增量刷新 git 状态 |
| 凭证 | **系统 keychain**（`keyring` crate） | 安全存储远端 token / 密码 |

### 2.2 选型理由

- **Tauri 而非 Electron**：体积小（~5MB vs ~80MB），内存低，Rust 后端天然适合封装 git2。
- **git2-rs 而非纯命令行**：避免反复 spawn 进程，读取文件状态/日志/分支信息更快；命令行仅用于 fetch/push 等需网络与认证的复杂场景。
- **tokio 并发**：批量操作需对 N 个仓库同时拉取/推送，tokio 任务池提供有界并发（默认 4），避免一次性 spawn 过多 git 进程拖垮系统。
- **JSON 而非 SQLite**：移除仓库注册表后，只需存"最近打开的根目录"与用户偏好，JSON 足矣。
- **notify 监听**：自动识别模式下，文件树随时变化，需监听 `.git` 目录的出现/消失与文件变更。

---

## 3. 架构分层

```
┌─────────────────────────────────────────────────────┐
│  表现层 (Webview / React)                            │
│  ┌─────────────┐ ┌───────────┐ ┌─────────────────┐  │
│  │ 菜单/工具栏  │ │ 批量操作栏  │ │ 树 + 列表 双栏   │  │
│  │             │ │(多选时浮现)│ │  + 批量进度面板  │  │
│  └─────────────┘ └───────────┘ └─────────────────┘  │
│              状态栏 (分支/同步/变更/批量)              │
└───────────────────────┬─────────────────────────────┘
                        │  Tauri IPC (invoke / emit)
┌───────────────────────▼─────────────────────────────┐
│  应用层 (Rust)                                       │
│  ┌──────────────┐ ┌──────────────┐ ┌─────────────┐  │
│  │ 命令调度      │ │ 事件总线      │ │ 权限/凭证网关 │  │
│  │ (tauri::cmd) │ │ (EventLoop)  │ │             │  │
│  └──────────────┘ └──────────────┘ └─────────────┘  │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│  领域层 (Rust)                                       │
│  ┌──────────────┐ ┌────────────┐ ┌──────────────────┐│
│  │ 工作区管理    │ │ Git 识别器  │ │ Git 操作服务     ││
│  │ WorkspaceMgr │ │ GitDetector │ │ GitService       ││
│  └──────────────┘ └────────────┘ └──────────────────┘│
│  ┌────────────────────┐ ┌──────────────────────────┐ │
│  │ 状态聚合            │ │ 批量操作编排 ⭐           │ │
│  │ StatusAggregator    │ │ BatchOpsManager          │ │
│  └────────────────────┘ └──────────────────────────┘ │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│  基础设施层 (Rust)                                   │
│  git2-rs │ notify │ keyring │ tokio(并发) │ walkdir │
└─────────────────────────────────────────────────────┘
```

### 3.1 各层职责

- **表现层**：纯 UI 渲染与交互，不直接访问文件系统或 git，所有数据经 IPC 获取。
- **应用层**：暴露 `#[tauri::command]`，做参数校验、命令路由、事件广播、凭证注入。
- **领域层**：核心业务逻辑，与 Tauri 解耦，可独立单测。
  - `WorkspaceManager`：管理当前打开的根目录、最近打开记录、文件树读取。
  - `GitDetector`：扫描目录树，识别含 `.git` 的目录，维护"git 仓库地图"。
  - `GitService`：封装 fetch/pull/commit/push/log/branch。
  - `StatusAggregator`：合并工作区/暂存区/远端差异。
  - `BatchOpsManager`：⭐ 批量操作编排，并发执行多仓库 git 任务并回传逐仓进度。
- **基础设施层**：第三方能力封装，对领域层提供 trait 抽象，便于测试替换。

---

## 4. 模块划分

### 4.1 工作区管理模块 (WorkspaceManager)

- **打开根目录**：用户通过"打开文件夹"选择一个目录作为浏览根（如 `D:\Projects`）。
- **磁盘列表**：应用启动时自动列出本机所有磁盘（Windows 盘符 / macOS 挂载点 / Linux 挂载点），展示在文件树根级，点击磁盘即以该盘为工作区打开。
- 记忆最近打开的根目录列表（JSON 持久化），支持快速切换。
- 懒加载读取文件树（按需展开子目录），避免一次性扫描巨量节点。
- 监听文件系统变更（`notify`），树结构与目录内容实时更新。

### 4.2 Git 自动识别模块 (GitDetector)  ⭐ 核心

这是本产品区别于传统 Git GUI 的关键。

- **扫描识别**：用户点击"扫描Git"按钮后，在当前目录下递归查找含 `.git` 子目录的目录，标记为 Git 仓库。扫描可随时取消。
- **增量扫描**：用户在左侧树中单击任意目录节点时，自动触发对该目录及其子目录的 Git 仓库扫描（增量合并到已有仓库列表，不覆盖之前的结果）。正在扫描时不会重复触发。
- **识别策略**：
  - 用户点击"扫描Git"按钮时，做一次**有限深度**的快速扫描（默认向下 3 层），找出所有 git 仓库，扫描前清空旧结果（全量替换）。
  - 用户单击目录节点时，对该目录做增量扫描（默认深度 3 层），结果合并到已有仓库列表（按路径去重覆盖）。
  - 文件树支持**树形展开/折叠**，点击目录节点的箭头展开时懒加载子目录内容。
  - 扫描跳过 `node_modules`、`target`、`__pycache__`、`.git` 内部目录等常见噪音。
  - `notify` 监听到新 `.git` 目录创建（如 `git init` / `git clone`）时，可手动重新扫描。
- **仓库地图**：维护 `路径 → GitRepoInfo` 映射，`GitRepoInfo` 含：分支、ahead/behind、变更数、远端 URL、是否干净。
- **上下文推导**：当前选中路径落在某个 git 仓库内时，自动激活该仓库的 git 上下文（分支/状态/历史），无需手动切换。
- **嵌套处理**：支持 git submodule / 嵌套仓库，内层 `.git` 优先于外层。
- **批量选择集**：向表现层提供"所有已识别仓库"清单，供批量多选使用。

### 4.3 Git 操作模块 (GitService)

| 操作 | 实现 | 备注 |
| --- | --- | --- |
| status | git2 | 工作区+暂存区差异聚合 |
| log / history | git2 | 分页加载，支持分支过滤 |
| branch | git2 | 创建/切换/删除/重命名 |
| commit | git2 | 暂存选择 + 提交信息 |
| fetch / pull | 命令行 git | 需认证，走 keychain 注入 |
| push | 命令行 git | 需认证，支持 force/上游 |
| merge / rebase | 命令行 git | 冲突状态回传前端 |
| diff | git2 | 文件级与行级 diff |

> 所有操作以"当前 git 上下文仓库"为隐式目标，前端无需显式传 repoId，由 `GitDetector` 根据当前路径推导；批量操作时则显式传入仓库路径列表。

### 4.4 文件浏览模块

- **左侧树**：从用户打开的根目录开始的单一文件树，支持**树形展开/折叠**。数据源为 `treeEntries`（打开工作区时设置，不随导航变化），确保左侧始终保持树结构。
  - 点击目录节点的箭头（▶/▼）展开/折叠子目录，懒加载子目录内容。
  - 单击目录节点：展开/折叠 + 右侧同步显示该目录内容 + 自动扫描该目录的 Git 仓库（增量合并）。
  - 双击目录节点导航进入该目录（设为 currentDir）。
  - **目录图标颜色规则**（左右窗口统一）：
    - 🟢 Git 仓库 + 无未提交变更（`isClean === true`）→ 绿色 `#22c55e`
    - 🔴 Git 仓库 + 有未提交变更（`isClean === false`）→ 红色 `#ef4444`
    - 🟡 普通目录 → 黄色 `#e8b339`
  - **Git 仓库节点**：显示复选框用于多选；分支名 + ahead/behind 角标。
  - 仓库内文件节点：右侧显示 git 状态标记（M/A/D/?/U）。
  - **多选快捷操作**：勾选 ≥1 个仓库后，底部显示"全选/清除"按钮。
- **右侧列表**：选中目录的条目列表（数据源为 `entries`，随导航更新），列含 `名称 / Git状态 / 分支 / 提交人 / 提交时间 / 修改时间 / 大小 / 最后提交`。右侧列表中的目录项同样应用图标颜色规则（通过 `reposMap` 查询）。
  - **分支、提交人、提交时间**三列仅对 Git 仓库目录显示（通过 `reposMap` 查询 `GitRepoInfo`），非 Git 目录显示 "—"。
  - 非 git 目录下的文件不显示 git 状态列（或显示"—"）。
- Git 状态标记：`M` 已修改 / `A` 已暂存 / `D` 已删除 / `?` 未跟踪 / `U` 冲突，颜色编码。
- **导航历史栈**：维护用户浏览路径的历史记录，支持工具栏"后退"按钮逐步回退。打开新根目录时重置历史栈；正常导航时压入新路径；后退时不截断历史（保留前进可能性）。
- **返回上级目录**：工具栏"向上"按钮，从当前目录返回上一级，至根目录时禁用。与"后退"独立运作——"向上"始终去父目录，"后退"去上一个浏览位置（可能是同级跳转）。

### 4.5 批量操作模块 (BatchOpsManager)  ⭐ 核心

支持基于文件树多选 git 仓库后的一键批量操作。

- **操作类型**：
  | 批量操作 | 行为 | 适用场景 |
  | --- | --- | --- |
  | 批量拉取 (Pull All) | 对选中仓库依次/并发执行 pull | 早上同步全部仓库 |
  | 批量推送 (Push All) | 对选中仓库推送本地提交 | 收工前推送全部 |
  | 批量获取 (Fetch All) | 仅 fetch 不合并，刷新远端状态 | 查看各仓库落后情况 |
  | 批量提交 (Commit All) | 用统一提交信息对各仓库暂存内容提交 | 统一改动批量入库 |
  | 批量同步 (Sync All) | pull 后 push | 保持全部仓库与远端一致 |
  | 批量切换分支 | 选中仓库统一切到指定分支 | 多库同步切换分支 |
- **并发编排**：tokio 任务池有界并发（默认 4 路），避免一次性拉起过多 git 进程；可配置并发度。
- **逐仓进度**：每个仓库独立状态机 `排队中 → 执行中 → 成功/失败/跳过`，实时回传。
- **失败隔离**：单仓失败不中断整体批次，汇总到结果报告；失败项可一键重试。
- **冲突处理**：pull/merge 产生冲突的仓库标记为"需处理"，不自动解决，引导用户单独处理。
- **事务感**：批量提交时可选择"全部有暂存才提交"或"分别提交"，避免部分仓库无变更产生空提交。
- **预检**：执行前展示待操作仓库清单与各自当前状态（有无变更/ahead-behind），用户确认后再执行。

### 4.6 窗口管理模块

- 自定义标题栏（Tauri `decorations: false` + 自绘）
- 多窗口：diff 详情、批量进度、设置面板可独立窗口
- 记忆窗口尺寸/分栏比例

### 4.7 配置与设置模块

- 用户偏好（主题、分栏比例、扫描深度、**批量并发度**、**批量默认操作**、**Git 仓库颜色**）
- 最近打开的根目录列表
- 凭证管理（keychain 增删查）
- Git 全局配置读写

---

## 5. 数据流

### 5.1 打开根目录 → 自动识别（关键流程）

```
用户点"打开文件夹" → 选择 D:\Projects
  └─ invoke('workspace_open', { rootPath })
       └─ WorkspaceManager::open(rootPath)
            ├─ 读取根目录顶层条目 → 返回文件树首层
            └─ 文件树展示首层条目（不自动扫描）

用户点"扫描Git"按钮
  └─ invoke('scan_git_repos', { rootPath, depth? })
       └─ 后台异步: GitDetector::scan_with_cancel(root, depth, cancel_flag)
            ├─ walkdir 遍历，检测 .git 目录（跳过 node_modules/target/.git 等）
            ├─ 对每个 git 仓库: git2 读取 分支/ahead-behind/状态
            └─ app.emit('git:repos-detected', [{path, branch, ahead, behind, dirty}...])
  └─ 前端收到 repos-detected 事件
       └─ 树节点按 path 匹配，渲染 git 仓库标记 + 批量复选框就绪

用户点"停止扫描"按钮
  └─ invoke('scan_cancel')
       └─ scan_cancel.store(true) → 后台遍历循环检测到取消标志后 break
       └─ app.emit('git:scan-cancelled', { rootPath, found })
```

### 5.1.1 子目录增量扫描流程

```
用户单击左侧树中的目录节点
  └─ navigateTo(entry.path)  // 右侧同步内容
  └─ scanGitRepos(entry.path)  // 增量扫描该目录
       └─ 后台异步: GitDetector::scan_with_cancel(entry.path, depth, cancel_flag)
            └─ 遍历该目录及子目录，检测 .git
            └─ app.emit('git:repos-detected', { repos })
  └─ 前端收到 repos-detected 事件
       └─ mergeRepos(payload.repos)  // 合并到已有仓库列表（按 path 去重覆盖，不清空已有结果）
       └─ 树节点和列表按 path 匹配，更新图标颜色和仓库标记
```

> **全量扫描 vs 增量扫描**：工具栏"扫描Git"按钮 = 先 `setRepos([])` 清空再扫描（全量替换）；单击目录节点 = 直接扫描，结果合并（增量）。

### 5.2 命令式（前端 → 后端）

```
用户点选树节点 src/components
  └─ invoke('workspace_list', { dirPath })
       └─ WorkspaceManager::list(dirPath)
            └─ GitDetector::contextOf(dirPath)  // 推导所属 git 仓库
            └─ 若在 git 仓库内: GitService::status(repoPath) + 按目录聚合
       └─ 返回 { entries, gitContext: {repoPath, branch, fileStatuses} }
  └─ Zustand store 更新 → 右侧列表渲染（带状态标记）
  └─ 导航历史栈压入新路径，工具栏"后退"按钮激活
```

### 5.2.1 后退导航流程

```
用户点工具栏"后退"按钮
  └─ WorkspaceStore.goBack()
       └─ 从 historyStack 取 historyIndex-1 位置的路径
       └─ invoke('workspace_list', { dirPath: targetDir })
       └─ 更新 currentDir / entries / historyIndex
       └─ canGoBack = (historyIndex > 0)，canGoUp = (currentDir !== rootPath)
  └─ 前端列表与面包屑同步刷新
```

### 5.2.2 返回上级目录流程

```
用户点工具栏"向上"按钮
  └─ WorkspaceStore.goUp()
       └─ 从 currentDir 计算父目录路径（处理 Windows 盘符 / UNC 路径）
       └─ 调用 navigateTo(parentPath) — 走正常导航流程（压入历史栈）
       └─ 若 currentDir === rootPath，按钮禁用
  └─ 前端列表与面包屑同步刷新
```

### 5.3 批量操作流程（关键流程） ⭐

```
用户在文件树勾选 3 个 git 仓库 → 点"批量拉取"
  └─ invoke('batch_run', { op: 'pull', repoPaths: [...] })
       └─ BatchOpsManager::run(op, repoPaths)
            ├─ 预检: 对每个仓库检查 远端/当前状态，生成任务清单
            ├─ app.emit('batch:started', { batchId, tasks: [...] })
            ├─ tokio 有界并发 (4) 逐仓执行 GitService::pull(repoPath)
            │    └─ 每仓: emit('batch:repo-progress', { batchId, repoPath, stage, percent })
            │    └─ 完成: emit('batch:repo-done', { batchId, repoPath, ok, message })
            └─ 全部完成: emit('batch:completed', { batchId, summary: {ok, failed, skipped} })
  └─ 前端批量进度面板实时更新逐仓状态
       └─ 失败/冲突项可单独重试 (invoke('batch_retry', {batchId, repoPath}))
```

### 5.4 事件式（后端 → 前端）

| 事件 | 触发 | 前端响应 |
| --- | --- | --- |
| `git:repos-detected` | 扫描发现 git 仓库 | 树节点渲染仓库标记、复选框就绪 |
| `git:scan-started` | 用户触发扫描 | 工具栏扫描按钮变为"停止扫描"状态 |
| `git:scan-cancelled` | 扫描被用户取消或出错 | 工具栏恢复"扫描Git"状态，显示已找到数量 |
| `fs:changed` | notify 监听到文件增删改 | 增量刷新对应树/列表节点 |
| `git:status-changed` | git 操作或外部变更 | 刷新状态标记 |
| `git:progress` | 单库 fetch/pull/push 进行中 | 状态栏进度条 |
| `git:conflict` | merge/rebase 冲突 | 弹出冲突解决面板 |
| `git:repo-added` | 检测到新 `git init`/`clone` | 树上新节点出现仓库标记 |
| `git:repo-removed` | `.git` 被删除 | 移除仓库标记 |
| `batch:started` | 批量操作开始 | 弹出批量进度面板，初始化任务行 |
| `batch:repo-progress` | 单仓执行中 | 更新对应任务行进度/阶段 |
| `batch:repo-done` | 单仓完成 | 任务行标记成功/失败/跳过 |
| `batch:completed` | 批次全部结束 | 面板汇总结果，提供重试入口 |

---

## 6. 目录结构

```
git-explore/
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── main.rs             # 入口，Tauri 构建
│   │   ├── commands/           # #[tauri::command] 定义
│   │   │   ├── workspace.rs    # 打开根目录/列表/最近记录
│   │   │   ├── git.rs          # 单库 git 操作命令
│   │   │   ├── batch.rs        # ⭐ 批量操作命令
│   │   │   └── fs.rs           # 文件浏览命令
│   │   ├── domain/             # 领域层（无 Tauri 依赖）
│   │   │   ├── workspace_manager.rs
│   │   │   ├── git_detector.rs     # ⭐ 自动识别 .git
│   │   │   ├── git_service.rs
│   │   │   ├── status_aggregator.rs
│   │   │   └── batch_ops_manager.rs  # ⭐ 批量编排
│   │   ├── infra/              # 基础设施
│   │   │   ├── git2_adapter.rs
│   │   │   ├── fs_watcher.rs   # notify 封装
│   │   │   ├── config.rs       # JSON 配置
│   │   │   └── credential.rs   # keyring
│   │   └── events.rs           # 事件定义
│   ├── Cargo.toml
│   └── tauri.conf.json         # 窗口/权限/打包配置
├── src/                        # React 前端
│   ├── main.tsx
│   ├── App.tsx                 # 顶层布局
│   ├── components/
│   │   ├── TitleBar/           # 自定义标题栏
│   │   ├── MenuBar/            # 顶部菜单
│   │   ├── ToolBar/            # 工具栏（打开文件夹 / **后退** / **向上** / **扫描Git** / 拉取/提交/推送…）
│   │   ├── BatchActionBar/     # ⭐ 批量操作栏（多选仓库时浮现）
│   │   ├── BatchProgressPanel/ # ⭐ 批量进度面板（逐仓状态）
│   │   ├── AddressBar/         # 地址/面包屑导航 + 最近根目录
│   │   ├── FileTree/           # 左侧文件树（**树形展开/折叠** + 仓库节点含批量复选框）
│   │   ├── FileList/           # 右侧文件列表
│   │   ├── StatusBar/          # 底部状态栏
│   │   └── dialogs/            # 提交/diff/批量确认/设置弹窗
│   ├── stores/                 # Zustand stores（含 batchSelectionStore + 导航历史栈 + 磁盘列表）
│   ├── ipc/                    # invoke 封装与类型
│   ├── styles/                 # CSS variables / 主题
│   └── types/                  # 共享 TS 类型
├── docs/
│   └── architecture.md         # 本文档
├── mockup/
│   └── git-explore-ui.html     # 静态展示图
└── package.json
```

> **导航历史栈设计**：WorkspaceStore 维护 `historyStack: string[]` + `historyIndex: number`，`navigateTo` 时压栈并截断后续历史，`goBack` 时仅移动 index 不截断（保留前进可能性），`goUp` 走 `navigateTo` 流程。`canGoBack` 和 `canGoUp` 作为派生状态驱动按钮 disabled。

---

## 7. 交互设计要点

### 7.1 鼠标交互（核心要求）

| 操作 | 行为 |
| --- | --- |
| 点"打开文件夹" | 选择根目录，加载文件树 |
| **点磁盘节点（空状态）** | 以该磁盘为工作区打开，加载根目录文件树 |
| **点"最近打开"项（空状态）** | 直接打开该路径为工作区 |
| **工具栏"扫描Git"按钮** | 扫描当前目录及子目录中的 Git 仓库，扫描中可点"停止"取消 |
| **工具栏"后退"按钮** | 后退到上一个浏览过的目录路径（导航历史） |
| **工具栏"向上"按钮** | 返回当前目录的上一级目录（至根目录为止） |
| 左键单击目录（左侧树） | 展开/折叠子目录（懒加载），右侧定位到该目录，**自动扫描该目录及子目录的 Git 仓库**（增量合并） |
| 左键双击目录（左侧树） | 导航进入该目录（设为 currentDir） |
| 左键单击目录（右侧列表） | 仅选中该行（高亮），不导航 |
| 左键双击目录（右侧列表） | 导航进入该目录（设为 currentDir，更新 entries） |
| 左键单击文件（右侧列表） | 仅选中该行（高亮） |
| 左键单击 git 仓库节点 | 展开并激活该仓库 git 上下文（状态栏更新分支） |
| **工具栏"分支"按钮** | 打开分支切换弹窗，列出当前选中 Git 仓库的所有分支（本地+远端），支持搜索过滤，点击切换分支 |
| **勾选 git 仓库节点复选框** | 加入批量选择集，底部显示全选/清除快捷操作 |
| 双击文件 | 打开 diff 或系统默认程序 |
| 右键条目 | 上下文菜单（提交/还原/忽略/在外部打开） |
| 右键 git 仓库节点 | 仓库级菜单（拉取/推送/分支/历史） |
| 右键空白 | 刷新/新建/粘贴 |
| 拖拽分栏 | 调整左右栏比例 |
| 列头点击 | 排序 |

### 7.2 自动识别与多仓库浏览

- **零注册**：用户从不"添加仓库"，只"打开文件夹"。
- 打开 `D:\Projects` 后，树中 `frontend-app`、`backend-api`、`docs-site` 等含 `.git` 的目录自动显示分支与同步角标。
- **目录图标颜色**：Git 仓库且无未提交变更 → 绿色；Git 仓库且有未提交变更 → 红色；普通目录 → 黄色。左右窗口统一规则。
- 浏览到 git 仓库**内部**任意路径时，文件自动带上 git 状态；浏览到**非 git** 目录（如 `D:\Projects\notes`）时，无 git 状态列。
- 仓库上下文随当前路径自动切换，状态栏始终显示"当前所在 git 仓库 + 分支"。

### 7.3 多 Git 库批量操作  ⭐

- **选择方式**：
  - 文件树中 git 仓库节点悬停显示复选框，或开启"批量模式"后常驻复选框。
  - 支持"全选仓库 / 反选 / 清除选择"快捷操作。
  - 仅 git 仓库节点可被选入批量集（普通目录/文件不可选）。
- **批量操作栏**：勾选 ≥1 个仓库后，工具栏下方浮现**批量操作栏**，显示"已选 N 个仓库"及按钮：批量拉取 / 推送 / 获取 / 同步 / 提交 / 切换分支 / 清除。
- **执行前预检**：点操作后弹出确认面板，列出待操作仓库及各自状态（有无变更、ahead/behind），确认后执行。
- **进度面板**：执行时底部弹出**批量进度面板**，逐仓一行显示 `仓库名 · 分支 · 阶段 · 状态(✓/✗/⏳/⊘)`，实时更新。
- **失败处理**：失败/冲突仓库标红，可单独重试或跳过；冲突仓库引导进入单独处理流程。
- **状态栏联动**：批量进行中，状态栏显示"批量拉取中 2/3"等汇总进度。
- **完成后**：进度面板保留结果摘要（成功 X / 失败 Y / 跳过 Z），可一键刷新各仓库状态。

---

## 8. 安全与权限

- **凭证**：远端账号/token 经 keychain 存储，内存中用完即清，不落明文配置。
- **路径访问**：仅允许访问当前打开根目录及其子路径，防止越权读取。
- **命令执行**：命令行 git 调用做参数白名单过滤，防注入。
- **批量并发限制**：有界并发避免资源耗尽；批量推送等危险操作需二次确认。
- **自动更新**：Tauri updater 签名校验。

---

## 9. 性能策略

- **分层懒扫描**：打开根目录只快速扫描有限深度（默认 3 层）找 git 仓库，更深目录按需扫描，避免遍历超大目录树阻塞。
- **虚拟滚动 + 懒加载**：右侧列表虚拟滚动，左侧树按需展开。
- **增量状态缓存**：git status 结果缓存，`notify` 监听触发局部刷新而非全量重算。
- **后台异步扫描**：GitDetector 扫描在 tokio 后台任务执行，UI 立即响应，识别结果通过事件渐进式送达。
- **批量有界并发**：BatchOpsManager 用 tokio Semaphore 控制并发度（默认 4），兼顾速度与系统负载。
- **log 分页**：避免一次性读取上万条提交。

---

## 10. 开发路线

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 架构设计 + 静态展示图 | ✅ 已完成 |
| P1 | Tauri 骨架 + 自定义标题栏 + 布局组件 | ✅ 已完成 |
| P2 | 打开根目录 + 文件树浏览（只读） | ✅ 已完成 |
| P3 | **GitDetector 自动识别 .git** + 仓库标记 | ✅ 已完成 |
| P4 | git status/log/branch + 状态标记 | ✅ 已完成 |
| P5 | commit/fetch/pull/push + 凭证 | 待开始 |
| P6 | **BatchOpsManager 多仓库批量操作** + 进度面板 | ✅ 已完成 |
| P7 | diff 视图 + 冲突解决 + 设置面板 | 待开始 |
| P8 | 打包发布 + 自动更新 | 待开始 |
| P9 | **文件树树形展开 + 多选 + 扫描Git按钮** | ✅ 已完成 |

---

## 11. 静态展示图说明

`mockup/git-explore-ui.html` 为 Windows 11 Explorer 风格的静态 UI 展示，体现"打开根目录自动识别 git 仓库 + 多仓库批量操作"理念：

- 自定义标题栏（Tauri 无边框窗口风格 + 窗口控制按钮）
- 菜单栏（文件 / 编辑 / 查看 / 仓库 / 分支 / 帮助）
- 工具栏（打开文件夹 / **扫描Git** / 后退 / 向上 / 批量模式开关 / 拉取 / 提交 / 推送 / **分支（弹窗切换）** / 历史 / 刷新 / 搜索）
- **批量操作栏**（勾选仓库后浮现：已选 N 个仓库 + 批量拉取/推送/获取/同步/提交/清除）
- 地址栏（单一路径输入框，显示当前路径，支持手动输入路径回车导航）
- 左侧单一文件树（空状态展示本机磁盘列表 + 最近打开；打开目录后，git 仓库节点自动显示 Git 橙图标 + 分支 + ahead/behind 角标 + **批量复选框**；普通目录无标记）
- 右侧列表（文件/目录 + Git 状态标记 + 分支 + 提交人 + 提交时间 + 修改时间 + 大小 + 最后提交；非 git 区域无状态列）
- **批量进度面板**（执行批量拉取时浮现：逐仓一行显示 仓库名/分支/阶段/状态，含成功/失败/进行中/排队）
- 底部状态栏（当前 git 仓库上下文 / 分支 / 同步状态 / 变更统计 / **批量进度** / 选中项 / 路径 / Git 版本 / **语言切换器**）

打开方式：浏览器直接打开该 HTML 文件即可预览。

---

## 附录 A. 核心数据模型

前后端共享的类型契约（Rust 端 serde 序列化，TS 端对应 interface）。所有结构体在 `src-tauri/src/types.rs` 与 `src/types/` 双向维护，构建时校验一致。

### A.1 GitRepoInfo（仓库信息）

```rust
struct GitRepoInfo {
    path: String,          // 仓库根绝对路径
    name: String,          // 目录名，用于展示
    branch: String,        // 当前分支
    ahead: u32,            // 领先远端提交数
    behind: u32,           // 落后远端提交数
    dirty_count: u32,      // 工作区+暂存区变更文件数
    is_clean: bool,        // dirty_count==0 && ahead==0 && behind==0
    remote_url: Option<String>,   // origin URL，无远端则 None
    has_upstream: bool,    // 当前分支是否跟踪远端
    head_short: String,    // HEAD 短哈希
    is_submodule: bool,    // 是否为 submodule
    last_commit_msg: String, // 最近一次提交信息摘要
    last_commit_author: String, // 最近一次提交者
    last_commit_time: i64, // 最近一次提交时间（Unix 时间戳）
}
```

### A.2 FileEntry（文件/目录条目）

```rust
struct FileEntry {
    name: String,
    path: String,          // 相对根目录路径
    is_dir: bool,
    size: u64,             // 文件字节数，目录为 0
    modified: i64,         // Unix 时间戳
    git_status: Option<FileStatus>, // 非 git 区域为 None
    last_commit: Option<CommitRef>, // 所属 git 仓库才有
}

struct CommitRef {
    hash: String,          // 短哈希
    message: String,       // 提交信息首行
    author: String,
    time: i64,
}
```

### A.3 FileStatus（Git 状态标记）

```rust
struct FileStatus {
    code: StatusCode,      // 见枚举
    staged: bool,          // 是否已暂存
}
enum StatusCode {
    Modified,   // M
    Added,      // A（已暂存新增）
    Deleted,    // D
    Untracked,  // ?
    Conflict,   // U
    Renamed,    // R
}
```

### A.4 BatchTask（批量任务）

```rust
struct BatchTask {
    id: String,            // 任务ID = repoPath
    repo_path: String,
    repo_name: String,
    branch: String,
    state: BatchState,
    stage: String,         // 人类可读阶段，如 "接收对象中"
    percent: u8,           // 0-100
    message: String,       // 完成时的结果/错误信息
    started_at: Option<i64>,
    finished_at: Option<i64>,
}
enum BatchState { Queued, Running, Success, Failed, Skipped, Conflict, Cancelled }
```

### A.5 BatchResult（批次结果）

```rust
struct BatchResult {
    batch_id: String,
    op: BatchOp,           // Pull/Push/Fetch/Sync/Commit/SwitchBranch
    total: u32,
    success: u32,
    failed: u32,
    skipped: u32,
    conflict: u32,
    tasks: Vec<BatchTask>,
}
```

### A.6 DriveInfo（磁盘信息）

```rust
struct DriveInfo {
    path: String,          // 盘符根路径，如 `C:\`
    name: String,          // 显示名称，如 `本地磁盘 (C:)`
}
```

---

## 附录 B. IPC 命令契约

所有命令经 `#[tauri::command]` 暴露，返回 `Result<T, AppError>`。前端 `src/ipc/` 封装同名函数。

### B.1 工作区命令

| 命令 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `list_drives` | — | `DriveInfo[]` | 列出本机所有磁盘（路径+显示名），用于文件树根级展示 |
| `workspace_open` | `{ rootPath: String }` | `TreeFirstLayer` | 打开根目录，返回首层条目，后台异步触发扫描 |
| `workspace_list` | `{ dirPath: String }` | `{ entries: FileEntry[], gitContext: Option<GitContext> }` | 列目录，自动推导 git 上下文 |
| `workspace_recent` | — | `String[]` | 最近打开的根目录列表 |
| `workspace_tree_expand` | `{ dirPath: String }` | `FileEntry[]` | 懒加载子目录（树展开） |
| `scan_git_repos` | `{ rootPath: String, depth?: usize }` | `void` | 异步扫描 Git 仓库，结果通过 `git:repos-detected` 事件回传 |
| `scan_cancel` | — | `void` | 取消正在进行的 Git 扫描 |

### B.2 Git 单库命令

| 命令 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `git_status` | `{ repoPath: String }` | `FileStatus[]` | 全仓库状态 |
| `git_log` | `{ repoPath, branch?, page, pageSize }` | `CommitRef[]` | 分页历史 |
| `git_branches` | `{ repoPath }` | `Branch[]` | 本地+远端分支 |
| `git_commit` | `{ repoPath, message, filePaths }` | `CommitRef` | 暂存指定文件并提交 |
| `git_pull` | `{ repoPath }` | `PullResult` | 进度走事件 |
| `git_push` | `{ repoPath, force? }` | `PushResult` | 进度走事件 |
| `git_fetch` | `{ repoPath }` | `FetchResult` | 仅获取 |
| `git_diff` | `{ repoPath, filePath, staged? }` | `DiffHunk[]` | 行级 diff |
| `git_checkout` | `{ repoPath, branch }` | `()` | 切换分支 |

### B.3 批量命令

| 命令 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `batch_run` | `{ op: BatchOp, repoPaths: String[] }` | `batchId: String` | 启动批次，立即返回 ID，进度走事件 |
| `batch_cancel` | `{ batchId }` | `()` | 取消整个批次（进行中的尽量中止，排队的取消） |
| `batch_retry` | `{ batchId, repoPath }` | `()` | 重试单个失败仓库 |
| `batch_status` | `{ batchId }` | `BatchResult` | 查询批次当前状态 |

### B.4 文件/系统命令

| 命令 | 入参 | 出参 | 说明 |
| --- | --- | --- | --- |
| `fs_open_external` | `{ path }` | `()` | 系统默认程序打开 |
| `fs_open_terminal` | `{ path }` | `()` | 在此路径打开终端 |
| `fs_ignore` | `{ repoPath, pattern }` | `()` | 追加到 .gitignore |
| `credential_set` | `{ host, username, token }` | `()` | 存入 keychain |
| `credential_get` | `{ host }` | `Option<Credential>` | 取凭证 |

### B.5 错误码 (AppError)

```rust
struct AppError {
    code: ErrorCode,
    message: String,       // 面向用户的中文案
    detail: Option<String>,// 调试细节
}
enum ErrorCode {
    NotFound,          // 路径/仓库/分支不存在
    NotAGitRepo,       // 非 git 目录
    AuthFailed,        // 认证失败
    NetworkError,      // 网络中断/超时
    Conflict,          // 合并冲突
    InvalidPath,       // 路径越界/非法
    GitError,          // git2/命令行 git 原始错误
    Cancelled,         // 操作被取消
    Internal,          // 其他内部错误
}
```

---

## 附录 C. 错误处理与日志

### C.1 错误传递链

```
git2 / 命令行 git  →  领域层转译为 AppError(ErrorCode)  →  命令层返回 Err(AppError)
                                                       →  前端 invoke catch → Toast/对话框/进度面板标红
```

- 领域层**不**返回原始 git2 错误，统一映射到 `ErrorCode`，附带用户可读信息。
- 网络类操作（fetch/pull/push）超时默认 60s，超时映射 `NetworkError`。
- 认证失败重试上限 3 次，超过则 `AuthFailed` 并提示去设置配置凭证。

### C.2 批量操作错误隔离

- 单仓失败只影响自身任务行，不中断批次；`BatchOpsManager` 捕获每个仓库的 `Result`。
- 冲突仓库标记 `Conflict` 状态，不自动解决，进度面板提供"去处理"入口。
- 批次结束汇总 `BatchResult`，失败项可单独 `batch_retry`。

### C.3 日志系统

| 维度 | 方案 |
| --- | --- |
| 日志库 | `tracing` + `tracing-subscriber`（Rust），前端 `console` + 上报到后端 |
| 分级 | TRACE/DEBUG/INFO/WARN/ERROR，默认 INFO，设置面板可调 |
| 落盘 | 滚动文件，存于 Tauri `app_log_dir`（如 `%APPDATA%\GitExplore\logs`），保留最近 7 天 |
| 内容 | 命令调用、git 操作阶段、错误（含 ErrorCode+detail）、批量任务生命周期 |
| 敏感信息 | 凭证/token **绝不**入日志，URL 中的密码脱敏 |
| 用户导出 | 设置面板"导出诊断日志"按钮，打包最近日志便于反馈问题 |

---

## 附录 D. 认证流程

### D.1 远端类型识别

打开仓库时由 `GitDetector` 读取 `remote.origin.url`，判断：
- `https://...` → HTTPS 凭证流
- `git@...` → SSH key 流（不做密码管理，依赖系统 ssh-agent）
- 无远端 → 跳过认证相关 UI

### D.2 HTTPS 凭证流（首次）

```
git pull 触发 → git credential helper 回调
  └─ 后端查 keyring(host) → 命中: 注入 → 继续
  └─ 未命中: emit('auth:required', {host, repoPath})
       └─ 前端弹认证对话框（用户名 + Token/密码）
            └─ invoke('credential_set', {host, username, token})
            └─ keyring 存储 → 重试 git pull
```

- 优先用 **Personal Access Token**（GitHub/GitLab 已不支持密码）。
- 凭证按 `host` 维度存储，同 host 多仓库共享，避免重复输入。
- 用户可在设置面板管理已存凭证（查看 host/用户名，token 脱敏显示，可删除）。

### D.3 多账号场景

- 同一 host 不同账号：凭证对话框支持"为此仓库单独配置"，存为 `repoPath → Credential` 覆盖 host 级默认。
- 批量操作时，每个仓库独立走各自凭证解析，互不干扰。

### D.4 SSH

- 不内置 SSH 客户端，复用系统 `ssh-agent` 与 `~/.ssh/`。
- 若 SSH key 有密码短语，首次由系统 keychain 解锁（macOS）/ 用户手动输入（Windows）。
- 设置面板可指定自定义 SSH key 路径，写入 git `core.sshCommand`。

---

## 附录 E. 应用生命周期与空状态

### E.1 启动流程

```
应用启动
  ├─ 读取 JSON 配置（窗口尺寸/分栏/最近根目录/偏好）
  ├─ 恢复窗口尺寸与分栏比例
  ├─ 调用 list_drives 获取本机磁盘列表 → 文件树展示磁盘节点
  ├─ 加载最近打开的根目录列表 → 文件树展示"最近打开"节点
  ├─ 若配置中有"启动时恢复上次根目录"且上次非空:
  │    └─ 自动 workspace_open(lastRoot) → 建树 → 后台扫描
  └─ 否则: 文件树展示磁盘列表 + 最近打开，等待用户点击进入
```

### E.2 空状态（未打开任何文件夹）

首次启动或关闭工作区时，文件树展示本机磁盘列表作为根级入口：
- 文件树顶部列出所有磁盘（Windows: 盘符列表如 `C:\`、`D:\`，含卷标名；macOS: `/` 和 `/Volumes/*`；Linux: `/`、`/media/*`、`/mnt/*`）
- 每个磁盘节点显示磁盘图标 + 名称，点击即以该盘为工作区打开
- 磁盘列表下方展示"最近打开"目录列表，点击直接打开
- 工具栏"打开文件夹"按钮仍可手动选择任意目录

> 此状态在静态展示图中尚未体现，列入展示图待补状态（见第 12 章）。

### E.3 退出持久化

关闭窗口时写入配置：
- 窗口位置/尺寸、左右分栏比例、侧栏宽度
- 当前根目录路径、展开的树节点、选中路径
- 批量进行中的批次**不**恢复（避免重启后误执行），仅记录未完成提示

### E.4 配置文件

| 项 | 值 |
| --- | --- |
| 位置 | Tauri `app_config_dir`：`%APPDATA%\GitExplore\config.json` |
| 结构 | `{ window, layout, recent_roots, last_root, preferences }` |
| 版本迁移 | 顶层 `schema_version` 字段，升级时按版本号迁移 |

---

## 附录 F. 键盘快捷键

虽然产品以鼠标控制为主，但提供基础键盘可达性（符合 Explorer 习惯）：

| 快捷键 | 行为 |
| --- | --- |
| `Ctrl+O` | 打开文件夹 |
| `Ctrl+G` | 扫描 Git 仓库 |
| `Ctrl+.` | 打开设置 |
| `F5` | 刷新（重新扫描当前目录） |
| `F2` | 重命名选中项 |
| `Delete` | 删除（移入回收站，git 跟踪文件标记删除） |
| `Ctrl+A` | 全选当前列表项 / 批量模式下全选仓库 |
| `Ctrl+C / V` | 复制/粘贴文件路径 |
| `Enter` | 打开文件 / 进入目录 |
| `Backspace` | 返回上级目录 |
| `Alt+←` | 后退到上一个浏览路径 |
| `Alt+↑` | 返回上级目录 |
| `Ctrl+Shift+P` | 拉取当前仓库 |
| `Ctrl+Shift+S` | 推送当前仓库 |
| `Ctrl+Shift+C` | 提交当前仓库 |
| `Ctrl+B` | 切换批量模式 |
| `Esc` | 取消选择 / 取消批量操作 / 关闭弹窗 |
| `Ctrl+.` | 打开设置 |

---

## 附录 G. 批量操作取消与控制

### G.1 取消层级

- **批次级取消**：`batch_cancel(batchId)` — 排队任务直接置 `Cancelled`，进行中任务尝试中止（kill git 子进程），已完成的保留结果。
- **单仓取消**：进度面板每行可选"取消"（仅对 `Queued`/`Running` 生效）。

### G.2 中止语义

- pull/push 中止不回滚已完成的网络传输，但保证工作区不被半成品污染（git 本身的原子性）。
- 取消后状态栏更新为"批量已取消 X/Y 完成"。

### G.3 暂停（可选，P6+）

- 批量进度面板提供"暂停/继续"：暂停后不再从队列取新任务，进行中的完成后再停。

---

## 附录 H. 多语言与国际化（i18n）

支持界面语言切换，默认跟随系统语言，可手动覆盖并持久化。**实时切换无需重启应用**。

### H.1 技术方案

| 层 | 方案 | 说明 |
| --- | --- | --- |
| 前端 | **i18next + react-i18next** | React 生态成熟方案，支持命名空间、插值、复数、懒加载 |
| 后端 | **rust-i18n** crate | 编译期嵌入翻译，命令/事件返回的文案本地化 |
| 资源格式 | **JSON**（每语言一个文件，按命名空间拆分） | 前后端共享同一份 key 体系，避免不一致 |
| 语言检测 | 系统语言优先 → 用户覆盖 | 启动时读系统 locale，配置中 `language` 字段覆盖 |

> 选 i18next 而非 react-intl：i18next 的 JSON key + 命名空间模型更贴合本项目的模块划分（菜单/工具栏/状态/git 状态/批量/错误），且后端 rust-i18n 的 YAML/JSON key 风格一致，便于双向对齐。

### H.2 支持语言

| 语言 | 代码 | 状态 |
| --- | --- | --- |
| 简体中文 | `zh-CN` | 默认，完整覆盖 |
| English | `en` | 完整覆盖 |
| 繁体中文 | `zh-TW` | 预留（P8+） |
| 其他 | — | 结构可扩展，新增语言只需加资源文件 |

首期交付 `zh-CN` + `en` 双语，资源文件结构预留扩展位。

### H.3 资源文件组织

```
src/locales/
├── zh-CN/
│   ├── common.json       # 通用：确定/取消/关闭/是/否…
│   ├── menu.json         # 菜单栏
│   ├── toolbar.json      # 工具栏
│   ├── addressbar.json   # 地址栏
│   ├── filetree.json     # 文件树
│   ├── filelist.json     # 文件列表（列头）
│   ├── git.json          # git 状态描述、操作动词
│   ├── batch.json        # 批量操作栏、进度面板、阶段文案
│   ├── statusbar.json    # 状态栏
│   ├── dialog.json       # 提交/diff/设置/认证弹窗
│   └── errors.json       # 错误信息（与后端 ErrorCode 对应）
└── en/
    └── (同结构)
```

命名空间按 UI 模块拆分，懒加载——切换或进入某视图时才加载对应命名空间，减少首屏体积。

### H.4 Key 命名规范

```jsonc
// src/locales/zh-CN/git.json
{
  "status": {
    "modified": "已修改",
    "added": "已暂存",
    "deleted": "已删除",
    "untracked": "未跟踪",
    "conflict": "冲突"
  },
  "badge": {
    "ahead": "领先 {{count}}",
    "behind": "落后 {{count}}"
  }
}
```

- 三级结构：`命名空间.模块.key`，避免平铺冲突。
- 插值用 `{{var}}`，复数用 i18next `_one/_other` 后缀。
- **不本地化**的内容：git 分支名、提交信息、文件名、路径、git 哈希、仓库名（用户数据，原样展示）。

### H.5 前后端文案协同

后端返回的 `AppError`、批量阶段 `stage` 等需本地化的字段，采用 **key 回传**策略，前端查表渲染：

```
后端: AppError { code: AuthFailed, message_key: "errors.auth_failed", params: {host} }
前端: i18next.t(err.message_key, err.params) → "github.com 认证失败"
```

- 后端不直接返回中文/英文字符串，返回 `message_key` + 插值参数。
- 前端按当前语言查 `errors.json` 渲染，切换语言时已有错误提示自动重渲染。
- 批量阶段 `stage` 同理：后端回传 `"batch.stage.receiving"`，前端渲染"正在接收对象…" / "Receiving objects…"。

### H.6 语言切换交互

- **切换入口**：状态栏右侧语言切换器（下拉菜单，显示当前语言 + 图标）；设置面板"语言"项同步。
- **实时切换**：i18next `changeLanguage` 触发全应用重渲染，无需重启；进行中的批量进度面板文案同步切换。
- **持久化**：切换后写入 `config.json` 的 `preferences.language`，下次启动直接使用。
- **跟随系统**：切换器首项为"跟随系统（当前：简体中文）"，取消覆盖即恢复系统语言检测。

### H.7 实现优先级

| 优先级 | 内容 | 阶段 |
| --- | --- | --- |
| P0 | i18n 框架接入、key 体系设计、双语资源骨架 | 与 P1 并行 |
| P1–P6 | 各模块开发时同步产出 `zh-CN` + `en` 双语资源 | 滚动补充 |
| P8 | 完整校对、繁体预留、可扩展性验证 | 发布前 |

> i18n 框架在 P1 骨架阶段即接入（而非 P8 才做），避免后期大规模重构已有硬编码文案。

---

## 12. 待补充清单（后续阶段完善）

本次架构设计已覆盖核心骨架与架构级关键缺失。以下内容留待相应开发阶段补充，不阻塞 P0 立项：

### 12.1 交互与功能（对应 P5–P7）
- diff 视图布局（行级 diff 渲染、并排/内联切换、二进制文件提示）
- 历史视图（提交列表 + 图形化分支拓扑）
- 右键上下文菜单完整项清单（文件级/目录级/仓库级/空白级）
- 冲突解决 UI（三路合并视图、选 ours/theirs、手动编辑）
- 拖放外部文件夹到窗口打开、"在终端/编辑器打开"集成
- submodule 初始化/更新/批量操作
- 大仓库/符号链接/二进制 diff 边界处理

### 12.2 工程化（对应 P8）
- 测试策略（领域层单元测试 + 临时 git 仓库夹具 + 前端组件测试 + Tauri E2E）
- 无障碍（高对比度、屏幕阅读器）
- 打包分发（目标平台优先 Windows，MSI/NSIS 安装包、代码签名、自动更新渠道）
- 崩溃上报

> 注：国际化(i18n)已正式纳入设计，见附录 H，P1 骨架阶段即接入。

### 12.3 静态展示图待补状态
当前展示图仅展示"正常浏览 + 批量进行中"一个状态，以下状态待补 mockup：
- 空状态（磁盘列表 + 最近打开引导页）
- 扫描中状态（识别进度）
- 单库 diff 视图
- 历史视图
- 提交对话框
- 设置面板
- 右键菜单展开态
- 冲突解决面板
