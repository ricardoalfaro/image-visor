#!/usr/bin/env node
// Separate, read-only TLS service. Never imports the desktop server.
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const https = require('node:https');
const crypto = require('node:crypto');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const readline = require('node:readline');
const FORMATS = { '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.heic':'image/heic' };
const MAX_IMAGE_BYTES = 50 * 1024 * 1024;
const inside = (root, file) => { const rel = path.relative(root, file); return rel !== '' && !rel.startsWith(`..${path.sep}`) && rel !== '..' && !path.isAbsolute(rel); };
const digest = value => crypto.createHash('sha256').update(value).digest();
const same = (a, b) => crypto.timingSafeEqual(digest(a), digest(b));

async function createShare({ folders, key, cert, now = Date.now }) {
  const roots = await Promise.all(folders.map(async folder => {
    const root = await fsp.realpath(folder);
    if (!(await fsp.stat(root)).isDirectory()) throw Error('Choose directories only');
    return { id: crypto.randomUUID(), name: path.basename(root), root };
  }));
  if (!roots.length) throw Error('At least one folder is required');
  const sessions = new Map();
  const files = new Map();
  let pairing;
  const newCode = () => { pairing = { code: String(crypto.randomInt(10000000, 100000000)), expires: now() + 300000, attempts: 0 }; return pairing.code; };
  const json = (res, status, body) => { res.writeHead(status, { 'Content-Type':'application/json', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(JSON.stringify(body)); };
  async function scan(root, dir = root.root, result = []) {
    for (const entry of await fsp.readdir(dir, { withFileTypes:true })) {
      if (entry.name.startsWith('.') || entry.isSymbolicLink()) continue;
      const file = path.join(dir, entry.name);
      // Do not follow directory or file symlinks, including replacements while scanning.
      const resolved = await fsp.realpath(file);
      if (!inside(root.root, resolved)) continue;
      if (entry.isDirectory()) await scan(root, file, result);
      else if (entry.isFile() && FORMATS[path.extname(file).toLowerCase()]) {
        if ((await fsp.stat(file)).size > MAX_IMAGE_BYTES) continue;
        const id = crypto.createHash('sha256').update(root.id + path.relative(root.root, file)).digest('hex');
        files.set(id, { root:root.root, file });
        result.push({ id, name:entry.name, folder:path.relative(root.root, dir), mediaPath:`/v1/images/${id}` });
      }
    }
    return result;
  }
  const server = https.createServer({ key, cert, minVersion:'TLSv1.2' }, async (req, res) => {
    try {
      const url = new URL(req.url, 'https://share.local');
      if (req.headers.origin) return json(res, 403, { error:'Browser access disabled' });
      if (url.pathname === '/v1/pair' && req.method === 'POST') {
        if (!pairing || pairing.expires <= now() || pairing.attempts >= 10) return json(res, 429, { error:'Generate a new code on the computer' });
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 1024) return json(res, 413, { error:'Request too large' }); }
        pairing.attempts++;
        let input; try { input = JSON.parse(body); } catch { return json(res, 400, { error:'Invalid JSON' }); }
        if (typeof input.code !== 'string' || !same(input.code, pairing.code)) return json(res, 403, { error:'Invalid code' });
        const token = crypto.randomBytes(32).toString('hex');
        for (const [existing, expiry] of sessions) if (expiry <= now()) sessions.delete(existing);
        sessions.set(token, now() + 12 * 3600000);
        pairing = undefined;
        return json(res, 200, { token });
      }
      const token = (req.headers.authorization || '').replace(/^Bearer /, '');
      if (!sessions.has(token) || sessions.get(token) <= now()) { sessions.delete(token); return json(res, 401, { error:'Pair again on the computer' }); }
      if (req.method !== 'GET' && req.method !== 'HEAD') return json(res, 405, { error:'Read only' });
      if (url.pathname === '/v1/galleries') return json(res, 200, { galleries: roots.map(({ id, name }) => ({ id, name })) });
      const gallery = /^\/v1\/galleries\/([^/]+)$/.exec(url.pathname);
      if (gallery) {
        const root = roots.find(r => r.id === gallery[1]);
        if (!root) return json(res, 404, { error:'Gallery not found' });
        const images = await scan(root);
        images.sort((a,b) => `${a.folder}/${a.name}`.localeCompare(`${b.folder}/${b.name}`, 'en', { numeric:true }));
        return json(res, 200, { images });
      }
      const media = /^\/v1\/images\/([a-f0-9]{64})$/.exec(url.pathname);
      if (media && files.has(media[1])) {
        const { root, file } = files.get(media[1]);
        // Revalidate on each read; open with O_NOFOLLOW and stream the validated descriptor.
        const real = await fsp.realpath(file);
        if (!inside(root, real) || real !== file) return json(res, 403, { error:'Outside shared folder' });
        const handle = await fsp.open(real, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
        try {
          // A renamed parent must not redirect the open descriptor outside the selected root.
          const current = await fsp.stat(real);
          const stat = await handle.stat();
          if (!stat.isFile() || stat.ino !== current.ino || stat.dev !== current.dev || await fsp.realpath(file) !== real) return json(res, 403, { error:'File changed; refresh gallery' });
          if (stat.size > MAX_IMAGE_BYTES) return json(res, 413, { error:'Image exceeds 50 MiB limit' });
          res.writeHead(200, { 'Content-Type':FORMATS[path.extname(file).toLowerCase()], 'Content-Length':stat.size, 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' });
          if (req.method === 'HEAD') return res.end();
          const stream = handle.createReadStream({ autoClose:false });
          await new Promise(resolve => { stream.on('error', () => { res.destroy(); resolve(); }); res.on('close', () => { stream.destroy(); resolve(); }); stream.pipe(res); });
        } finally { await handle.close(); }
        return;
      }
      json(res, 404, { error:'Not found' });
    } catch (error) {
      if (!res.headersSent) json(res, error.code === 'ENOENT' ? 404 : 500, { error:'Unable to read shared content' });
      else res.destroy();
    }
  });
  server.requestTimeout = 15000;
  server.headersTimeout = 10000;
  server.maxConnections = 32;
  return { server, newCode, revoke: () => { sessions.clear(); pairing = undefined; }, roots };
}
async function main() {
  const folders = process.argv.slice(2);
  if (!folders.length) throw Error('Usage: node tv-server.js /chosen/gallery [/another/gallery]');
  const state = path.join(os.homedir(), '.image-viewer-pro-tv');
  fs.mkdirSync(state, { recursive:true, mode:0o700 });
  const keyPath = path.join(state, 'key.pem'), certPath = path.join(state, 'cert.pem');
  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','365','-subj','/CN=Image Viewer Pro Local'], { stdio:'ignore' });
    fs.chmodSync(keyPath, 0o600);
  }
  const cert = fs.readFileSync(certPath);
  const share = await createShare({ folders, key:fs.readFileSync(keyPath), cert });
  const port = Number(process.env.TV_PORT || 5443);
  await new Promise((resolve, reject) => { share.server.once('error', reject); share.server.listen(port, process.env.TV_HOST || '0.0.0.0', resolve); });
  console.log('Image Viewer Pro — TLS / read only');
  for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) if (a.family === 'IPv4' && !a.internal) console.log(`Apple TV address: https://${a.address}:${port}`);
  console.log(`Certificate SHA-256: ${new crypto.X509Certificate(cert).fingerprint256}`);
  console.log(`Pairing code (5 minutes, one use): ${share.newCode()}`);
  console.log('Commands: pair = new code; revoke = disconnect all; Ctrl+C = stop');
  for (const root of share.roots) console.log(`Sharing: ${root.root}`);
  readline.createInterface({ input:process.stdin }).on('line', line => {
    if (line.trim() === 'pair') console.log(`Pairing code: ${share.newCode()}`);
    if (line.trim() === 'revoke') { share.revoke(); console.log('All sessions revoked. Type pair to link again.'); }
  });
}
if (require.main === module) main().catch(e => { console.error(e.message); process.exitCode = 1; });
module.exports = { createShare };
