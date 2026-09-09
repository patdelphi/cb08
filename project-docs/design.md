# CB08 录音笔 BLE Web 应用 — 技术设计

版本：1.0
创建时间：2026-08-20
最后更新：2026-09-09

## 1. 架构总览

```
┌─────────────────────────────────────────────────────┐
│                    浏览器端（web/）                    │
│  ┌──────────┐  ┌──────────┐  ┌───────────────────┐  │
│  │ index.html│  │styles.css│  │     app.js       │  │
│  │  页面结构  │  │  样式    │  │  业务逻辑（IIFE） │  │
│  └──────────┘  └──────────┘  └───────────────────┘  │
│                                  │                   │
│                    ┌─────────────┼────────────┐      │
│                    │             │            │      │
│              ┌─────▼───┐  ┌─────▼────┐ ┌────▼───┐  │
│              │协议层    │  │ BLE 层   │ │音频层   │  │
│              │crc16    │  │connect   │ │opus-ogg│  │
│              │frame    │  │write     │ │decode  │  │
│              │parser   │  │notify    │ │wav     │  │
│              └─────────┘  └──────────┘ └────────┘  │
│                    │             │            │      │
└────────────────────┼─────────────┼────────────┼──────┘
                     │             │            │
         Web Bluetooth API    GATT 特征     Blob/下载
                     │
              ┌──────▼──────┐
              │  CB08 设备   │
              │  QS668 芯片  │
              └─────────────┘
```

无后端（ASR 模块除外），纯前端单页应用。

## 2. 模块划分

### 2.1 协议层（app.js 内）

| 函数/类 | 职责 |
|---------|------|
| `crc16Xmodem(data)` | CRC-16/XMODEM 校验，多项式 0x1021 |
| `buildFrame(data)` | 构造完整帧：0x5A + LEN + data + CRC16-LE |
| `buildFrameWithSeq(data, seq, preserveSeq)` | 带序号帧构造；2-2 下载强制 preserveSeq |
| `FrameParser` | 流式帧解析：半帧重组、噪声跳过、CRC 校验 |
| `handleFrame(frame)` | 帧分发：TYPE=0→控制 / 1→实时 / 2→文件 / 3→录音 |
| `parseFileList(body)` | 文件列表 BE 解析：count + time + size + name(20B) |

帧格式：
```
┌──────┬───────┬──────────┬──────────┬───────┬─────────────┐
│ 0x5A │ LEN   │ TYPE     │ CMD      │ SEQ   │ CRC16-LE    │
│ 1B   │ 1B    │ 1B       │ 1B       │ 1B    │ 2B          │
└──────┴───────┴──────────┴──────────┴───────┴─────────────┘
```

LEN = TYPE + CMD + SEQ + PAYLOAD 长度（不含 0x5A 和 LEN 自身，也不含 CRC）

### 2.2 BLE 层（app.js 内）

| 函数 | 职责 |
|------|------|
| `connect(compatScan)` | 扫描设备，正常模式过滤 AE20，兼容模式 acceptAll |
| `openBleSession(device)` | GATT 连接全流程，5 次重试 |
| `writeBytes(bytes)` | 优先 writeValueWithoutResponse，回退 writeValue |
| `onDisconnected()` | 清理状态、UI 反馈 |

UUID：
| 用途 | UUID |
|------|------|
| 服务 | 0000ae20-0000-1000-8000-00805f9b34fb |
| 写特征 (AE21) | 0000ae21-0000-1000-8000-00805f9b34fb |
| 通知特征 (AE22) | 0000ae22-0000-1000-8000-00805f9b34fb |
| 按键通知 (AE23) | 0000ae23-0000-1000-8000-00805f9b34fb |

连接稳定性策略：
1. 整个连接流程（connect → getPrimaryService → getCharacteristic × N → startNotifications）包在 5 次重试里
2. 每次 GATT 操作间延时 100-300ms
3. 全部成功后才注册 gattserverdisconnected 监听
4. 重试前先 disconnect 再重连

