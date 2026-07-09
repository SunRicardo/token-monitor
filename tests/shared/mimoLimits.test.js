'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { fetchMimoLimits } = require('../../src/shared/limitCollector');
const { sharedDataDir } = require('../../src/shared/config');
const { normalizeLimitProvider, normalizeLimitsSummary, publicLimits } = require('../../src/shared/limits');
const {
  buildBalanceObject,
  classifyMimoLoginUrl,
  filterMimoSessionCookies,
  formatMimoLoginUrlForLog,
  isMimoLoginExternalProtocolUrl,
  isMimoLoginHttpUrl,
  parseTokenPlanUsage,
  probeMimoSession,
  resolveMimoDataDir,
  writeMimoSessionArtifacts
} = require('../../src/shared/mimoLimits');

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function makeMimoSessionDir(accountId = 'acct-1') {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-mimo-'));
  writeJson(path.join(dir, 'cookies.json'), [
    { name: 'session', value: 'cookie-value' }
  ]);
  writeJson(path.join(dir, 'accounts.json'), {
    current_account_id: accountId,
    accounts: [
      {
        account_id: accountId,
        cookies: [{ name: 'session', value: 'cookie-value' }],
        endpoints: {}
      }
    ]
  });
  writeJson(path.join(dir, 'config.json'), {
    platform_url: 'https://platform.xiaomimimo.com',
    token_plan_base_url: 'https://platform.xiaomimimo.com'
  });
  writeJson(path.join(dir, 'endpoints.json'), {
    discovered_apis: {}
  });
  writeJson(path.join(dir, 'balance_snapshot.json'), {
    balance: '12.50',
    gift_balance: '1.25',
    cash_balance: '11.25',
    plan_used: '300',
    plan_limit: '1000',
    plan_percent: '30',
    today_token_total: '456',
    today_usage_date: '2026-07-07',
    latest_model_usage_date: '2026-07-07',
    today_usage_basis: 'token_plan_usage'
  });
  return dir;
}

test('resolveMimoDataDir defaults to the Token Monitor shared mimo directory', () => {
  const dataDir = resolveMimoDataDir({}, { platform: 'darwin', homeDir: '/Users/tester' });
  assert.equal(dataDir, path.join(sharedDataDir({ platform: 'darwin', homeDir: '/Users/tester' }), 'mimo'));
  assert.doesNotMatch(dataDir, /MiMoMonitor/);
});

test('classifyMimoLoginUrl routes MiMo and Xiaomi http urls into child windows', () => {
  const httpsUrl = 'https://account.xiaomi.com/pass/serviceLogin?_json=1';
  const result = classifyMimoLoginUrl(httpsUrl);
  assert.equal(result.action, 'child');
  assert.equal(result.hostname, 'account.xiaomi.com');
  assert.equal(result.protocol, 'https:');
  assert.equal(result.displayUrl, 'https://account.xiaomi.com/pass/serviceLogin');
  assert.equal(isMimoLoginHttpUrl(httpsUrl), true);
  assert.equal(formatMimoLoginUrlForLog(httpsUrl), 'https://account.xiaomi.com/pass/serviceLogin');
});

test('classifyMimoLoginUrl sends custom schemes external and blocks dangerous protocols', () => {
  assert.equal(classifyMimoLoginUrl('weixin://dl/business?ticket=abc').action, 'external');
  assert.equal(isMimoLoginExternalProtocolUrl('weixin://dl/business?ticket=abc'), true);
  assert.equal(formatMimoLoginUrlForLog('weixin://dl/business?ticket=abc'), 'weixin://dl/business');

  assert.equal(classifyMimoLoginUrl('javascript:alert(1)').action, 'block');
  assert.equal(isMimoLoginExternalProtocolUrl('javascript:alert(1)'), false);
});

