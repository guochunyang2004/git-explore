// 菜单栏

import { useState } from "react";
import { useTranslation } from "react-i18next";

export function MenuBar() {
  const { t } = useTranslation();
  const [active, setActive] = useState<string | null>(null);
  const items = ["file", "edit", "view", "repository", "branch", "help"];

  return (
    <div style={{
      height: "var(--menubar-h)", background: "var(--bg-bar)",
      display: "flex", alignItems: "center", padding: "0 6px",
      borderBottom: "1px solid var(--border-soft)", flexShrink: 0,
    }}>
      {items.map((key) => (
        <div
          key={key}
          className="menu-item"
          style={{
            padding: "5px 10px", borderRadius: "var(--r-sm)", cursor: "pointer",
            fontSize: 13, color: active === key ? "var(--accent)" : "var(--text-primary)",
            background: active === key ? "var(--bg-selected)" : "transparent",
          }}
          onMouseEnter={() => setActive(key)}
          onMouseLeave={() => setActive(null)}
          onClick={() => setActive(key)}
        >
          {t(`menu:${key}`)}
        </div>
      ))}
    </div>
  );
}
