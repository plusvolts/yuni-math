/* 오프라인 캐시. 파일을 고치면 VERSION 숫자를 올려주세요 (app.js의 APP_VERSION도 함께). */
const VERSION = 'yuni-math-7';
const FILES = ['./', 'index.html', 'style.css', 'content.js', 'app.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'audio-ko/index.json', '기획서.md'];
// 한국어 녹음 파일(공통 65번)은 설치 뒤 백그라운드로 모두 받아둬요 (오프라인용)
// 파일이 많아서(2천 개 넘게) 8개씩 차례로 받아요
const cacheAudio = () => caches.open(VERSION).then(c => fetch('audio-ko/index.json').then(r => r.json()).then(async idx => {
  const fs = [...new Set(Object.values(idx))];
  for (let i = 0; i < fs.length; i += 8) await Promise.all(fs.slice(i, i + 8).map(f => c.match('audio-ko/' + f).then(hit => hit || c.add('audio-ko/' + f).catch(() => {}))));
})).catch(() => {});
self.addEventListener('install', e => { e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES.map(f => encodeURI(f)))).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()).then(() => { cacheAudio(); })); });
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const req = e.request; const url = new URL(req.url);
  // 녹음 파일(mp3)은 바뀌지 않으니 캐시 먼저
  if (/\/audio-ko\/[^/]+\.mp3$/.test(url.pathname)) {
    e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => { if (r.ok) { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); } return r; })).catch(() => fetch(req)));
    return;
  }
  // 나머지는 네트워크 우선 + 브라우저 캐시도 매번 확인(no-cache) → 새 버전이 바로 반영돼요. 안 되면 캐시 → 오프라인 동작
  const net = req.mode === 'navigate' ? fetch(req.url, { cache: 'no-cache' }) : fetch(req, { cache: 'no-cache' });
  e.respondWith(net.then(r => { const copy = r.clone(); caches.open(VERSION).then(c => c.put(req, copy)); return r; })
    .catch(() => caches.match(req, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
