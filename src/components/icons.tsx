// 内联 SVG 图标库（避免依赖外部图标库）

import type { CSSProperties } from "react";

interface IconProps {
  size?: number;
  style?: CSSProperties;
  className?: string;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

export const GitBranchIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="6" cy="6" r="2.2" /><circle cx="6" cy="18" r="2.2" /><circle cx="18" cy="8" r="2.2" /><path d="M6 8.2v7.6" /><path d="M18 10.2c0 4-6 2.8-6 6" /></svg>
);
export const FolderIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
);
export const FolderOpenIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><path d="M12 11v5m-2.5-2.5 2.5 2.5 2.5-2.5" /></svg>
);
export const FileIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M14 3v5h5" /><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /></svg>
);
export const PullIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M12 4v12" /><path d="m7 11 5 5 5-5" /><path d="M5 20h14" /></svg>
);
export const PushIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M12 20V8" /><path d="m7 13 5-5 5 5" /><path d="M5 4h14" /></svg>
);
export const CommitIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M5 12l5 5L20 7" /></svg>
);
export const HistoryIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const RefreshIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M21 12a9 9 0 1 1-2.64-6.36" /><path d="M21 3v6h-6" /></svg>
);
export const SearchIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="11" cy="11" r="7" /><path d="m21 21-4.3-4.3" /></svg>
);
export const SettingsIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
);
export const ArrowLeftIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M19 12H5" /><path d="m12 19-7-7 7-7" /></svg>
);
export const ArrowUpIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M12 19V5" /><path d="m5 12 7-7 7 7" /></svg>
);
export const GridIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><path d="M17.5 14v7M14 17.5h7" /></svg>
);
export const SyncIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="M7 10l-3 3 3 3" /><path d="M17 14l3-3-3-3" /><path d="M4 13h16" /></svg>
);
export const GlobeIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="9" /><path d="M3 12h18" /><path d="M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18" /></svg>
);
export const ChevronRightIcon = ({ size = 10, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="m3 2 4 3-4 3" /></svg>
);
export const ChevronDownIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="m3 5 3 3 3-3" /></svg>
);
export const CheckIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><path d="m2 6 3 3 5-6" /></svg>
);
export const SuccessIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="9" /><path d="m8 12 3 3 5-6" /></svg>
);
export const ErrorIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v5" /><path d="M12 16h.01" /></svg>
);
export const QueueIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 8v4" /><path d="M12 16h.01" /></svg>
);
export const CloseIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><line x1="2.5" y1="2.5" x2="9.5" y2="9.5" /><line x1="9.5" y1="2.5" x2="2.5" y2="9.5" /></svg>
);
export const MinimizeIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><line x1="2" y1="6" x2="10" y2="6" /></svg>
);
export const MaximizeIcon = ({ size = 12, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><rect x="2.5" y="2.5" width="7" height="7" /></svg>
);

export const DriveIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 6V4a1 1 0 0 1 1-1h8a1 1 0 0 1 1 1v2" /><circle cx="8" cy="14" r="1.5" /><circle cx="16" cy="14" r="1.5" /></svg>
);
