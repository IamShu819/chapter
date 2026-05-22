# 章章 Chapter — 项目交接文档

## 项目概况
- **项目名**: 章章 Chapter — 中文多格式电子书阅读器
- **技术栈**: Svelte 5 (runes) + Vite 8 + Capacitor (Android APK)
- **项目路径**: `D:\chapter`
- **构建工具链**: JDK 21 在 `D:\DevTools\jdk21`，Android SDK 在 `D:\DevTools\android-sdk`，Gradle 8.14.3 在 `D:\DevTools\gradle-8.14.3`

## 核心文件
- `src/routes/Reader.svelte` — 阅读器主组件，约1100行，处理 txt/epub/md/pdf 阅读、查词、批注、搜索
- `src/routes/Bookshelf.svelte` — 书架主页
- `src/routes/Vocab.svelte` — 生词页，含闪卡复习模式
- `src/routes/Settings.svelte` — 设置页（主题/字号/字体/行距）
- `src/routes/Import.svelte` — 导入页（本地文件 + 在线搜索）
- `src/lib/stores/app.svelte.ts` — 全局状态管理（$state runes），包含 BookStore/SettingsStore/BookmarkStore/VocabStore/AnnotationStore
- `src/lib/db/index.ts` — Dexie.js (IndexedDB)，当前 schema version 3
- `src/lib/types/` — 类型定义（book, reader, bookmark, vocab, annotation, dictionary）
- `src/app.css` — 全局样式，含三套主题 CSS 变量（light/dark/sepia）

## 已实现功能
- txt/epub/md/pdf 多格式阅读
- 章节导航（上下章按钮）
- 搜索高亮（修复了 $& 字面量 bug）
- 点击查词（内置字典引擎）
- 笔记批注（选中文字→笔记，批注高亮显示）
- 字号调节（A-/A+ 按钮）
- 书签管理
- 生词本 + 闪卡复习（3D 翻转动画）
- 深色/浅色/棕褐色主题切换
- 在线搜索下载电子书

## 已知问题与注意
1. **主题切换**: App.svelte 里用 `$effect` 监听 `settingsStore.settings.theme` 设置 `data-theme` 到 `<html>`，同时 `.app-shell` 也绑了 `data-theme`。之前有响应式不触发的问题，加了 `$effect` 后解决
2. **滑动翻页已删除**: 之前实现过触摸滑动翻页，因显示 bug 已移除，只保留箭头按钮翻页
3. **Reader.svelte 的 `handleContentClick`**: 用 `onpointerup` 而非 `onclick`，配合 `user-select: text` 实现手机上选中文字后显示查字/笔记工具栏
4. **Capacitor StatusBar**: 动态更新颜色，不再在 config 里写死 backgroundColor
5. **android/local.properties**: `sdk.dir=D\:\\DevTools\\android-sdk`
6. **gradle-wrapper.properties**: distributionUrl 指向本地文件 `file\:///D:/DevTools/gradle-8.14.3-bin.zip`

## 构建 APK 流程
```bash
cd D:/chapter
export JAVA_HOME=/d/DevTools/jdk21
export ANDROID_HOME=/d/DevTools/android-sdk
npm run build
npx cap copy android
npx cap sync android
cd android && ./gradlew assembleDebug
# APK 在 android/app/build/outputs/apk/debug/app-debug.apk
```

## 应用图标
- 图标源文件在 `D:\wy\Pictures\chapter2.png`
- 用 `scripts/gen-icon.mjs` 脚本裁切并生成各密度 PNG（mdpi~xxxhdpi）
- 换图标：改图片路径后 `node scripts/gen-icon.mjs`，再重新构建 APK

## Capacitor 配置
- `capacitor.config.json`: appId=com.chapter.reader, appName=章章
- 插件: @capacitor/filesystem, @capacitor/splash-screen, @capacitor/status-bar