test('filterMimoSessionCookies keeps Xiaomi and MiMo login cookies across domains', () => {
  const filtered = filterMimoSessionCookies([
    { domain: '.account.xiaomi.com', name: 'passToken', path: '/' },
    { domain: '.sns.account.xiaomi.com', name: 'sns_profile', path: '/' },
    { domain: '.xiaomi.com', name: 'uLocale', path: '/' },
    { domain: '.platform.xiaomimimo.com', name: 'api-platform_serviceToken', path: '/' },
    { domain: '.example.com', name: 'sid', path: '/' },
    { url: 'https://platform.xiaomimimo.com', name: 'userId', path: '/' },
    { url: 'https://platform.xiaomimimo.com', name: 'userId', path: '/' }
  ]);

  assert.deepEqual(
    filtered.map((cookie) => `${cookie.domain || cookie.url}|${cookie.name}`),
    [
      '.account.xiaomi.com|passToken',
      '.sns.account.xiaomi.com|sns_profile',
      '.xiaomi.com|uLocale',
      '.platform.xiaomimimo.com|api-platform_serviceToken',
      'https://platform.xiaomimimo.com|userId'
    ]
  );
});

test('fetchMimoLimits returns notConfigured when Token Monitor MiMo data is missing', async () => {
  const missingDir = path.join(os.tmpdir(), `token-monitor-mimo-missing-${Date.now()}`);
  const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-mimo-home-'));
  const result = await fetchMimoLimits({ mimoDataDir: missingDir }, {
    homeDir: isolatedHome,
    platform: 'darwin',
    fetch: async () => {
      throw new Error('fetch should not be called when the session directory is missing');
    }
  });

  assert.equal(result.provider, 'mimo');
  assert.equal(result.status, 'notConfigured');
  assert.equal(result.source, 'web');
  assert.equal(result.windows.length, 0);
  assert.equal(result.balance, null);
});

test('fetchMimoLimits uses the balance snapshot when live endpoints are unavailable', async () => {
  const mimoDataDir = makeMimoSessionDir();
  const result = await fetchMimoLimits({ mimoDataDir }, {
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) })
  });

  assert.equal(result.provider, 'mimo');
  assert.equal(result.status, 'ok');
  assert.equal(result.source, 'web');
  assert.equal(result.windows.length, 1);
  assert.equal(result.windows[0].kind, 'billing');
  assert.equal(result.windows[0].label, 'Token Plan');
  assert.equal(result.windows[0].used, 300);
  assert.equal(result.windows[0].limit, 1000);
  assert.equal(result.windows[0].remaining, 700);
  assert.equal(result.windows[0].usedPercent, 30);
  assert.equal(result.balance.amount, 12.5);
  assert.equal(result.balance.giftBalance, 1.25);
  assert.equal(result.balance.cashBalance, 11.25);
  assert.equal(result.balance.planUsed, 300);
  assert.equal(result.balance.planLimit, 1000);
  assert.equal(result.balance.planPercent, 30);
  assert.equal(result.balance.todayTokenTotal, 456);
  assert.equal(result.balance.todayUsageDate, '2026-07-07');
  assert.equal(result.balance.latestModelUsageDate, '2026-07-07');
  assert.equal(result.balance.todayUsageBasis, 'token_plan_usage');
  assert.ok(result.accountKey.startsWith('sha256:'));
  assert.ok(!JSON.stringify(result).includes('cookie-value'));
});

test('fetchMimoLimits normalizes MiMo ratio percents from saved snapshots', async () => {
  const mimoDataDir = makeMimoSessionDir();
  writeJson(path.join(mimoDataDir, 'balance_snapshot.json'), {
    balance: '9.89',
    gift_balance: '4.70',
    cash_balance: '5.19',
    plan_used: 3790722856,
    plan_limit: 4100000000,
    plan_percent: 0.9246,
    today_token_total: 3790722856,
    today_usage_date: '2026-07-08',
    latest_model_usage_date: '2026-07-08',
    today_usage_basis: 'token_plan_usage'
  });

  const result = await fetchMimoLimits({ mimoDataDir }, {
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) })
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.windows[0].used, 3790722856);
  assert.equal(result.windows[0].limit, 4100000000);
  assert.equal(result.windows[0].usedPercent, 92.46);
  assert.equal(result.windows[0].remainingPercent, 7.54);
  assert.equal(result.balance.amount, 9.89);
  assert.equal(result.balance.planPercent, 92.46);
});

