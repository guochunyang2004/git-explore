// 语言切换器（对应附录 H.6）

import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { LANGUAGES, type LanguageCode } from "@/i18n";
import { GlobeIcon, ChevronDownIcon, CheckIcon } from "@/components/icons";

export function LanguageSwitcher() {
  const { i18n, t } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const current = LANGUAGES.find((l) => l.code === i18n.language) ?? LANGUAGES[0];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const change = (code: LanguageCode) => { i18n.changeLanguage(code); setOpen(false); };

  return (
    <div className="lang-select" ref={ref} title={t("statusbar:language")} onClick={() => setOpen(!open)}>
      <GlobeIcon size={12} />
      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>{current.name}</span>
      <ChevronDownIcon size={12} style={{ color: "var(--text-tertiary)" }} />
      {open && (
        <div style={{
          position: "absolute", bottom: "100%", right: 0, marginBottom: 4,
          background: "var(--bg-surface)", border: "1px solid var(--border)",
          borderRadius: "var(--r-sm)", boxShadow: "var(--shadow-2)",
          minWidth: 150, zIndex: 100, overflow: "hidden",
        }}>
          {LANGUAGES.map((l) => (
            <div key={l.code}
              onClick={(e) => { e.stopPropagation(); change(l.code); }}
              style={{
                display: "flex", alignItems: "center", justifyContent: "space-between",
                padding: "7px 12px", cursor: "pointer", fontSize: 12,
                background: l.code === current.code ? "var(--bg-selected)" : "transparent",
              }}
            >
              <span>{l.name}</span>
              {l.code === current.code && <CheckIcon size={12} style={{ color: "var(--accent)" }} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
