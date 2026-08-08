'use strict';

// Reasonix's native session transcript is a Node-only sidecar.  Keep this
// adapter separate from the aggregate stats scanner: Tokscale remains the
// aggregate authority, while this module only turns one native event log into
// the canonical prompt/turn events consumed by sessionDetail.js.

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { resolveReasonixHome } = require('./reasonixPaths');

const SESSION_PREFIX = 'reasonix:';
const META_SUFFIX = '.jsonl.meta';
const LEGACY_META_SUFFIX = '.meta.json';
const EVENTS_SUFFIX = '.events.jsonl';

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : null;
}

function textValue(value, maxLength = 4096) {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  return text ? text.slice(0, maxLength) : '';
}

function finiteNumber(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(/[$,]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function hasNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value);
  return typeof value === 'string' && value.trim() !== '' && Number.isFinite(Number(value.replace(/[$,]/g, '')));
}

function firstValue(sources, keys) {
  for (const source of sources || []) {
    const value = objectValue(source);
    if (!value) continue;
    for (const key of keys) {
      if (Object.prototype.hasOwnProperty.call(value, key)) return value[key];
    }
  }
  return undefined;
}

function firstNumber(sources, keys) {
  const value = firstValue(sources, keys);
  return hasNumber(value) ? Math.max(0, finiteNumber(value)) : 0;
}

function firstText(sources, keys, maxLength = 4096) {
  const value = firstValue(sources, keys);
  return textValue(value, maxLength);
}

function uniqueTools(tools) {
  return [...new Set((tools || []).map((tool) => textValue(tool, 256)).filter(Boolean))];
}

function namespaceId(sessionId) {
  const value = textValue(sessionId, 512);
  if (!value.startsWith(SESSION_PREFIX)) return '';
  return value.slice(SESSION_PREFIX.length).trim();
}

function stableId(meta) {
  const root = objectValue(meta);
  if (!root) return '';
  const nested = [
    root.BranchMeta,
    root.branchMeta,
    root.branch_meta,
    root.branch
  ];
  return textValue(firstValue([root, ...nested], ['id', 'ID']), 512);
}