test('fetchMimoLimits returns unauthorized when MiMo endpoints reject the session', async () => {
  const mimoDataDir = makeMimoSessionDir();
  const result = await fetchMimoLimits({ mimoDataDir }, {
    fetch: async (url) => {
      const pathname = new URL(url).pathname;
      return { ok: false, status: pathname === '/api/v1/userProfile' ? 403 : 404, json: async () => ({}) };
    }
  });

  assert.equal(result.provider, 'mimo');
  assert.equal(result.status, 'unauthorized');
  assert.equal(result.source, 'web');
  assert.equal(result.windows.length, 0);
  assert.equal(result.balance, null);
});

test('fetchMimoLimits keeps snapshot quota when token plan usage rejects an otherwise signed-in session', async () => {
  const mimoDataDir = makeMimoSessionDir();
  const calls = [];
  const result = await probeMimoSession({ mimoDataDir }, {
    fetch: async (url) => {
      const pathname = new URL(url).pathname;
      calls.push(pathname);
      if (pathname === '/api/v1/userProfile') {
        return { ok: true, status: 200, json: async () => ({ code: 0, data: { userId: 'acct-1', nickName: 'MiMo User' } }) };
      }
      if (pathname === '/api/v1/tokenPlan/usage') {
        return { ok: false, status: 403, json: async () => ({ code: 403, message: 'forbidden' }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }
  });
  const provider = result.provider;

  assert.equal(provider.provider, 'mimo');
  assert.equal(result.status, 'ok');
  assert.equal(provider.status, 'ok');
  assert.equal(provider.source, 'web');
  assert.equal(provider.windows.length, 1);
  assert.equal(provider.windows[0].kind, 'billing');
  assert.equal(provider.windows[0].label, 'Token Plan');
  assert.equal(provider.windows[0].used, 300);
  assert.equal(provider.windows[0].limit, 1000);
  assert.equal(provider.windows[0].usedPercent, 30);
  assert.equal(provider.balance.amount, 12.5);
  assert.equal(provider.balance.giftBalance, 1.25);
  assert.equal(provider.balance.cashBalance, 11.25);
  assert.equal(provider.balance.planUsed, 300);
  assert.equal(provider.balance.planLimit, 1000);
  assert.equal(provider.balance.planPercent, 30);
  assert.ok(calls.includes('/api/v1/balance'));
  assert.match(JSON.stringify(result.endpoints.probe_summary), /"token_plan_usage"/);
});

test('fetchMimoLimits preserves live balance when token plan usage rejects an otherwise signed-in session', async () => {
  const mimoDataDir = makeMimoSessionDir();
  const result = await fetchMimoLimits({ mimoDataDir }, {
    fetch: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/api/v1/userProfile') {
        return { ok: true, status: 200, json: async () => ({ code: 0, data: { userId: 'acct-1', nickName: 'MiMo User' } }) };
      }
      if (pathname === '/api/v1/tokenPlan/usage') {
        return { ok: false, status: 403, json: async () => ({ code: 403, message: 'forbidden' }) };
      }
      if (pathname === '/api/v1/balance') {
        return { ok: true, status: 200, json: async () => ({ code: 0, data: { balance: 19.5, giftBalance: 3.5, cashBalance: 16, currency: 'CNY' } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.windows[0].kind, 'billing');
  assert.equal(result.windows[0].used, 300);
  assert.equal(result.windows[0].limit, 1000);
  assert.equal(result.balance.amount, 19.5);
  assert.equal(result.balance.giftBalance, 3.5);
  assert.equal(result.balance.cashBalance, 16);
  assert.equal(result.balance.planUsed, 300);
  assert.equal(result.balance.planLimit, 1000);
  assert.equal(result.balance.planPercent, 30);
});

test('fetchMimoLimits live-fetches when session exists without a saved snapshot', async () => {
  const mimoDataDir = makeMimoSessionDir();
  fs.rmSync(path.join(mimoDataDir, 'balance_snapshot.json'));
  const calls = [];
  const now = Date.parse('2026-07-08T10:00:00.000Z');
  const result = await fetchMimoLimits({ mimoDataDir }, {
    now: () => now,
    fetch: async (url, init = {}) => {
      calls.push({ url, method: init.method || 'GET' });
      const pathname = new URL(url).pathname;
      if (pathname === '/api/v1/userProfile') {
        return { ok: true, status: 200, json: async () => ({ code: 0, data: { userId: 'acct-1', nickName: 'MiMo User' } }) };
      }
      if (pathname === '/api/v1/tokenPlan/usage') {
        return { ok: true, status: 200, json: async () => ({ code: 0, data: { plan_used: 200, plan_limit: 1000, plan_percent: 20, today_token_total: 40 } }) };
      }
      if (pathname === '/api/v1/tokenPlan/usage/detail/list') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 0, data: [{ date: '2026-07-08', totalToken: 41 }] })
        };
      }
      if (pathname === '/api/v1/usage/detail/list') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 0, data: [] })
        };
      }
      if (pathname === '/api/v1/balance') {
        return {
          ok: true,
          status: 200,
          json: async () => ({ code: 0, data: { balance: 15, giftBalance: 2, cashBalance: 13, currency: 'CNY' } })
        };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }
  });

  assert.equal(result.provider, 'mimo');
  assert.equal(result.status, 'ok');
  assert.equal(result.balance.amount, 15);
  assert.equal(result.balance.planUsed, 200);
  assert.equal(result.balance.planLimit, 1000);
  assert.equal(result.balance.planPercent, 20);
  assert.equal(result.balance.todayTokenTotal, 41);
  assert.equal(result.balance.todayUsageDate, '2026-07-08');
  assert.equal(result.balance.latestModelUsageDate, '2026-07-08');
  assert.ok(calls.some((call) => call.url.endsWith('/api/v1/userProfile')));
  assert.ok(calls.some((call) => call.url.endsWith('/api/v1/tokenPlan/usage')));
  assert.ok(calls.some((call) => call.url.endsWith('/api/v1/balance')));
});

