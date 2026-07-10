# GitExplore

> 基于 Tauri 2 的多 Git 仓库桌面管理工具，界面遵循 Windows Explorer 风格。
>
> **核心理念**：无需"添加仓库"，打开任意根目录后自动识别其中的 `.git` 目录，按文件树浏览并管理；支持文件树多选 Git 仓库进行**批量操作**。

---

## ✨ 功能特性

### 🔍 零注册自动识别

- 打开任意文件夹，自动扫描并识别其中的 Git 仓库
- 无需手动"添加仓库"，浏览到 Git 目录即自动激活仓库上下文
- 支持 `git init` / `git clone` 后的实时检测（基于 `notify` 文件监听）

### 🌳 Windows Explorer 风格浏览

- **左侧文件树**：树形展开/折叠，懒加载子目录，支持磁盘列表作为根级入口
- **右侧文件列表**：8 列布局（名称 / Git状态 / 分支 / 提交人 / 提交时间 / 修改时间 / 大小 / 最后提交）
- **目录图标颜色规则**：
  - 🟢 Git 仓库 + 无未提交变更 → 绿色
  - 🔴 Git 仓库 + 有未提交变更 → 红色
  - 🟡 普通目录 → 黄色
- **导航历史栈**：工具栏"后退"按钮逐步回退浏览路径
- **返回上级目录**：工具栏"向上"按钮，与"后退"独立运作
- **双击导航**：单击选中、双击进入目录（符合 Windows 资源管理器习惯）

### 🔧 Git 单库操作

- **状态查看**：工作区 + 暂存区差异聚合（M/A/D/?/U 状态标记）
- **提交历史**：分页加载，支持分支过滤
- **分支管理**：分支切换弹窗（搜索过滤、本地/远端分组、一键切换）
- **提交**：暂存指定文件并提交
- **拉取/推送**：进度走事件实时回传
- **Diff**：文件级与行级 diff

### ⚡ 多仓库批量操作

- 文件树多选 Git 仓库，一键批量操作：
  - 批量拉取 (Pull All)
  - 批量推送 (Push All)
  - 批量获取 (Fetch All)
  - 批量同步 (Sync All) — pull 后 push
  - 批量提交 (Commit All)
  - 批量切换分支
- **有界并发**：tokio 任务池控制并发度（默认 4 路），避免资源耗尽
- **逐仓进度**：每个仓库独立状态机（排队中 → 执行中 → 成功/失败/跳过），实时回传
- **失败隔离**：单仓失败不中断整体批次，失败项可单独重试
- **冲突处理**：标记冲突仓库，引导单独处理

### 🎨 其他特性

- **自定义标题栏**：Tauri 无边框窗口 + 自绘标题栏
- **中英文双语**：i18next 国际化，实时切换无需重启
- **Git 仓库颜色配置**：用户可自定义 Git 仓库节点颜色
- **磁盘列表**：启动时自动列出本机所有磁盘作为入口
- **最近打开**：记忆最近打开的根目录列表，支持快速切换

---

## 🏗️ 技术架构

### 技术栈

| 层 | 技术 | 说明 |
| --- | --- | --- |
| 外壳 | **Tauri 2.x** | Rust 后端 + 系统 WebView，体积小（~5MB）、内存低 |
| 前端 | **React 18 + TypeScript + Vite** | 组件化 UI，HMR 开发体验 |
| 状态管理 | **Zustand** | 轻量状态管理，多 Store 拆分 |
| 样式 | **原生 CSS + CSS Variables** | Fluent/Win11 视觉语言，无重型 UI 库 |
| Git 引擎 | **git2-rs (libgit2)** | 嵌入式 Git，避免反复 spawn 进程 |
| 并发 | **tokio** | 批量操作有界并发任务池 |
| 文件监听 | **notify** | 监听工作区变更，增量刷新 |
| 配置存储 | **JSON 文件** | 轻量持久化，无需数据库 |
| 凭证 | **keyring** | 系统密钥链安全存储 |
| 国际化 | **i18next + react-i18next** | 中英文双语，命名空间拆分 |

### 架构分层

```
┌─────────────────────────────────────────────────────┐
│  表现层 (Webview / React)                            │
│  菜单/工具栏 · 批量操作栏 · 树+列表双栏 · 状态栏      │
└───────────────────────┬─────────────────────────────┘
                        │  Tauri IPC (invoke / emit)
┌───────────────────────▼─────────────────────────────┐
│  应用层 (Rust)                                       │
│  命令调度 · 事件总线 · 权限/凭证网关                   │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│  领域层 (Rust)                                       │
│  工作区管理 · Git识别器 · Git操作服务 · 批量操作编排   │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│  基础设施层 (Rust)                                   │
│  git2-rs · notify · keyring · tokio · walkdir        │
└─────────────────────────────────────────────────────┘
```

### 核心模块

| 模块 | 职责 |
| --- | --- |
| **WorkspaceManager** | 管理当前打开的根目录、文件树懒加载、导航历史栈 |
| **GitDetector** | 递归扫描 `.git` 目录，维护"路径→GitRepoInfo"仓库地图，增量合并 |
| **GitService** | 封装 status/log/branch/commit/fetch/pull/push/checkout |
| **BatchOpsManager** | 多仓库批量操作编排，tokio 有界并发，逐仓进度回传 |
| **StatusAggregator** | 合并工作区/暂存区/远端差异 |

