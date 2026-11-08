const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const https = require('node:https');
const { execFileSync, execFile } = require('node:child_process');
const { promisify } = require('node:util');
const crypto = require('node:crypto');
const { createShare } = require('../tv-server');

test('TLS share: pairing, scope, symlink checks, read-only and revocation', async t => {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'ivp-tv-'));
  t.after(() => fs.rm(temp, { recursive:true, force:true }));
  const root = path.join(temp, 'gallery'); await fs.mkdir(root);
  await fs.mkdir(path.join(root, 'album'));
  await fs.writeFile(path.join(root, 'album', 'photo2.jpg'), 'image-two');
  await fs.writeFile(path.join(root, 'photo10.png'), 'image-ten');
  await fs.writeFile(path.join(root, 'private.txt'), 'private');
  await fs.writeFile(path.join(root, '.hidden.jpg'), 'hidden');
  const oversized = path.join(root, 'too-big.jpg');
  const large = await fs.open(oversized, 'w'); await large.truncate(50 * 1024 * 1024 + 1); await large.close();
  const outside = path.join(temp, 'outside.jpg'); await fs.writeFile(outside, 'secret');
  await fs.symlink(outside, path.join(root, 'escape.jpg'));
  await fs.symlink(temp, path.join(root, 'escape-dir'));
  const keyPath = path.join(temp, 'key.pem'), certPath = path.join(temp, 'cert.pem');
  execFileSync('openssl', ['req','-x509','-newkey','rsa:2048','-nodes','-keyout',keyPath,'-out',certPath,'-days','1','-subj','/CN=test'], { stdio:'ignore' });
  let now = Date.now();
  const share = await createShare({ folders:[root], key:await fs.readFile(keyPath), cert:await fs.readFile(certPath), now:() => now });
  await new Promise(r => share.server.listen(0, '127.0.0.1', r));
  t.after(() => new Promise(r => { share.server.closeAllConnections(); share.server.close(r); }));
  const port = share.server.address().port;
  const request = (route, { method='GET', token, body, origin } = {}) => new Promise((resolve,reject) => {
    const req = https.request({ hostname:'127.0.0.1', port, path:route, method, rejectUnauthorized:false,
      headers:{ ...(token ? { Authorization:`Bearer ${token}` } : {}), ...(origin ? { Origin:origin } : {}) } }, res => {
      let data = ''; res.on('data', c => data += c); res.on('end', () => resolve({ status:res.statusCode, data, json:() => JSON.parse(data) }));
    }); req.on('error', reject); if (body !== undefined) req.write(JSON.stringify(body)); req.end();
  });
  assert.equal((await request('/v1/galleries')).status, 401);
  let code = share.newCode();
  assert.equal((await request('/v1/pair', { method:'POST', body:{ code:'wrong' } })).status, 403);
  let pair = await request('/v1/pair', { method:'POST', body:{ code } }); assert.equal(pair.status, 200);
  const token = pair.json().token;
  assert.equal((await request('/v1/pair', { method:'POST', body:{ code } })).status, 429);
  const galleries = (await request('/v1/galleries', { token })).json().galleries;
  assert.equal(galleries.length, 1); assert.equal(galleries[0].name, 'gallery');
  assert.ok(!JSON.stringify(galleries).includes(temp));
  const images = (await request(`/v1/galleries/${galleries[0].id}`, { token })).json().images;
  assert.equal(images.length, 2);
  const image = images.find(x => x.name === 'photo2.jpg');
  assert.equal((await request(image.mediaPath, { token })).data, 'image-two');
  assert.equal((await request(image.mediaPath)).status, 401);
  assert.equal((await request(image.mediaPath, { token, method:'HEAD' })).data, '');
  for (const method of ['DELETE','PUT','POST','PATCH']) assert.equal((await request(image.mediaPath, { token, method })).status, 405);
  for (const route of ['/api/folder?path=/','/api/choose-folder','/media?path=/etc/passwd','/server.js','/../README.md','/v1/images/../../etc/passwd']) assert.equal((await request(route, { token })).status, 404);
  assert.equal((await request('/v1/galleries', { token, origin:'https://evil.test' })).status, 403);
  const growing = images.find(x => x.name === 'photo10.png');
  const enlarged = await fs.open(path.join(root, 'photo10.png'), 'r+');
  await enlarged.truncate(50 * 1024 * 1024 + 1); await enlarged.close();
  assert.equal((await request(growing.mediaPath, { token })).status, 413);
  await fs.writeFile(path.join(root, 'photo10.png'), 'image-ten');
  // A file changed to a symlink after indexing must never be served.
  await fs.unlink(path.join(root, 'album', 'photo2.jpg'));
  await fs.symlink(outside, path.join(root, 'album', 'photo2.jpg'));
  assert.equal((await request(image.mediaPath, { token })).status, 403);
  // Nor may a parent directory be replaced with a symlink.
  await fs.unlink(path.join(root, 'album', 'photo2.jpg'));
  await fs.rmdir(path.join(root, 'album'));
  await fs.symlink(temp, path.join(root, 'album'));
  assert.notEqual((await request(image.mediaPath, { token })).status, 200);
  assert.equal(await fs.readFile(outside, 'utf8'), 'secret');
  code = share.newCode(); now += 300001;
  assert.equal((await request('/v1/pair', { method:'POST', body:{ code } })).status, 429);
  code = share.newCode();
  for (let i=0; i<10; i++) assert.equal((await request('/v1/pair', { method:'POST', body:{ code:'wrong' } })).status, 403);
  assert.equal((await request('/v1/pair', { method:'POST', body:{ code } })).status, 429);
  now += 12 * 3600000;
  assert.equal((await request('/v1/galleries', { token })).status, 401);
  code = share.newCode(); pair = await request('/v1/pair', { method:'POST', body:{ code } });
  if (process.env.NATIVE_SMOKE_BINARY) {
    const code = share.newCode();
    const fingerprint = new crypto.X509Certificate(await fs.readFile(certPath)).fingerprint256;
    const { stdout } = await promisify(execFile)(process.env.NATIVE_SMOKE_BINARY, [`https://127.0.0.1:${port}`, code, fingerprint]);
    console.log(stdout.trim());
  }
  share.revoke();
  assert.equal((await request('/v1/galleries', { token:pair.json().token })).status, 401);
});

test('desktop server rejects a LAN bind and preserves default loopback', async () => {
  const { spawn } = require('node:child_process');
  const blocked = spawn(process.execPath, ['server.js'], { cwd:path.join(__dirname, '..'), env:{ ...process.env, HOST:'0.0.0.0', PORT:'0' } });
  let error = ''; blocked.stderr.on('data', chunk => error += chunk);
  const exit = await new Promise(resolve => blocked.on('exit', resolve));
  assert.notEqual(exit, 0); assert.match(error, /loopback-only/);
  const local = spawn(process.execPath, ['server.js'], { cwd:path.join(__dirname, '..'), env:{ ...process.env, HOST:'127.0.0.1', PORT:'0' } });
  try {
    const output = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(Error('Desktop server did not start')), 5000);
      local.stdout.once('data', chunk => { clearTimeout(timer); resolve(String(chunk)); });
      local.once('error', error => { clearTimeout(timer); reject(error); });
    });
    assert.match(output, /http:\/\/127\.0\.0\.1:/);
  } finally { local.kill(); }
});
