// i18n 配置（对应架构文档附录 H）

import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import common from "@/locales/zh-CN/common.json";
import menu from "@/locales/zh-CN/menu.json";
import toolbar from "@/locales/zh-CN/toolbar.json";
import filetree from "@/locales/zh-CN/filetree.json";
import filelist from "@/locales/zh-CN/filelist.json";
import git from "@/locales/zh-CN/git.json";
import batch from "@/locales/zh-CN/batch.json";
import statusbar from "@/locales/zh-CN/statusbar.json";
import settings from "@/locales/zh-CN/settings.json";
import errors from "@/locales/zh-CN/errors.json";
import addressbar from "@/locales/zh-CN/addressbar.json";
import branch from "@/locales/zh-CN/branch.json";
import commonEn from "@/locales/en/common.json";
import menuEn from "@/locales/en/menu.json";
import toolbarEn from "@/locales/en/toolbar.json";
import filetreeEn from "@/locales/en/filetree.json";
import filelistEn from "@/locales/en/filelist.json";
import gitEn from "@/locales/en/git.json";
import batchEn from "@/locales/en/batch.json";
import statusbarEn from "@/locales/en/statusbar.json";
import settingsEn from "@/locales/en/settings.json";
import errorsEn from "@/locales/en/errors.json";
import addressbarEn from "@/locales/en/addressbar.json";
import branchEn from "@/locales/en/branch.json";

export const LANGUAGES = [
  { code: "zh-CN", name: "简体中文", short: "中" },
  { code: "en", name: "English", short: "EN" },
] as const;

export type LanguageCode = (typeof LANGUAGES)[number]["code"];

/** 检测系统语言，映射到支持的语言 */
function detectSystemLanguage(): LanguageCode {
  const lang = navigator.language || "zh-CN";
  if (lang.startsWith("en")) return "en";
  return "zh-CN";
}

i18n.use(initReactI18next).init({
  resources: {
    "zh-CN": { common, menu, toolbar, filetree, filelist, git, batch, statusbar, settings, errors, addressbar, branch },
    en: { common: commonEn, menu: menuEn, toolbar: toolbarEn, filetree: filetreeEn, filelist: filelistEn, git: gitEn, batch: batchEn, statusbar: statusbarEn, settings: settingsEn, errors: errorsEn, addressbar: addressbarEn, branch: branchEn },
  },
  lng: detectSystemLanguage(),
  fallbackLng: "zh-CN",
  defaultNS: "common",
  interpolation: { escapeValue: false },
});

export default i18n;
