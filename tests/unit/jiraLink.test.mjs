import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jiraValues, jiraUrl, jiraLabel, jiraLinks } from '../../src/markdown/jiraLink.ts';
import { renderFrontMatterCard } from '../../src/markdown/frontmatter.ts';

const BASE = 'https://ngosolucoes.atlassian.net/';

test('chave do Jira vira endereço do ticket', () => {
  assert.equal(jiraUrl('QA-123', BASE), 'https://ngosolucoes.atlassian.net/browse/QA-123');
  assert.equal(jiraUrl('qa-7', BASE), 'https://ngosolucoes.atlassian.net/browse/QA-7');
  assert.equal(jiraUrl('https://outro.atlassian.net/browse/X-1', BASE), 'https://outro.atlassian.net/browse/X-1');
  assert.equal(jiraUrl('QA-123', ''), '');
  assert.equal(jiraUrl('texto livre', BASE), '');
  assert.equal(jiraLabel('https://a.atlassian.net/browse/web-9'), 'WEB-9');
  assert.deepEqual(jiraValues(['QA-1', ' QA-2 ']), ['QA-1', 'QA-2']);
  assert.deepEqual(jiraValues('QA-1, QA-2'), ['QA-1', 'QA-2']);
  assert.deepEqual(jiraValues(undefined), []);
  assert.deepEqual(jiraLinks(['QA-1', 'sem chave'], BASE).map((l) => l.key), ['QA-1']);
});

test('cartão do cabeçalho: jira com link quando há endereço', () => {
  const fm = '---\ntipo: bug\nid: BUG-001\njira: [QA-123, PORTAL-4]\n---';
  const html = renderFrontMatterCard(fm, { jiraBase: BASE });
  assert.match(html, /<a class="fm-jira" href="https:\/\/ngosolucoes\.atlassian\.net\/browse\/QA-123"[^>]*>QA-123 ↗<\/a>, <a class="fm-jira" href="https:\/\/ngosolucoes\.atlassian\.net\/browse\/PORTAL-4"/);
  const plain = renderFrontMatterCard(fm);
  assert.doesNotMatch(plain, /fm-jira/);
  assert.match(plain, /QA-123, PORTAL-4/);
});
