#!/usr/bin/env node
// Intelligences-Trader — documentation/count guard.
//
// Runs the real test suites, measures the executed case count per suite, and
// compares it with the totals advertised in README.md, CHANGELOG.md and
// DELIVERY/گزارش-پذیرش-نهایی.md. Nothing is hard-coded: the numbers come out
// of the suites' own output, so a drifting document fails this check instead
// of failing a later audit.
//
// The guard compares like with like: a "N of M" claim is a passed-of-total
// claim, a bare "N" case count is a total claim, and a per-suite row is
// measured against that suite alone. Skipped and deselected cases are counted
// as scheduled but not passing, so a green run that skipped work cannot be
// advertised as "N of N passing".
//
// The Node counters are read out of the test runner's own output, in the spec
// format a terminal prints and in the TAP format a CI log prints.
//
// Usage:
//   node scripts/verify-doc-counts.mjs
//
// Exit: 0 when every advertised count matches the measured counts, 1 otherwise.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const read = relativePath => readFileSync(join(repoRoot, relativePath), 'utf8');

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  return {
    status: result.status === null ? 1 : result.status,
    output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
  };
};

const workspacePaths = JSON.parse(read('package.json')).workspaces;
// The npm header carries the workspace name, but npm prints the package name
// while some versions print the directory. Both are accepted, and a directory
// basename is only used when it identifies one workspace unambiguously.
const workspaceNames = new Map();
const basenameUsage = new Map();
for (const workspacePath of workspacePaths) {
  const basename = workspacePath.split('/').pop();
  basenameUsage.set(basename, (basenameUsage.get(basename) ?? 0) + 1);
}
for (const workspacePath of workspacePaths) {
  const packageName = JSON.parse(read(join(workspacePath, 'package.json'))).name;
  workspaceNames.set(packageName, workspacePath);
  const basename = workspacePath.split('/').pop();
  if (basenameUsage.get(basename) === 1) workspaceNames.set(basename, workspacePath);
}

// The test runner prints the spec format on a terminal and the TAP format
// everywhere else (CI included), so both prefixes are accepted.
const COUNTER = /^(?:ℹ|#)\s+/;

const parseWorkspaceCounters = (output, names) => {
  const counters = new Map();
  let currentWorkspace = null;
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    const header = /^>\s+(.+?)@(\S+) test$/.exec(trimmed);
    if (header) {
      currentWorkspace = names.get(header[1]) ?? null;
      if (currentWorkspace && !counters.has(currentWorkspace)) {
        counters.set(currentWorkspace, { total: null, passed: null, skipped: null });
      }
      continue;
    }
    if (!currentWorkspace) continue;
    const workspace = counters.get(currentWorkspace);
    const total = new RegExp(`^${COUNTER.source}tests (\\d+)$`).exec(trimmed);
    if (total) {
      workspace.total = Number(total[1]);
      continue;
    }
    const passed = new RegExp(`^${COUNTER.source}pass(?:ed)? (\\d+)$`).exec(trimmed);
    if (passed) {
      workspace.passed = Number(passed[1]);
      continue;
    }
    const skipped = new RegExp(`^${COUNTER.source}skipped (\\d+)$`).exec(trimmed);
    if (skipped) workspace.skipped = Number(skipped[1]);
  }
  return counters;
};

// Self-check: the CI job runs on a runtime whose non-interactive reporter is
// the TAP one, so a parser that only understands the terminal format would
// fail the guard on every push while passing locally. Both formats are
// verified here on every run.
const selfCheckNames = new Map([
  ['app', 'robot trader'],
  ['server', 'robot trader/server'],
]);
const selfCheckSamples = [
  ['spec', '> app@1.0.0 test\nℹ tests 3\nℹ pass 3\nℹ skipped 0\n'],
  ['TAP', '> app@1.0.0 test\n# tests 3\n# pass 3\n# skipped 0\n'],
];
for (const [format, sample] of selfCheckSamples) {
  const parsed = parseWorkspaceCounters(sample, selfCheckNames).get('robot trader');
  if (!parsed || parsed.total !== 3 || parsed.passed !== 3 || parsed.skipped !== 0) {
    console.error(`verify-doc-counts: the ${format} test output could not be parsed.`);
    process.exit(1);
  }
}

