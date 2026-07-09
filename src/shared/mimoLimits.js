'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { hashKey } = require('./hashKey');
const { sharedDataDir, writeJsonAtomic } = require('./config');
const { normalizeLimitProvider } = require('./limits');

const MIMO_PLATFORM_URL = 'https://platform.xiaomimimo.com';
const MIMO_PLATFORM_CONSOLE_URL = 'https://platform.xiaomimimo.com/console/plan-manage';
const MIMO_USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/132.0.0.0 Safari/537.36';
const MIMO_LOGIN_HOST_SUFFIXES = ['xiaomimimo.com', 'xiaomi.com', 'mi.com'];
const MIMO_LOGIN_BLOCKED_PROTOCOLS = new Set(['about:', 'chrome:', 'chrome-extension:', 'data:', 'devtools:', 'file:', 'filesystem:', 'javascript:', 'vbscript:']);

function cleanText(value) {
  let raw = value;
  if (typeof raw !== 'string') return '';
  raw = raw.trim();
  if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
    raw = raw.slice(1, -1).trim();
  }
  return raw;
}

function normalizeDataDir(value) {
  const raw = String(value || '').trim();
  return raw ? path.resolve(raw) : '';
}

function parseMimoLoginUrl(value) {
  try {
    return new URL(String(value || ''));
  } catch (_) {
    return null;
  }
}

function isMimoLoginHost(hostname) {
  const host = String(hostname || '').toLowerCase();
  if (!host) return false;
  return MIMO_LOGIN_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

function cookieDomainHost(value) {
  return String(value || '').trim().toLowerCase().replace(/^\.+/, '');
}

function mimoSessionCookieMatches(cookie) {
  if (!cookie || typeof cookie !== 'object') return false;
  const domainHost = cookieDomainHost(cookie.domain);
  if (domainHost && isMimoLoginHost(domainHost)) return true;
  const parsed = parseMimoLoginUrl(cookie.url);
  return Boolean(parsed && isMimoLoginHost(parsed.hostname));
}

function filterMimoSessionCookies(cookies) {
  const filtered = [];
  const seen = new Set();
  for (const cookie of Array.isArray(cookies) ? cookies : []) {
    if (!mimoSessionCookieMatches(cookie)) continue;
    const key = [
      String(cookie?.name || '').trim(),
      cookieDomainHost(cookie?.domain),
      String(cookie?.path || '').trim()
    ].join('\0');
    if (seen.has(key)) continue;
    seen.add(key);
    filtered.push(cookie);
  }
  return filtered;
}

function shouldCaptureMimoSessionForUrl(value) {
  const parsed = parseMimoLoginUrl(value);
  if (!parsed) return false;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return isMimoLoginHost(parsed.hostname);
}

function isMimoLoginHttpUrl(value) {
  const parsed = parseMimoLoginUrl(value);
  if (!parsed) return false;
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  return isMimoLoginHost(parsed.hostname);
}

function isMimoLoginExternalProtocolUrl(value) {
  const parsed = parseMimoLoginUrl(value);
  if (!parsed) return false;
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') return false;
  return !MIMO_LOGIN_BLOCKED_PROTOCOLS.has(parsed.protocol);
}

function formatMimoLoginUrlForLog(value) {
  const parsed = parseMimoLoginUrl(value);
  if (!parsed) return 'invalid-url';
  const pathname = parsed.pathname && parsed.pathname !== '/' ? parsed.pathname : parsed.pathname || '';
  if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
    return `${parsed.protocol}//${parsed.hostname}${pathname}`;
  }
  const hostPart = parsed.hostname ? `//${parsed.hostname}` : '';
  return `${parsed.protocol}${hostPart}${pathname}`;
}

function classifyMimoLoginUrl(value) {
  const parsed = parseMimoLoginUrl(value);
  if (!parsed) {
    return {
      action: 'block',
      reason: 'invalid_url',
      protocol: '',
      hostname: '',
      displayUrl: 'invalid-url'
    };
  }

  const protocol = parsed.protocol;
  const hostname = parsed.hostname || '';
  const displayUrl = formatMimoLoginUrlForLog(parsed.href);
  if (MIMO_LOGIN_BLOCKED_PROTOCOLS.has(protocol)) {
    return {
      action: 'block',
      reason: 'dangerous_protocol',
      protocol,
      hostname,
      displayUrl
    };
  }

  if (protocol === 'http:' || protocol === 'https:') {
    if (isMimoLoginHost(hostname)) {
      return {
        action: 'child',
        reason: 'mimo_login_http',
        protocol,
        hostname,
        displayUrl
      };
    }
    return {
      action: 'block',
      reason: 'unsupported_http_url',
      protocol,
      hostname,
      displayUrl
    };
  }

  return {
    action: 'external',
    reason: 'external_protocol',
    protocol,
    hostname,
    displayUrl
  };
}

function resolveMimoDataDir(options = {}, deps = {}) {
  const env = deps.env || process.env;
  const explicit = normalizeDataDir(
    options.mimoDataDir
    || deps.mimoDataDir
    || env.TOKEN_MONITOR_MIMO_DATA_DIR
  );
  if (explicit) return explicit;
  return path.join(sharedDataDir({ env, platform: deps.platform, homeDir: deps.homeDir }), 'mimo');
}

function candidateMimoDataDirs(options = {}, deps = {}) {
  return [resolveMimoDataDir(options, deps)];
}

function normalizeMimoManagedAccounts(value) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  const accounts = [];
  for (const account of value) {
    if (!account || typeof account !== 'object') continue;
    const id = String(account.id || '').trim();
    const accountKey = String(account.accountKey || '').trim();
    const dataDir = normalizeDataDir(account.dataDir);
    if (!id || !accountKey || !dataDir) continue;
    if (seen.has(accountKey)) continue;
    seen.add(accountKey);
    accounts.push({
      id,
      accountKey,
      accountName: String(account.accountName || '').trim(),
      accountLabel: String(account.accountLabel || '').trim(),
      dataDir,
      enabled: account.enabled !== false
    });
  }
  return accounts;
}

function base64UrlToBuffer(value) {
  const raw = cleanText(value);
  if (!raw) return null;
  const normalized = raw.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized.length % 4 === 0 ? normalized : normalized + '='.repeat(4 - (normalized.length % 4));
  return Buffer.from(padded, 'base64');
}

