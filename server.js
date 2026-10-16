// Foley Party server.
// - Serves the game page.
// - Relays game messages between players in the same room (WebSocket).
// - Holds audio snippets, recordings and the scene video in memory for a few hours (HTTP upload/download).
//   The scene video stays hidden until the host reveals it, so players can't peek.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = process.env.PORT || 3000;
const PAGE = fs.readFileSync(path.join(__dirname, 'public', 'index.html'));
const MAX_PLAYERS = 12;
const MAX_MSG_BYTES = 64 * 1024;
const MAX_VIDEO = 80 * 1024 * 1024;     // per video file
const MAX_AUDIO = 4 * 1024 * 1024;      // per snippet or recording
const MAX_STEM = 16 * 1024 * 1024;      // per sound part (dialogue, music, effects…) for the reveal
const MAX_ROOM = 160 * 1024 * 1024;     // all files in one room
const MAX_TOTAL = 320 * 1024 * 1024;    // all files on the server
const TTL_MS = 3 * 60 * 60 * 1000;      // files are deleted after 3 hours

const blobs = new Map(); // "room/id" -> { buf, type, hidden, key, room, at }
let totalBytes = 0;
const ROOM_RE = /^[a-z0-9_-]{1,20}$/;
const ID_RE = /^[a-f0-9]{16}$/;

function roomBytes(room) { let n = 0; for (const b of blobs.values()) if (b.room === room) n += b.buf.length; return n; }
function dropBlob(k) { const b = blobs.get(k); if (b) { totalBytes -= b.buf.length; blobs.delete(k); } }
function json(res, code, obj) { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); }

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  const parts = url.pathname.split('/').filter(Boolean);

  if (url.pathname === '/healthz') { res.writeHead(200, { 'content-type': 'text/plain' }); return res.end('ok'); }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' });
    return res.end(PAGE);
  }

  // POST /blob/<room>?kind=audio|video  -> { id, key }
  if (req.method === 'POST' && parts[0] === 'blob' && parts.length === 2) {
    const room = parts[1];
    if (!ROOM_RE.test(room)) return json(res, 400, { error: 'bad room' });
    const k = url.searchParams.get('kind');
    const kind = k === 'video' ? 'video' : k === 'stem' ? 'stem' : 'audio';
    const limit = kind === 'video' ? MAX_VIDEO : kind === 'stem' ? MAX_STEM : MAX_AUDIO;
    const type = String(req.headers['content-type'] || 'application/octet-stream').slice(0, 80);
    if (kind === 'video' ? !/^video\//.test(type) : !/^audio\//.test(type)) return json(res, 415, { error: 'wrong file type' });
    const declared = Number(req.headers['content-length'] || 0);
    if (declared > limit) return json(res, 413, { error: kind === 'video' ? 'Video is too big (80 MB max). Trim it to just the scene.' : 'Audio is too big.' });
    if (totalBytes + (declared || 0) > MAX_TOTAL || roomBytes(room) + (declared || 0) > MAX_ROOM) return json(res, 507, { error: 'The server is full right now. Try again in a while.' });
    const chunks = []; let size = 0, aborted = false;
    req.on('data', c => {
      if (aborted) return;
      size += c.length;
      if (size > limit) { aborted = true; json(res, 413, { error: 'File is too big.' }); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => {
      if (aborted) return;
      const buf = Buffer.concat(chunks);
      if (!buf.length) return json(res, 400, { error: 'empty file' });
      if (totalBytes + buf.length > MAX_TOTAL || roomBytes(room) + buf.length > MAX_ROOM) return json(res, 507, { error: 'The server is full right now. Try again in a while.' });
      const id = crypto.randomBytes(8).toString('hex');
      const key = crypto.randomBytes(12).toString('hex');
      blobs.set(room + '/' + id, { buf, type, hidden: kind !== 'audio', key, room, at: Date.now() });   // video and parts stay hidden until the reveal
      totalBytes += buf.length;
      json(res, 200, { id, key });
    });
    req.on('error', () => {});
    return;
  }

  // GET /blob/<room>/<id>
  if (req.method === 'GET' && parts[0] === 'blob' && parts.length === 3) {
    const [, room, id] = parts;
    if (!ROOM_RE.test(room) || !ID_RE.test(id)) return json(res, 400, { error: 'bad request' });
    const b = blobs.get(room + '/' + id);
    if (!b) return json(res, 404, { error: 'File not found. It may have expired.' });
    if (b.hidden) return json(res, 403, { error: 'Not revealed yet' });
    res.writeHead(200, { 'content-type': b.type, 'content-length': b.buf.length, 'cache-control': 'private, max-age=3600' });
    return res.end(b.buf);
  }

  res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found');
});

setInterval(() => {
  const now = Date.now();
  for (const [k, b] of blobs) if (now - b.at > TTL_MS) dropBlob(k);
}, 10 * 60 * 1000);

// ---------- rooms
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: MAX_MSG_BYTES });
const rooms = new Map();
function cleanPres(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {};
  try { if (JSON.stringify(p).length > 4000) return { name: typeof p.name === 'string' ? p.name.slice(0, 16) : 'Player' }; } catch { return {}; }
  return p;
}
function roster(room) { const r = {}; for (const c of room) if (c.label) r[c.label] = c.pres || {}; return r; }
function broadcast(room, msg) { const t = JSON.stringify(msg); for (const c of room) if (c.label && c.readyState === 1) c.send(t); }