const nodeRun = run('npm', ['test', '--workspaces', '--if-present'], repoRoot);
if (nodeRun.status !== 0) {
  console.error('verify-doc-counts: the Node workspaces did not pass.');
  console.error(nodeRun.output.split('\n').slice(-20).join('\n'));
  process.exit(1);
}

const workspaceCounters = parseWorkspaceCounters(nodeRun.output, workspaceNames);

const nodeSuites = workspacePaths.map(workspacePath => ({
  key: workspacePath,
  counters: workspaceCounters.get(workspacePath) ?? null,
}));
const unreadableNodeSuites = nodeSuites.filter(
  suite =>
    !suite.counters ||
    typeof suite.counters.total !== 'number' ||
    typeof suite.counters.passed !== 'number' ||
    typeof suite.counters.skipped !== 'number',
);
if (unreadableNodeSuites.length > 0) {
  console.error(
    `verify-doc-counts: could not read the executed case counters for: ${unreadableNodeSuites.map(suite => suite.key).join(', ')}`,
  );
  process.exit(1);
}

const pythonRun = run('uv', ['run', 'pytest', '-q'], join(repoRoot, 'ml_service'));
if (pythonRun.status !== 0) {
  console.error('verify-doc-counts: the Python suite did not pass.');
  console.error(pythonRun.output.split('\n').slice(-20).join('\n'));
  process.exit(1);
}

const PYTHON_COUNTER_PATTERN = /(\d+)\s+(passed|failed|skipped|deselected|xfailed|xpassed|errors?)\b/g;
const pythonSummaryLine = pythonRun.output
  .split('\n')
  .map(line => line.replace(/=+/g, ' ').trim())
  .reverse()
  .find(
    line =>
      /\bin\b/.test(line) &&
      /(\d+)\s+(passed|failed|skipped|deselected|xfailed|xpassed|errors?)\b/.test(line),
  );
if (!pythonSummaryLine) {
  console.error('verify-doc-counts: could not read the executed case counters out of the pytest output.');
  process.exit(1);
}
const pythonCounters = { passed: 0, failed: 0, skipped: 0, deselected: 0, xfailed: 0, xpassed: 0, errors: 0 };
for (const match of pythonSummaryLine.matchAll(PYTHON_COUNTER_PATTERN)) {
  const key = match[2].startsWith('error') ? 'errors' : match[2];
  pythonCounters[key] += Number(match[1]);
}
const pythonTotal = Object.values(pythonCounters).reduce((total, value) => total + value, 0);

const suites = [
  ...nodeSuites.map(suite => ({
    key: suite.key,
    label: `node · ${suite.key}`,
    total: suite.counters.total,
    passed: suite.counters.passed,
    skipped: suite.counters.skipped,
  })),
  {
    key: 'ml_service',
    label: 'python · ml_service',
    total: pythonTotal,
    passed: pythonCounters.passed,
    skipped: pythonCounters.skipped,
  },
];

const sum = (selector, entries = suites) =>
  entries.reduce((total, entry) => total + selector(entry), 0);

const nodeEntries = suites.filter(suite => suite.label.startsWith('node · '));
const pythonEntries = suites.filter(suite => suite.label.startsWith('python · '));
const nodeTotal = sum(suite => suite.total, nodeEntries);
const nodePassed = sum(suite => suite.passed, nodeEntries);
const nodeSkipped = sum(suite => suite.skipped, nodeEntries);
const pythonPassed = pythonCounters.passed;
const pythonSkipped = pythonCounters.skipped;
const grandTotal = nodeTotal + pythonTotal;
const grandPassed = nodePassed + pythonPassed;
const grandSkipped = nodeSkipped + pythonSkipped;

const formatCounters = (total, passed, skipped) =>
  `total ${String(total).padStart(4)}  passed ${String(passed).padStart(4)}  skipped ${String(skipped).padStart(4)}`;

console.log('Measured test counts');
for (const suite of suites) {
  console.log(`  ${suite.label.padEnd(32)} ${formatCounters(suite.total, suite.passed, suite.skipped)}`);
}
console.log(`  ${'node total'.padEnd(32)} ${formatCounters(nodeTotal, nodePassed, nodeSkipped)}`);
console.log(`  ${'python total'.padEnd(32)} ${formatCounters(pythonTotal, pythonPassed, pythonSkipped)}`);
console.log(`  ${'grand total'.padEnd(32)} ${formatCounters(grandTotal, grandPassed, grandSkipped)}`);

