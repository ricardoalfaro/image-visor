const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { Readable } = require('node:stream');
const { execFileSync } = require('node:child_process');
const { createShare } = require('../tv-server');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

test('collections: manifest, upload, listing, pruning, restart', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ivp-col-'));
  t.after(() => fs.rm(temp, { recursive: true, force: true }));
  const keyPath = path.join(temp, 'key.pem'), certPath = path.join(temp, 'cert.pem');
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', keyPath, '-out', certPath, '-days', '1', '-subj', '/CN=test'], { stdio: 'ignore' });
  const key = await fs.readFile(keyPath), cert = await fs.readFile(certPath);
  const collectionsDir = path.join(temp, 'collections');
  const open = async () => {
    const share = await createShare({ folders: [], key, cert, collectionsDir, cacheDir: path.join(temp, 'cache') });
    await new Promise(r => share.server.listen(0, '127.0.0.1', r));
    const port = share.server.address().port;
    const code = share.newCode();
    const call = (route, { method = 'GET', token, body } = {}) => new Promise((resolve, reject) => {
      const req = https.request({ hostname: '127.0.0.1', port, path: route, method, rejectUnauthorized: false, headers: token ? { Authorization: `Bearer ${token}` } : {} }, res => {
        const chunks = []; res.on('data', c => chunks.push(c)); res.on('end', () => { const data = Buffer.concat(chunks); resolve({ status: res.statusCode, data, json: () => JSON.parse(data) }); });
      }); req.on('error', reject); if (body !== undefined) req.write(JSON.stringify(body)); req.end();
    });
    const token = (await call('/v1/pair', { method: 'POST', body: { code } })).json().token;
    return { share, call: (route, o = {}) => call(route, { ...o, token }), close: () => new Promise(r => { share.server.closeAllConnections(); share.server.close(r); }) };
  };

  const a = await open();
  const manifest = [
    { id: 'favorites', name: 'Favoritos', items: [{ key: 'k1', name: 'one.png', size: PNG.length, type: 'image/png' }, { key: 'k2', name: 'two.PNG', size: PNG.length, type: '' }, { key: 'bad', name: 'clip.mov', size: 10, type: 'video/quicktime' }] },
    { id: 'abc-123', name: 'Viaje', items: [] },
    { id: '../evil', name: 'Nope', items: [] },
  ];
  const first = await a.share.setCollections(manifest);
  assert.equal(first.count, 2);
  assert.equal(first.missing.length, 2);
  for (const { collection, file } of first.missing) await a.share.saveCollectionItem(collection, file, Readable.from([PNG]));
  assert.equal((await a.share.setCollections(manifest)).missing.length, 0);
  await assert.rejects(a.share.saveCollectionItem('favorites', '../../x.png', Readable.from([PNG])));
  await assert.rejects(a.share.saveCollectionItem('favorites', 'a'.repeat(64) + '.png', Readable.from([PNG])));

  const galleries = (await a.call('/v1/galleries')).json().galleries;
  const fav = galleries.find(g => g.name === 'Favoritos');
  assert.equal(fav.kind, 'collection'); assert.equal(fav.count, 2);
  assert.ok(!(await fs.readdir(collectionsDir)).includes('..'));
  const images = (await a.call(`/v1/galleries/${fav.id}`)).json().images;
  assert.deepEqual(images.map(i => i.name), ['one.png', 'two.PNG']); // keeps the order of the desktop app
  const shown = await a.call(images[0].displayPath);
  assert.equal(shown.status, 200); assert.deepEqual(shown.data.subarray(0, 2), Buffer.from([0xff, 0xd8]));
  await a.close();

  // Survives a restart, then drops removed items and collections.
  const b = await open();
  assert.equal((await b.call('/v1/galleries')).json().galleries.find(g => g.name === 'Favoritos').count, 2);
  await b.share.setCollections([{ id: 'favorites', name: 'Favoritos', items: [{ key: 'k1', name: 'one.png', size: PNG.length, type: 'image/png' }] }]);
  const after = (await b.call('/v1/galleries')).json().galleries;
  assert.equal(after.length, 1); assert.equal(after[0].count, 1);
  assert.equal((await fs.readdir(path.join(collectionsDir, 'favorites'))).filter(f => f.endsWith('.png')).length, 1);
  await b.close();
});
