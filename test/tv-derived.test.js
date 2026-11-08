const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { execFileSync } = require('node:child_process');
const { createShare } = require('../tv-server');

// 1x1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('persistent sessions, stable ids, covers and resized images', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ivp-derived-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const root = path.join(temp, 'trip'); await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'a.png'), PNG);
  await fs.writeFile(path.join(root, 'broken.jpg'), 'not an image');
  const keyPath = path.join(temp, 'key.pem'), certPath = path.join(temp, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=test'], { stdio: 'ignore' });
  const key = await fs.readFile(keyPath), cert = await fs.readFile(certPath);
  let saved = {};
  const sessionStore = { load: () => new Map(Object.entries(saved)), save: map => { saved = Object.fromEntries(map); } };
  const open = async () => {
    const share = await createShare({ folders: [root], key, cert, sessionStore, cacheDir: path.join(temp, 'cache') });
    await new Promise(r => share.server.listen(0, '127.0.0.1', r));
    const port = share.server.address().port;
    const request = (route, { method = 'GET', token, body } = {}) => new Promise((resolve, reject) => {
      const req = https.request({ hostname: '127.0.0.1', port, path: route, method, rejectUnauthorized: false, headers: token ? { Authorization: `Bearer ${token}` } : {} }, res => {
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => { const data = Buffer.concat(chunks); resolve({ status: res.statusCode, type: res.headers['content-type'], data, json: () => JSON.parse(data) }); });
      }); req.on('error', reject); if (body !== undefined) req.write(JSON.stringify(body)); req.end();
    });
    const close = () => new Promise(r => { share.server.closeAllConnections(); share.server.close(r); });
    return { share, request, close };
  };

  const first = await open();
  const code = first.share.newCode();
  const token = (await first.request('/v1/pair', { method: 'POST', body: { code } })).json().token;
  assert.ok(!JSON.stringify(saved).includes(token), 'token must be stored hashed');
  const galleries = (await first.request('/v1/galleries', { token })).json().galleries;
  assert.equal(galleries[0].count, 2);
  assert.match(galleries[0].cover, /^\/v1\/thumbs\/[a-f0-9]{64}$/);
  const images = (await first.request(`/v1/galleries/${galleries[0].id}`, { token })).json().images;
  const png = images.find(i => i.name === 'a.png'), broken = images.find(i => i.name === 'broken.jpg');
  for (const route of [png.displayPath, png.thumbPath]) {
    const res = await first.request(route, { token });
    assert.equal(res.status, 200); assert.equal(res.type, 'image/jpeg'); assert.deepEqual(res.data.subarray(0, 2), Buffer.from([0xff, 0xd8]));
    assert.equal((await first.request(route)).status, 401);
  }
  assert.equal((await first.request(broken.displayPath, { token })).status, 415);
  await first.close();

  // After a restart the same Apple TV keeps working and ids do not change.
  const second = await open();
  const again = (await second.request('/v1/galleries', { token })).json().galleries;
  assert.equal(again[0].id, galleries[0].id);
  const reloaded = (await second.request(`/v1/galleries/${again[0].id}`, { token })).json().images;
  assert.equal(reloaded.find(i => i.name === 'a.png').id, png.id);
  second.share.revoke();
  assert.equal((await second.request('/v1/galleries', { token })).status, 401);
  await second.close();
});
