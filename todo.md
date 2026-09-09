# CB08 录音笔 Web 应用开发计划

创建时间：2026-08-20
最后更新：2026-09-09
依据文档：docs/录音笔BLE通讯协议.docx、docs/NextProto AI录音卡.htm、docs/qs668-raw-opus-to-ogg.py
源码来源：https://nextproto.top/qs668/ （官方 QS668 BLE Protocol Tester）

## 目标
基于 BLE 通讯协议，维护官方 Web Bluetooth 单页应用（原生 HTML/CSS/JS，无构建工具），覆盖：
- 设备控制：电量、容量、时间同步、固件、授权码
- 录音控制：开始/保存/暂停/继续、状态、录音时间、增益
- 文件管理：列表、下载导入（WAV/Opus）、删除
- 实时音频：接收 Opus 流 → 解码播放 → 保存落盘（Ogg/WAV）

## 当前状态
- ✅ 官方完整源码已复制到 web/ 目录
- ✅ opus-to-ogg.js 已集成（Opus → Ogg 封装）
- ✅ BLE 真机连接验证通过
- ✅ 页面现有功能全部 OK
- ✅ 协议自检 4/4 通过
- ✅ README.md + project-docs/ 文档完成
- ✅ GitHub 仓库：https://github.com/patdelphi/cb08

### app.js 已实现的功能模块
1. CRC-16/XMODEM：crc16Xmodem()，校验向量 "123456789"→0x31C3
2. FrameParser 类：流式帧解析、半帧重组、噪声跳过、CRC 校验，AE22/AE23 独立缓冲
3. buildFrame / buildFrameWithSeq：帧构造，SEQ 自增；2-2 下载请求强制整帧单写
4. BLE 连接：connect() 正常扫描（过滤 AE20）+ 兼容扫描（acceptAllDevices）
5. writeBytes：优先 writeValueWithoutResponse，回退 writeValue
6. 设备控制：syncTime / capacity / battery / firmware / auth
7. 录音控制：开始/保存/暂停/继续、状态/时间/文件名、增益读设
8. 文件管理：parseFileList（BE 解析）、下载（候选名回退）、删除（二次确认）
9. WAV 验证：inspectWav() 检查 RIFF/WAVE 头、采样率/位深/声道
10. 协议自检：CRC 向量、2-2 示例帧、半帧重组、BE 列表解析
11. 通信日志：TX/RX 带时间戳，导出功能
12. i18n：完整中/英文双语
13. 主题：白天/夜间切换

## 目录结构
```
c08/
├── README.md              # 项目说明
├── todo.md                # 本文件
├── .gitignore
├── chat_history.md        # 对话历史
├── docs/                  # 资料文档（只读参考）
│   ├── 录音笔BLE通讯协议.docx
│   ├── NextProto AI录音卡.htm
│   ├── qs668-raw-opus-to-ogg.py
│   ├── 连接测试.htm
│   ├── index.html / styles.css / app.js  # 官方原始源码
├── project-docs/          # 项目文档
│   ├── requirements.md    # 需求规格
│   ├── design.md          # 技术设计
│   ├── tasks.md          # 任务跟踪
│   ├── api.md            # API 文档
│   └── changelog.md      # 变更日志
└── web/                   # 工作目录（可运行应用）
    ├── index.html
    ├── styles.css
    ├── app.js
    └── opus-to-ogg.js     # Opus → Ogg 封装
```

## 后续任务

### P0 — Opus → WAV 转换 ✅
- [x] 新建 web/opus-to-wav.js
- [x] WebCodecs AudioDecoder 解码 Opus → PCM
- [x] 拼 WAV 头（44B RIFF/WAVE）+ PCM 数据 → .wav Blob
- [x] 集成到保存逻辑：用户可选导出 .ogg / .wav / .opus
- [x] i18n 添加导出格式选项
- [x] 验证 5 文件 HTTP 200

### P1 — 实时音频解码播放 ✅
- [x] 接收 Opus 流实时喂入 AudioDecoder
- [x] PCM → AudioContext 播放
- [x] 实时播放开关（rtLivePlayToggle）
- [x] 断开/停止时清理解码器

### P2 — 波形显示 ✅
- [x] Canvas 2D 绘制实时波形
- [x] 从 AudioDecoder 输出的 PCM 数据取幅度
- [x] 波形区域集成到实时音频面板
- [x] 白天/夜间主题自适应配色

### P3 — 批量下载 ✅
- [x] 文件列表多选（checkbox + 全选）
- [x] 批量下载按钮，逐个下载并保存
- [x] 格式选择（WAV/OPUS/原始）
- [x] i18n 双语

### P4 — 通信日志增强 ✅
- [x] 按级别（TX/RX/OK/ERR/WARN/INFO）过滤
- [x] 导出 TXT 保留原有功能
- [x] 导出 CSV（UTF-8 BOM + CRLF）
- [x] i18n 双语

### P5 — 协议层单元测试 ✅
- [x] 新建 web/test/protocol.test.js
- [x] Node.js 内置 assert，无第三方依赖
- [x] 30 个测试用例全通过：CRC/帧构造/帧解析/BE/Ogg/WAV/Float→Int16
- [x] 运行命令：node web/test/protocol.test.js

### P6 — 离线 PWA ✅
- [x] manifest.json（可安装到桌面，含 SVG 图标）
- [x] Service Worker 缓存静态资源（stale-while-revalidate 策略）
- [x] 断网可用
- [x] index.html 注册 SW + manifest 引用
```
