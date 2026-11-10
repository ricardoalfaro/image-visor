const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const { createShare } = require('../tv-server');

let hasFfmpeg = true;
try { execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' }); } catch { hasFfmpeg = false; }

test('videos are listed, served with byte ranges and get a poster', { skip: !hasFfmpeg }, async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ivp-video-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'clips'); await fs.mkdir(root);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc=size=320x180:rate=24', '-t', '1', '-pix_fmt', 'yuv420p', path.join(root, 'clip.mp4')]);
  const size = (await fs.stat(path.join(root, 'clip.mp4'))).size;
  const keyPath = path.join(temp, 'key.pem'), certPath = path.join(temp, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=test'], { stdio: 'ignore' });
  const share = await createShare({ folders: [root], key: await fs.readFile(keyPath), cert: await fs.readFile(certPath), cacheDir: path.join(temp, 'cache') });
  await new Promise(r => share.server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => { share.server.closeAllConnections(); share.server.close(r); }));
  const port = share.server.address().port;
  const get = (route, headers = {}, method = 'GET') => new Promise((resolve, reject) => {
    const req = https.request({ hostname: '127.0.0.1', port, path: route, method, rejectUnauthorized: false, headers }, res => {
      const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, data: Buffer.concat(chunks) }));
    }); req.on('error', reject); req.end();
  });
  const code = share.newCode();
  const token = JSON.parse((await new Promise((resolve, reject) => {
    const req = https.request({ hostname: '127.0.0.1', port, path: '/v1/pair', method: 'POST', rejectUnauthorized: false }, res => { const c = []; res.on('data', d => c.push(d)); res.on('end', () => resolve(Buffer.concat(c))); });
    req.on('error', reject); req.end(JSON.stringify({ code }));
  })).toString()).token;
  const auth = { Authorization: `Bearer ${token}` };
  const [gallery] = JSON.parse((await get('/v1/galleries', auth)).data).galleries;
  const [clip] = JSON.parse((await get(`/v1/galleries/${gallery.id}`, auth)).data).images;
  assert.equal(clip.type, 'video');
  const part = await get(clip.mediaPath, { ...auth, Range: 'bytes=0-99' });
  assert.equal(part.status, 206); assert.equal(part.data.length, 100);
  assert.equal(part.headers['content-range'], `bytes 0-99/${size}`);
  const tail = await get(clip.mediaPath, { ...auth, Range: 'bytes=-10' });
  assert.equal(tail.status, 206); assert.equal(tail.data.length, 10);
  assert.equal((await get(clip.mediaPath, { ...auth, Range: `bytes=${size + 5}-` })).status, 416);
  assert.equal((await get(clip.mediaPath, auth)).data.length, size);
  const poster = await get(clip.thumbPath, auth);
  assert.equal(poster.status, 200); assert.deepEqual(poster.data.subarray(0, 2), Buffer.from([0xff, 0xd8]));
});
