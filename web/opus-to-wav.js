/**
 * QS668 原始 Opus 流 → WAV 文件转换器
 *
 * 使用 WebCodecs AudioDecoder 解码 Opus → PCM → WAV 文件
 * 设备每包固定 40B（Opus config 9，20ms/帧，16kHz 单声道）
 *
 * 用法（异步）：
 *   const wavBytes = await wrapQs668RawOpusToWav(rawUint8Array);
 *   const blob = new Blob([wavBytes], { type: "audio/wav" });
 *
 * 依赖：浏览器 WebCodecs API（Chrome 94+ / Edge 94+）
 */

(function (global) {
  "use strict";

  // QS668 Opus 参数
  var SAMPLE_RATE = 16000;
  var CHANNELS = 1;
  var FRAME_MS = 20;
  var SAMPLES_PER_FRAME = (SAMPLE_RATE * FRAME_MS) / 1000; // 320 采样/帧

  /**
   * 构造 WAV 文件头（44 字节 RIFF/WAVE）
   * data: PCM 数据（Float32 或 Int16）
   * 返回 Uint8Array（头 + 数据）
   */
  function buildWavHeader(dataLength, sampleRate, channels, bitsPerSample) {
    var header = new Uint8Array(44);
    var dv = new DataView(header.buffer);

    // RIFF 标识
    header[0] = 0x52; // R
    header[1] = 0x49; // I
    header[2] = 0x46; // F
    header[3] = 0x46; // F

    // 文件大小（不含 RIFF 头自身 8 字节）
    dv.setUint32(4, 36 + dataLength, true);

    // WAVE 标识
    header[8] = 0x57; // W
    header[9] = 0x41; // A
    header[10] = 0x56; // V
    header[11] = 0x45; // E

    // fmt 子块
    header[12] = 0x66; // f
    header[13] = 0x6d; // m
    header[14] = 0x74; // t
    header[15] = 0x20; // 空格

    // fmt 大小（PCM 固定 16）
    dv.setUint32(16, 16, true);

    // 音频格式（PCM = 1）
    dv.setUint16(20, 1, true);

    // 声道数
    dv.setUint16(22, channels, true);

    // 采样率
    dv.setUint32(24, sampleRate, true);

    // 字节率 = 采样率 × 声道 × 位深/8
    var byteRate = sampleRate * channels * (bitsPerSample / 8);
    dv.setUint32(28, byteRate, true);

    // 块对齐 = 声道 × 位深/8
    dv.setUint16(32, channels * (bitsPerSample / 8), true);

    // 位深
    dv.setUint16(34, bitsPerSample, true);

    // data 子块
    header[36] = 0x64; // d
    header[37] = 0x61; // a
    header[38] = 0x74; // t
    header[39] = 0x61; // a

    // data 大小
    dv.setUint32(40, dataLength, true);

    return header;
  }

  /**
   * Float32 PCM → Int16 PCM 转换
   * WebCodecs 输出 Float32，WAV 需要 Int16
   */
  function float32ToInt16(float32) {
    var int16 = new Int16Array(float32.length);
    for (var i = 0; i < float32.length; i++) {
      var s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
    }
    return new Uint8Array(int16.buffer);
  }

  /**
   * 解码单个 Opus 包为 PCM Float32
   * 返回 Promise<Float32Array>
   */
  function decodeOpusPacket(decoder, packet) {
    return new Promise(function (resolve, reject) {
      var chunks = [];

      decoder.ondeallocate = function () {};
      decoder.ondequeue = function (event) {
        // 取出解码帧
        var frame = event.frame;
        if (frame) {
          // 读取 Float32 PCM 数据
          var pcmb = new Float32Array(frame.data.byteLength / 4);
          new DataView(frame.data).getFloat32(0, true); // 触发读取
          var bufView = new DataView(frame.data);
          for (var i = 0; i < pcmb.length; i++) {
            pcmb[i] = bufView.getFloat32(i * 4, true);
          }
          chunks.push(pcmb);
          frame.close ? frame.close() : void 0;
        }
      };

      // 添加 chunk 处理
      var originalOutput = decoder.output;
      decoder.output = function (frame) {
        var pcmb = new Float32Array(frame.data.byteLength / 4);
        var bufView = new DataView(frame.data);
        for (var i = 0; i < pcmb.length; i++) {
          pcmb[i] = bufView.getFloat32(i * 4, true);
        }
        chunks.push(pcmb);
        if (frame.close) frame.close();
      };

      try {
        decoder.decode(new EncodedAudioChunk({
          type: "key",
          data: packet,
          timestamp: 0,
          duration: FRAME_MS * 1000 // 微秒
        }));
        // flush 确保所有帧输出
        decoder.decode(new EncodedAudioChunk({
          type: "key",
          data: new Uint8Array(0),
          timestamp: 0,
          duration: 0
        }));
        decoder.flush().then(function () {
          // 合并所有 PCM 片段
          var totalLen = 0;
          for (var i = 0; i < chunks.length; i++) totalLen += chunks[i].length;
          var merged = new Float32Array(totalLen);
          var off = 0;
          for (var i = 0; i < chunks.length; i++) {
            merged.set(chunks[i], off);
            off += chunks[i].length;
          }
          resolve(merged);
        }).catch(reject);
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * 主函数：QS668 原始 Opus → WAV
   * raw: Uint8Array（40B 的整数倍）
   * 返回 Promise<Uint8Array>（完整 WAV 文件）
   */
  async function wrapQs668RawOpusToWav(raw) {
    if (!global.AudioDecoder) {
      throw new Error("WebCodecs AudioDecoder 不可用，需要 Chrome 94+");
    }
    if (raw.length % 40 !== 0) {
      throw new Error("QS668 raw Opus 长度必须是 40 的倍数，当前 " + raw.length);
    }

    var numPackets = raw.length / 40;

    // 创建解码器
    var decoder = new AudioDecoder({
      output: function () {}, // 占位，后面动态替换
      error: function (e) {
        console.error("AudioDecoder error:", e);
      }
    });

    decoder.configure({
      codec: "opus",
      sampleRate: SAMPLE_RATE,
      numberOfChannels: CHANNELS,
      // Opus config 9 对应的 extra data
      description: new Uint8Array([0x4f, 0x70, 0x75, 0x73, 0x48, 0x65, 0x61, 0x64, 0x01, 0x01, 0x38, 0x01, 0x80, 0x3e, 0x00, 0x00, 0x00, 0x00, 0x00])
    });

    // 收集所有 PCM 数据
    var pcmChunks = [];

    // 逐包解码
    for (var i = 0; i < numPackets; i++) {
      var packet = raw.subarray(i * 40, i * 40 + 40);
      var pcm = await decodeOpusPacket(decoder, packet);
      pcmChunks.push(pcm);
    }

    // 合并 PCM
    var totalPcmLen = 0;
    for (var i = 0; i < pcmChunks.length; i++) totalPcmLen += pcmChunks[i].length;
    var mergedPcm = new Float32Array(totalPcmLen);
    var off = 0;
    for (var i = 0; i < pcmChunks.length; i++) {
      mergedPcm.set(pcmChunks[i], off);
      off += pcmChunks[i].length;
    }

    // Float32 → Int16
    var pcm16 = float32ToInt16(mergedPcm);

    // 构造 WAV 文件
    var header = buildWavHeader(pcm16.length, SAMPLE_RATE, CHANNELS, 16);
    var wav = new Uint8Array(header.length + pcm16.length);
    wav.set(header, 0);
    wav.set(pcm16, header.length);

    // 关闭解码器
    try { decoder.close(); } catch (_) {}

    return wav;
  }

  /**
   * 简化版：同步构造 WAV（当已经有 PCM 数据时）
   * pcm16: Uint8Array（Int16 PCM 数据）
   */
  function buildWavFromPcm16(pcm16, sampleRate, channels) {
    if (!sampleRate) sampleRate = SAMPLE_RATE;
    if (!channels) channels = CHANNELS;
    var header = buildWavHeader(pcm16.length, sampleRate, channels, 16);
    var wav = new Uint8Array(header.length + pcm16.length);
    wav.set(header, 0);
    wav.set(pcm16, header.length);
    return wav;
  }

  // 导出
  global.wrapQs668RawOpusToWav = wrapQs668RawOpusToWav;
  global.buildWavFromPcm16 = buildWavFromPcm16;
  global.buildWavHeader = buildWavHeader;
  global.float32ToInt16 = float32ToInt16;
})(typeof window !== "undefined" ? window : this);
