# CB08 录音笔 BLE Web 应用

基于 Web Bluetooth 的 QS668/CB08 录音笔浏览器端控制工具，原生 HTML/CSS/JS 实现，无构建依赖。

## 功能概览

| 模块 | 说明 |
|------|------|
| 设备连接 | Web Bluetooth 扫描连接，支持正常扫描（AE20 服务过滤）和兼容扫描（手动选择） |
| 设备状态 | 电量、容量、时间同步、固件版本、授权码 |
| 录音控制 | 开始/保存/暂停/继续、录音状态/时间/文件名、增益读取与设置 |
| 文件管理 | 列表浏览、WAV/Opus 下载、文件删除（二次确认） |
| 实时音频 | 接收 Opus 流，Ogg/Opus 封装落盘（可播放 `.ogg`） |
| ASR 转写 | 预留 `/api/qs668/transcribe` 后端接口，800ms / 600-3200B 分段提交 |
| 协议自检 | CRC-16/XMODEM 校验、帧构造、半帧重组、BE 列表解析 |
| 原始命令 | 调试用：手动构造并发送任意协议帧 |
| 通信日志 | TX/RX 带时间戳，支持导出 |
| 多语言 | 中文 / 英文双语切换 |
| 主题 | 白天 / 夜间主题切换 |

## 快速开始

```bash
# 1. 进入项目目录
cd c08

# 2. 启动本地 HTTP 服务器
python -m http.server 8000

# 3. 用 Chrome 或 Edge 打开
#    http://localhost:8000/web/
```

> **要求**：Chrome 56+ 或 Edge 79+，且页面需通过 `localhost` 或 HTTPS 访问（Web Bluetooth 限制）。

## 目录结构

```
c08/
├── README.md                          # 本文件
├── todo.md                            # 开发计划与任务跟踪
├── .gitignore
├── docs/                              # 资料文档（只读参考）
│   ├── 录音笔BLE通讯协议.docx          # BLE 协议规格
│   ├── NextProto AI录音卡.htm          # 产品介绍页
│   ├── qs668-raw-opus-to-ogg.py        # Opus→Ogg Python 参考实现
│   ├── 连接测试.htm                    # SingleFile 快照（UI 参考）
│   ├── index.html                     # 官方原始 HTML
│   ├── styles.css                     # 官方原始 CSS
│   └── app.js                         # 官方原始 JS
└── web/                               # 工作目录（可运行应用）
    ├── index.html                     # 页面结构，data-i18n 多语言标记
    ├── styles.css                     # 样式，白天/夜间主题
    ├── app.js                         # 业务逻辑（连接/协议/设备控制/文件管理/ASR）
    └── opus-to-ogg.js                 # Opus→Ogg 封装（CRC-32/OggS 页面构造）
```

## 技术要点

### BLE 通讯协议

- **服务 UUID**：`0xAE20`
- **写特征**：`0xAE21`（发送命令帧）
- **通知特征**：`0xAE22`（接收响应数据）
- **按键通知**：`0xAE23`（按键事件，可选）
- **帧格式**：`[0x5A][LEN][CMD][SUB][SEQ][PAYLOAD...][CRC16-LE]`
- **CRC**：CRC-16/XMODEM，多项式 `0x1021`，初始值 `0x0000`
- **字节序**：文件列表字段为大端（BE），其余为小端（LE）

### Opus → Ogg 封装

`opus-to-ogg.js` 将 QS668 原始 40 字节 Opus 包封装为标准 Ogg/Opus 文件：
- CRC-32 查表法（多项式 `0x04C11DB7`）
- OggS 页面头构造（granule position、segment table、eos 标志）
- 浏览器和播放器可直接播放生成的 `.ogg` 文件

### 连接稳定性

QS668 设备 BLE 连接可能立即断开，已实现：
- 整个连接流程（connect → 服务发现 → 特征发现 → 通知订阅）5 次重试
- GATT 操作间延时（100-300ms）让设备稳定
- 成功后才注册断开监听

## 浏览器兼容性

| 浏览器 | 支持情况 |
|--------|----------|
| Chrome 56+ (Windows/macOS/Linux) | 完全支持 |
| Edge 79+ (Chromium) | 完全支持 |
| Chrome Android | 支持（需手动选择设备） |
| Firefox / Safari | 不支持 Web Bluetooth API |

## 真机联调步骤

1. 短按录音笔电源键唤醒设备
2. 确保设备未连接其他手机/电脑
3. 浏览器打开 `http://localhost:8000/web/`
4. 点击「连接设备」或「兼容扫描」
5. 在蓝牙选择器中选中设备
6. 连接成功后可执行：电量查询、文件列表、下载、录音控制等

## 后续计划

- [x] 本地运行验证 + 协议自检 4/4 通过
- [ ] 真机联调全功能验证
- [ ] ASR 后端对接（`/api/qs668/transcribe`）
- [ ] WebCodecs 实时 Opus 解码播放
- [ ] 按需定制 UI / 品牌替换

## 许可

源码来源于 [https://nextproto.top/qs668/](https://nextproto.top/qs668/)（官方 QS668 BLE Protocol Tester），在此基础上修改和扩展。