test('fetchMimoLimits normalizes real MiMo token plan usage ratio fields', async () => {
  const mimoDataDir = makeMimoSessionDir();
  fs.rmSync(path.join(mimoDataDir, 'balance_snapshot.json'));
  const now = Date.parse('2026-07-08T10:00:00.000Z');
  const result = await fetchMimoLimits({ mimoDataDir }, {
    now: () => now,
    fetch: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/api/v1/userProfile') {
        return { ok: true, status: 200, json: async () => ({ code: 0, data: { userId: 'acct-1', nickName: 'MiMo User' } }) };
      }
      if (pathname === '/api/v1/tokenPlan/usage') {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            code: 0,
            data: {
              monthUsage: {
                percent: 0.9246,
                items: [{ used: 3790722856, limit: 4100000000, percent: 0.9246 }]
              },
              usage: {
                percent: 0.92,
                items: [{ used: 3790722856, limit: 4100000000, percent: 0.92 }]
              }
            }
          })
        };
      }
      if (pathname === '/api/v1/balance') {
        return { ok: true, status: 200, json: async () => ({ code: 0, data: { balance: '9.89', giftBalance: '4.70', cashBalance: '5.19', currency: 'CNY' } }) };
      }
      return { ok: false, status: 404, json: async () => ({}) };
    }
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.windows[0].used, 3790722856);
  assert.equal(result.windows[0].limit, 4100000000);
  assert.equal(result.windows[0].usedPercent, 92.46);
  assert.equal(result.windows[0].remainingPercent, 7.54);
  assert.equal(result.balance.amount, 9.89);
  assert.equal(result.balance.planPercent, 92.46);
});