const failures = [];
const expectValue = (document, description, measured, advertised) => {
  if (measured !== advertised) {
    failures.push(`${document}: ${description} advertises ${advertised}, measured ${measured}`);
  }
};

const readme = read('README.md');
const readmeClaims = [...readme.matchAll(/covers (\d+) unit and integration test suites/g)];
if (readmeClaims.length === 0) {
  failures.push('README.md: no "covers N unit and integration test suites" claim found');
}
for (const claim of readmeClaims) {
  expectValue('README.md', 'the advertised test total', grandTotal, Number(claim[1]));
}

const changelog = read('CHANGELOG.md');
const newestEntry = changelog.split(/^## /m).slice(1)[0] ?? '';
const changelogClaims = [...newestEntry.matchAll(/(\d+) of (\d+) automated tests passing/g)];
if (changelogClaims.length === 0) {
  failures.push('CHANGELOG.md: the newest entry has no "N of N automated tests passing" claim');
}
for (const claim of changelogClaims) {
  expectValue('CHANGELOG.md', 'the advertised passing count', grandPassed, Number(claim[1]));
  expectValue('CHANGELOG.md', 'the advertised test total', grandTotal, Number(claim[2]));
}

const deliveryPath = 'DELIVERY/گزارش-پذیرش-نهایی.md';
const delivery = read(deliveryPath);
const deliveryLines = delivery.split('\n');
const deliverySuiteRows = [
  { key: 'robot trader/server', label: /بک‌اند هسته \(`robot trader\/server`\)/ },
  { key: 'server', label: /درگاه پروکسی \(`server`\)/ },
  { key: 'robot trader', label: /فرانت‌اند \(`robot trader`\)/ },
  { key: 'ml_service', label: /پایتون و یادگیری ماشین \(`ml_service`\)/ },
];
const measuredByKey = new Map(suites.map(suite => [suite.key, suite]));

for (const rule of deliverySuiteRows) {
  const row = deliveryLines.find(line => rule.label.test(line));
  if (!row) {
    failures.push(`${deliveryPath}: no test row found for ${rule.key}`);
    continue;
  }
  const claim = /\*\*(\d+) \/ (\d+)\*\*/.exec(row);
  if (!claim) {
    failures.push(`${deliveryPath}: the row for ${rule.key} has no "N / N" count`);
    continue;
  }
  const measured = measuredByKey.get(rule.key);
  if (!measured) {
    failures.push(`${deliveryPath}: no measured suite found for ${rule.key}`);
    continue;
  }
  expectValue(deliveryPath, `the ${rule.key} row passing count`, measured.passed, Number(claim[1]));
  expectValue(deliveryPath, `the ${rule.key} row test count`, measured.total, Number(claim[2]));
}

const totalRow = deliveryLines.find(line => /مجموع کل پروژه/.test(line));
if (!totalRow) {
  failures.push(`${deliveryPath}: no "مجموع کل پروژه" row found`);
} else {
  const claim = /\*\*(\d+) \/ (\d+)/.exec(totalRow);
  if (!claim) {
    failures.push(`${deliveryPath}: the "مجموع کل پروژه" row has no "N / N" count`);
  } else {
    expectValue(deliveryPath, 'the project total row passing count', grandPassed, Number(claim[1]));
    expectValue(deliveryPath, 'the project total row test count', grandTotal, Number(claim[2]));
  }
}

for (const claim of delivery.matchAll(/(\d+)\s*\/\s*(\d+)\s*تست/g)) {
  expectValue(deliveryPath, 'the advertised passing count', grandPassed, Number(claim[1]));
  expectValue(deliveryPath, 'the advertised test total', grandTotal, Number(claim[2]));
}

if (failures.length > 0) {
  console.error('\nDocumented test counts do not match the executed ones:');
  for (const failure of failures) console.error(`  ✗ ${failure}`);
  process.exit(1);
}

console.log('\nDocumented test counts match the executed ones.');
