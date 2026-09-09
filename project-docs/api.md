# CB08 录音笔 BLE Web 应用 — API 文档

版本：1.0
创建时间：2026-08-20
最后更新：2026-09-09

## 1. BLE 协议命令表

帧格式：`[0x5A][LEN][TYPE][CMD][SEQ][PAYLOAD...][CRC16-LE]`

### TYPE=0 控制命令

| CMD | 功能 | 请求参数 | 响应 body | 字节序 |
|-----|------|----------|-----------|--------|
| 0 | 同步时间 | year_lo, year_hi, month, day, hour, min, sec | ACK | LE |
| 1 | 获取容量 | 无 | remain(4B) + total(4B) | LE |
| 3 | 获取电量 | 无 | battery_byte (110=充满) | — |
| 10 | 固件版本 | 无 | 版本字符串 | — |
| 12 | 授权码 | 无 | 授权码 | — |

### TYPE=1 实时命令

| CMD | 功能 |
|-----|------|
| 0-7 | 实时音频传输相关（Opus 流） |

### TYPE=2 文件命令

| CMD | 功能 | 请求参数 | 响应 | 字节序 |
|-----|------|----------|------|--------|
| 1 | 读取文件列表 | offset(4B) | count(4B)+time(4B)+size(4B)+name(20B) × N | BE |
| 3 | 分段导入文件 | name+offset+data | ACK | — |
| 4 | 下载文件 | name+offset | 36B/帧 数据 | LE |
| 5 | 删除文件 | name | result_code | — |
| 6 | 删除全部 | 无 | result_code | — |

> **重要**：CMD=4 下载请求必须 `preserveSeq=true`，整帧单写，不可拆分。

### TYPE=3 录音命令

| CMD | 功能 |
|-----|------|
| 0 | 开始录音 |
| 1 | 保存录音 |
| 2 | 暂停录音 |
| 3 | 继续录音 |
| 4 | 查询状态（时长/文件名） |
| 5 | 读取增益 |
| 6 | 设置增益 |

### AE23 按键通知

设备机身按键事件，通过 AE23 特征通知，body 中包含按键码。

## 2. JS 内部 API

### 协议层

```javascript
// CRC-16/XMODEM 校验
crc16Xmodem(data: Uint8Array): number

// 构造帧
buildFrame(data: Uint8Array): Uint8Array

// 带序号帧构造
buildFrameWithSeq(data: Uint8Array, seq: number, preserveSeq: boolean): Uint8Array

// 帧解析器
class FrameParser {
  push(chunk: Uint8Array): Frame[]
  parse(): Frame[]
}

// 帧对象
interface Frame {
  source: string;     // "AE22" | "AE23"
  seq: number;
  data: Uint8Array;   // TYPE + CMD + body
}
```

### BLE 层

```javascript
// 连接设备
connect(compatScan: boolean): Promise<void>

// 发送命令
sendCommand(type: number, cmd: number, params?: number[] | Uint8Array): Promise<void>

// 写入字节
writeBytes(bytes: Uint8Array): Promise<void>

// 断开
disconnect(): void
```

### 文件管理

```javascript
// 读取文件列表
requestFileList(): Promise<void>

// 下载文件
requestDownload(name: string, offset: number, candidates?: string[]): Promise<void>

// 删除单个文件
deleteOneFile(file: { name: string }): Promise<void>

// 删除全部
deleteAllFiles(): Promise<void>

// WAV 验证
inspectWav(bytes: Uint8Array): { valid: boolean, sampleRate: number, ... }

// 下载 Blob
downloadBlob(blob: Blob, filename: string): void
```

### 音频层

```javascript
// Opus → Ogg 封装（opus-to-ogg.js）
wrapQs668RawOpus(raw: Uint8Array): Uint8Array

// 保存实时音频（app.js 内）
saveRealtimeAudio(): void
```

## 3. ASR 后端接口（待实现）

### POST /api/qs668/transcribe

请求：
```json
{
  "segments": [
    { "data": "<base64 opus bytes>", "duration_ms": 800 },
    ...
  ],
  "sample_rate": 16000,
  "channels": 1
}
```

响应：
```json
{
  "text": "转写文本内容",
  "segments": [
    { "start": 0, "end": 0.8, "text": "..." },
    ...
  ]
}
```

分段策略：800ms / 600-3200B 每段
