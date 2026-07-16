'use strict';

const { KNOWN_CLIENTS } = require('./clientTracking');

const MAC_WIDGET_SCHEMA_VERSION = 1;
const KNOWN_TOOLS = new Set(KNOWN_CLIENTS.split(',').filter(Boolean));
const KNOWN_LIMIT_PROVIDERS = new Set([
  'claude', 'codex', 'cursor', 'antigravity', 'opencode', 'deepseek', 'minimax',
  'mimo', 'grok', 'copilot', 'kiro', 'zai', 'volcengine', 'qoder', 'zaiteam',
  'kimi', 'ollama'
]);
const KNOWN_LIMIT_STATUSES = new Set([
  'ok', 'disabled', 'notConfigured', 'unauthorized', 'rateLimited',
  'sourceRateLimited', 'unavailable', 'error'
]);
const KNOWN_WINDOW_KINDS = new Set(['session', 'weekly', 'billing']);

function finiteNumber(value, fallback = 0) {
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function nonNegativeNumber(value, fallback = 0) {
  return Math.max(0, finiteNumber(value, fallback));
}

function normalizedPercent(value) {
  const number = finiteNumber(value, NaN);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.min(100, number));
}

function normalizedIso(value) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function normalizedStatus(value) {
  const status = String(value || '').trim();
  return KNOWN_LIMIT_STATUSES.has(status) ? status : 'error';
}

function buildTools(today) {
  const tokensByTool = today?.clients && typeof today.clients === 'object' ? today.clients : {};
  const costsByTool = today?.clientCosts && typeof today.clientCosts === 'object' ? today.clientCosts : {};
  const tools = [];
  for (const tool of KNOWN_TOOLS) {
    const totalTokens = Math.round(nonNegativeNumber(tokensByTool[tool]));
    const costUsd = nonNegativeNumber(costsByTool[tool]);
    if (totalTokens <= 0 && costUsd <= 0) continue;
    tools.push({ id: tool, totalTokens, costUsd });
  }
  return tools.sort((left, right) => (
    right.totalTokens - left.totalTokens
    || right.costUsd - left.costUsd
    || left.id.localeCompare(right.id)
  ));
}

function buildLimitWindow(window) {
  if (!window || typeof window !== 'object') return null;
  const kind = String(window.kind || '').trim().toLowerCase();
  if (!KNOWN_WINDOW_KINDS.has(kind)) return null;
  const usedPercent = normalizedPercent(window.usedPercent);
  const remainingPercent = normalizedPercent(
    window.remainingPercent ?? (usedPercent === null ? null : 100 - usedPercent)
  );
  return {
    kind,
    usedPercent,
    remainingPercent,
    resetsAt: normalizedIso(window.resetsAt),
    windowMinutes: window.windowMinutes === null || window.windowMinutes === undefined
      ? null
      : nonNegativeNumber(window.windowMinutes)
  };
}

function buildLimits(limits) {
  const providers = Array.isArray(limits?.providers) ? limits.providers : [];
  const output = [];
  for (const provider of providers) {
    if (!provider || typeof provider !== 'object') continue;
    const providerId = String(provider.provider || '').trim().toLowerCase();
    if (!KNOWN_LIMIT_PROVIDERS.has(providerId)) continue;
    const windows = Array.isArray(provider.windows)
      ? provider.windows.map(buildLimitWindow).filter(Boolean).slice(0, 2)
      : [];
    output.push({
      provider: providerId,
      status: normalizedStatus(provider.status),
      updatedAt: normalizedIso(provider.updatedAt),
      windows
    });
  }
  return output.sort((left, right) => (
    left.provider.localeCompare(right.provider)
    || String(left.updatedAt || '').localeCompare(String(right.updatedAt || ''))
  ));
}

function buildMacWidgetSnapshot(stats, options = {}) {
  const now = options.now === undefined ? new Date() : new Date(options.now);
  const generatedAt = Number.isNaN(now.getTime()) ? new Date().toISOString() : now.toISOString();
  const today = stats?.periods?.today && typeof stats.periods.today === 'object'
    ? stats.periods.today
    : {};
  return {
    schemaVersion: MAC_WIDGET_SCHEMA_VERSION,
    generatedAt,
    today: {
      totalTokens: Math.round(nonNegativeNumber(today.totalTokens)),
      costUsd: nonNegativeNumber(today.costUsd)
    },
    tools: buildTools(today),
    limits: buildLimits(stats?.limits)
  };
}

function serializeMacWidgetSnapshot(stats, options = {}) {
  return `${JSON.stringify(buildMacWidgetSnapshot(stats, options))}\n`;
}

module.exports = {
  MAC_WIDGET_SCHEMA_VERSION,
  buildMacWidgetSnapshot,
  serializeMacWidgetSnapshot
};