test('fetchMimoLimits keeps an unused active Token Plan at 100% remaining', async () => {
  const mimoDataDir = makeMimoSessionDir();
  const result = await fetchMimoLimits({ mimoDataDir }, {
    fetch: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/api/v1/userProfile') return { ok: true, status: 200, json: async () => ({ code: 0, data: { userId: 'acct-1' } }) };
      if (pathname === '/api/v1/tokenPlan/usage') return { ok: true, status: 200, json: async () => ({ code: 0, data: { monthUsage: { used: 0, limit: 1000, percent: 0 } } }) };
      if (pathname === '/api/v1/tokenPlan/detail') return { ok: true, status: 200, json: async () => ({ code: 0, data: { expired: false, currentPeriodEnd: '2099-01-01T00:00:00.000Z', planName: 'Lite' } }) };
      if (pathname === '/api/v1/tokenPlan/list') return { ok: true, status: 200, json: async () => ({ code: 0, data: [{ active: true, planName: 'Pro' }] }) };
      if (pathname === '/api/v1/balance') return { ok: true, status: 200, json: async () => ({ code: 0, data: { balance: 12.5, currency: 'CNY' } }) };
      return { ok: false, status: 404, json: async () => ({}) };
    }
  });

  assert.equal(result.balance.planStatus, 'active');
  assert.equal(result.windows.length, 1);
  assert.equal(result.windows[0].usedPercent, 0);
  assert.equal(result.windows[0].remainingPercent, 100);
});

test('fetchMimoLimits suppresses stale snapshot quota when plan endpoints confirm expiry', async () => {
  const mimoDataDir = makeMimoSessionDir();
  const result = await fetchMimoLimits({ mimoDataDir }, {
    fetch: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/api/v1/userProfile') return { ok: true, status: 200, json: async () => ({ code: 0, data: { userId: 'acct-1' } }) };
      if (pathname === '/api/v1/tokenPlan/usage') return { ok: true, status: 200, json: async () => ({ code: 0, data: { monthUsage: { percent: 0 } } }) };
      if (pathname === '/api/v1/tokenPlan/detail') return { ok: true, status: 200, json: async () => ({ code: 0, data: { expired: true, currentPeriodEnd: '2026-07-09T23:29:59.000Z', planName: 'Lite' } }) };
      if (pathname === '/api/v1/tokenPlan/list') return { ok: true, status: 200, json: async () => ({ code: 0, data: [{ active: true, planName: 'Pro' }] }) };
      if (pathname === '/api/v1/balance') return { ok: true, status: 200, json: async () => ({ code: 0, data: { balance: 7.51, currency: 'CNY' } }) };
      return { ok: false, status: 404, json: async () => ({}) };
    }
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.windows.length, 0);
  assert.equal(result.balance.planStatus, 'expired');
  assert.equal(result.balance.planPercent, null);
  assert.equal(result.balance.amount, 7.51);
});

test('fetchMimoLimits treats a past currentPeriodEnd as expired without an expired flag', async () => {
  const mimoDataDir = makeMimoSessionDir();
  const result = await fetchMimoLimits({ mimoDataDir }, {
    now: () => Date.parse('2026-07-10T00:00:00.000Z'),
    fetch: async (url) => {
      const pathname = new URL(url).pathname;
      if (pathname === '/api/v1/userProfile') return { ok: true, status: 200, json: async () => ({ code: 0, data: { userId: 'acct-1' } }) };
      if (pathname === '/api/v1/tokenPlan/usage') return { ok: true, status: 200, json: async () => ({ code: 0, data: { monthUsage: { percent: 0 } } }) };
      if (pathname === '/api/v1/tokenPlan/detail') return { ok: true, status: 200, json: async () => ({ code: 0, data: { currentPeriodEnd: '2026-07-09T23:29:59.000Z', planName: 'Lite' } }) };
      if (pathname === '/api/v1/tokenPlan/list') return { ok: true, status: 200, json: async () => ({ code: 0, data: [{ active: true, planName: 'Pro' }] }) };
      if (pathname === '/api/v1/balance') return { ok: true, status: 200, json: async () => ({ code: 0, data: { balance: 7.51, currency: 'CNY' } }) };
      return { ok: false, status: 404, json: async () => ({}) };
    }
  });

  assert.equal(result.balance.planStatus, 'expired');
  assert.equal(result.windows.length, 0);
});