function decryptFernetToken(token, keyText) {
  const key = base64UrlToBuffer(keyText);
  if (!key || key.length !== 32) {
    throw new Error('invalid fernet key');
  }
  const data = base64UrlToBuffer(token);
  if (!data || data.length < 1 + 8 + 16 + 32) {
    throw new Error('invalid fernet token');
  }
  if (data[0] !== 0x80) {
    throw new Error('unsupported fernet token version');
  }

  const macOffset = data.length - 32;
  const body = data.subarray(0, macOffset);
  const mac = data.subarray(macOffset);
  const signingKey = key.subarray(0, 16);
  const encryptionKey = key.subarray(16);
  const expectedMac = crypto.createHmac('sha256', signingKey).update(body).digest();
  if (mac.length !== expectedMac.length || !crypto.timingSafeEqual(mac, expectedMac)) {
    throw new Error('invalid fernet signature');
  }

  const iv = data.subarray(9, 25);
  const ciphertext = data.subarray(25, macOffset);
  const decipher = crypto.createDecipheriv('aes-128-cbc', encryptionKey, iv);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  const pad = plaintext[plaintext.length - 1];
  if (!pad || pad > 16) {
    throw new Error('invalid fernet padding');
  }
  for (let index = 0; index < pad; index += 1) {
    if (plaintext[plaintext.length - 1 - index] !== pad) {
      throw new Error('invalid fernet padding');
    }
  }
  return plaintext.subarray(0, plaintext.length - pad).toString('utf8');
}

async function readStoredJson(filePath, deps = {}) {
  const readFile = deps.readFile || fs.promises.readFile;
  try {
    const text = await readFile(filePath, 'utf8');
    if (typeof text !== 'string') return { present: true, value: null };
    let raw;
    try {
      raw = JSON.parse(text);
    } catch (_) {
      raw = text.trim();
    }
    return { present: true, value: raw };
  } catch (error) {
    if (error?.code === 'ENOENT') return { present: false, value: null };
    return { present: false, value: null, error };
  }
}

async function readSessionJson(filePath, dataDir, deps = {}) {
  const read = await readStoredJson(filePath, deps);
  if (!read.present) return read;
  if (typeof read.value !== 'string') return { present: true, value: read.value };

  const token = cleanText(read.value);
  if (!token.startsWith('gAAAAA')) {
    return { present: true, value: read.value };
  }

  const keyPath = path.join(dataDir, '.key');
  const keyRead = await readStoredJson(keyPath, deps);
  if (!keyRead.present || typeof keyRead.value !== 'string' || !cleanText(keyRead.value)) {
    return { present: false, value: null, error: Object.assign(new Error(`Missing MiMo session key in ${dataDir}`), { code: 'MIMO_KEY_MISSING' }) };
  }

  try {
    const plaintext = decryptFernetToken(token, keyRead.value);
    return { present: true, value: JSON.parse(plaintext) };
  } catch (error) {
    return { present: false, value: null, error: Object.assign(error, { code: 'MIMO_DECRYPT_FAILED' }) };
  }
}

function selectCurrentAccount(accountsStore) {
  if (!accountsStore || typeof accountsStore !== 'object') return {};
  const accounts = Array.isArray(accountsStore.accounts) ? accountsStore.accounts : [];
  const currentId = String(accountsStore.current_account_id || '').trim();
  if (currentId) {
    const current = accounts.find((account) => String(account?.account_id || '').trim() === currentId);
    if (current && typeof current === 'object') return current;
  }
  for (const account of accounts) {
    if (account && typeof account === 'object') return account;
  }
  return {};
}

function cookieHeaderFor(cookies) {
  const parts = [];
  for (const cookie of cookies || []) {
    if (!cookie || typeof cookie !== 'object') continue;
    const name = String(cookie.name || '').trim();
    const value = cookie.value;
    if (!name || value === undefined || value === null) continue;
    parts.push(`${name}=${String(value)}`);
  }
  return parts.join('; ');
}

async function loadMimoSessionContextForDir(dataDir, deps = {}) {
  const cookiesRead = await readSessionJson(path.join(dataDir, 'cookies.json'), dataDir, deps);
  if (cookiesRead.error) return { status: 'unavailable', issue: 'session_read_failed', dataDir, error: cookiesRead.error };

  const accountsRead = await readSessionJson(path.join(dataDir, 'accounts.json'), dataDir, deps);
  if (accountsRead.error) return { status: 'unavailable', issue: 'session_read_failed', dataDir, error: accountsRead.error };

  const endpointsRead = await readStoredJson(path.join(dataDir, 'endpoints.json'), deps);
  const configRead = await readStoredJson(path.join(dataDir, 'config.json'), deps);
  const snapshotRead = await readStoredJson(path.join(dataDir, 'balance_snapshot.json'), deps);
  const statusRead = await readStoredJson(path.join(dataDir, 'status.json'), deps);

  const accountStore = accountsRead.present && accountsRead.value && typeof accountsRead.value === 'object' ? accountsRead.value : {};
  const selectedAccount = selectCurrentAccount(accountStore);
  let cookies = Array.isArray(cookiesRead.value) ? cookiesRead.value : [];
  if (cookies.length === 0 && Array.isArray(selectedAccount.cookies)) {
    cookies = selectedAccount.cookies;
  }
  if (cookies.length === 0) {
    const statusMeta = statusRead.present && statusRead.value && typeof statusRead.value === 'object'
      ? statusRead.value
      : {};
    if (statusMeta.status === 'unauthorized') {
      return { status: 'unauthorized', issue: 'session_expired', dataDir, statusMeta };
    }
    if (statusMeta.status === 'unavailable') {
      return { status: 'unavailable', issue: String(statusMeta.issue || 'session_unavailable').trim() || 'session_unavailable', dataDir, statusMeta };
    }
    return { status: 'notConfigured', issue: 'missing_session_files', dataDir };
  }

  let endpoints = endpointsRead.present && endpointsRead.value && typeof endpointsRead.value === 'object' ? endpointsRead.value : {};
  if (Object.keys(endpoints).length === 0 && selectedAccount.endpoints && typeof selectedAccount.endpoints === 'object') {
    endpoints = selectedAccount.endpoints;
  }

  const config = configRead.present && configRead.value && typeof configRead.value === 'object' ? configRead.value : {};
  const balanceSnapshot = snapshotRead.present && snapshotRead.value && typeof snapshotRead.value === 'object' ? snapshotRead.value : null;

  return {
    status: 'ok',
    issue: '',
    dataDir,
    cookies,
    cookieHeader: cookieHeaderFor(cookies),
    account: selectedAccount,
    endpoints,
    config,
    balanceSnapshot,
    statusMeta: statusRead.present && statusRead.value && typeof statusRead.value === 'object' ? statusRead.value : null
  };
}

