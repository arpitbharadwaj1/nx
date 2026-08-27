import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { renderDiagnostics } from './render';
import type { OxlintDiagnostic } from './run-oxlint';

// picocolors decides on colors at import time, so an env var set in the test is too late.
jest.mock('picocolors', () => {
  const colors = jest.requireActual('picocolors').createColors(false);
  return { __esModule: true, default: colors, ...colors };
});

// Captured from `oxlint --format=json` 1.77.0 on this source.
const source = 'console.log(1);\nfunction f() { debugger; }\n';
const diagnostics: OxlintDiagnostic[] = [
  {
    message: "Function 'f' is declared but never used.",
    code: 'eslint(no-unused-vars)',
    severity: 'error',
    filename: 'libs/a/src/x.ts',
    labels: [
      {
        label: "'f' is declared here",
        span: { offset: 25, length: 1, line: 2, column: 10 },
      },
    ],
    help: 'Consider removing this declaration.',
    url: 'https://oxc.rs/docs/guide/usage/linter/rules/eslint/no-unused-vars.html',
  },
  {
    message: 'Unexpected console statement.',
    code: 'eslint(no-console)',
    severity: 'warning',
    filename: 'libs/a/src/x.ts',
    labels: [{ span: { offset: 0, length: 11, line: 1, column: 1 } }],
    help: 'Delete this console statement.',
  },
];

describe('renderDiagnostics', () => {
  let workspaceRoot: string;
  beforeAll(() => {
    workspaceRoot = mkdtempSync(join(tmpdir(), 'oxlint-render-'));
    mkdirSync(join(workspaceRoot, 'libs/a/src'), { recursive: true });
    writeFileSync(join(workspaceRoot, 'libs/a/src/x.ts'), source);
  });

  it('should render agent one-liners the way Oxlint does', () => {
    expect(
      renderDiagnostics('agent', diagnostics, {
        workspaceRoot,
        agentMode: false,
      })
    ).toBe(
      "libs/a/src/x.ts:2:10: error eslint(no-unused-vars): Function 'f' is declared but never used. help: Consider removing this declaration.\n" +
        'libs/a/src/x.ts:1:1: warning eslint(no-console): Unexpected console statement. help: Delete this console statement.\n'
    );
  });

  it('should render default as agent in agent mode', () => {
    expect(
      renderDiagnostics('default', diagnostics, {
        workspaceRoot,
        agentMode: true,
      })
    ).toBe(
      renderDiagnostics('agent', diagnostics, {
        workspaceRoot,
        agentMode: true,
      })
    );
  });

  it('should render code frames with the label and help text', () => {
    const out = renderDiagnostics('default', diagnostics, {
      workspaceRoot,
      agentMode: false,
    });
    expect(out).toMatchInlineSnapshot(`
      "
        × eslint(no-unused-vars): Function 'f' is declared but never used.
         ╭─[libs/a/src/x.ts:2:10]
       1 │ console.log(1);
       2 │ function f() { debugger; }
         ·          ┬
         ·          ╰── 'f' is declared here
       3 │
         ╰────
        help: Consider removing this declaration.

        ⚠ eslint(no-console): Unexpected console statement.
         ╭─[libs/a/src/x.ts:1:1]
       1 │ console.log(1);
         · ───────────
       2 │ function f() { debugger; }
         ╰────
        help: Delete this console statement.

      Found 1 warning and 1 error.
      "
    `);
  });

  it('should render GitHub workflow commands with end positions', () => {
    const out = renderDiagnostics('github', diagnostics, {
      workspaceRoot,
      agentMode: false,
    });
    expect(out).toBe(
      "::error file=libs/a/src/x.ts,line=2,endLine=2,col=10,endColumn=11,title=eslint(no-unused-vars)::libs/a/src/x.ts:2:10: Function 'f' is declared but never used.\n" +
        '::warning file=libs/a/src/x.ts,line=1,endLine=1,col=1,endColumn=12,title=eslint(no-console)::libs/a/src/x.ts:1:1: Unexpected console statement.\n' +
        '\nFound 1 warning and 1 error.\n'
    );
  });

  it('should render only the summary for a clean run', () => {
    expect(
      renderDiagnostics('default', [], { workspaceRoot, agentMode: false })
    ).toBe('Found 0 warnings and 0 errors.\n');
    expect(
      renderDiagnostics('agent', [], { workspaceRoot, agentMode: true })
    ).toBe('');
  });

  it('should render json as the diagnostics subset', () => {
    expect(
      JSON.parse(
        renderDiagnostics('json', diagnostics, {
          workspaceRoot,
          agentMode: false,
        })
      )
    ).toEqual({ diagnostics });
  });
});