test('probeMimoSession keeps optional detail 401 from blocking balance snapshot', async () => {
  const mimoDataDir = makeMimoSessionDir();
  fs.rmSync(path.join(mimoDataDir, 'balance_snapshot.json'));
  const calls = [];
  const now = Date.parse('2026-07-08T10:00:00.000Z');
  const result = await probeMimoSession({ mimoDataDir }, {
    now: () => now,
    fetch: async (url, init = {}) => {
      const pathname = new URL(url).pathname;
      calls.push({
        path: pathname,
        method: init.method || 'GET',
        headerNames: Object.keys(init.headers || {}).sort(),
        cookieHeader: init.headers?.Cookie || ''
      });
      if (pathname === '/api/v1/userProfile') {
        return { ok: true, status: 200, json: async () => ({ code: 0, data: { userId: 'acct-1', email: 'mimo@example.com', nickName: 'MiMo User' } }) };
      }
      if (pathname === '/api/v1/tokenPlan/usage') {
        return { ok: true, status: 200, json: async () => ({ code: 0, data: { plan_used: 200, plan_limit: 1000, plan_percent: 20, today_token_total: 40 } }) };
      }
      if (pathname === '/api/v1/balance') {
        return { ok: true, status: 200, json: async () => ({ code: 0, data: { balance: 15, giftBalance: 2, cashBalance: 13, currency: 'CNY' } }) };
      }
      return { ok: false, status: pathname.includes('detail/list') ? 401 : 404, json: async () => ({}) };
    }
  });

  assert.equal(result.status, 'ok');
  assert.equal(result.provider.status, 'ok');
  assert.equal(result.balanceSnapshot.balance, 15);
  assert.equal(result.balanceSnapshot.plan_used, 200);
  assert.equal(result.statusSummary.hasSnapshot, true);
  assert.equal(result.statusSummary.accountName, 'mimo@example.com');
  assert.ok(calls.some((call) => call.path === '/api/v1/tokenPlan/usage/detail/list' && call.method === 'POST'));
  assert.ok(calls.some((call) => call.path === '/api/v1/balance'));
  const usageCall = calls.find((call) => call.path === '/api/v1/tokenPlan/usage');
  assert.ok(usageCall.headerNames.includes('Cookie'));
  assert.ok(usageCall.headerNames.includes('Origin'));
  assert.ok(usageCall.headerNames.includes('Referer'));
  assert.ok(usageCall.headerNames.includes('User-Agent'));
  assert.equal(usageCall.cookieHeader, 'session=cookie-value');
  const probeText = JSON.stringify(result.endpoints.probe_summary);
  assert.match(probeText, /"headerNames"/);
  assert.doesNotMatch(probeText, /cookie-value/);
});

test('parseTokenPlanUsage keeps normal percent values unchanged', () => {
  assert.deepEqual(
    parseTokenPlanUsage({ plan_used: 20, plan_limit: 100, plan_percent: 20 }),
    { planUsed: 20, planLimit: 100, planPercent: 20, todayTokenTotal: null }
  );
});

test('fetchMimoLimits returns unavailable when the MiMo session cannot be decrypted', async () => {
  const corruptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-mimo-corrupt-'));
  fs.writeFileSync(path.join(corruptDir, 'cookies.json'), 'gAAAAA-corrupt-session-token\n');
  const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-mimo-home-'));
  const result = await fetchMimoLimits({ mimoDataDir: corruptDir }, {
    homeDir: isolatedHome,
    platform: 'darwin',
    fetch: async () => {
      throw new Error('fetch should not run when MiMo session decryption fails');
    }
  });

  assert.equal(result.provider, 'mimo');
  assert.equal(result.status, 'unavailable');
  assert.equal(result.source, 'web');
  assert.equal(result.windows.length, 0);
});

