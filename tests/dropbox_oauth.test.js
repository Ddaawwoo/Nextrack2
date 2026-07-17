const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');

function storage() {
  const values = new Map();
  return {
    getItem: key => values.has(key) ? values.get(key) : null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key),
  };
}

function loadIntegration({ href = 'https://ddaawwoo.github.io/Nextrack2/index.html', fetchImpl } = {}) {
  const assigned = [];
  const historyCalls = [];
  const sessionStorage = storage();
  const locationUrl = new URL(href);
  const window = {
    location: {
      href,
      origin: locationUrl.origin,
      pathname: locationUrl.pathname,
      search: locationUrl.search,
      assign: url => assigned.push(url),
    },
    history: {
      replaceState: (...args) => historyCalls.push(args),
    },
  };
  const context = {
    window,
    sessionStorage,
    crypto: webcrypto,
    TextEncoder,
    URL,
    URLSearchParams,
    btoa: value => Buffer.from(value, 'binary').toString('base64'),
    fetch: fetchImpl || (async () => { throw new Error('Unexpected fetch'); }),
    console,
    setTimeout,
    clearTimeout,
    Blob,
    File: globalThis.File || class File extends Blob {
      constructor(parts, name, options = {}) {
        super(parts, options);
        this.name = name;
      }
    },
  };

  const source = fs.readFileSync('dropbox-advanced.js', 'utf8');
  vm.runInNewContext(source, context, { filename: 'dropbox-advanced.js' });
  return { integration: window.DropboxIntegration, assigned, historyCalls, sessionStorage, window };
}

test('signIn opens Dropbox OAuth with PKCE for each user', async () => {
  const { integration, assigned, sessionStorage } = loadIntegration();

  await integration.signIn();

  assert.equal(assigned.length, 1);
  const auth = new URL(assigned[0]);
  assert.equal(auth.origin, 'https://www.dropbox.com');
  assert.equal(auth.pathname, '/oauth2/authorize');
  assert.equal(auth.searchParams.get('client_id'), 'ro3534tr3nfa1fo');
  assert.equal(auth.searchParams.get('response_type'), 'code');
  assert.equal(auth.searchParams.get('redirect_uri'), 'https://ddaawwoo.github.io/Nextrack2/');
  assert.equal(auth.searchParams.get('code_challenge_method'), 'S256');
  assert.ok(auth.searchParams.get('code_challenge'));
  assert.match(auth.searchParams.get('scope'), /files\.content\.read/);
  assert.ok(sessionStorage.getItem('dawomix_dropbox_pkce_verifier'));
  assert.ok(sessionStorage.getItem('dawomix_dropbox_oauth_state'));
});

test('initialize exchanges an OAuth callback code and stores only a session token', async () => {
  const calls = [];
  const fetchImpl = async (url, options) => {
    calls.push({ url, options });
    return {
      ok: true,
      json: async () => ({ access_token: 'user-specific-token' }),
    };
  };
  const env = loadIntegration({
    href: 'https://ddaawwoo.github.io/Nextrack2/index.html?code=abc&state=expected',
    fetchImpl,
  });
  env.sessionStorage.setItem('dawomix_dropbox_pkce_verifier', 'verifier');
  env.sessionStorage.setItem('dawomix_dropbox_oauth_state', 'expected');

  const initialized = await env.integration.initialize();

  assert.equal(initialized, true);
  assert.equal(env.integration.getSignInStatus(), true);
  assert.equal(env.sessionStorage.getItem('dawomix_dropbox_access_token'), 'user-specific-token');
  assert.equal(calls[0].url, 'https://api.dropboxapi.com/oauth2/token');
  const body = new URLSearchParams(calls[0].options.body);
  assert.equal(body.get('code'), 'abc');
  assert.equal(body.get('code_verifier'), 'verifier');
  assert.equal(body.get('client_id'), 'ro3534tr3nfa1fo');
  assert.equal(body.get('redirect_uri'), 'https://ddaawwoo.github.io/Nextrack2/');
  assert.equal(env.historyCalls.length, 1);
});

test('listAudioFiles follows pagination and filters supported audio', async () => {
  const responses = [
    { entries: [
      { '.tag': 'file', name: 'track.mp3', path_lower: '/track.mp3' },
      { '.tag': 'file', name: 'cover.jpg', path_lower: '/cover.jpg' },
    ], has_more: true, cursor: 'next' },
    { entries: [
      { '.tag': 'file', name: 'set.flac', path_lower: '/music/set.flac' },
    ], has_more: false },
  ];
  const env = loadIntegration({
    fetchImpl: async () => ({ ok: true, json: async () => responses.shift() }),
  });
  env.sessionStorage.setItem('dawomix_dropbox_access_token', 'token');

  const files = await env.integration.listAudioFiles();

  assert.equal(files.map(file => file.name).join(','), 'track.mp3,set.flac');
});
