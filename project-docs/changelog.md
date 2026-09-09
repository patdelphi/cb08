# CB08 录音笔 BLE Web 应用 — 变更日志

## 2026-09-09

### 新增
- 创建 project-docs/ 目录，编写项目文档：
  - requirements.md — 需求规格（8 大功能模块、非功能需求、约束）
  - design.md — 技术设计（架构图、模块划分、数据流、状态管理）
  - tasks.md — 任务跟踪（已完成 8 项 / 进行中 1 项 / 待办 8 项）
  - api.md — API 文档（BLE 命令表、JS 内部 API、ASR 后端接口）
  - changelog.md — 本文件

## 2026-08-20

### 新增
- 从 https://nextproto.top/qs668/ 抓取完整官方源码（HTML + CSS + JS）
- 创建 web/ 工作目录，复制 3 个文件作为项目基础
- 移植 qs668-raw-opus-to-ogg.py → opus-to-ogg.js（CRC-32 查表、OggS 页面构造）
- 集成 Opus→Ogg 到 app.js 的 saveRealtimeAudio()
- 编写 README.md
- 初始化 git 仓库，推送到 https://github.com/patdelphi/cb08

### 优化
- 删除"购买与技术支持" section 和浮动二维码按钮
- 清理无用 CSS（15.2KB → 8.8KB，减 42%）
- 清理 i18n 中 14 条无用条目
- 标题改为"CB08 录音笔 BLE 测试平台"

### 修复
- BLE 连接超时从 9 秒延长到 60 秒
- GATT 连接改为 5 次整体重试（connect → 服务发现 → 通知订阅全流程）
- GATT 操作间增加 100-300ms 延时
- 延迟注册 gattserverdisconnected 监听，避免中途断开清 state

### 验证
- HTTP 服务器正常运行
- 4 个文件全部 HTTP 200
- 协议自检 4/4 全通过（CRC/帧构造/半帧重组/BE 解析）
- opus-to-ogg.js Node 测试通过（CRC=0、OggS magic、120B→246B、eos 标志）