test('managed MiMo unavailable rows do not inherit the saved Token Plan label', async () => {
  const corruptDir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-mimo-corrupt-'));
  fs.writeFileSync(path.join(corruptDir, 'cookies.json'), 'gAAAAA-corrupt-session-token\n');
  const isolatedHome = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-mimo-home-'));
  const providers = await fetchMimoLimits({
    mimoManagedAccounts: [
      { id: 'a', accountKey: 'sha256:mimo-a', accountName: 'Alpha', accountLabel: 'Token Plan', dataDir: corruptDir, enabled: true }
    ]
  }, {
    homeDir: isolatedHome,
    platform: 'darwin',
    fetch: async () => {
      throw new Error('fetch should not run when MiMo session decryption fails');
    }
  });

  assert.equal(Array.isArray(providers), true);
  assert.equal(providers.length, 1);
  assert.equal(providers[0].provider, 'mimo');
  assert.equal(providers[0].status, 'unavailable');
  assert.equal(providers[0].accountKey, 'sha256:mimo-a');
  assert.equal(providers[0].accountName, 'Alpha');
  assert.equal(providers[0].accountLabel, '');
  assert.equal(providers[0].windows.length, 0);
});

test('fetchMimoLimits returns one provider per enabled managed MiMo account', async () => {
  const firstDir = makeMimoSessionDir('acct-1');
  const secondDir = makeMimoSessionDir('acct-2');
  const providers = await fetchMimoLimits({
    mimoManagedAccounts: [
      { id: 'a', accountKey: 'sha256:mimo-a', accountName: 'Alpha', accountLabel: 'Token Plan', dataDir: firstDir, enabled: true },
      { id: 'b', accountKey: 'sha256:mimo-b', accountName: 'Beta', accountLabel: 'Token Plan', dataDir: secondDir, enabled: true }
    ]
  }, {
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) })
  });

  assert.equal(Array.isArray(providers), true);
  assert.equal(providers.length, 2);
  assert.equal(new Set(providers.map((provider) => provider.accountKey)).size, 2);
});

test('fetchMimoLimits skips disabled managed MiMo accounts', async () => {
  const firstDir = makeMimoSessionDir('acct-1');
  const secondDir = makeMimoSessionDir('acct-2');
  const providers = await fetchMimoLimits({
    mimoManagedAccounts: [
      { id: 'a', accountKey: 'sha256:mimo-a', accountName: 'Alpha', accountLabel: 'Token Plan', dataDir: firstDir, enabled: true },
      { id: 'b', accountKey: 'sha256:mimo-b', accountName: 'Beta', accountLabel: 'Token Plan', dataDir: secondDir, enabled: false }
    ]
  }, {
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) })
  });

  assert.equal(providers.length, 1);
  assert.match(providers[0].accountKey, /^sha256:/);
});

test('fetchMimoLimits dedupes duplicate managed MiMo accounts by accountKey', async () => {
  const firstDir = makeMimoSessionDir('acct-1');
  const secondDir = makeMimoSessionDir('acct-2');
  const providers = await fetchMimoLimits({
    mimoManagedAccounts: [
      { id: 'a', accountKey: 'sha256:mimo-a', accountName: 'Alpha', accountLabel: 'Token Plan', dataDir: firstDir, enabled: true },
      { id: 'b', accountKey: 'sha256:mimo-a', accountName: 'Alpha Clone', accountLabel: 'Token Plan', dataDir: secondDir, enabled: true }
    ]
  }, {
    fetch: async () => ({ ok: false, status: 404, json: async () => ({}) })
  });

  assert.equal(providers.length, 1);
  assert.match(providers[0].accountKey, /^sha256:/);
});

test('buildBalanceObject normalizes balance and plan fields from snapshot data', () => {
  const balance = buildBalanceObject(
    {},
    {
      balance: '9.5',
      gift_balance: '1.5',
      cash_balance: '8.0',
      plan_used: '250',
      plan_limit: '1000',
      plan_percent: '25',
      today_token_total: '88',
      today_usage_date: '2026-07-07',
      latest_model_usage_date: '2026-07-06',
      today_usage_basis: 'snapshot'
    },
    {}
  );

  assert.deepEqual(balance, {
    amount: 9.5,
    currency: 'CNY',
    giftBalance: 1.5,
    cashBalance: 8,
    snapshotDate: '',
    planUsed: 250,
    planLimit: 1000,
    planPercent: 25,
    planStatus: null,
    todayTokenTotal: 88,
    todayUsageDate: '2026-07-07',
    latestModelUsageDate: '2026-07-06',
    todayUsageBasis: 'snapshot'
  });
});

