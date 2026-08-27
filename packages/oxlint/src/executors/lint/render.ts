import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import pc from 'picocolors';
import type { OxlintDiagnostic, OxlintSpan } from './run-oxlint.js';
import type { OxlintOutputFormat } from './schema.js';

export interface RenderContext {
  workspaceRoot: string;
  /** In CI or under an AI agent `default` renders as `agent`, as Oxlint does. */
  agentMode: boolean;
}

export function renderDiagnostics(
  format: OxlintOutputFormat,
  diagnostics: OxlintDiagnostic[],
  context: RenderContext
): string {
  switch (format) {
    case 'json':
      return JSON.stringify({ diagnostics }, null, 2) + '\n';
    case 'github':
      return renderGithub(diagnostics, context) + summary(diagnostics);
    case 'agent':
      return renderAgent(diagnostics);
    case 'default':
      return context.agentMode
        ? renderAgent(diagnostics)
        : renderGraphical(diagnostics, context) + summary(diagnostics);
  }
}

export function countBySeverity(diagnostics: OxlintDiagnostic[]): {
  errors: number;
  warnings: number;
} {
  let errors = 0;
  for (const d of diagnostics) {
    if (d.severity === 'error') errors++;
  }
  return { errors, warnings: diagnostics.length - errors };
}

function summary(diagnostics: OxlintDiagnostic[]): string {
  const { errors, warnings } = countBySeverity(diagnostics);
  const line = `Found ${warnings} warning${warnings === 1 ? '' : 's'} and ${errors} error${errors === 1 ? '' : 's'}.`;
  return (
    (diagnostics.length ? '\n' : '') +
    (errors ? pc.red(line) : warnings ? pc.yellow(line) : line) +
    '\n'
  );
}

function renderAgent(diagnostics: OxlintDiagnostic[]): string {
  return diagnostics
    .map((d) => {
      const { line, column } = position(d);
      const help = d.help ? ` help: ${d.help}` : '';
      return `${d.filename}:${line}:${column}: ${d.severity} ${d.code}: ${d.message}${help}\n`;
    })
    .join('');
}

function renderGithub(
  diagnostics: OxlintDiagnostic[],
  context: RenderContext
): string {
  const sources = new SourceCache(context.workspaceRoot);
  return diagnostics
    .map((d) => {
      const span = d.labels[0]?.span;
      const { line, column } = position(d);
      const end = span ? sources.endOf(d.filename, span) : { line, column };
      const level = d.severity === 'error' ? 'error' : 'warning';
      const props = [
        `file=${escapeProperty(d.filename)}`,
        `line=${line}`,
        `endLine=${end.line}`,
        `col=${column}`,
        `endColumn=${end.column}`,
        `title=${escapeProperty(d.code)}`,
      ].join(',');
      const message = escapeData(
        `${d.filename}:${line}:${column}: ${d.message}`
      );
      return `::${level} ${props}::${message}\n`;
    })
    .join('');
}

/**
 * Oxlint's terminal report: a code frame per diagnostic with one line of
 * context either side, the span underlined, and the label and `help` text
 * below. Source lines come from disk since the JSON report carries offsets
 * only, so a run with no diagnostics reads nothing.
 */
function renderGraphical(
  diagnostics: OxlintDiagnostic[],
  context: RenderContext
): string {
  const sources = new SourceCache(context.workspaceRoot);
  let out = '';
  for (const d of diagnostics) {
    const isError = d.severity === 'error';
    const paint = isError ? pc.red : pc.yellow;
    const { line, column } = position(d);
    out += `\n  ${paint(isError ? '×' : '⚠')} ${paint(d.code)}: ${d.message}\n`;
    out += `   ${pc.dim(`╭─[${d.filename}:${line}:${column}]`)}\n`;

    const lines = sources.lines(d.filename);
    const span = d.labels[0]?.span;
    if (lines && span) {
      const first = Math.max(1, line - 1);
      const last = Math.min(lines.length, line + 1);
      const width = String(last).length;
      for (let n = first; n <= last; n++) {
        const text = lines[n - 1];
        out += ` ${pc.dim(String(n).padStart(width))} ${pc.dim('│')}${text ? ` ${text}` : ''}\n`;
        if (n === line) {
          out += underline(
            width,
            column,
            span,
            lines[n - 1],
            d.labels[0].label,
            paint
          );
        }
      }
    }
    out += `   ${pc.dim('╰────')}\n`;
    if (d.help) {
      out += `  ${pc.cyan('help')}: ${d.help}\n`;
    }
  }
  return out;
}

function underline(
  width: number,
  column: number,
  span: OxlintSpan,
  lineText: string,
  label: string | undefined,
  paint: (s: string) => string
): string {
  // A multi-line span is underlined to the end of its first line.
  const length = Math.max(
    1,
    Math.min(span.length, lineText.length - column + 1)
  );
  const gutter = ` ${' '.repeat(width)} ${pc.dim('·')} `;
  const pad = ' '.repeat(column - 1);
  if (!label) {
    return `${gutter}${pad}${paint('─'.repeat(length))}\n`;
  }
  const mid = Math.floor((length - 1) / 2);
  const bar = '─'.repeat(mid) + '┬' + '─'.repeat(length - mid - 1);
  return (
    `${gutter}${pad}${paint(bar)}\n` +
    `${gutter}${pad}${' '.repeat(mid)}${paint('╰── ' + label)}\n`
  );
}

function position(d: OxlintDiagnostic): { line: number; column: number } {
  const span = d.labels[0]?.span;
  return { line: span?.line ?? 1, column: span?.column ?? 1 };
}

class SourceCache {
  private cache = new Map<string, string[] | null>();
  private workspaceRoot: string;
  // No parameter property: Node's strip-only TypeScript mode rejects them,
  // which would push the whole executor onto the slower swc fallback.
  constructor(workspaceRoot: string) {
    this.workspaceRoot = workspaceRoot;
  }

  lines(file: string): string[] | null {
    if (!this.cache.has(file)) {
      try {
        this.cache.set(
          file,
          readFileSync(join(this.workspaceRoot, file), 'utf-8').split('\n')
        );
      } catch {
        this.cache.set(file, null);
      }
    }
    return this.cache.get(file);
  }

  endOf(file: string, span: OxlintSpan): { line: number; column: number } {
    const lines = this.lines(file);
    if (!lines) {
      return { line: span.line, column: span.column + span.length };
    }
    let remaining = span.offset + span.length;
    for (let i = 0; i < lines.length; i++) {
      const lineLength = lines[i].length + 1;
      if (remaining <= lineLength) {
        return { line: i + 1, column: remaining + 1 };
      }
      remaining -= lineLength;
    }
    return { line: lines.length, column: (lines.at(-1)?.length ?? 0) + 1 };
  }
}

// https://github.com/actions/toolkit/blob/main/packages/core/src/command.ts
function escapeData(s: string): string {
  return s.replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A');
}

function escapeProperty(s: string): string {
  return escapeData(s).replace(/:/g, '%3A').replace(/,/g, '%2C');
}