### 数据流

```
用户打开文件夹 → WorkspaceManager 加载文件树
用户点"扫描Git" → GitDetector 异步扫描 → emit 事件 → 前端渲染仓库标记
用户单击目录 → 右侧同步内容 + 增量扫描该目录 Git 仓库（合并到已有列表）
用户勾选仓库 → 点批量操作 → BatchOpsManager 并发执行 → 逐仓进度回传
```

### 前端 Store 架构

| Store | 职责 |
| --- | --- |
| `WorkspaceStore` | rootPath、currentDir、entries、treeEntries、导航历史栈、selectedEntry、磁盘列表 |
| `GitReposStore` | 已识别 Git 仓库列表与 reposMap |
| `BatchSelectionStore` | 批量勾选的仓库路径集合 |
| `BatchProgressStore` | 批量操作进度状态 |
| `ScanStore` | 扫描状态（scanning 标志） |

---

## 📁 项目结构

```
git-explore/
├── src-tauri/                  # Rust 后端
│   ├── src/
│   │   ├── main.rs             # 入口
│   │   ├── lib.rs              # 库入口 + 命令注册
│   │   ├── commands/           # Tauri 命令
│   │   │   ├── workspace.rs    # 工作区/扫描
│   │   │   ├── git.rs          # Git 单库操作
│   │   │   ├── batch.rs        # 批量操作
│   │   │   └── config.rs       # 配置
│   │   ├── domain/             # 领域层（无 Tauri 依赖）
│   │   │   ├── workspace_manager.rs
│   │   │   ├── git_detector.rs
│   │   │   ├── git_service.rs
│   │   │   └── batch_ops_manager.rs
│   │   ├── infra/              # 基础设施
│   │   │   ├── git2_adapter.rs # git2-rs 实现
│   │   │   ├── config.rs       # JSON 配置
│   │   │   └── error.rs        # 错误定义
│   │   ├── events.rs           # 事件定义
│   │   └── types.rs            # 共享类型
│   ├── capabilities/           # Tauri 权限声明
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                        # React 前端
│   ├── App.tsx                 # 顶层布局
│   ├── components/
│   │   ├── ToolBar.tsx         # 工具栏
│   │   ├── FileTree.tsx        # 左侧文件树
│   │   ├── FileList.tsx        # 右侧文件列表
│   │   ├── BranchSwitchDialog.tsx  # 分支切换弹窗
│   │   ├── SettingsDialog.tsx  # 设置弹窗
│   │   ├── BatchActionBar.tsx  # 批量操作栏
│   │   └── BatchProgressPanel.tsx  # 批量进度面板
│   ├── stores/                 # Zustand stores
│   ├── ipc/                    # Tauri IPC 封装
│   ├── i18n/                   # i18n 配置
│   ├── locales/                # 中英文资源
│   ├── hooks/                  # React hooks
│   ├── types/                  # TS 类型
│   └── styles/                 # CSS
├── docs/
│   └── architecture.md         # 架构设计文档
├── mockup/                     # 静态 UI 展示
└── package.json
```

---

## 🚀 快速开始

### 环境要求

- [Node.js](https://nodejs.org/) 18+
- [Rust](https://www.rust-lang.org/) (stable)
- [Tauri 2 前置依赖](https://tauri.app/start/prerequisites/)

### 开发

```bash
# 安装前端依赖
npm install

# 启动开发模式（Tauri + Vite HMR）
npm run tauri:dev
```

### 构建

```bash
# 编译并打包（生成 MSI + NSIS 安装包）
npm run tauri:build
```

构建产物位于 `src-tauri/target/release/bundle/`。

---

## 📋 开发路线

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| P0 | 架构设计 + 静态展示图 | ✅ 已完成 |
| P1 | Tauri 骨架 + 自定义标题栏 + 布局组件 | ✅ 已完成 |
| P2 | 打开根目录 + 文件树浏览（只读） | ✅ 已完成 |
| P3 | GitDetector 自动识别 .git + 仓库标记 | ✅ 已完成 |
| P4 | git status/log/branch + 状态标记 | ✅ 已完成 |
| P6 | BatchOpsManager 多仓库批量操作 + 进度面板 | ✅ 已完成 |
| P9 | 文件树树形展开 + 多选 + 扫描Git按钮 | ✅ 已完成 |
| — | 分支切换弹窗 | ✅ 已完成 |
| — | Git 信息列（分支/提交人/提交时间） | ✅ 已完成 |
| — | 双击导航 + 导航历史栈 | ✅ 已完成 |
| — | 磁盘列表入口 | ✅ 已完成 |
| — | 中英文 i18n | ✅ 已完成 |
| P5 | commit/fetch/pull/push + 凭证 | 🚧 待开始 |
| P7 | diff 视图 + 冲突解决 + 设置面板 | 🚧 待开始 |
| P8 | 打包发布 + 自动更新 | 🚧 待开始 |

---

## 📄 License

MIT
