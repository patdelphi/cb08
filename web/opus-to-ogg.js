/**
 * QS668 原始 Opus 流 → Ogg/Opus 文件包装器（JS 移植版）
 * 移植自 docs/qs668-raw-opus-to-ogg.py
 *
 * 设备每包固定 40B（Opus config 9，20ms/帧，16kHz），
 * 按 Ogg/Opus 规范包装后可直接用浏览器/播放器播放。
 *
 * 用法：
 *   const oggBytes = wrapQs668RawOpus(rawUint8Array);
 *   const blob = new Blob([oggBytes], { type: "audio/ogg" });
 */

(function (global) {
  "use strict";

  // OGG CRC-32 多项式（与 Python 脚本一致）
  var CRC_POLY = 0x04c11db7;

  // 构建 CRC 查表（256 项 Uint32）
  var CRC_TABLE = (function () {
    var table = new Uint32Array(256);
    for (var v = 0; v < 256; v++) {
      var reg = v << 24;
      for (var i = 0; i < 8; i++) {
        if (reg & 0x80000000) {
          reg = ((reg << 1) ^ CRC_POLY) >>> 0;
        } else {
          reg = (reg << 1) >>> 0;
        }
      }
      table[v] = reg;
    }
    return table;
  })();

  // 逐字节计算 OGG CRC-32
  function oggCrc(data) {
    var crc = 0;
    for (var i = 0; i < data.length; i++) {
      crc = (((crc << 8) >>> 0) ^ CRC_TABLE[((crc >>> 24) & 0xff) ^ data[i]]) >>> 0;
    }
    return crc >>> 0;
  }

  // 将 Uint8Array 写入 Uint8Array 目标偏移处（内部工具）
  function setBytes(dst, offset, src) {
    dst.set(src, offset);
    return offset + src.length;
  }

  // 构造一个 OGG 页面
  // payloads: Uint8Array[]；granule: Number；serial: Number；seq: Number；flags: Number
  function makePage(payloads, granule, serial, seq, flags) {
    // 拼接 body
    var bodyLen = 0;
    for (var i = 0; i < payloads.length; i++) bodyLen += payloads[i].length;
    var body = new Uint8Array(bodyLen);
    var bOff = 0;
    for (var i = 0; i < payloads.length; i++) {
      bOff = setBytes(body, bOff, payloads[i]);
    }

    // 计算 laces（每个 payload 的长度编码：255 序列 + 剩余）
    var laces = [];
    for (var i = 0; i < payloads.length; i++) {
      var remaining = payloads[i].length;
      while (remaining >= 255) {
        laces.push(255);
        remaining -= 255;
      }
      laces.push(remaining);
    }

    // 页头：4(magic) + 1(ver) + 1(flags) + 8(granule) + 4(serial) + 4(seq) + 4(crc) + 1(laceCount) + laces
    var headerLen = 27 + laces.length;
    var page = new Uint8Array(headerLen + bodyLen);
    var dv = new DataView(page.buffer);

    var off = 0;
    // magic "OggS"
    page[off++] = 0x4f; // O
    page[off++] = 0x67; // g
    page[off++] = 0x67; // g
    page[off++] = 0x53; // S
    // version
    page[off++] = 0;
    // flags
    page[off++] = flags & 0xff;
    // granule（64-bit LE）
    dv.setBigUint64(off, BigInt(granule), true); off += 8;
    // serial（32-bit LE）
    dv.setUint32(off, serial >>> 0, true); off += 4;
    // seq（32-bit LE）
    dv.setUint32(off, seq >>> 0, true); off += 4;
    // CRC 占位（先写 0，后面回填）
    dv.setUint32(off, 0, true);
    var crcOffset = off;
    off += 4;
    // lace 段数
    page[off++] = laces.length;
    // laces
    for (var i = 0; i < laces.length; i++) {
      page[off++] = laces[i];
    }
    // body
    page.set(body, off);

    // 计算并回填 CRC
    var crc = oggCrc(page);
    dv.setUint32(crcOffset, crc, true);

    return page;
  }

  // 包装 QS668 固定 40B 原始 Opus 包为 Ogg/Opus
  // raw: Uint8Array；sampleRate: 默认 16000
  function wrapQs668RawOpus(raw, sampleRate) {
    if (sampleRate === undefined) sampleRate = 16000;
    if (raw.length % 40 !== 0) {
      throw new Error("QS668 raw OPUS length must be a multiple of 40 bytes, got " + raw.length);
    }

    var numPackets = raw.length / 40;
    var packets = [];
    for (var i = 0; i < numPackets; i++) {
      packets.push(raw.subarray(i * 40, i * 40 + 40));
    }

    var serial = 0x51533638; // "QS68"
    var seq = 0;
    var pages = [];

    // --- OpusHead ---
    // "OpusHead" + version(1) + channels(1) + preskip(2 LE) + sampleRate(4 LE) + gain(2 LE signed) + mapping(1)
    var head = new Uint8Array(19);
    var hdv = new DataView(head.buffer);
    head[0] = 0x4f; // O
    head[1] = 0x70; // p
    head[2] = 0x75; // u
    head[3] = 0x73; // s
    head[4] = 0x48; // H
    head[5] = 0x65; // e
    head[6] = 0x61; // a
    head[7] = 0x64; // d
    head[8] = 1;     // version
    head[9] = 1;     // channels
    hdv.setUint16(10, 312, true); // preskip
    hdv.setUint32(12, sampleRate, true); // sample rate
    hdv.setInt16(16, 0, true);   // output gain
    head[18] = 0;   // channel mapping family

    pages.push(makePage([head], 0, serial, seq, 0x02));
    seq++;

    // --- OpusTags ---
    var vendorStr = new Uint8Array([0x51, 0x53, 0x36, 0x36, 0x38]); // "QS668"
    var tags = new Uint8Array(8 + 4 + vendorStr.length + 4);
    var tdv = new DataView(tags.buffer);
    tags[0] = 0x4f; tags[1] = 0x70; tags[2] = 0x75; tags[3] = 0x73;
    tags[4] = 0x54; tags[5] = 0x61; tags[6] = 0x67; tags[7] = 0x73;
    tdv.setUint32(8, vendorStr.length, true);
    tags.set(vendorStr, 12);
    tdv.setUint32(12 + vendorStr.length, 0, true); // comment count = 0

    pages.push(makePage([tags], 0, serial, seq, 0x00));
    seq++;

    // --- 音频数据页：每 50 包一页 ---
    var granule = 0;
    for (var start = 0; start < numPackets; start += 50) {
      var end = Math.min(start + 50, numPackets);
      var group = packets.slice(start, end);
      granule += 960 * group.length; // 48kHz 粒度时钟，每包 960 采样
      var isLast = end >= numPackets;
      var flags = isLast ? 0x04 : 0x00; // 0x04 = eos
      pages.push(makePage(group, granule, serial, seq, flags));
      seq++;
    }

    // 拼接所有页
    var totalLen = 0;
    for (var i = 0; i < pages.length; i++) totalLen += pages[i].length;
    var result = new Uint8Array(totalLen);
    var offset = 0;
    for (var i = 0; i < pages.length; i++) {
      offset = setBytes(result, offset, pages[i]);
    }
    return result;
  }

  // 导出
  global.wrapQs668RawOpus = wrapQs668RawOpus;
  global.oggCrc = oggCrc; // 暴露用于测试
})(typeof window !== "undefined" ? window : this);
