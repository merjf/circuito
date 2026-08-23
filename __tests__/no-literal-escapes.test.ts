/**
 * Guards against the P0 fixed 2026-08-16 (`PLAN_ui_fixes.md` B2): a
 * `×`/`·`-style escape sequence typed directly between JSX tags
 * renders as those literal six characters, not the glyph. `builder.tsx`
 * shipped with exactly that — `<Text>×</Text>` drew "×", not "×" —
 * because it is a scar of hand-editing `.tsx` files with a `node -e` script
 * that writes JS string escapes without noticing JSX text does not process
 * them. It is the kind of typo that is invisible in a diff and only shows up
 * on a device, so it needs an automated guard rather than a promise to be
 * careful next time.
 *
 * The check parses each `.tsx` file with the TypeScript compiler and inspects
 * only `JsxText` nodes — the plain text sitting directly between tags. That
 * is what makes "outside a string literal or comment" free: a `×` inside
 * a string or template literal is a different AST node (`StringLiteral` /
 * `NoSubstitutionTemplateLiteral` / template span) and is never visited here,
 * and comments are trivia the compiler does not turn into nodes at all.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as ts from 'typescript';

const ROOT = path.resolve(__dirname, '..');
const SCAN_DIRS = ['app', 'src'];
const ESCAPE_PATTERN = /\\u[0-9A-Fa-f]{4}/;

function collectTsxFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules') continue;
      out.push(...collectTsxFiles(full));
    } else if (entry.isFile() && entry.name.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

interface Violation {
  file: string;
  line: number;
  text: string;
}

function findViolations(file: string): Violation[] {
  const source = fs.readFileSync(file, 'utf8');
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const violations: Violation[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node) && ESCAPE_PATTERN.test(node.text)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile));
      violations.push({
        file: path.relative(ROOT, file),
        line: line + 1,
        text: node.text.trim(),
      });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return violations;
}

describe('no literal \\uXXXX escapes in JSX text', () => {
  it('finds none across app/ and src/', () => {
    const files = SCAN_DIRS.flatMap((d) => collectTsxFiles(path.join(ROOT, d)));
    expect(files.length).toBeGreaterThan(0);

    const violations = files.flatMap(findViolations);
    if (violations.length > 0) {
      const report = violations.map((v) => `  ${v.file}:${v.line} — "${v.text}"`).join('\n');
      throw new Error(
        `Found \\uXXXX escape sequence(s) sitting directly in JSX text, which render ` +
          `as those literal characters rather than the intended glyph. Paste the real ` +
          `character instead:\n${report}`,
      );
    }
  });
});
