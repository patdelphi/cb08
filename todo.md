﻿# CB08 录音笔 Web 应用开发计划

创建时间：2026-08-20
最后更新：2026-08-20
依据文档：docs/录音笔BLE通讯协议.docx、docs/NextProto AI录音卡.htm、docs/qs668-raw-opus-to-ogg.py
源码来源：https://nextproto.top/qs668/ （官方 QS668 BLE Protocol Tester）

## 目标
基于 BLE 通讯协议，维护官方 Web Bluetooth 单页应用（原生 HTML/CSS/JS，无构建工具），覆盖：
- 设备控制：电量、容量、时间同步、固件、授权码
- 录音控制：开始/保存/暂停/继续、状态、录音时间、增益
- 文件管理：列表、下载导入（WAV/Opus）、删除
- 实时音频：接收 Opus 流 → 保存落盘；ASR 通过后端 /api/qs668/transcribe 分段提交

## 当前状态：已有官方完整源码
从 https://nextproto.top/qs668/ 抓取了完整源码（HTML + CSS + JS），已复制到 web/ 目录：
- web/index.html （12.6KB）— 完整页面结构，含 data-i18n 多语言标记
- web/styles.css （15.2KB）— 完整样式，含白天/夜间主题
- web/app.js   （64.6KB）— 完整 JS 业务逻辑

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
10. ASR 接口：/api/qs668/transcribe，800ms / 600-3200B 分段提交
11. 协议自检：CRC 向量、2-2 示例帧、半帧重组、BE 列表解析
12. 通信日志：TX/RX 带时间戳，导出功能
13. i18n：完整中/英文双语
14. 主题：白天/夜间切换

## 目录结构
```
c08/
├── todo.md              # 本文件
├── docs/                # 资料文档（只读参考）
│   ├── 录音笔BLE通讯协议.docx
│   ├── NextProto AI录音卡.htm
│   ├── qs668-raw-opus-to-ogg.py
│   ├── 连接测试.htm       # SingleFile 快照（无 JS，UI 参考）
│   ├── index.html        # 官方原始 HTML
│   ├── styles.css        # 官方原始 CSS
│   └── app.js            # 官方原始 JS
└── web/                  # 工作目录（可运行应用）
    ├── index.html
    ├── styles.css
    └── app.js
```

## 后续任务（按需）
1. [ ] 本地运行验证：python -m http.server，确认页面正常加载、协议自检通过
2. [ ] 真机联调：连接 CB08 设备，验证电量/容量/固件/文件列表/下载/录音控制
3. [ ] ASR 后端对接：实现 /api/qs668/transcribe 接口（当前前端已就绪，后端待建）
4. [ ] Opus 解码播放：当前实时音频仅保存原始 Opus 流，未解码播放（可选用 WebCodecs）
5. [ ] 按需定制：UI 调整、功能裁剪、品牌替换等
```
