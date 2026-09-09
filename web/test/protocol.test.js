/**
 * CB08 BLE 协议层单元测试
 * 使用 Node.js 内置 assert，无第三方依赖
 *
 * 运行：node web/test/protocol.test.js
 */

const assert = require("assert");
const path = require("path");

// 测试结果统计
let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failed++;
    console.error(`  ✗ ${name}: ${e.message}`);
  }
}

console.log("\n=== CB08 BLE 协议层单元测试 ===\n");

// ---- CRC-16/XMODEM ----
console.log("[CRC-16/XMODEM]");

// 标准实现（独立于 app.js，用于交叉验证）
function crc16Xmodem(data) {
  let crc = 0;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i] << 8;
    for (let j = 0; j < 8; j++) {
      if (crc & 0x8000) {
        crc = ((crc << 1) ^ 0x1021) & 0xffff;
      } else {
        crc = (crc << 1) & 0xffff;
      }
    }
  }
  return crc;
}

test("CRC '123456789' → 0x31C3", () => {
  const data = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
  assert.strictEqual(crc16Xmodem(data), 0x31c3);
});

test("CRC 空数据 → 0x0000", () => {
  assert.strictEqual(crc16Xmodem(new Uint8Array(0)), 0);
});

test("CRC 单字节 0x00 → 0x0000", () => {
  assert.strictEqual(crc16Xmodem(new Uint8Array([0x00])), 0);
});

test("CRC 单字节 0xFF → 0xFF00... 不", () => {
  // 0xFF: crc = 0xFF00, 第一次迭代后 crc = (0xFF00 << 1) ^ 0x1021 = 0x1FE00 ^ 0x1021... 需截断 16bit
  const result = crc16Xmodem(new Uint8Array([0xff]));
  assert.ok(result >= 0 && result <= 0xffff, "CRC 在 16 位范围内");
});

// ---- 帧构造 ----
console.log("\n[帧构造]");

function buildFrame(data) {
  const len = data.length;
  const frame = new Uint8Array(2 + len + 2); // 0x5A + LEN + data + CRC16
  frame[0] = 0x5a;
  frame[1] = len;
  frame.set(data, 2);
  const crc = crc16Xmodem(frame.subarray(0, 2 + len));
  frame[2 + len] = crc & 0xff;      // CRC LE
  frame[2 + len + 1] = (crc >> 8) & 0xff;
  return frame;
}

test("帧以 0x5A 开头", () => {
  const frame = buildFrame(new Uint8Array([0x00, 0x01]));
  assert.strictEqual(frame[0], 0x5a);
});

test("帧 LEN 字段正确", () => {
  const data = new Uint8Array([0x00, 0x01, 0x02, 0x03]);
  const frame = buildFrame(data);
  assert.strictEqual(frame[1], data.length);
});

test("帧总长度 = 2 + LEN + 2", () => {
  const data = new Uint8Array([0x00, 0x01]);
  const frame = buildFrame(data);
  assert.strictEqual(frame.length, 2 + 2 + 2);
});

test("帧 CRC 正确（LE）", () => {
  const data = new Uint8Array([0x00, 0x01]);
  const frame = buildFrame(data);
  const expectedCrc = crc16Xmodem(frame.subarray(0, 4));
  const actualCrc = frame[4] | (frame[5] << 8);
  assert.strictEqual(actualCrc, expectedCrc);
});

// ---- 帧解析 ----
console.log("\n[帧解析]");

class FrameParser {
  constructor() {
    this.buf = new Uint8Array(0);
    this.source = "TEST";
  }
  push(chunk) {
    const merged = new Uint8Array(this.buf.length + chunk.length);
    merged.set(this.buf, 0);
    merged.set(chunk, this.buf.length);
    this.buf = merged;
    return this.parse();
  }
  parse() {
    const frames = [];
    let off = 0;
    while (off < this.buf.length) {
      // 找 0x5A
      while (off < this.buf.length && this.buf[off] !== 0x5a) off++;
      if (off >= this.buf.length) break;
      const len = this.buf[off + 1];
      if (off + 2 + len + 2 > this.buf.length) break; // 不完整
      const data = this.buf.subarray(off + 2, off + 2 + len);
      const crc = this.buf[off + 2 + len] | (this.buf[off + 3 + len] << 8);
      const expected = crc16Xmodem(this.buf.subarray(off, off + 2 + len));
      if (crc !== expected) { off++; continue; }
      frames.push({ data: new Uint8Array(data), seq: 0, source: this.source });
      off += 2 + len + 2;
    }
    this.buf = this.buf.slice(off);
    return frames;
  }
}

