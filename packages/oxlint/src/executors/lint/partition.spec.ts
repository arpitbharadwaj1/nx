import {
  nestedProjectIgnorePatterns,
  normalizeFilename,
  partitionDiagnostics,
} from './partition';
import type { OxlintDiagnostic } from './run-oxlint';

const diagnostic = (filename: string): OxlintDiagnostic => ({
  filename,
  message: 'm',
  code: 'c',
  severity: 'error',
  labels: [],
});

describe('partitionDiagnostics', () => {
  it('should give every task an entry and assign by longest matching path', () => {
    const byTask = partitionDiagnostics(
      [
        diagnostic('libs/a/src/x.ts'),
        diagnostic('libs/a/nested/src/y.ts'),
        diagnostic('libs/b/index.ts'),
      ],
      [
        { taskId: 'a:lint', paths: ['libs/a'] },
        { taskId: 'a-nested:lint', paths: ['libs/a/nested'] },
        { taskId: 'b:lint', paths: ['libs/b'] },
        { taskId: 'c:lint', paths: ['libs/c'] },
      ]
    );
    expect([...byTask.keys()]).toEqual([
      'a:lint',
      'a-nested:lint',
      'b:lint',
      'c:lint',
    ]);
    expect(byTask.get('a:lint').map((d) => d.filename)).toEqual([
      'libs/a/src/x.ts',
    ]);
    expect(byTask.get('a-nested:lint').map((d) => d.filename)).toEqual([
      'libs/a/nested/src/y.ts',
    ]);
    expect(byTask.get('c:lint')).toEqual([]);
  });

  it('should not match a sibling that shares a name prefix', () => {
    const byTask = partitionDiagnostics(
      [diagnostic('libs/ab/x.ts')],
      [
        { taskId: 'a:lint', paths: ['libs/a'] },
        { taskId: 'ab:lint', paths: ['libs/ab'] },
      ]
    );
    expect(byTask.get('a:lint')).toEqual([]);
    expect(byTask.get('ab:lint')).toHaveLength(1);
  });

  it('should anchor globs and single files', () => {
    const byTask = partitionDiagnostics(
      [diagnostic('libs/a/src/x.ts'), diagnostic('libs/a/tools/t.ts')],
      [
        { taskId: 'src:lint', paths: ['libs/a/src/**/*.ts'] },
        { taskId: 'tool:lint', paths: ['libs/a/tools/t.ts'] },
      ]
    );
    expect(byTask.get('src:lint')).toHaveLength(1);
    expect(byTask.get('tool:lint')).toHaveLength(1);
  });

  it('should drop a diagnostic no task owns', () => {
    const byTask = partitionDiagnostics(
      [diagnostic('tools/x.ts')],
      [{ taskId: 'a:lint', paths: ['libs/a'] }]
    );
    expect(byTask.get('a:lint')).toEqual([]);
  });
});

describe('normalizeFilename', () => {
  it('should turn file URLs and absolute paths into workspace-relative ones', () => {
    expect(normalizeFilename('file:///ws/libs/a/x.ts', '/ws')).toBe(
      'libs/a/x.ts'
    );
    expect(normalizeFilename('/ws/libs/a/x.ts', '/ws')).toBe('libs/a/x.ts');
    expect(normalizeFilename('./libs/a/x.ts', '/ws')).toBe('libs/a/x.ts');
    expect(normalizeFilename('libs/a/x.ts', '/ws')).toBe('libs/a/x.ts');
  });
});

describe('nestedProjectIgnorePatterns', () => {
  const roots = ['libs/a', 'libs/a/nested', 'libs/a/nested/deeper', 'libs/b'];

  it('should ignore nested projects that are not in the run', () => {
    expect(
      nestedProjectIgnorePatterns(
        [{ projectRoot: 'libs/a', paths: ['libs/a'] }],
        roots
      )
    ).toEqual([
      '--ignore-pattern=libs/a/nested/**',
      '--ignore-pattern=libs/a/nested/deeper/**',
    ]);
  });

  it('should keep nested projects that are in the run', () => {
    expect(
      nestedProjectIgnorePatterns(
        [
          { projectRoot: 'libs/a', paths: ['libs/a'] },
          { projectRoot: 'libs/a/nested', paths: ['libs/a/nested'] },
        ],
        roots
      )
    ).toEqual(['--ignore-pattern=libs/a/nested/deeper/**']);
  });
});