test('publicLimits strips MiMo identity fields from renderer-facing summaries', () => {
  const payload = publicLimits({
    updatedAt: '2026-07-07T00:00:00.000Z',
    providers: [
      {
        provider: 'mimo',
        accountKey: 'sha256:mimo-account',
        accountName: 'alice',
        accountEmail: 'alice@example.com',
        accountLabel: 'Token Plan',
        status: 'ok',
        source: 'web',
        windows: [],
        balance: {
          amount: 12.5,
          currency: 'CNY',
          giftBalance: 1.25,
          cashBalance: 11.25,
          planUsed: 300,
          planLimit: 1000,
          planPercent: 30,
          todayTokenTotal: 456,
          todayUsageDate: '2026-07-07',
          latestModelUsageDate: '2026-07-07',
          todayUsageBasis: 'token_plan_usage'
        }
      }
    ]
  });

  assert.equal(payload.providers.length, 1);
  assert.equal(payload.providers[0].provider, 'mimo');
  assert.equal(Object.hasOwn(payload.providers[0], 'accountKey'), false);
  assert.equal(Object.hasOwn(payload.providers[0], 'accountName'), false);
  assert.equal(Object.hasOwn(payload.providers[0], 'accountEmail'), false);
  assert.equal(Object.hasOwn(payload.providers[0], 'accountLabel'), false);
});

test('normalizeLimitsSummary accepts mimo and normalizeLimitProvider rejects micode', () => {
  const summary = normalizeLimitsSummary({
    providers: [
      { provider: 'mimo', status: 'ok', source: 'web', windows: [] }
    ]
  });
  assert.equal(summary.providers.length, 1);
  assert.equal(summary.providers[0].provider, 'mimo');

  assert.equal(normalizeLimitProvider({ provider: 'micode', status: 'ok', source: 'web', windows: [] }), null);
  assert.equal(normalizeLimitProvider({ provider: 'mimo', status: 'ok', source: 'web', windows: [] }).provider, 'mimo');
});

test('writeMimoSessionArtifacts does not persist cookies in accounts.json', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'token-monitor-mimo-safe-'));
  const cookies = [{ name: 'session', value: 'secret-cookie-value', domain: '.example.com' }];
  const artifacts = {
    status: 'ok',
    cookies,
    account: {
      account_id: 'acct-1',
      display_name: 'Test User',
      user_id: 'acct-1',
      phone: null,
      email: 'test@example.com',
      nick_name: 'Test',
      real_name: null,
      login_time: new Date().toISOString(),
      last_used: new Date().toISOString(),
      endpoints: {}
    },
    endpoints: { discovered_apis: {} },
    balanceSnapshot: null,
    statusSummary: { version: 1, status: 'ok', updatedAt: new Date().toISOString() },
    config: {}
  };
  await writeMimoSessionArtifacts(dir, artifacts);

  const accountsRaw = fs.readFileSync(path.join(dir, 'accounts.json'), 'utf8');
  const accounts = JSON.parse(accountsRaw);
  const savedAccount = accounts.accounts[0];
  assert.equal(Object.hasOwn(savedAccount, 'cookies'), false, 'accounts.json must not contain cookies field');
  assert.equal(JSON.stringify(savedAccount).includes('secret-cookie-value'), false, 'accounts.json must not contain cookie values');

  const cookiesRaw = fs.readFileSync(path.join(dir, 'cookies.json'), 'utf8');
  const savedCookies = JSON.parse(cookiesRaw);
  assert.equal(savedCookies.length, 1);
  assert.equal(savedCookies[0].value, 'secret-cookie-value');

  fs.rmSync(dir, { recursive: true, force: true });
});
