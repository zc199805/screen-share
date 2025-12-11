/**
 * Service Worker - 用于离线缓存和PWA功能
 */

const CACHE_NAME = 'screen-share-v1';
const urlsToCache = [
    './',
    './index.html',
    './styles.css',
    './app.js',
    './webrtc.js',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png'
];

// 安装事件 - 缓存资源
self.addEventListener('install', (event) => {
    console.log('Service Worker: 安装中...');
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('Service Worker: 缓存文件');
                return cache.addAll(urlsToCache);
            })
            .catch((err) => {
                console.log('Service Worker: 缓存失败', err);
            })
    );
    // 立即激活
    self.skipWaiting();
});

// 激活事件 - 清理旧缓存
self.addEventListener('activate', (event) => {
    console.log('Service Worker: 激活');
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cacheName) => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: 清理旧缓存', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    // 立即接管所有页面
    self.clients.claim();
});

// 请求拦截 - 优先网络，回退缓存
self.addEventListener('fetch', (event) => {
    // 跳过非GET请求和跨域请求
    if (event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        fetch(event.request)
            .then((response) => {
                // 请求成功，更新缓存
                if (response.status === 200) {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            })
            .catch(() => {
                // 网络失败，从缓存获取
                return caches.match(event.request);
            })
    );
});
