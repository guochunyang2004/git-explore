// 地址栏：单一路径输入框（对应架构文档 4.7 & mockup）
// 显示当前路径，支持手动输入路径导航，回车跳转
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspaceStore } from "@/stores";

export function AddressBar() {
  const { t } = useTranslation();
  const currentDir = useWorkspaceStore((s) => s.currentDir);
  const rootPath = useWorkspaceStore((s) => s.rootPath);
  const navigateTo = useWorkspaceStore((s) => s.navigateTo);
  const openWorkspace = useWorkspaceStore((s) => s.openWorkspace);
  const [inputValue, setInputValue] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // 同步显示当前路径
  useEffect(() => {
    if (!isEditing) {
      setInputValue(currentDir ?? "");
    }
  }, [currentDir, isEditing]);

  const handleFocus = () => {
    setIsEditing(true);
    // 全选内容
    requestAnimationFrame(() => inputRef.current?.select());
  };

  const handleBlur = () => {
    setIsEditing(false);
    setInputValue(currentDir ?? "");
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const target = inputValue.trim();
      if (!target) return;
      // 如果路径在当前根目录下，走 navigateTo；否则 openWorkspace
      if (rootPath && target.toLowerCase().startsWith(rootPath.toLowerCase())) {
        navigateTo(target);
      } else {
        openWorkspace(target);
      }
      inputRef.current?.blur();
    } else if (e.key === "Escape") {
      // 取消编辑，恢复原值
      setInputValue(currentDir ?? "");
      inputRef.current?.blur();
    }
  };

  return (
    <div className="addressbar">
      <input
        ref={inputRef}
        className="address-input"
        value={inputValue}
        placeholder={t("addressbar:placeholder")}
        onChange={(e) => setInputValue(e.target.value)}
        onFocus={handleFocus}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        spellCheck={false}
        autoComplete="off"
      />
    </div>
  );
}