wss.on('connection', (ws, req) => {
  const code = String(new URL(req.url, 'http://x').searchParams.get('room') || '').toLowerCase();
  if (!ROOM_RE.test(code)) return ws.close(1008, 'bad room');
  let room = rooms.get(code);
  if (!room) { room = new Set(); rooms.set(code, room); }
  if (room.size >= MAX_PLAYERS) { ws.send(JSON.stringify({ t: 'full' })); return ws.close(1008, 'full'); }
  room.add(ws);
  ws.alive = true; ws.budget = 80;
  ws.on('pong', () => { ws.alive = true; });
  ws.on('message', raw => {
    ws.alive = true;
    if (ws.budget <= 0) return; ws.budget--;
    let m; try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m !== 'object') return;
    if (m.t === 'ping') return ws.send('{"t":"pong"}');
    if (m.t === 'time') return ws.send(JSON.stringify({ t: 'time', c: m.c, s: Date.now() }));   // clock sync for the screening
    if (m.t === 'hello' && typeof m.label === 'string' && /^[a-z0-9]{1,20}$/i.test(m.label)) {
      for (const c of room) if (c !== ws && c.label === m.label) { room.delete(c); try { c.terminate(); } catch {} }
      ws.label = m.label; ws.pres = cleanPres(m.pres);
      return broadcast(room, { t: 'roster', roster: roster(room) });
    }
    if (!ws.label) return;
    if (m.t === 'pres') { ws.pres = cleanPres(m.pres); return broadcast(room, { t: 'roster', roster: roster(room) }); }
    if (m.t === 'unhide' && typeof m.id === 'string' && typeof m.key === 'string') {
      const b = blobs.get(code + '/' + m.id);
      if (b && b.key === m.key) b.hidden = false;
      return;
    }
    if (m.t === 'ev' && typeof m.topic === 'string' && /^[a-z]{1,16}$/.test(m.topic)) {
      return broadcast(room, { t: 'ev', from: ws.label, topic: m.topic, data: m.data });
    }
  });
  ws.on('close', () => {
    room.delete(ws);
    if (room.size === 0) rooms.delete(code);
    else broadcast(room, { t: 'roster', roster: roster(room) });
  });
});
setInterval(() => { for (const ws of wss.clients) ws.budget = 80; }, 2000);
setInterval(() => { for (const ws of wss.clients) { if (!ws.alive) { ws.terminate(); continue; } ws.alive = false; try { ws.ping(); } catch {} } }, 15000);

server.listen(PORT, () => console.log(`Foley Party running on port ${PORT}`));
