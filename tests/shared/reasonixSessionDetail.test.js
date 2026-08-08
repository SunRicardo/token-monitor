'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const { readSessionDetail } = require('../../src/shared/sessionDetail');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value));
}

function writeSidecarSession(stateHome, directoryName, stem, meta, lines) {
  const directory = path.join(stateHome, directoryName);
  fs.mkdirSync(directory, { recursive: true });
  writeJson(path.join(directory, `${stem}.jsonl.meta`), meta);
  fs.writeFileSync(path.join(directory, `${stem}.events.jsonl`), `${lines.join('\n')}\n`);
  return directory;
}

function readReasonix(home, stateHome, sessionId, period = 'total', now = new Date(2026, 7, 8, 12, 0)) {
  return readSessionDetail({
    client: 'reasonix',
    sessionId,
    period,
    sessionCost: 999,
    home,
    deps: {
      env: { REASONIX_STATE_HOME: stateHome },
      platform: 'linux',
      now
    }
  });
}

test('Reasonix routed detail resolves by BranchMeta ID and maps typed prompts/turns/tools', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reasonix-detail-'));
  const stateHome = path.join(root, 'state');
  const projectDirectory = path.join('projects', 'opaque-project', 'sessions');
  const firstTurn = '2026-08-08T10:00:00.000Z';
  const oldTurn = '2026-07-31T10:00:00.000Z';
  writeSidecarSession(stateHome, projectDirectory, 'filename-is-not-the-id', {
    id: 'branch-123',
    scope: 'project',
    workspace_root: path.join(root, 'private-workspace')
  }, [
    JSON.stringify({ type: 'user.message', ts: firstTurn, text: '测试一下' }),
    JSON.stringify({ type: 'model.turn.started', ts: '2026-08-08T10:00:01.000Z', turn: 1 }),
    JSON.stringify({ type: 'tool.intent', ts: '2026-08-08T10:00:02.000Z', turn: 1, name: 'read_file' }),
    JSON.stringify({
      type: 'model.final',
      ts: '2026-08-08T10:00:03.000Z',
      turn: 1,
      usage: {
        prompt_tokens: 30696,
        completion_tokens: 193,
        total_tokens: 30889,
        reasoning_tokens: 88,
        prompt_cache_hit_tokens: 15232,
        prompt_cache_miss_tokens: 15464,
        cache_write_tokens: 0
      }
    }),
    JSON.stringify({ type: 'user.message', ts: oldTurn, text: '上个月的请求' }),
    JSON.stringify({
      type: 'model.final',
      ts: '2026-07-31T10:00:03.000Z',
      turn: 2,
      usage: {
        prompt_tokens: 10,
        completion_tokens: 5,
        prompt_cache_hit_tokens: 2
      }
    })
  ]);

  const detail = readReasonix(root, stateHome, 'reasonix:branch-123');
  assert.equal(detail.found, true);
  assert.equal(detail.client, 'reasonix');
  assert.equal(detail.exchanges.length, 2);
  assert.equal(detail.exchanges[0].promptPreview, '测试一下');
  assert.equal(detail.exchanges[0].turnCount, 1);
  assert.deepEqual(detail.exchanges[0].tools, ['read_file']);
  assert.deepEqual(detail.exchanges[0].tokens, {
    input: 15464,
    output: 193,
    cacheRead: 15232,
    cacheWrite: 0,
    reasoning: 88,
    total: 30889
  });
  assert.equal(detail.exchanges[0].tokens.input + detail.exchanges[0].tokens.output + detail.exchanges[0].tokens.cacheRead + detail.exchanges[0].tokens.cacheWrite, 30889);
  assert.equal(detail.exchanges[0].tokens.total, 30889);
  assert.equal(detail.exchanges[0].tokens.reasoning, 88);
  assert.equal(detail.exchanges[1].tokens.input, 8);
  assert.equal(detail.exchanges[1].tokens.total, 15);
  assert.equal(detail.totals.totalTokens, 30904);
  assert.equal(detail.totals.turnCount, 2);
  assert.equal(detail.totals.costUsd, 0);

  const today = readReasonix(root, stateHome, 'reasonix:branch-123', 'today');
  assert.equal(today.exchanges.length, 1);
  assert.equal(today.totals.totalTokens, 30889);
  const month = readReasonix(root, stateHome, 'reasonix:branch-123', 'month');
  assert.equal(month.exchanges.length, 1);
  assert.equal(month.totals.totalTokens, 30889);

  assert.equal(readReasonix(root, stateHome, 'reasonix:not-the-branch-id').found, false);
  assert.doesNotMatch(JSON.stringify(detail), new RegExp(root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('Reasonix detail supports current replace/append message snapshots and ignores internal prompt wrappers', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reasonix-snapshot-detail-'));
  const stateHome = path.join(root, 'state');
  const directory = path.join(stateHome, 'sessions');
  fs.mkdirSync(directory, { recursive: true });
  writeJson(path.join(directory, 'legacy-name.meta.json'), { ID: 'snapshot-1' });
  const initial = {
    type: 'replace',
    created_at: '2026-08-08T09:00:00.000Z',
    messages: [
      { id: 'system', role: 'system', content: 'internal' },
      { id: 'user-1', role: 'user', createdAt: '2026-08-08T09:00:01.000Z', content: '<reasoning-language>English</reasoning-language>\n测试一下' },
      { id: 'assistant-1', role: 'assistant', createdAt: '2026-08-08T09:00:02.000Z', tool_calls: [{ name: 'search' }] }
    ]
  };
  const append = {
    type: 'append',
    created_at: '2026-08-08T09:01:00.000Z',
    messages: [
      { id: 'user-2', role: 'user', createdAt: '2026-08-08T09:01:01.000Z', content: '推送远端' },
      { id: 'assistant-2', role: 'assistant', createdAt: '2026-08-08T09:01:02.000Z' }
    ]
  };
  fs.writeFileSync(path.join(directory, 'legacy-name.events.jsonl'), `${JSON.stringify(initial)}\n${JSON.stringify(append)}\n`);

  const detail = readReasonix(root, stateHome, 'reasonix:snapshot-1');
  assert.equal(detail.found, true);
  assert.deepEqual(detail.exchanges.map((exchange) => exchange.promptPreview), ['测试一下', '推送远端']);
  assert.equal(detail.totals.turnCount, 2);
  assert.deepEqual(detail.exchanges[0].tools, ['search']);
  assert.equal(detail.totals.totalTokens, 0);
});

test('Reasonix detail skips missing or corrupt identity/transcript files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'reasonix-invalid-detail-'));
  const stateHome = path.join(root, 'state');
  const sessions = path.join(stateHome, 'sessions');
  fs.mkdirSync(sessions, { recursive: true });
  writeJson(path.join(sessions, 'missing-id.jsonl.meta'), { preview: 'not stable' });
  fs.writeFileSync(path.join(sessions, 'missing-id.events.jsonl'), '{}\n');
  fs.writeFileSync(path.join(sessions, 'corrupt.jsonl.meta'), '{not-json');
  fs.writeFileSync(path.join(sessions, 'corrupt.events.jsonl'), '{}\n');
  writeJson(path.join(sessions, 'no-events.jsonl.meta'), { id: 'no-events' });

  assert.equal(readReasonix(root, stateHome, 'reasonix:missing-id').found, false);
  assert.equal(readReasonix(root, stateHome, 'reasonix:corrupt').found, false);
  assert.equal(readReasonix(root, stateHome, 'reasonix:no-events').found, false);
});