function timestampOf(record, payload, fallback = '') {
  const value = firstValue([record, payload], ['ts', 'timestamp', 'created_at', 'createdAt', 'updated_at', 'updatedAt']);
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
  const text = textValue(value, 128);
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function eventPayload(record) {
  return objectValue(record?.payload) || objectValue(record?.data) || record;
}

function eventType(record, payload) {
  const direct = textValue(firstValue([record], ['event_type', 'eventType', 'kind', 'type'])).toLowerCase();
  if (direct && direct !== 'event') return direct;
  return textValue(firstValue([payload], ['event_type', 'eventType', 'kind', 'type'])).toLowerCase();
}

function eventTurn(record, payload) {
  const value = firstValue([record, payload], ['turn', 'turn_id', 'turnId']);
  return value === undefined || value === null ? '' : String(value);
}

function cleanPromptText(value) {
  return String(value || '')
    // The current Reasonix runtime wraps user input with an internal
    // reasoning-language directive before writing the snapshot transcript.
    .replace(/<reasoning-language>[\s\S]*?<\/reasoning-language>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 20000);
}

function messageText(message) {
  if (typeof message === 'string') return cleanPromptText(message);
  if (Array.isArray(message)) {
    return cleanPromptText(message.map((part) => messageText(part)).filter(Boolean).join(' '));
  }
  const value = objectValue(message) || {};
  const content = value.content ?? value.raw_content ?? value.rawContent ?? value.text;
  if (typeof content === 'string') return cleanPromptText(content);
  if (Array.isArray(content)) {
    return cleanPromptText(content.map((part) => {
      if (typeof part === 'string') return part;
      const objectPart = objectValue(part);
      return typeof objectPart?.text === 'string'
        ? objectPart.text
        : (typeof objectPart?.content === 'string' ? objectPart.content : '');
    }).join(' '));
  }
  return '';
}

function toolName(value) {
  if (typeof value === 'string') return textValue(value, 256);
  const source = objectValue(value);
  if (!source) return '';
  const direct = firstText([source], ['name', 'tool_name', 'toolName', 'tool'], 256);
  if (direct) return direct;
  const nestedTool = objectValue(source.tool);
  const nestedName = firstText([nestedTool], ['name', 'tool_name', 'toolName'], 256);
  if (nestedName) return nestedName;
  const functionValue = objectValue(source.function);
  return firstText([functionValue], ['name'], 256);
}

function toolNames(value) {
  if (!Array.isArray(value)) return [];
  return uniqueTools(value.flatMap((item) => {
    const name = toolName(item);
    return name ? [name] : [];
  }));
}

function usageObject(record, payload) {
  return objectValue(firstValue([payload, record], ['usage', 'token_usage', 'tokenUsage'])) || null;
}

function reasonixTokens(record, payload) {
  const usage = usageObject(record, payload);
  const sources = [usage, payload, record];
  const prompt = firstNumber(sources, ['promptTokens', 'prompt_tokens', 'inputTokens', 'input_tokens']);
  const cacheRead = firstNumber(sources, [
    'cacheHitTokens', 'cache_hit_tokens', 'promptCacheHitTokens', 'prompt_cache_hit_tokens',
    'cacheReadTokens', 'cache_read_tokens', 'cachedInputTokens', 'cached_input_tokens'
  ]);
  const cacheMissValue = firstValue(sources, [
    'cacheMissTokens', 'cache_miss_tokens', 'promptCacheMissTokens', 'prompt_cache_miss_tokens',
    'cacheMiss', 'cache_miss'
  ]);
  const cacheMiss = hasNumber(cacheMissValue)
    ? Math.max(0, finiteNumber(cacheMissValue))
    : Math.max(0, prompt - cacheRead);
  const output = firstNumber(sources, ['completionTokens', 'completion_tokens', 'outputTokens', 'output_tokens']);
  const cacheWrite = firstNumber(sources, [
    'cacheWriteTokens', 'cache_write_tokens', 'promptCacheWriteTokens', 'prompt_cache_write_tokens'
  ]);
  const reasoning = firstNumber(sources, [
    'reasoningTokens', 'reasoning_tokens', 'reasoningOutputTokens', 'reasoning_output_tokens'
  ]);

  // Reasonix reports reasoningTokens as a subset of completion.  Keep it in
  // the canonical informational field, but never add it to the closed total.
  return {
    input: cacheMiss,
    output,
    cacheRead,
    cacheWrite,
    reasoning,
    total: cacheMiss + output + cacheRead + cacheWrite
  };
}

function messageTokens(message) {
  const source = objectValue(message) || {};
  return reasonixTokens(source, source);
}

function messageTimestamp(message, fallback) {
  const value = firstValue([message], ['ts', 'timestamp', 'created_at', 'createdAt', 'updated_at', 'updatedAt']);
  const text = textValue(value, 128);
  if (!text) return fallback;
  const date = new Date(text);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function messageToolNames(message) {
  const source = objectValue(message) || {};
  return uniqueTools([
    ...toolNames(source.tool_calls),
    ...toolNames(source.toolCalls),
    ...toolNames(source.tools)
  ]);
}

function snapshotMessages(records) {
  let messages = [];
  let sawSnapshot = false;
  for (const { record } of records) {
    const type = eventType(record, record);
    if (type !== 'replace' && type !== 'append') continue;
    const payload = eventPayload(record);
    const incoming = Array.isArray(payload?.messages)
      ? payload.messages
      : (objectValue(payload?.message) ? [payload.message] : []);
    if (incoming.length === 0) continue;
    sawSnapshot = true;
    if (type === 'replace') {
      messages = incoming.slice();
      continue;
    }
    const index = firstValue([payload, record], ['message_index', 'messageIndex']);
    if (hasNumber(index)) {
      const offset = Math.max(0, Math.trunc(finiteNumber(index)));
      messages.splice(offset, incoming.length, ...incoming);
      continue;
    }
    const existingIds = new Set(messages.map((message) => textValue(message?.id || message?.message_id, 256)).filter(Boolean));
    for (const message of incoming) {
      const id = textValue(message?.id || message?.message_id, 256);
      if (id && existingIds.has(id)) continue;
      messages.push(message);
      if (id) existingIds.add(id);
    }
  }
  if (!sawSnapshot) return null;

  const events = [];
  for (const message of messages) {
    const source = objectValue(message);
    if (!source) continue;
    const role = textValue(source.role || source.kind, 32).toLowerCase();
    const timestamp = messageTimestamp(source, '');
    if (role === 'user') {
      const text = messageText(source);
      if (text && source.internal !== true && source.synthetic !== true) {
        events.push({ kind: 'prompt', timestamp, text });
      }
    } else if (role === 'assistant' || role === 'model') {
      events.push({
        kind: 'turn',
        timestamp,
        tokens: messageTokens(source),
        tools: messageToolNames(source)
      });
    }
  }
  return events;
}

function typedEvents(records) {
  const events = [];
  const toolsByTurn = new Map();
  const pendingTools = [];

  function addTools(turn, names) {
    const clean = uniqueTools(names);
    if (clean.length === 0) return;
    const key = turn || '__pending__';
    const current = toolsByTurn.get(key) || [];
    toolsByTurn.set(key, uniqueTools(current.concat(clean)));
    if (!turn) pendingTools.push(...clean);
  }

  for (const { record, timestamp: recordTimestamp } of records) {
    const payload = eventPayload(record);
    const type = eventType(record, payload);
    const timestamp = timestampOf(record, payload, recordTimestamp || '');
    const turn = eventTurn(record, payload);

    if (type === 'user.message' || type === 'user_message') {
      const rawText = firstValue([payload, record], ['text', 'content', 'message']);
      const text = cleanPromptText(typeof rawText === 'string' ? rawText : messageText(rawText));
      if (text && payload.internal !== true && payload.synthetic !== true) {
        events.push({ kind: 'prompt', timestamp, text });
      }
      continue;
    }

    if (type.startsWith('tool.')) {
      addTools(turn, [toolName(payload), toolName(payload.toolCall), toolName(payload.tool_call)]);
      continue;
    }

    if (type === 'model.final' || type === 'model_final') {
      const finalTools = [
        ...toolNames(firstValue([payload, record], ['toolCalls', 'tool_calls', 'tools'])),
        ...((toolName(payload.toolCall) || toolName(payload.tool_call)) ? [toolName(payload.toolCall) || toolName(payload.tool_call)] : [])
      ];
      const turnTools = toolsByTurn.get(turn || '__pending__') || [];
      events.push({
        kind: 'turn',
        timestamp,
        tokens: reasonixTokens(record, payload),
        tools: uniqueTools(turnTools.concat(pendingTools, finalTools))
      });
      if (turn) toolsByTurn.delete(turn);
      toolsByTurn.delete('__pending__');
      pendingTools.length = 0;
    }
  }
  return events;
}

function parseReasonixEventLog(text) {
  const records = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const record = JSON.parse(trimmed);
      if (objectValue(record)) records.push({ record, timestamp: timestampOf(record, record, '') });
    } catch (_) {
      // A partially-written final JSONL line is expected during a live turn.
    }
  }
  const snapshot = snapshotMessages(records);
  return snapshot || typedEvents(records);
}

