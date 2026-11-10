#!/usr/bin/env node
// Separate, read-only TLS service for the Apple TV app. Never imports the desktop server.
//
//   node tv-server.js                 serve (galleries come from the desktop app or from `add`)
//   node tv-server.js add <folder>…   save galleries
//   node tv-server.js remove <folder> forget a gallery
//   node tv-server.js list            show saved galleries
//   node tv-server.js pair            print a new pairing code from the running service
//   node tv-server.js revoke          disconnect every paired Apple TV
//   node tv-server.js install-service / uninstall-service   start automatically at login (macOS)
//
// The desktop app talks to this service through a private Unix socket, never through the network.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const https = require('node:https');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFileSync, execFile, spawn } = require('node:child_process');
const { promisify } = require('node:util');
const execFileAsync = promisify(execFile);

const FORMATS = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.heic': 'image/heic' };
const VIDEO_FORMATS = { '.mp4': 'video/mp4', '.m4v': 'video/x-m4v', '.mov': 'video/quicktime' };
const MEDIA_FORMATS = { ...FORMATS, ...VIDEO_FORMATS };
const isVideo = file => Boolean(VIDEO_FORMATS[path.extname(file).toLowerCase()]);
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const MAX_VIDEO_BYTES = 64 * 1024 * 1024 * 1024;
const DISPLAY_PX = 2560;
const THUMB_PX = 640;
const SCAN_TTL_MS = 20000;
const STATE_DIR = path.join(os.homedir(), '.image-viewer-pro-tv');

const inside = (root, file) => { const rel = path.relative(root, file); return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel); };
const digest = value => crypto.createHash('sha256').update(value).digest();
const same = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));
const hashToken = token => crypto.createHash('sha256').update(token).digest('hex');

