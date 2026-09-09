/**
 * CB08 BLE 测试平台 Service Worker
 * 缓存静态资源，支持离线使用
 */

var CACHE_NAME = "cb08-ble-v1";
var ASSETS = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./opus-to-ogg.js",
  "./opus-to-wav.js",
  "./manifest.json"
];

// 安装：预缓存核心资源
self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

// 激活：清理旧缓存
self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(
        names.filter(function (name) {
          return name !== CACHE_NAME;
        }).map(function (name) {
          return caches.delete(name);
        })
      );
    }).then(function () {
      return self.clients.claim();
    })
  );
});

// 请求：缓存优先，回退网络
self.addEventListener("fetch", function (event) {
  // 只处理 GET 请求
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(function (cached) {
      if (cached) {
        // 有缓存就用，同时后台更新
        fetch(event.request).then(function (resp) {
          if (resp && resp.status === 200) {
            var clone = resp.clone();
            caches.open(CACHE_NAME).then(function (cache) {
              cache.put(event.request, clone);
            });
          }
        }).catch(function () { /* 离线时静默 */ });
        return cached;
      }
      // 无缓存，走网络
      return fetch(event.request).then(function (resp) {
        if (!resp || resp.status !== 200) return resp;
        var clone = resp.clone();
        caches.open(CACHE_NAME).then(function (cache) {
          cache.put(event.request, clone);
        });
        return resp;
      });
    })
  );
});