function readJson(fsApi, filePath) {
  try {
    const value = JSON.parse(fsApi.readFileSync(filePath, 'utf8'));
    return objectValue(value);
  } catch (_) {
    return null;
  }
}

function isFile(fsApi, filePath) {
  try { return fsApi.statSync(filePath).isFile(); } catch (_) { return false; }
}

function sessionDirectories(stateHome, fsApi, pathApi) {
  const directories = [];
  const legacy = pathApi.join(stateHome, 'sessions');
  if (isDirectory(fsApi, legacy)) directories.push(legacy);
  const projects = pathApi.join(stateHome, 'projects');
  if (!isDirectory(fsApi, projects)) return directories;
  let entries;
  try { entries = fsApi.readdirSync(projects, { withFileTypes: true }); } catch (_) { return directories; }
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isDirectory()) continue;
    const routed = pathApi.join(projects, entry.name, 'sessions');
    if (isDirectory(fsApi, routed)) directories.push(routed);
  }
  return directories;
}

function isDirectory(fsApi, directory) {
  try { return fsApi.statSync(directory).isDirectory(); } catch (_) { return false; }
}

function metaCandidate(name) {
  if (name.endsWith(META_SUFFIX)) return { stem: name.slice(0, -META_SUFFIX.length), priority: 0 };
  if (name.endsWith(LEGACY_META_SUFFIX)) return { stem: name.slice(0, -LEGACY_META_SUFFIX.length), priority: 1 };
  return null;
}

function findSessionEventFile({ sessionId, home, options = {} } = {}) {
  const id = namespaceId(sessionId);
  if (!id) return '';
  const fsApi = options.fsModule || fs;
  const pathApi = options.pathModule || path;
  const platform = options.platform || process.platform;
  const env = options.env || process.env;
  const homeDir = home || options.homeDir || os.homedir();
  const cwdDir = options.cwdDir || process.cwd();
  const stateHome = resolveReasonixHome({ env, homeDir, platform, cwdDir });
  for (const directory of sessionDirectories(stateHome, fsApi, pathApi)) {
    let entries;
    try { entries = fsApi.readdirSync(directory, { withFileTypes: true }); } catch (_) { continue; }
    const candidates = entries
      .filter((entry) => entry.isFile())
      .map((entry) => {
        const parsed = metaCandidate(entry.name);
        return parsed ? { ...parsed, name: entry.name } : null;
      })
      .filter(Boolean)
      .sort((left, right) => left.name.localeCompare(right.name) || left.priority - right.priority);
    for (const candidate of candidates) {
      const metaPath = pathApi.join(directory, candidate.name);
      const meta = readJson(fsApi, metaPath);
      if (stableId(meta) !== id) continue;
      const eventsPath = pathApi.join(directory, `${candidate.stem}${EVENTS_SUFFIX}`);
      if (isFile(fsApi, eventsPath)) return eventsPath;
    }
  }
  return '';
}

function readReasonixSessionEvents({ sessionId, home, ...options } = {}) {
  const eventsPath = findSessionEventFile({ sessionId, home, options });
  if (!eventsPath) return { found: false, events: [] };
  try {
    const text = (options.fsModule || fs).readFileSync(eventsPath, 'utf8');
    return { found: true, events: parseReasonixEventLog(text) };
  } catch (_) {
    return { found: false, events: [] };
  }
}

module.exports = {
  findSessionEventFile,
  parseReasonixEventLog,
  readReasonixSessionEvents,
  reasonixTokens,
  stableId
};