// Sessions are kept as SHA-256 hashes so a leaked state file cannot be replayed as a token.
function fileSessionStore(file) {
  return {
    load() { try { return new Map(Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')))); } catch { return new Map(); } },
    save(map) { fs.writeFileSync(file, JSON.stringify(Object.fromEntries(map)), { mode: 0o600 }); },
  };
}

const COLLECTION_ID = /^[A-Za-z0-9_-]{1,64}$/;
const ITEM_FILE = /^[a-f0-9]{64}\.(jpg|png|heic)$/;
const EXT_BY_MIME = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/heic': '.heic' };
const sha = value => crypto.createHash('sha256').update(value).digest('hex');
function itemFileName(item) {
  const ext = path.extname(String(item.name || '')).toLowerCase();
  const normalized = ext === '.jpeg' ? '.jpg' : ext;
  const chosen = FORMATS[normalized] ? normalized : EXT_BY_MIME[item.type];
  return chosen && typeof item.key === 'string' && item.key ? `${sha(item.key)}${chosen}` : null;
}

async function createShare({ folders, key, cert, now = Date.now, sessionTtlMs = 12 * 3600000, sessionStore, cacheDir, collectionsDir }) {
  let roots = [];
  let collectionRoots = [];
  const allRoots = () => [...roots, ...collectionRoots];
  // Folders can be replaced at runtime (the desktop app syncs its list). Unreadable ones are skipped.
  async function setFolders(list) {
    const next = []; const skipped = [];
    for (const item of list) {
      const entry = typeof item === 'string' ? { path: item } : item;
      try {
        const root = await fsp.realpath(entry.path);
        if (!(await fsp.stat(root)).isDirectory()) throw Error('not a directory');
        const id = sha(root).slice(0, 32);
        if (!next.some(r => r.id === id)) next.push({ id, name: (entry.name || '').trim() || path.basename(root), root, kind: 'folder' });
      } catch { skipped.push(entry.path); }
    }
    for (const root of roots) if (!next.some(r => r.id === root.id)) scans.delete(root.id);
    roots = next;
    pruneFiles();
    return { count: next.length, skipped };
  }
  function pruneFiles() {
    const keep = new Set(allRoots().map(r => r.root));
    for (const [id, info] of files) if (!keep.has(info.root)) files.delete(id);
  }

  // Collections and Favoritos live in the browser; the desktop app uploads copies of their photos.
  async function readCollection(dir) {
    try {
      const real = await fsp.realpath(dir);
      const data = JSON.parse(await fsp.readFile(path.join(real, 'collection.json'), 'utf8'));
      const sourceId = path.basename(real);
      if (!COLLECTION_ID.test(sourceId)) return null;
      return { id: sha(`collection:${sourceId}`).slice(0, 32), sourceId, name: data.name || 'Colección', root: real, kind: 'collection', items: data.items || [] };
    } catch { return null; }
  }
  async function loadCollections() {
    const loaded = [];
    for (const entry of await fsp.readdir(collectionsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && COLLECTION_ID.test(entry.name)) { const c = await readCollection(path.join(collectionsDir, entry.name)); if (c) loaded.push(c); }
    }
    collectionRoots = loaded;
  }
  async function setCollections(list) {
    const missing = []; const live = new Set();
    for (const c of list) {
      if (!c || !COLLECTION_ID.test(c.id || '') || !Array.isArray(c.items)) continue;
      const dir = path.join(collectionsDir, c.id);
      await fsp.mkdir(dir, { recursive: true, mode: 0o700 });
      const real = await fsp.realpath(dir);
      const items = [];
      for (const item of c.items) {
        const file = itemFileName(item);
        if (!file || items.some(i => i.file === file)) continue;
        items.push({ file, name: String(item.name || '').slice(0, 200) });
        let present = false;
        try { present = (await fsp.stat(path.join(real, file))).size === item.size; } catch {}
        if (!present && Number.isFinite(item.size) && item.size <= MAX_IMAGE_BYTES) missing.push({ collection: c.id, file, key: item.key });
      }
      await fsp.writeFile(path.join(real, 'collection.json'), JSON.stringify({ name: String(c.name || '').slice(0, 120), items }), { mode: 0o600 });
      const wanted = new Set(items.map(i => i.file));
      for (const name of await fsp.readdir(real)) if (ITEM_FILE.test(name) && !wanted.has(name)) await fsp.rm(path.join(real, name), { force: true });
      live.add(c.id);
      scans.delete(sha(`collection:${c.id}`).slice(0, 32));
    }
    for (const entry of await fsp.readdir(collectionsDir, { withFileTypes: true })) {
      if (entry.isDirectory() && COLLECTION_ID.test(entry.name) && !live.has(entry.name)) await fsp.rm(path.join(collectionsDir, entry.name), { recursive: true, force: true });
    }
    await loadCollections();
    pruneFiles();
    return { count: collectionRoots.length, missing };
  }
  async function saveCollectionItem(collectionId, file, readable) {
    const root = collectionRoots.find(r => r.sourceId === collectionId);
    if (!root || !ITEM_FILE.test(file) || !root.items.some(i => i.file === file)) throw Object.assign(Error('Unknown item'), { status: 404 });
    const tmp = path.join(root.root, `${file}.${crypto.randomBytes(4).toString('hex')}.tmp`);
    let size = 0;
    const limit = new (require('node:stream').Transform)({ transform(chunk, _enc, done) { size += chunk.length; done(size > MAX_IMAGE_BYTES ? Object.assign(Error('Too large'), { status: 413 }) : null, chunk); } });
    try {
      await require('node:stream/promises').pipeline(readable, limit, fs.createWriteStream(tmp, { mode: 0o600 }));
      await fsp.rename(tmp, path.join(root.root, file));
    } finally { await fsp.rm(tmp, { force: true }); }
    scans.delete(root.id);
  }
  cacheDir ||= await fsp.mkdtemp(path.join(os.tmpdir(), 'ivp-cache-'));
  await fsp.mkdir(cacheDir, { recursive: true, mode: 0o700 });

  const files = new Map();
  const scans = new Map();
  const sessions = sessionStore ? sessionStore.load() : new Map(); // hash(token) -> expiry
  const persist = () => sessionStore?.save(sessions);
  let pairing;
  const newCode = () => { pairing = { code: String(crypto.randomInt(10000000, 100000000)), expires: now() + 300000, attempts: 0 }; return pairing.code; };
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(JSON.stringify(body)); };

  collectionsDir ||= await fsp.mkdtemp(path.join(os.tmpdir(), 'ivp-collections-'));
  await fsp.mkdir(collectionsDir, { recursive: true, mode: 0o700 });
  await setFolders(folders);
  await loadCollections();

  async function scan(root, dir = root.root, result = []) {
    for (const entry of await fsp.readdir(dir, { withFileTypes: true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name);
      // Do not follow directory or file symlinks, including replacements while scanning.
      const resolved = await fsp.realpath(file);
      if (!inside(root.root, resolved)) continue;
      if (entry.isDirectory()) await scan(root, file, result);
      else if (entry.isFile() && MEDIA_FORMATS[path.extname(file).toLowerCase()]) {
        if ((await fsp.stat(file)).size > (isVideo(file) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) continue;
        const id = crypto.createHash('sha256').update(root.id + path.relative(root.root, file)).digest('hex');
        files.set(id, { root: root.root, file });
        result.push({
          id, name: entry.name, folder: path.relative(root.root, dir), type: isVideo(file) ? 'video' : 'image',
          mediaPath: `/v1/images/${id}`, displayPath: `/v1/display/${id}`, thumbPath: `/v1/thumbs/${id}`,
        });
      }
    }
    return result;
  }
  async function listImages(root) {
    const cached = scans.get(root.id);
    if (cached && cached.expires > now()) return cached.images;
    if (root.kind === 'collection') {
      const images = [];
      for (const item of root.items) {
        const file = path.join(root.root, item.file);
        try { if (!(await fsp.stat(file)).isFile()) continue; } catch { continue; }
        const id = sha(root.id + item.file);
        files.set(id, { root: root.root, file });
        images.push({ id, name: item.name || item.file, folder: '', mediaPath: `/v1/images/${id}`, displayPath: `/v1/display/${id}`, thumbPath: `/v1/thumbs/${id}` });
      }
      scans.set(root.id, { images, expires: now() + SCAN_TTL_MS });
      return images;
    }
    const images = await scan(root);
    images.sort((a, b) => `${a.folder}/${a.name}`.localeCompare(`${b.folder}/${b.name}`, 'en', { numeric: true }));
    scans.set(root.id, { images, expires: now() + SCAN_TTL_MS });
    return images;
  }

  // Resized JPEGs (macOS `sips`) keep Wi-Fi transfers small: ~1 MB instead of up to 50 MiB.
  const inflight = new Map();
  const waiters = [];
  let active = 0;
  async function limited(task) {
    while (active >= 3) await new Promise(resolve => waiters.push(resolve));
    active++;
    try { return await task(); } finally { active--; waiters.shift()?.(); }
  }
  async function derive(id, real, stat, px) {
    const out = path.join(cacheDir, `${id}-${px}-${Math.trunc(stat.mtimeMs)}.jpg`);
    try { await fsp.access(out); return out; } catch {}
    if (!inflight.has(out)) {
      inflight.set(out, limited(async () => {
        const tmp = `${out}.${process.pid}.${crypto.randomBytes(4).toString('hex')}.tmp.jpg`;
        try {
          let source = real;
          let posterDir;
          if (isVideo(real)) { // first frame through Quick Look, then the usual resize
            posterDir = await fsp.mkdtemp(path.join(cacheDir, 'poster-'));
            await execFileAsync('qlmanage', ['-t', '-s', String(px), '-o', posterDir, real], { timeout: 60000 });
            source = path.join(posterDir, `${path.basename(real)}.png`);
          }
          try { await execFileAsync('sips', ['-Z', String(px), '-s', 'format', 'jpeg', '-s', 'formatOptions', '82', source, '--out', tmp], { timeout: 60000 }); }
          finally { if (posterDir) await fsp.rm(posterDir, { recursive: true, force: true }); }
          await fsp.rename(tmp, out);
        } finally { await fsp.rm(tmp, { force: true }); }
      }).finally(() => inflight.delete(out)));
    }
    await inflight.get(out);
    return out;
  }

  // Supports HTTP byte ranges: AVPlayer seeks inside videos through them.
  async function sendStream(req, res, handle, stat, contentType) {
    const headers = { 'Content-Type': contentType, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
    let start = 0, end = stat.size - 1, status = 200;
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range || '');
    if (range && (range[1] || range[2])) {
      if (range[1] === '') start = Math.max(0, stat.size - Number(range[2]));
      else { start = Number(range[1]); if (range[2] !== '') end = Math.min(end, Number(range[2])); }
      if (start > end || start >= stat.size) { res.writeHead(416, { 'Content-Range': `bytes */${stat.size}` }); return res.end(); }
      status = 206; headers['Content-Range'] = `bytes ${start}-${end}/${stat.size}`;
    }
    headers['Content-Length'] = Math.max(0, end - start + 1);
    res.writeHead(status, headers);
    if (req.method === 'HEAD' || stat.size === 0) return res.end();
    const stream = handle.createReadStream({ start, end, autoClose: false });
    await new Promise(resolve => { stream.on('error', () => { res.destroy(); resolve(); }); res.on('close', () => { stream.destroy(); resolve(); }); stream.pipe(res); });
  }

  const server = https.createServer({ key, cert, minVersion: 'TLSv1.2' }, async (req, res) => {
    try {
      const url = new URL(req.url, 'https://share.local');
      if (req.headers.origin) return json(res, 403, { error: 'Browser access disabled' });
      if (url.pathname === '/v1/pair' && req.method === 'POST') {
        if (!pairing || pairing.expires <= now() || pairing.attempts >= 10) return json(res, 429, { error: 'Generate a new code on the computer' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 1024) return json(res, 413, { error: 'Request too large' }); }
        pairing.attempts++;
        let input; try { input = JSON.parse(body); } catch { return json(res, 400, { error: 'Invalid JSON' }); }
        if (typeof input.code !== 'string' || !same(input.code, pairing.code)) return json(res, 403, { error: 'Invalid code' });
        const token = crypto.randomBytes(32).toString('hex');
        for (const [existing, expiry] of sessions) if (expiry <= now()) sessions.delete(existing);
        sessions.set(hashToken(token), now() + sessionTtlMs);
        persist();
        pairing = undefined;
        return json(res, 200, { token });
      }
      const tokenHash = hashToken((req.headers.authorization || '').replace(/^Bearer /, ''));
      if (!sessions.has(tokenHash) || sessions.get(tokenHash) <= now()) {
        if (sessions.delete(tokenHash)) persist();
        return json(res, 401, { error: 'Pair again on the computer' });
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error: 'Read only' });
      if (url.pathname === '/v1/galleries') {
        const galleries = await Promise.all(allRoots().map(async root => {
          try {
            const images = await listImages(root);
            return { id: root.id, name: root.name, kind: root.kind, count: images.length, cover: images[0]?.thumbPath ?? null };
          } catch { return { id: root.id, name: root.name, kind: root.kind, count: 0, cover: null }; }
        }));
        return json(res, 200, { galleries });
      }
      const gallery = /^\/v1\/galleries\/([^/]+)$/.exec(url.pathname);
      if (gallery) {
        const root = allRoots().find(r => r.id === gallery[1]);
        if (!root) return json(res, 404, { error: 'Gallery not found' });
        return json(res, 200, { images: await listImages(root) });
      }
      const media = /^\/v1\/(images|display|thumbs)\/([a-f0-9]{64})$/.exec(url.pathname);
      if (media && files.has(media[2])) {
        const [, kind, id] = media;
        const { root, file } = files.get(id);
        // Revalidate on each read; open with O_NOFOLLOW and use the validated descriptor.
        const real = await fsp.realpath(file);
        if (!inside(root, real) || real !== file) return json(res, 403, { error: 'Outside shared folder' });
        const handle = await fsp.open(real, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        let derived;
        try {
          // A renamed parent must not redirect the open descriptor outside the selected root.
          const current = await fsp.stat(real);
          const stat = await handle.stat();
          if (!stat.isFile() || stat.ino !== current.ino || stat.dev !== current.dev || await fsp.realpath(file) !== real) return json(res, 403, { error: 'File changed; refresh gallery' });
          if (stat.size > (isVideo(real) ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES)) return json(res, 413, { error: 'File exceeds the size limit' });
          if (kind === 'images') return await sendStream(req, res, handle, stat, MEDIA_FORMATS[path.extname(file).toLowerCase()]);
          try {
            const out = await derive(id, real, stat, kind === 'thumbs' ? THUMB_PX : DISPLAY_PX);
            derived = await fsp.open(out, fs.constants.O_RDONLY);
            return await sendStream(req, res, derived, await derived.stat(), 'image/jpeg');
          } catch (error) {
            if (!res.headersSent) return json(res, 415, { error: 'Unable to convert image' });
            throw error;
          }
        } finally { await derived?.close(); await handle.close(); }
      }
      json(res, 404, { error: 'Not found' });
    } catch (error) {
      if (!res.headersSent) json(res, error.code === 'ENOENT' ? 404 : 500, { error: 'Unable to read shared content' });
      else res.destroy();
    }
  });
  server.requestTimeout = 60000;
  server.headersTimeout = 10000;
  server.maxConnections = 32;
  return {
    server, newCode, setFolders, setCollections, saveCollectionItem, roots: () => roots, pairingActive: () => Boolean(pairing && pairing.expires > now()),
    hasSessions: () => [...sessions.values()].some(expiry => expiry > now()),
    revoke: () => { sessions.clear(); persist(); pairing = undefined; },
  };
}

// ---- command line / service ------------------------------------------------------------

const configPath = path.join(STATE_DIR, 'config.json');
const socketPath = path.join(STATE_DIR, 'control.sock');
const plistLabel = 'com.imageviewerpro.tv';
const plistPath = path.join(os.homedir(), 'Library', 'LaunchAgents', `${plistLabel}.plist`);
const readConfig = () => {
  try { return (JSON.parse(fs.readFileSync(configPath, 'utf8')).folders || []).map(f => typeof f === 'string' ? { path: f } : f); } catch { return []; }
};
const writeConfig = folders => fs.writeFileSync(configPath, JSON.stringify({ folders }, null, 2), { mode: 0o600 });
const expand = p => path.resolve(p.replace(/^~(?=$|\/)/, os.homedir()));

// Talks to a running service through its Unix socket (null when it is not running).
function control(method, route, body) {
  return new Promise(resolve => {
    const req = http.request({ socketPath, path: route, method, headers: { 'Content-Type': 'application/json' }, timeout: 5000 }, res => {
      let data = ''; res.on('data', c => data += c);
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(data) }); } catch { resolve({ status: res.statusCode, body: {} }); } });
    });
    req.on('error', () => resolve(null)); req.on('timeout', () => { req.destroy(); resolve(null); });
    if (body !== undefined) req.write(JSON.stringify(body));
    req.end();
  });
}