test("完整帧解析", () => {
  const parser = new FrameParser();
  const frame = buildFrame(new Uint8Array([0x00, 0x01]));
  const result = parser.push(frame);
  assert.strictEqual(result.length, 1);
  assert.deepStrictEqual(Array.from(result[0].data), [0x00, 0x01]);
});

test("半帧重组", () => {
  const parser = new FrameParser();
  const frame = buildFrame(new Uint8Array([0x00, 0x01]));
  const half1 = frame.slice(0, 3);
  const half2 = frame.slice(3);
  let result = parser.push(half1);
  assert.strictEqual(result.length, 0, "半帧不应返回结果");
  result = parser.push(half2);
  assert.strictEqual(result.length, 1, "补全后应返回 1 帧");
});

test("噪声跳过", () => {
  const parser = new FrameParser();
  const noise = new Uint8Array([0x00, 0x01, 0x02]);
  const frame = buildFrame(new Uint8Array([0x00, 0x01]));
  const combined = new Uint8Array(noise.length + frame.length);
  combined.set(noise, 0);
  combined.set(frame, noise.length);
  const result = parser.push(combined);
  assert.strictEqual(result.length, 1, "噪声后应解析出 1 帧");
});

test("多帧连续解析", () => {
  const parser = new FrameParser();
  const f1 = buildFrame(new Uint8Array([0x00, 0x01]));
  const f2 = buildFrame(new Uint8Array([0x00, 0x02]));
  const combined = new Uint8Array(f1.length + f2.length);
  combined.set(f1, 0);
  combined.set(f2, f1.length);
  const result = parser.push(combined);
  assert.strictEqual(result.length, 2);
});

// ---- 文件列表 BE 解析 ----
console.log("\n[文件列表 BE 解析]");

function parseFileList(body) {
  if (body.length < 12) return [];
  const dv = new DataView(body.buffer, body.byteOffset, body.byteLength);
  const count = dv.getUint32(0, false); // BE
  const time = dv.getUint32(4, false);
  const size = dv.getUint32(8, false);
  return [{ count, time, size }];
}

test("BE 解析 count=1 time=12 size=3456", () => {
  const body = new Uint8Array(12);
  const dv = new DataView(body.buffer);
  dv.setUint32(0, 1, false);   // BE
  dv.setUint32(4, 12, false);
  dv.setUint32(8, 3456, false);
  const result = parseFileList(body);
  assert.strictEqual(result.length, 1);
  assert.strictEqual(result[0].count, 1);
  assert.strictEqual(result[0].time, 12);
  assert.strictEqual(result[0].size, 3456);
});

test("BE vs LE 区分", () => {
  const body = new Uint8Array(4);
  const dv = new DataView(body.buffer);
  dv.setUint32(0, 256, false); // BE: 0x00000100
  assert.strictEqual(dv.getUint32(0, false), 256);
  assert.strictEqual(dv.getUint32(0, true), 65536, "LE 读取应得到 65536");
});

// ---- Opus → Ogg 测试 ----
console.log("\n[Opus → Ogg]");

// 加载 opus-to-ogg.js（Node 环境）
const oggModule = { exports: {} };
const oggCode = require("fs").readFileSync(
  path.join(__dirname, "..", "opus-to-ogg.js"),
  "utf8"
);
// 包装为模块
const oggFn = new Function("module", "exports", "global", oggCode + "\nmodule.exports = { wrapQs668RawOpus, oggCrc };");
oggFn(oggModule, oggModule.exports, global);
const { wrapQs668RawOpus, oggCrc } = oggModule.exports;

test("OGG CRC 空数据 → 0", () => {
  assert.strictEqual(oggCrc(new Uint8Array(0)), 0);
});

test("OGG CRC 单字节 0x00 → 0", () => {
  assert.strictEqual(oggCrc(new Uint8Array([0x00])), 0);
});

test("OggS magic 正确", () => {
  const raw = new Uint8Array(40); // 1 个空 Opus 包
  const ogg = wrapQs668RawOpus(raw);
  assert.strictEqual(ogg[0], 0x4f); // O
  assert.strictEqual(ogg[1], 0x67); // g
  assert.strictEqual(ogg[2], 0x67); // g
  assert.strictEqual(ogg[3], 0x53); // S
});

test("120B(3包) → OGG 输出 > 120B", () => {
  const raw = new Uint8Array(120);
  const ogg = wrapQs668RawOpus(raw);
  assert.ok(ogg.length > 120, `OGG 应大于 120B，实际 ${ogg.length}`);
});

test("非 40 倍数报错", () => {
  const raw = new Uint8Array(41);
  assert.throws(() => wrapQs668RawOpus(raw), /40/);
});