async function loadMimoSessionContext(options = {}, deps = {}) {
  const candidates = candidateMimoDataDirs(options, deps);
  let lastNotConfigured = null;
  let lastUnavailable = null;
  for (const dataDir of candidates) {
    const context = await loadMimoSessionContextForDir(dataDir, deps);
    if (context.status === 'ok') return context;
    if (context.status === 'unavailable') {
      lastUnavailable = context;
      continue;
    }
    if (context.status === 'notConfigured') {
      lastNotConfigured = context;
      continue;
    }
    return context;
  }
  return lastUnavailable
    || lastNotConfigured
    || { status: 'notConfigured', issue: 'missing_session_files', dataDir: candidates[0] || '', cookies: [] };
}

function valueFromAliases(object, aliases) {
  if (!object || typeof object !== 'object') return undefined;
  for (const alias of aliases) {
    if (object[alias] !== undefined && object[alias] !== null) return object[alias];
  }
  return undefined;
}

function numberFromAliases(object, aliases) {
  const value = valueFromAliases(object, aliases);
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[%,$]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeMimoPercent(value, used = null, limit = null) {
  const explicit = typeof value === 'number' && Number.isFinite(value)
    ? value
    : (typeof value === 'string' && value.trim() !== '' ? Number(value.replace(/[%,$]/g, '')) : null);
  if (explicit !== null && Number.isFinite(explicit)) {
    const percent = explicit > 0 && explicit <= 1 ? explicit * 100 : explicit;
    return Math.max(0, Math.min(100, percent));
  }
  if (used !== null && limit !== null && limit > 0) {
    return Math.max(0, Math.min(100, (used / limit) * 100));
  }
  return null;
}

function normalizeDateText(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? (raw.length <= 32 ? raw : '') : parsed.toISOString().slice(0, 10);
}

function extractItems(input) {
  if (Array.isArray(input)) return input.filter((item) => item && typeof item === 'object');
  if (!input || typeof input !== 'object') return [];
  const candidates = [input.items, input.rows, input.list, input.data?.items, input.data?.rows, input.data?.list];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) return candidate.filter((item) => item && typeof item === 'object');
  }
  return [];
}

function planStatusFromValue(value) {
  const status = String(value || '').trim().toLowerCase().replace(/[\s-]+/g, '_');
  if (!status) return null;
  if (/(expired|expire|inactive|invalid|ended|cancel|closed|finished|terminated)/.test(status)) return 'expired';
  if (/(active|valid|effective|available|ongoing|in_effect)/.test(status)) return 'active';
  return null;
}

function planExpiryMs(record) {
  const value = valueFromAliases(record, [
    'expiresAt', 'expires_at', 'expireAt', 'expire_at', 'expiryTime', 'expiry_time',
    'endTime', 'end_time', 'endDate', 'end_date', 'currentPeriodEnd', 'current_period_end',
    'validUntil', 'valid_until'
  ]);
  if (typeof value === 'number' && Number.isFinite(value)) return value < 1e12 ? value * 1000 : value;
  const parsed = Date.parse(String(value || '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function booleanFromAliases(object, aliases) {
  const value = valueFromAliases(object, aliases);
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number' && (value === 0 || value === 1)) return value === 1;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1') return true;
    if (normalized === 'false' || normalized === '0') return false;
  }
  return null;
}

// `/tokenPlan/detail` is the current account's plan record. `/tokenPlan/list`
// is only the purchasable-plan catalogue, so its `active` values must never
// influence the account's quota state.
function mimoPlanStatus(detailResult, now) {
  if (!detailResult?.ok || !detailResult.body || typeof detailResult.body !== 'object' || Array.isArray(detailResult.body)) return null;
  const detail = detailResult.body;
  const expiredFlag = booleanFromAliases(detail, ['expired', 'isExpired', 'is_expired']);
  if (expiredFlag === true) return 'expired';
  const expiresAt = planExpiryMs(detail);
  if (expiresAt !== null) return expiresAt > now ? 'active' : 'expired';
  const status = planStatusFromValue(valueFromAliases(detail, ['status', 'planStatus', 'plan_status', 'state', 'planState', 'plan_state']));
  if (status) return status;
  return expiredFlag === false ? 'active' : null;
}

function unwrapApiBody(body) {
  if (!body || typeof body !== 'object') return body;
  if (body.code === 0 && Object.hasOwn(body, 'data')) return body.data;
  if (Object.hasOwn(body, 'data') && !Object.hasOwn(body, 'code')) return body.data;
  return body;
}

function safeOrigin(urlValue) {
  try {
    return new URL(urlValue).origin;
  } catch (_) {
    return MIMO_PLATFORM_URL;
  }
}

function baseUrlForSource(source, config = {}) {
  if (source === 'token_plan') {
    return config.token_plan_base_url
      || config.token_plan_api_base_url
      || config.platform_url
      || config.platform_api_base_url
      || MIMO_PLATFORM_URL;
  }
  return config.platform_url
    || config.platform_api_base_url
    || MIMO_PLATFORM_URL;
}

function refererForSource(source, config = {}) {
  if (source === 'token_plan') {
    return config.token_plan_console_url
      || config.platform_console_url
      || MIMO_PLATFORM_CONSOLE_URL;
  }
  return config.platform_console_url || MIMO_PLATFORM_CONSOLE_URL;
}

function requestHeaders(cookieHeader, source, config = {}) {
  const headers = {
    'User-Agent': MIMO_USER_AGENT,
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'zh-CN,zh;q=0.9'
  };
  const cookie = cleanText(cookieHeader);
  if (cookie) headers.Cookie = cookie;
  headers.Origin = safeOrigin(baseUrlForSource(source, config));
  headers.Referer = refererForSource(source, config);
  return headers;
}