function startControlServer(share, fingerprint) {
  const reply = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
  let owner = null;
  const control = http.createServer(async (req, res) => {
    try {
      const upload = req.method === 'PUT' && /^\/collections\/([A-Za-z0-9_-]{1,64})\/([a-f0-9]{64}\.[a-z]+)$/.exec(req.url);
      if (upload) {
        try { await share.saveCollectionItem(upload[1], upload[2], req); return reply(res, 200, { saved: true }); }
        catch (error) { return reply(res, error.status || 500, { error: error.message }); }
      }
      let raw = ''; for await (const chunk of req) { raw += chunk; if (raw.length > 1e7) return reply(res, 413, {}); }
      const body = raw ? JSON.parse(raw) : {};
      if (req.method === 'GET' && req.url === '/status') {
        return reply(res, 200, { running: true, paired: share.hasSessions(), galleries: share.roots().length, fingerprint, owner });
      }
      if (req.method === 'POST' && req.url === '/pair') {
        return reply(res, 200, { code: share.newCode(), expiresInSeconds: 300, fingerprint });
      }
      if (req.method === 'POST' && req.url === '/revoke') { share.revoke(); return reply(res, 200, { revoked: true }); }
      if (req.method === 'POST' && req.url === '/reload') { return reply(res, 200, await share.setFolders(readConfig())); }
      if (req.method === 'POST' && req.url === '/collections') {
        if (!Array.isArray(body.collections)) return reply(res, 400, { error: 'collections must be a list' });
        return reply(res, 200, await share.setCollections(body.collections));
      }
      if (req.method === 'POST' && req.url === '/galleries') {
        if (!Array.isArray(body.folders)) return reply(res, 400, { error: 'folders must be a list' });
        const folders = body.folders.filter(f => f && typeof f.path === 'string').map(f => ({ path: f.path, name: typeof f.name === 'string' ? f.name.slice(0, 120) : '' }));
        const result = await share.setFolders(folders);
        writeConfig(folders);
        // Which browser profile synced last; only that one keeps the TV up to date automatically.
        owner = typeof body.owner === 'string' && /^[A-Za-z0-9-]{1,64}$/.test(body.owner) ? body.owner : null;
        return reply(res, 200, result);
      }
      reply(res, 404, { error: 'Not found' });
    } catch { reply(res, 500, { error: 'Control error' }); }
  });
  fs.rmSync(socketPath, { force: true });
  control.listen(socketPath, () => fs.chmodSync(socketPath, 0o600));
  return control;
}