### 2.3 音频层

#### opus-to-ogg.js（已完成）

| 函数 | 职责 |
|------|------|
| `buildCrcTable()` | 构建 CRC-32 查表（256 项，多项式 0x04C11DB7） |
| `oggCrc(data)` | 计算 OggS 页面 CRC-32 |
| `makePage(headerType, granule, seq, packets, eos)` | 构造 OggS 页面 |
| `wrapQs668RawOpus(rawBytes)` | 主函数：40B Opus 包 → Ogg/Opus 文件 |

流程：
```
40B × N (Opus 包)
    │
    ├─ 第 1 包前插入 ID 头页（granule=0, eos=false）
    ├─ 每包一个数据页（granule = 包序号 × 20ms）
    └─ 最后一页设 eos=true（headerType |= 0x04）
         │
         ▼
    .ogg 文件（可播放）
```

#### Opus → WAV（待实现）

方案：WebCodecs AudioDecoder 解码 Opus → PCM → 拼 WAV 头（44B RIFF/WAVE）

### 2.4 ASR 层（待实现）

```
浏览器                        后端
  │                            │
  │  POST /api/qs668/transcribe│
  │  body: { segments: [...] } │
  │ ──────────────────────────>│
  │                            │  Whisper / 其他 ASR
  │  200 { text: "..." }       │
  │<───────────────────────────│
```

分段策略：800ms / 600-3200B 每段

## 3. 前端设计

### 3.1 页面布局

```
┌─────────────────────────────────────────────┐
│ 顶栏：标题 | 中/EN | 白天/夜间 | 状态 | 连接 │
├──────────────┬──────────────────────────────┤
│ 设备状态面板  │ 文件列表面板                  │
│  电量/容量    │  读取列表/导入/删除            │
│  固件/录音状态│  文件名/大小/操作              │
│  增益/巡检    │                              │
├──────────────┼──────────────────────────────┤
│ 录音控制面板  │ 实时音频面板                  │
│  开始/保存    │  开始接收/波形                │
│  暂停/继续    │  Ogg/WAV 保存                │
│  增益设置     │  ASR 转写                    │
├──────────────┴──────────────────────────────┤
│ 调试面板：原始命令 | 协议自检 | 通信日志        │
└─────────────────────────────────────────────┘
```

### 3.2 i18n 机制

- HTML 标签 `data-i18n="key"` 标记
- JS `I18N` 对象存储 `zh` / `en` 双语
- `applyI18n()` 遍历 `[data-i18n]` 元素设置 textContent
- `t(key, vars)` 函数支持模板变量

### 3.3 主题机制

- CSS 变量定义白天/夜间两套色值
- `<body>` 添加/移除 `data-theme="dark"` 切换
- localStorage 持久化

## 4. 数据流

### 4.1 命令发送

```
用户点击 → sendCommand(type, cmd, params)
  → buildFrame([type, cmd, ...params])
  → writeBytes(frame) → AE21 写特征 → 设备
```

### 4.2 响应接收

```
设备 → AE22 通知 → characteristicvaluechanged 事件
  → parsers.ae22.push(new Uint8Array(buf))
  → FrameParser.parse() → 完整帧
  → handleFrame(frame) → 按 TYPE 分发
  → 更新 UI / 日志 / 下载缓冲
```

### 4.3 文件下载

```
requestDownload(name, offset)
  → sendCommand(2, 4, [...name, offset])
  → AE22 通知返回 2-4 数据帧
  → download.buffer 累积
  → 完成后 inspectWav() 验证 / wrapQs668RawOpus() 封装
  → downloadBlob() 保存
```

## 5. 状态管理

全局 `state` 对象：
```javascript
const state = {
  device, server, writeChar, notifyChar, keyNotifyChar,
  connected: false,
  seq: 0,
  download: { buffer, name, totalSize, receivedSize, ... },
  realtime: { recording, chunks, ... },
  listIdleTimer, downloadIdleTimer,
};
```

无框架，直接 DOM 操作。