async function requestJson(url, init = {}, deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch;
  const timeoutMs = Number(deps.fetchTimeoutMs || 12000);
  const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = controller ? setTimeout(() => controller.abort(), timeoutMs) : null;
  const headers = init.headers || {};
  const meta = {
    method: init.method || 'GET',
    headerNames: Object.keys(headers).sort(),
    hasCookie: Boolean(headers.Cookie)
  };
  try {
    const response = await fetchFn(url, {
      method: meta.method,
      headers,
      body: init.body,
      signal: controller ? controller.signal : undefined
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, status: 'unauthorized', url, httpStatus: response.status, ...meta };
    }
    if (response.status === 429) {
      return { ok: false, status: 'sourceRateLimited', url, httpStatus: response.status, ...meta };
    }
    if (!response.ok) {
      return { ok: false, status: 'unavailable', url, httpStatus: response.status, ...meta };
    }
    let body;
    try {
      body = await response.json();
    } catch (_) {
      return { ok: false, status: 'unavailable', url, httpStatus: response.status, ...meta };
    }
    return { ok: true, status: 'ok', url, httpStatus: response.status, body: unwrapApiBody(body), ...meta };
  } catch (error) {
    if (error?.name === 'AbortError') return { ok: false, status: 'unavailable', url, ...meta };
    return { ok: false, status: 'unavailable', url, error, ...meta };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function discoveredUrlsForPath(source, targetPath, config = {}, endpoints = {}) {
  const base = baseUrlForSource(source, config).replace(/\/+$/, '');
  const discovered = endpoints && typeof endpoints === 'object' ? endpoints.discovered_apis : null;
  if (!discovered || typeof discovered !== 'object') return [];
  const matches = [];
  for (const candidate of Object.keys(discovered)) {
    if (!candidate.startsWith(base)) continue;
    try {
      if (new URL(candidate).pathname.replace(/\/+$/, '') === targetPath.replace(/\/+$/, '')) {
        matches.push(candidate);
      }
    } catch (_) {}
  }
  return matches;
}

async function requestFirst({
  cookieHeader,
  sourceKeys,
  method,
  paths,
  config,
  endpoints,
  payload,
  params
}, deps = {}) {
  let sawUnauthorized = false;
  let sawRateLimited = false;
  const attempts = [];
  const remember = (result) => {
    if (result) attempts.push(result);
    return result;
  };
  for (const source of sourceKeys) {
    const headers = requestHeaders(cookieHeader, source, config);
    const base = baseUrlForSource(source, config).replace(/\/+$/, '');
    const seen = new Set();
    for (const targetPath of paths) {
      for (const url of discoveredUrlsForPath(source, targetPath, config, endpoints)) {
        if (seen.has(url)) continue;
        seen.add(url);
        const init = { method, headers: { ...headers } };
        if (method === 'POST' && payload) {
          init.body = JSON.stringify(payload);
          init.headers['Content-Type'] = 'application/json';
        }
        const result = remember(await requestJson(url, init, deps));
        if (result.ok) return { ...result, source, attempts };
        if (result.status === 'unauthorized') sawUnauthorized = true;
        if (result.status === 'sourceRateLimited') sawRateLimited = true;
      }

      const url = `${base}${targetPath}`;
      if (seen.has(url)) continue;
      seen.add(url);
      const init = { method, headers: { ...headers } };
      if (method === 'POST' && payload) {
        init.body = JSON.stringify(payload);
        init.headers['Content-Type'] = 'application/json';
      }
      if (params && Object.keys(params).length) {
        const parsed = new URL(url);
        for (const [key, value] of Object.entries(params)) {
          if (value === undefined || value === null || value === '') continue;
          parsed.searchParams.set(key, String(value));
        }
        const result = remember(await requestJson(parsed.toString(), init, deps));
        if (result.ok) return { ...result, source, attempts };
        if (result.status === 'unauthorized') sawUnauthorized = true;
        if (result.status === 'sourceRateLimited') sawRateLimited = true;
        continue;
      }
      const result = remember(await requestJson(url, init, deps));
      if (result.ok) return { ...result, source, attempts };
      if (result.status === 'unauthorized') sawUnauthorized = true;
      if (result.status === 'sourceRateLimited') sawRateLimited = true;
    }
  }

  if (sawUnauthorized) return { ok: false, status: 'unauthorized', attempts };
  if (sawRateLimited) return { ok: false, status: 'sourceRateLimited', attempts };
  return { ok: false, status: 'unavailable', attempts };
}

function parseTokenPlanUsage(data) {
  if (!data || typeof data !== 'object') return {};
  let planUsed = numberFromAliases(data, ['plan_used', 'planUsed', 'used']);
  let planLimit = numberFromAliases(data, ['plan_limit', 'planLimit', 'limit']);
  let planPercent = normalizeMimoPercent(numberFromAliases(data, ['plan_percent', 'planPercent', 'percent']), planUsed, planLimit);
  const applyPlanFields = (source) => {
    if (!source || typeof source !== 'object') return;
    const used = numberFromAliases(source, ['used', 'plan_used', 'planUsed']);
    const limit = numberFromAliases(source, ['limit', 'plan_limit', 'planLimit']);
    const percent = normalizeMimoPercent(numberFromAliases(source, ['percent', 'plan_percent', 'planPercent']), used, limit);
    if (planUsed === null) planUsed = used;
    if (planLimit === null) planLimit = limit;
    if (planPercent === null) planPercent = percent;
  };
  const monthUsageSource = data.monthUsage || data.month_usage || data.month_usage_list || data.monthUsageList;
  applyPlanFields(monthUsageSource);
  const monthUsageItems = extractItems(monthUsageSource);
  if (monthUsageItems.length > 0) applyPlanFields(monthUsageItems[0]);
  const usageSource = data.usage || data.todayUsage || data.token_usage || data.tokenUsage;
  applyPlanFields(usageSource);
  const usageItems = extractItems(usageSource);
  if (usageItems.length > 0) applyPlanFields(usageItems[0]);
  let todayTokenTotal = numberFromAliases(data, ['today_token_total', 'todayTokenTotal']);
  if (todayTokenTotal === null) {
    const planTotal = usageItems.find((item) => String(item.name || item.key || '').trim() === 'plan_total_token');
    if (planTotal) {
      todayTokenTotal = numberFromAliases(planTotal, ['used', 'totalToken', 'total_token']);
    }
  }
  if (planPercent === null) planPercent = normalizeMimoPercent(null, planUsed, planLimit);
  return { planUsed, planLimit, planPercent, todayTokenTotal };
}

function parseUsageRowsResponse(data) {
  const rows = extractItems(data);
  const byDate = new Map();
  for (const row of rows) {
    const date = String(row.date || row.day || row.usage_date || row.usageDate || '').trim();
    if (!date) continue;
    const totalToken = numberFromAliases(row, ['totalToken', 'total_token', 'totalTokens', 'total_tokens', 'used']);
    if (!Number.isFinite(totalToken) || totalToken <= 0) continue;
    byDate.set(date, (byDate.get(date) || 0) + totalToken);
  }
  return byDate;
}

function parseSnapshotUsageFields(snapshot) {
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const planUsed = numberFromAliases(snap, ['plan_used', 'planUsed', 'used']);
  const planLimit = numberFromAliases(snap, ['plan_limit', 'planLimit', 'limit']);
  return {
    planUsed,
    planLimit,
    planPercent: normalizeMimoPercent(numberFromAliases(snap, ['plan_percent', 'planPercent', 'percent']), planUsed, planLimit),
    todayTokenTotal: numberFromAliases(snap, ['today_token_total', 'todayTokenTotal']),
    todayUsageDate: normalizeDateText(snap.today_usage_date ?? snap.todayUsageDate ?? snap.date),
    latestModelUsageDate: normalizeDateText(snap.latest_model_usage_date ?? snap.latestModelUsageDate),
    todayUsageBasis: String(snap.today_usage_basis ?? snap.todayUsageBasis ?? '').trim().slice(0, 64),
    planStatus: planStatusFromValue(snap.plan_status ?? snap.planStatus)
  };
}

function buildUsageSummary(detailResults, todayKey) {
  const byDate = new Map();
  let sawDetailResponse = false;
  for (const result of detailResults) {
    if (!result) continue;
    if (result.ok && result.body !== undefined) sawDetailResponse = true;
    if (!result.ok || !result.body) continue;
    const rows = parseUsageRowsResponse(result.body);
    for (const [date, total] of rows.entries()) {
      byDate.set(date, (byDate.get(date) || 0) + total);
    }
  }
  const dates = Array.from(byDate.keys()).sort((a, b) => b.localeCompare(a));
  const latestModelUsageDate = dates[0] || '';
  const todayTokenTotal = byDate.has(todayKey) ? byDate.get(todayKey) : null;
  let todayUsageBasis = '';
  if (dates.length > 0) {
    todayUsageBasis = byDate.has(todayKey) ? 'model_usage_today_rows' : 'model_usage_no_today_rows';
  } else if (sawDetailResponse) {
    todayUsageBasis = 'model_usage_no_rows';
  }
  return {
    todayTokenTotal,
    latestModelUsageDate,
    todayUsageBasis
  };
}

function balanceNumberFrom(value) {
  return numberFromAliases(value, ['balance', 'account_balance', 'accountBalance', 'amount']);
}

function buildBalanceObject(liveBalance, snapshot, usageSummary) {
  const live = liveBalance && typeof liveBalance === 'object' ? liveBalance : {};
  const snap = snapshot && typeof snapshot === 'object' ? snapshot : {};
  const snapshotUsage = parseSnapshotUsageFields(snap);
  const planExpired = usageSummary?.planStatus === 'expired';
  const amount = balanceNumberFrom(live) ?? balanceNumberFrom(snap);
  const giftBalance = numberFromAliases(live, ['giftBalance', 'gift_balance']) ?? numberFromAliases(snap, ['gift_balance']);
  const cashBalance = numberFromAliases(live, ['cashBalance', 'cash_balance']) ?? numberFromAliases(snap, ['cash_balance']);
  const currency = String(
    valueFromAliases(live, ['currency', 'balanceCurrency', 'balance_currency'])
    || valueFromAliases(snap, ['currency'])
    || 'CNY'
  ).trim().toUpperCase().slice(0, 8) || 'CNY';
  if (
    amount === null
    && giftBalance === null
    && cashBalance === null
    && !usageSummary
    && !snap.date
  ) {
    return null;
  }
  return {
    amount,
    currency,
    giftBalance,
    cashBalance,
    snapshotDate: normalizeDateText(snap.date),
    planUsed: planExpired ? null : (usageSummary?.planUsed ?? snapshotUsage.planUsed ?? null),
    planLimit: planExpired ? null : (usageSummary?.planLimit ?? snapshotUsage.planLimit ?? null),
    planPercent: planExpired ? null : (usageSummary?.planPercent ?? snapshotUsage.planPercent ?? null),
    planStatus: usageSummary?.planStatus ?? snapshotUsage.planStatus ?? null,
    todayTokenTotal: usageSummary?.todayTokenTotal ?? snapshotUsage.todayTokenTotal ?? null,
    todayUsageDate: normalizeDateText(usageSummary?.todayUsageDate || snapshotUsage.todayUsageDate),
    latestModelUsageDate: normalizeDateText(usageSummary?.latestModelUsageDate || snapshotUsage.latestModelUsageDate),
    todayUsageBasis: String(usageSummary?.todayUsageBasis || snapshotUsage.todayUsageBasis || '').trim().slice(0, 64)
  };
}

function accountKeyFor(account, cookies) {
  const accountId = String(account?.account_id || account?.user_id || '').trim();
  if (accountId) return hashKey('mimo', accountId);
  const cookieSeed = Array.isArray(cookies)
    ? cookies.map((cookie) => `${String(cookie?.name || '').trim()}:${String(cookie?.domain || '').trim()}`).filter(Boolean).join('|')
    : '';
  if (cookieSeed) return hashKey('mimo', cookieSeed);
  return hashKey('mimo', 'current');
}

function limitProviderForStatus(status, updatedAt) {
  return normalizeLimitProvider({
    provider: 'mimo',
    source: 'web',
    status,
    updatedAt,
    windows: []
  });
}

function buildMimoAccountRecord(profile, account, cookies, updatedAt) {
  const resolvedAccount = account && typeof account === 'object' ? account : {};
  const accountId = String(
    valueFromAliases(profile, ['userId', 'user_id', 'accountId', 'account_id'])
    || resolvedAccount.account_id
    || resolvedAccount.user_id
    || ''
  ).trim();
  const phone = String(valueFromAliases(profile, ['phone']) || resolvedAccount.phone || '').trim() || null;
  const email = String(valueFromAliases(profile, ['email', 'platformEmail']) || resolvedAccount.email || '').trim() || null;
  const nickName = String(valueFromAliases(profile, ['nickName', 'userName']) || resolvedAccount.nick_name || '').trim() || null;
  const realName = String(valueFromAliases(profile, ['realName']) || resolvedAccount.real_name || '').trim() || null;
  const displayName = String(
    realName
    || nickName
    || phone
    || email
    || (accountId ? `账号 ${accountId.slice(-4)}` : '')
    || 'MiMo account'
  ).trim();

  return {
    account_id: accountId || null,
    display_name: displayName,
    user_id: String(valueFromAliases(profile, ['userId', 'user_id']) || resolvedAccount.user_id || accountId || '').trim() || null,
    phone,
    email,
    nick_name: nickName,
    real_name: realName,
    login_time: updatedAt,
    last_used: updatedAt,
    endpoints: resolvedAccount.endpoints && typeof resolvedAccount.endpoints === 'object' ? resolvedAccount.endpoints : {}
  };
}

function mimoStatusAccountName(account) {
  if (!account || typeof account !== 'object') return '';
  return String(
    account.email
    || account.nick_name
    || account.real_name
    || account.display_name
    || ''
  ).trim();
}

function buildMimoStatusSummary({ status, issue = '', updatedAt, account, endpoints, balanceSnapshot, cookieCount }) {
  const accountName = mimoStatusAccountName(account);
  return {
    version: 1,
    status,
    issue: String(issue || '').trim(),
    updatedAt,
    accountLabel: 'MiMo account',
    accountName,
    endpointCount: Number(Object.keys(endpoints?.discovered_apis || {}).length || 0),
    hasCookies: Number(cookieCount || 0) > 0,
    hasSnapshot: Boolean(balanceSnapshot),
    balanceDate: String(balanceSnapshot?.date || '').trim().slice(0, 16)
  };
}

async function writeMimoSessionArtifacts(dataDir, artifacts, deps = {}) {
  if (!dataDir) return { ok: false, error: new Error('Missing MiMo data directory') };
  const cookies = Array.isArray(artifacts?.cookies) ? artifacts.cookies : [];
  const account = artifacts?.account && typeof artifacts.account === 'object' ? artifacts.account : {};
  const endpoints = artifacts?.endpoints && typeof artifacts.endpoints === 'object' ? artifacts.endpoints : {};
  const balanceSnapshot = artifacts?.balanceSnapshot && typeof artifacts.balanceSnapshot === 'object' ? artifacts.balanceSnapshot : null;
  const statusSummary = artifacts?.statusSummary && typeof artifacts.statusSummary === 'object' ? artifacts.statusSummary : null;
  const config = artifacts?.config && typeof artifacts.config === 'object' ? artifacts.config : {};
  const shouldClearSession = cookies.length === 0 && String(artifacts?.status || statusSummary?.status || '').trim() === 'notConfigured';
  const writeJson = deps.writeJson || writeJsonAtomic;
  const removeFile = deps.removeFile || fs.promises.rm;

  try {
    await fs.promises.mkdir(dataDir, { recursive: true });
    if (cookies.length > 0) {
      await writeJson(path.join(dataDir, 'cookies.json'), cookies);
      await writeJson(path.join(dataDir, 'accounts.json'), {
        version: 1,
        current_account_id: account.account_id || account.user_id || null,
        accounts: [account]
      });
      await writeJson(path.join(dataDir, 'endpoints.json'), endpoints);
      if (balanceSnapshot) {
        await writeJson(path.join(dataDir, 'balance_snapshot.json'), balanceSnapshot);
      }
      if (Object.keys(config).length > 0) {
        await writeJson(path.join(dataDir, 'config.json'), config);
      }
    } else if (shouldClearSession) {
      for (const filename of ['cookies.json', 'accounts.json', 'endpoints.json', 'balance_snapshot.json']) {
        try {
          await removeFile(path.join(dataDir, filename), { force: true });
        } catch (_) {}
      }
    }
    await writeJson(path.join(dataDir, 'status.json'), statusSummary || buildMimoStatusSummary({
      status: cookies.length > 0 ? 'checking' : 'notConfigured',
      issue: cookies.length > 0 ? 'session_unchanged' : 'missing_session_files',
      updatedAt: new Date().toISOString(),
      account,
      endpoints,
      balanceSnapshot,
      cookieCount: cookies.length
    }));
    return { ok: true };
  } catch (error) {
    return { ok: false, error };
  }
}

function contextStatusForProvider(context) {
  if (!context || typeof context !== 'object') return 'notConfigured';
  if (context.status === 'ok') return 'ok';
  if (context.status === 'notConfigured') return 'notConfigured';
  if (context.status === 'unauthorized') return 'unauthorized';
  if (context.status === 'sourceRateLimited') return 'sourceRateLimited';
  return 'unavailable';
}

async function probeMimoSession(options = {}, deps = {}) {
  const dataDir = resolveMimoDataDir(options, deps);
  const now = (deps.now || Date.now)();
  const updatedAt = new Date(now).toISOString();
  const explicitCookies = Array.isArray(options.cookies)
    ? options.cookies.filter((cookie) => cookie && typeof cookie === 'object')
    : null;
  const explicitContext = explicitCookies && explicitCookies.length > 0
    ? {
        status: 'ok',
        issue: '',
        dataDir,
        cookies: explicitCookies,
        cookieHeader: cookieHeaderFor(explicitCookies),
        account: options.account && typeof options.account === 'object' ? options.account : {},
        endpoints: options.endpoints && typeof options.endpoints === 'object' ? options.endpoints : {},
        config: options.config && typeof options.config === 'object' ? options.config : {},
        balanceSnapshot: options.balanceSnapshot && typeof options.balanceSnapshot === 'object' ? options.balanceSnapshot : null
      }
    : null;
  const context = explicitContext || await loadMimoSessionContext({ ...options, mimoDataDir: dataDir }, deps);
  const contextStatus = contextStatusForProvider(context);
  if (contextStatus !== 'ok') {
    return {
      status: contextStatus,
      provider: limitProviderForStatus(contextStatus, updatedAt),
      cookies: Array.isArray(context?.cookies) ? context.cookies : [],
      account: context?.account || {},
      endpoints: context?.endpoints || {},
      config: context?.config || {},
      balanceSnapshot: context?.balanceSnapshot || null,
      statusSummary: buildMimoStatusSummary({
        status: contextStatus,
        issue: context?.issue || (contextStatus === 'notConfigured' ? 'missing_session_files' : 'session_unavailable'),
        updatedAt,
        account: context?.account || {},
        endpoints: context?.endpoints || {},
        balanceSnapshot: context?.balanceSnapshot || null,
        cookieCount: Array.isArray(context?.cookies) ? context.cookies.length : 0
      })
    };
  }

  const todayKey = new Date(now).toISOString().slice(0, 10);
  const account = context.account || {};
  const cookieHeader = context.cookieHeader || cookieHeaderFor(context.cookies);
  const snapshotUsage = parseSnapshotUsageFields(context.balanceSnapshot);
  const apiPlatformPh = Array.isArray(context.cookies)
    ? String((context.cookies.find((cookie) => String(cookie?.name || '').trim() === 'api-platform_ph') || {}).value || '').trim()
    : '';
  const monthPayload = { year: new Date(now).getFullYear(), month: new Date(now).getMonth() + 1 };
  const params = apiPlatformPh ? { 'api-platform_ph': apiPlatformPh } : undefined;
  const discoveredApis = {};
  const probeAttempts = [];
  const summarizeAttempt = (attempt) => {
    if (!attempt?.url) return null;
    let parsed;
    try {
      parsed = new URL(attempt.url);
    } catch (_) {
      return null;
    }
    return {
      method: String(attempt.method || '').trim() || 'GET',
      path: parsed.pathname,
      status: Number.isFinite(Number(attempt.httpStatus)) ? Number(attempt.httpStatus) : null,
      ok: Boolean(attempt.ok),
      hasCookie: Boolean(attempt.hasCookie),
      headerNames: Array.isArray(attempt.headerNames) ? attempt.headerNames.filter((name) => typeof name === 'string').sort() : []
    };
  };
  const recordProbeResult = (name, result) => {
    for (const attempt of result?.attempts || (result ? [result] : [])) {
      const summary = summarizeAttempt(attempt);
      if (summary) probeAttempts.push({ name, ...summary });
    }
  };
  const probeSummary = (extra = {}) => ({
    ...extra,
    attempts: probeAttempts
  });
  const recordDiscovered = (result, source) => {
    if (!result?.ok || !result.url) return;
    discoveredApis[result.url] = {
      method: result.method || '',
      status: Number.isFinite(Number(result.httpStatus)) ? Number(result.httpStatus) : 200,
      path: new URL(result.url).pathname,
      source: result.source || source || '',
      last_seen: updatedAt
    };
  };

  const userProfileResult = await requestFirst({
    cookieHeader,
    sourceKeys: ['token_plan', 'platform'],
    method: 'GET',
    paths: ['/api/v1/userProfile']
  }, deps);
  recordProbeResult('user_profile', userProfileResult);
  recordDiscovered(userProfileResult, 'platform');
  if (!userProfileResult.ok) {
    if (userProfileResult.status === 'unauthorized') {
      return {
        status: 'unauthorized',
        provider: limitProviderForStatus('unauthorized', updatedAt),
        cookies: context.cookies,
        account,
        endpoints: { version: 1, login_time: updatedAt, platform_console_url: MIMO_PLATFORM_CONSOLE_URL, discovered_apis: discoveredApis, probe_summary: probeSummary({ user_profile_ok: false }) },
        config: context.config || {},
        balanceSnapshot: context.balanceSnapshot || null,
        statusSummary: buildMimoStatusSummary({
          status: 'unauthorized',
          issue: 'session_expired',
          updatedAt,
          account,
          endpoints: { discovered_apis: discoveredApis },
          balanceSnapshot: context.balanceSnapshot || null,
          cookieCount: Array.isArray(context.cookies) ? context.cookies.length : 0
        })
      };
    }
    if (userProfileResult.status === 'sourceRateLimited') {
      return {
        status: 'sourceRateLimited',
        provider: limitProviderForStatus('sourceRateLimited', updatedAt),
        cookies: context.cookies,
        account,
        endpoints: { version: 1, login_time: updatedAt, platform_console_url: MIMO_PLATFORM_CONSOLE_URL, discovered_apis: discoveredApis, probe_summary: probeSummary({ user_profile_ok: false }) },
        config: context.config || {},
        balanceSnapshot: context.balanceSnapshot || null,
        statusSummary: buildMimoStatusSummary({
          status: 'sourceRateLimited',
          issue: 'rate_limited',
          updatedAt,
          account,
          endpoints: { discovered_apis: discoveredApis },
          balanceSnapshot: context.balanceSnapshot || null,
          cookieCount: Array.isArray(context.cookies) ? context.cookies.length : 0
        })
      };
    }
  }

  const usageResult = await requestFirst({
    cookieHeader,
    sourceKeys: ['token_plan', 'platform'],
    method: 'GET',
    paths: ['/api/v1/tokenPlan/usage']
  }, deps);
  recordProbeResult('token_plan_usage', usageResult);
  recordDiscovered(usageResult, 'token_plan');

  let planDetailResult = null;
  for (const targetPath of ['/api/v1/usage/token-plan/list', '/api/v1/tokenPlan/detail', '/api/v1/tokenPlan/list']) {
    const result = await requestFirst({
      cookieHeader,
      sourceKeys: ['token_plan', 'platform'],
      method: 'GET',
      paths: [targetPath],
      params: targetPath === '/api/v1/usage/token-plan/list' ? params : undefined
    }, deps);
    recordProbeResult(targetPath.replace(/^\/api\/v1\//, '').replace(/\W+/g, '_'), result);
    recordDiscovered(result, result.source || 'token_plan');
    if (targetPath === '/api/v1/tokenPlan/detail') planDetailResult = result;
  }

  const detailResults = [];
  for (const targetPath of ['/api/v1/tokenPlan/usage/detail/list', '/api/v1/usage/detail/list']) {
    const result = await requestFirst({
      cookieHeader,
      sourceKeys: ['token_plan', 'platform'],
      method: 'POST',
      paths: [targetPath],
      payload: monthPayload,
      params
    }, deps);
    recordProbeResult(targetPath.replace(/^\/api\/v1\//, '').replace(/\W+/g, '_'), result);
    recordDiscovered(result, result.source || 'token_plan');
    if (result.ok) detailResults.push(result);
  }

  const balanceResult = await requestFirst({
    cookieHeader,
    sourceKeys: ['platform'],
    method: 'GET',
    paths: ['/api/v1/balance', '/api/v1/user/balance', '/api/v1/account/balance']
  }, deps);
  recordProbeResult('balance', balanceResult);
  recordDiscovered(balanceResult, 'platform');

  const usageData = parseTokenPlanUsage(usageResult.body || {});
  const usageSummary = buildUsageSummary(detailResults, todayKey);
  const confirmedPlanStatus = mimoPlanStatus(planDetailResult, now);
  const livePlanStatus = confirmedPlanStatus || (usageData.planLimit !== null && usageData.planLimit > 0 ? 'active' : null);
  const planStatus = livePlanStatus ?? snapshotUsage.planStatus ?? null;
  const planUsed = planStatus === 'expired' ? null : (usageData.planUsed ?? snapshotUsage.planUsed);
  const planLimit = planStatus === 'expired' ? null : (usageData.planLimit ?? snapshotUsage.planLimit);
  const planPercent = planStatus === 'expired' ? null : (usageData.planPercent ?? snapshotUsage.planPercent);
  const todayTokenTotal = usageSummary.todayUsageBasis === 'model_usage_today_rows'
    ? (usageSummary.todayTokenTotal ?? usageData.todayTokenTotal ?? snapshotUsage.todayTokenTotal ?? null)
    : (usageData.todayTokenTotal ?? usageSummary.todayTokenTotal ?? snapshotUsage.todayTokenTotal ?? null);
  const todayUsageDate = snapshotUsage.todayUsageDate || (todayTokenTotal === null ? '' : todayKey);
  const latestModelUsageDate = usageSummary.latestModelUsageDate || snapshotUsage.latestModelUsageDate || (todayTokenTotal !== null ? todayKey : '');
  const todayUsageBasis = usageSummary.todayUsageBasis || snapshotUsage.todayUsageBasis || (todayTokenTotal !== null ? 'token_plan_usage' : '');
  const liveBalance = balanceResult.ok ? (balanceResult.body || {}) : {};
  const balance = buildBalanceObject(liveBalance, context.balanceSnapshot, {
    planUsed,
    planLimit,
    planPercent,
    planStatus,
    todayTokenTotal,
    todayUsageDate,
    latestModelUsageDate,
    todayUsageBasis
  });

  if (planUsed === null && planLimit === null && planPercent === null && todayTokenTotal === null && !balance) {
    return {
      status: 'unavailable',
      provider: limitProviderForStatus('unavailable', updatedAt),
      cookies: context.cookies,
      account,
      endpoints: { version: 1, login_time: updatedAt, platform_console_url: MIMO_PLATFORM_CONSOLE_URL, discovered_apis: discoveredApis, probe_summary: probeSummary({ empty: true }) },
      config: context.config || {},
      balanceSnapshot: context.balanceSnapshot || null,
      statusSummary: buildMimoStatusSummary({
        status: 'unavailable',
        issue: 'missing_usage_data',
        updatedAt,
        account,
        endpoints: { discovered_apis: discoveredApis },
        balanceSnapshot: context.balanceSnapshot || null,
        cookieCount: Array.isArray(context.cookies) ? context.cookies.length : 0
      })
    };
  }

  const planRemaining = planUsed !== null && planLimit !== null ? Math.max(0, planLimit - planUsed) : null;
  const percent = planPercent !== null
    ? Math.max(0, Math.min(100, planPercent))
    : (planUsed !== null && planLimit !== null && planLimit > 0 ? Math.max(0, Math.min(100, (planUsed / planLimit) * 100)) : null);
  const windows = [];
  if (planUsed !== null || planLimit !== null || percent !== null) {
    windows.push({
      kind: 'billing',
      label: 'Token Plan',
      used: planUsed,
      limit: planLimit,
      remaining: planRemaining,
      usedPercent: percent,
      remainingPercent: percent === null ? null : Math.max(0, Math.min(100, 100 - percent)),
      resetsAt: '',
      windowMinutes: null,
      showMeter: true
    });
  }

  const profile = userProfileResult.body && typeof userProfileResult.body === 'object' ? userProfileResult.body : {};
  const accountId = String(
    valueFromAliases(profile, ['userId', 'user_id', 'accountId', 'account_id'])
    || account.account_id
    || account.user_id
    || ''
  ).trim();
  const accountRecord = buildMimoAccountRecord(
    profile,
    {
      ...account,
      account_id: accountId || account.account_id || null,
      user_id: accountId || account.user_id || null,
      endpoints: {
        ...context.endpoints,
        discovered_apis: discoveredApis
      }
    },
    context.cookies,
    updatedAt
  );
  const balanceSnapshot = {
    balance: balance?.amount ?? null,
    date: updatedAt.slice(0, 10),
    gift_balance: balance?.giftBalance ?? null,
    cash_balance: balance?.cashBalance ?? null,
    plan_used: planUsed,
    plan_limit: planLimit,
    plan_percent: planPercent,
    plan_status: planStatus,
    today_token_total: todayTokenTotal,
    today_usage_date: todayUsageDate || '',
    latest_model_usage_date: latestModelUsageDate || '',
    today_usage_basis: todayUsageBasis || ''
  };
  const endpoints = {
    version: 1,
    login_time: updatedAt,
    platform_console_url: MIMO_PLATFORM_CONSOLE_URL,
    discovered_apis: discoveredApis,
    probe_summary: {
      verified_paths: Array.from(new Set(Object.values(discoveredApis).map((entry) => entry.path))).sort(),
      endpoint_count: Object.keys(discoveredApis).length,
      user_profile_ok: true,
      token_plan_usage_ok: usageResult.ok,
      usage_token_plan_list_ok: probeAttempts.some((attempt) => attempt.name === 'usage_token_plan_list' && attempt.ok),
      token_plan_detail_ok: probeAttempts.some((attempt) => attempt.name === 'tokenPlan_detail' && attempt.ok),
      token_plan_list_ok: probeAttempts.some((attempt) => attempt.name === 'tokenPlan_list' && attempt.ok),
      usage_detail_ok: detailResults.length > 0,
      balance_ok: balanceResult.ok,
      session_expired: false,
      api_response_invalid: false,
      attempts: probeAttempts
    }
  };
  const provider = normalizeLimitProvider({
    provider: 'mimo',
    accountKey: accountKeyFor({ ...accountRecord, account_id: accountRecord.account_id || accountRecord.user_id }, context.cookies),
    accountName: mimoStatusAccountName(accountRecord),
    accountLabel: 'Token Plan',
    source: 'web',
    status: 'ok',
    updatedAt,
    windows,
    balance
  });
  const statusSummary = buildMimoStatusSummary({
    status: 'ok',
    updatedAt,
    account: accountRecord,
    endpoints,
    balanceSnapshot,
    cookieCount: context.cookies.length
  });

  return {
    status: 'ok',
    provider,
    cookies: context.cookies,
    account: accountRecord,
    endpoints,
    config: context.config || {},
    balanceSnapshot,
    statusSummary
  };
}

async function fetchMimoLimits(options = {}, deps = {}) {
  const managedAccounts = normalizeMimoManagedAccounts(options.mimoManagedAccounts || deps.mimoManagedAccounts)
    .filter((account) => account.enabled !== false);
  if (managedAccounts.length > 0) {
    const providers = [];
    const seen = new Set();
    for (const account of managedAccounts) {
      const probe = await probeMimoSession({ ...options, mimoDataDir: account.dataDir }, deps);
      const provider = normalizeLimitProvider({
        ...probe.provider,
        accountKey: String(probe?.provider?.accountKey || account.accountKey || '').trim(),
        accountName: String(
          probe?.statusSummary?.accountName
          || probe?.account?.email
          || probe?.account?.nick_name
          || probe?.account?.real_name
          || probe?.account?.display_name
          || account.accountName
          || ''
        ).trim(),
        accountLabel: probe?.provider?.status === 'ok'
          ? String(probe?.provider?.accountLabel || account.accountLabel || 'Token Plan').trim()
          : String(probe?.provider?.accountLabel || '').trim()
      });
      const key = String(provider?.accountKey || account.accountKey || account.id).trim();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      providers.push(provider);
    }
    return providers;
  }
  const probe = await probeMimoSession(options, deps);
  return probe.provider;
}

module.exports = {
  MIMO_PLATFORM_URL,
  MIMO_PLATFORM_CONSOLE_URL,
  classifyMimoLoginUrl,
  candidateMimoDataDirs,
  filterMimoSessionCookies,
  formatMimoLoginUrlForLog,
  probeMimoSession,
  loadMimoSessionContext,
  isMimoLoginExternalProtocolUrl,
  isMimoLoginHttpUrl,
  mimoSessionCookieMatches,
  resolveMimoDataDir,
  shouldCaptureMimoSessionForUrl,
  writeMimoSessionArtifacts,
  fetchMimoLimits,
  accountKeyFor,
  buildBalanceObject,
  parseTokenPlanUsage,
  buildUsageSummary
};