function installService() {
  const plist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${plistLabel}</string>
  <key>ProgramArguments</key><array><string>${process.execPath}</string><string>${__filename}</string></array>
  <key>WorkingDirectory</key><string>${path.dirname(__filename)}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:${path.dirname(process.execPath)}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ProcessType</key><string>Background</string>
  <key>StandardOutPath</key><string>${path.join(STATE_DIR, 'service.log')}</string>
  <key>StandardErrorPath</key><string>${path.join(STATE_DIR, 'service.log')}</string>
</dict></plist>
`;
  fs.mkdirSync(path.dirname(plistPath), { recursive: true });
  fs.writeFileSync(plistPath, plist);
  const domain = `gui/${process.getuid()}`;
  try { execFileSync('launchctl', ['bootout', `${domain}/${plistLabel}`], { stdio: 'ignore' }); } catch {}
  execFileSync('launchctl', ['bootstrap', domain, plistPath]);
  console.log(`Service installed: ${plistPath}\nLogs: ${path.join(STATE_DIR, 'service.log')}`);
}

async function main() {
  fs.mkdirSync(STATE_DIR, { recursive: true, mode: 0o700 });
  const [command, ...rest] = process.argv.slice(2);
  const needService = async (method, route, body) => {
    const result = await control(method, route, body);
    if (!result) throw Error('The Apple TV service is not running. Start it with: node tv-server.js  (or install-service)');
    return result.body;
  };
  if (command === 'install-service') { installService(); return; }
  if (command === 'uninstall-service') {
    try { execFileSync('launchctl', ['bootout', `gui/${process.getuid()}/${plistLabel}`], { stdio: 'ignore' }); } catch {}
    fs.rmSync(plistPath, { force: true }); console.log('Service removed.'); return;
  }
  if (command === 'add') {
    if (!rest.length) throw Error('Usage: node tv-server.js add /folder [/another]');
    const folders = readConfig();
    for (const folder of rest) {
      const full = fs.realpathSync(expand(folder));
      if (!fs.statSync(full).isDirectory()) throw Error(`Not a folder: ${folder}`);
      if (!folders.some(f => f.path === full)) folders.push({ path: full });
    }
    writeConfig(folders); console.log(`Saved ${folders.length} galleries.`);
    await control('POST', '/reload');
    return;
  }
  if (command === 'remove') {
    const full = expand(rest[0] || '');
    const folders = readConfig().filter(f => f.path !== full && path.basename(f.path) !== rest[0] && f.name !== rest[0]);
    writeConfig(folders); console.log(`Saved ${folders.length} galleries.`);
    await control('POST', '/reload');
    return;
  }
  if (command === 'list') { readConfig().forEach(f => console.log(f.name ? `${f.name}  ${f.path}` : f.path)); return; }
  if (command === 'pair') {
    const { code, fingerprint } = await needService('POST', '/pair');
    console.log(`Pairing code (5 minutes, one use): ${code}\nCertificate SHA-256: ${fingerprint}`); return;
  }
  if (command === 'revoke') { await needService('POST', '/revoke'); console.log('All Apple TVs disconnected.'); return; }
  if (command) throw Error(`Unknown command: ${command}`);

  if ((await control('GET', '/status'))?.status === 200) throw Error('The Apple TV service is already running.');
  const keyPath = path.join(STATE_DIR, 'key.pem'), certPath = path.join(STATE_DIR, 'cert.pem');
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '3650', '-subj', '/CN=Image Viewer Pro Local'], { stdio: 'ignore' });
    fs.chmodSync(keyPath, 0o600);
  }
  const cert = fs.readFileSync(certPath);
  const share = await createShare({
    folders: readConfig(), key: fs.readFileSync(keyPath), cert, sessionTtlMs: 365 * 24 * 3600000,
    sessionStore: fileSessionStore(path.join(STATE_DIR, 'sessions.json')), cacheDir: path.join(STATE_DIR, 'cache'),
    collectionsDir: path.join(STATE_DIR, 'collections'),
  });
  const port = Number(process.env.TV_PORT || 5443);
  await new Promise((resolve, reject) => { share.server.once('error', reject); share.server.listen(port, process.env.TV_HOST || '0.0.0.0', resolve); });
  const fingerprint = new crypto.X509Certificate(cert).fingerprint256;
  const controlServer = startControlServer(share, fingerprint);
  console.log('Image Viewer Pro — TLS / read only');
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`Apple TV address: https://${a.address}:${port}`);
  console.log(`Certificate SHA-256: ${fingerprint}`);
  for (const root of share.roots().filter(r => r.kind === 'folder')) console.log(`Sharing: ${root.root}`);
  console.log(share.hasSessions() ? 'An Apple TV is already paired.' : 'Waiting for pairing: press “Vincular TV” in the desktop app.');

  // Bonjour: lets the Apple TV find this computer without typing an address.
  const bonjour = spawn('dns-sd', ['-R', `Image Viewer Pro (${os.hostname().split('.')[0]})`, '_ivp-tv._tcp', 'local', String(port), `fp=${fingerprint.replace(/:/g, '').slice(0, 32)}`], { stdio: 'ignore' });
  bonjour.on('error', () => {});
  const stop = () => { bonjour.kill(); controlServer.close(); fs.rmSync(socketPath, { force: true }); process.exit(0); };
  process.on('SIGINT', stop); process.on('SIGTERM', stop);
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { createShare };