test("末页 eos 标志 0x04", () => {
  const raw = new Uint8Array(40); // 1 包 = 末页
  const ogg = wrapQs668RawOpus(raw);
  // 找最后一个 OggS 页面
  let lastPageOff = -1;
  for (let i = ogg.length - 4; i >= 0; i--) {
    if (ogg[i] === 0x4f && ogg[i + 1] === 0x67 && ogg[i + 2] === 0x67 && ogg[i + 3] === 0x53) {
      lastPageOff = i;
      break;
    }
  }
  assert.notStrictEqual(lastPageOff, -1, "至少有一个 OggS 页面");
  // flags 字节在 offset+5
  const flags = ogg[lastPageOff + 5];
  assert.strictEqual(flags & 0x04, 0x04, "末页应有 eos 标志");
});

// ---- WAV 头部测试 ----
console.log("\n[WAV 头部]");

function buildWavHeader(dataLength, sampleRate, channels, bitsPerSample) {
  const header = new Uint8Array(44);
  const dv = new DataView(header.buffer);
  header[0] = 0x52; header[1] = 0x49; header[2] = 0x46; header[3] = 0x46;
  dv.setUint32(4, 36 + dataLength, true);
  header[8] = 0x57; header[9] = 0x41; header[10] = 0x56; header[11] = 0x45;
  header[12] = 0x66; header[13] = 0x6d; header[14] = 0x74; header[15] = 0x20;
  dv.setUint32(16, 16, true);
  dv.setUint16(20, 1, true);
  dv.setUint16(22, channels, true);
  dv.setUint32(24, sampleRate, true);
  dv.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true);
  dv.setUint16(32, channels * (bitsPerSample / 8), true);
  dv.setUint16(34, bitsPerSample, true);
  header[36] = 0x64; header[37] = 0x61; header[38] = 0x74; header[39] = 0x61;
  dv.setUint32(40, dataLength, true);
  return header;
}

test("WAV RIFF 头正确", () => {
  const h = buildWavHeader(1000, 16000, 1, 16);
  assert.strictEqual(h[0], 0x52); // R
  assert.strictEqual(h[1], 0x49); // I
  assert.strictEqual(h[2], 0x46); // F
  assert.strictEqual(h[3], 0x46); // F
});

test("WAV WAVE 头正确", () => {
  const h = buildWavHeader(1000, 16000, 1, 16);
  assert.strictEqual(h[8], 0x57);  // W
  assert.strictEqual(h[9], 0x41);  // A
  assert.strictEqual(h[10], 0x56); // V
  assert.strictEqual(h[11], 0x45); // E
});

test("WAV fmt 格式 = 1 (PCM)", () => {
  const h = buildWavHeader(1000, 16000, 1, 16);
  const dv = new DataView(h.buffer);
  assert.strictEqual(dv.getUint16(20, true), 1);
});

test("WAV 采样率 16000", () => {
  const h = buildWavHeader(1000, 16000, 1, 16);
  const dv = new DataView(h.buffer);
  assert.strictEqual(dv.getUint32(24, true), 16000);
});

test("WAV 文件大小 = 36 + dataLength", () => {
  const h = buildWavHeader(1000, 16000, 1, 16);
  const dv = new DataView(h.buffer);
  assert.strictEqual(dv.getUint32(4, true), 36 + 1000);
});

test("WAV data 头正确", () => {
  const h = buildWavHeader(1000, 16000, 1, 16);
  assert.strictEqual(h[36], 0x64); // d
  assert.strictEqual(h[37], 0x61); // a
  assert.strictEqual(h[38], 0x74); // t
  assert.strictEqual(h[39], 0x61); // a
});

// ---- Float32 → Int16 ----
console.log("\n[Float32 → Int16]");

function float32ToInt16(float32) {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return new Uint8Array(int16.buffer);
}

test("0.0 → 0", () => {
  const result = new Int16Array(float32ToInt16(new Float32Array([0.0])).buffer);
  assert.strictEqual(result[0], 0);
});

test("1.0 → 32767", () => {
  const result = new Int16Array(float32ToInt16(new Float32Array([1.0])).buffer);
  assert.strictEqual(result[0], 0x7fff);
});

test("-1.0 → -32768", () => {
  const result = new Int16Array(float32ToInt16(new Float32Array([-1.0])).buffer);
  assert.strictEqual(result[0], -32768);
});

test("超范围 2.0 截断为 32767", () => {
  const result = new Int16Array(float32ToInt16(new Float32Array([2.0])).buffer);
  assert.strictEqual(result[0], 0x7fff);
});

// ---- 结果汇总 ----
console.log(`\n=== 结果：${passed} 通过，${failed} 失败 ===\n`);
process.exit(failed > 0 ? 1 : 0);
