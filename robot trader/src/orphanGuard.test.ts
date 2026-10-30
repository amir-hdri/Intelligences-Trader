import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, extname, join, relative, resolve } from 'node:path';

const SRC_DIR = resolve(__dirname, '..', 'src');
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);
const ENTRY_POINT_NAMES = new Set(['index.tsx', 'main.tsx']);

const IMPORT_PATTERN = /(?:^|[\n;])\s*(?:import|export)\b[^;]*?from\s*['"]([^'"]+)['"]/g;
const SIDE_EFFECT_IMPORT_PATTERN = /(?:^|[\n;])\s*import\s*['"]([^'"]+)['"]/g;
const DYNAMIC_IMPORT_PATTERN = /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
const WORKER_URL_PATTERN = /new\s+URL\(\s*['"]([^'"]+)['"]/g;

const collectSourceFiles = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(fullPath);
    return SOURCE_EXTENSIONS.has(extname(entry.name)) ? [fullPath] : [];
  });

const isProductionModule = (file: string): boolean => {
  const name = basename(file);
  return !name.endsWith('.d.ts') && !name.includes('.test.');
};

const stripQuery = (specifier: string): string => specifier.split('?')[0];

const extractSpecifiers = (source: string): string[] => [
  ...Array.from(source.matchAll(IMPORT_PATTERN), match => match[1]),
  ...Array.from(source.matchAll(SIDE_EFFECT_IMPORT_PATTERN), match => match[1]),
  ...Array.from(source.matchAll(DYNAMIC_IMPORT_PATTERN), match => match[1]),
  ...Array.from(source.matchAll(WORKER_URL_PATTERN), match => match[1]),
];

const resolveSpecifier = (fromFile: string, specifier: string): string | null => {
  const cleaned = stripQuery(specifier);
  if (!cleaned.startsWith('.')) return null;
  const base = resolve(dirname(fromFile), cleaned);
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ];
  return candidates.find(candidate => existsSync(candidate)) ?? null;
};

const collectEntryPoints = (srcDir: string, productionFiles: string[]): string[] => {
  const root = resolve(srcDir);
  return productionFiles.filter(file => dirname(file) === root && ENTRY_POINT_NAMES.has(basename(file)));
};

export const findOrphanModules = (srcDir: string): string[] => {
  const root = resolve(srcDir);
  const productionFiles = collectSourceFiles(root).filter(isProductionModule);
  const productionModules = new Set(productionFiles);
  const outgoing = new Map<string, string[]>();

  for (const file of productionFiles) {
    const source = readFileSync(file, 'utf8');
    const targets = new Set<string>();
    for (const specifier of extractSpecifiers(source)) {
      const resolved = resolveSpecifier(file, specifier);
      if (resolved && productionModules.has(resolved)) targets.add(resolved);
    }
    outgoing.set(file, [...targets]);
  }

  const reachable = new Set<string>();
  const queue = collectEntryPoints(root, productionFiles);
  while (queue.length > 0) {
    const current = queue.shift() as string;
    if (reachable.has(current)) continue;
    reachable.add(current);
    for (const target of outgoing.get(current) ?? []) {
      if (!reachable.has(target)) queue.push(target);
    }
  }

  return productionFiles
    .filter(file => !reachable.has(file))
    .map(file => relative(root, file))
    .sort();
};

const createFixture = (files: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'orphan-guard-'));
  for (const [relativePath, contents] of Object.entries(files)) {
    const target = join(root, relativePath);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents, 'utf8');
  }
  return root;
};

const withFixture = (files: Record<string, string>, assertion: (root: string) => void): void => {
  const root = createFixture(files);
  try {
    assertion(root);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
};

test('reports a production module that nothing references', () => {
  withFixture(
    {
      'index.tsx': "import { used } from './used';\nexport const app = used;\n",
      'used.ts': 'export const used = 1;\n',
      'lonely.ts': 'export const lonely = 1;\n',
    },
    root => {
      assert.deepEqual(findOrphanModules(root), ['lonely.ts']);
    },
  );
});

test('reports a dead island whose modules only import each other', () => {
  withFixture(
    {
      'index.tsx': "import { used } from './used';\nexport const app = used;\n",
      'used.ts': 'export const used = 1;\n',
      'islandA.ts': "import { b } from './islandB';\nexport const a = b;\n",
      'islandB.ts': "import { a } from './islandA';\nexport const b = a;\n",
    },
    root => {
      assert.deepEqual(findOrphanModules(root), ['islandA.ts', 'islandB.ts']);
    },
  );
});

test('keeps a production module that is only reached through a dynamic import', () => {
  withFixture(
    {
      'index.tsx': "export const load = async () => (await import('./lazy')).lazy;\n",
      'lazy.ts': 'export const lazy = 1;\n',
    },
    root => {
      assert.deepEqual(findOrphanModules(root), []);
    },
  );
});

test('keeps a production module that is only reached through a worker URL', () => {
  withFixture(
    {
      'index.tsx': "const worker = new URL('./worker.ts?worker', import.meta.url);\nexport const app = worker;\n",
      'worker.ts': 'export const worker = 1;\n',
    },
    root => {
      assert.deepEqual(findOrphanModules(root), []);
    },
  );
});

test('does not treat a test file as a production importer', () => {
  withFixture(
    {
      'index.tsx': "export const app = 1;\n",
      'helper.test.ts': "import { helper } from './helper';\nexport const used = helper;\n",
      'helper.ts': 'export const helper = 1;\n',
    },
    root => {
      assert.deepEqual(findOrphanModules(root), ['helper.ts']);
    },
  );
});

test('every production module under src/ is reachable from the entry point', () => {
  const orphans = findOrphanModules(SRC_DIR);
  assert.deepEqual(
    orphans,
    [],
    `Orphaned production modules under src/ (unreachable from index.tsx):\n${orphans.join('\n')}`,
  );
});
