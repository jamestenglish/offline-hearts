import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Inspect the config syntax rather than importing it: VitePWA has module/plugin side effects.
function configuredSite() {
  const source = ts.createSourceFile('vite.config.ts', readFileSync(resolve('vite.config.ts'), 'utf8'), ts.ScriptTarget.Latest, true);
  const config = source.statements
    .filter(ts.isExportAssignment)
    .map(statement => statement.expression)
    .find(expression => ts.isCallExpression(expression) && expression.expression.getText(source) === 'defineConfig');
  if (!config || !ts.isCallExpression(config) || !ts.isObjectLiteralExpression(config.arguments[0])) throw new Error('Expected an inline defineConfig({...})');
  const property = (object: ts.ObjectLiteralExpression, name: string): ts.Expression => {
    const assignment = object.properties.find((item): item is ts.PropertyAssignment =>
      ts.isPropertyAssignment(item) && (ts.isIdentifier(item.name) || ts.isStringLiteral(item.name)) && item.name.text === name);
    if (!assignment) throw new Error(`Missing Vite config property ${name}`);
    return assignment.initializer;
  };
  const object = (expression: ts.Expression): ts.ObjectLiteralExpression => {
    if (!ts.isObjectLiteralExpression(expression)) throw new Error(`Expected Vite config object, got ${expression.getText(source)}`);
    return expression;
  };
  const root = config.arguments[0];
  const build = object(property(root, 'build'));
  const rollup = object(property(build, 'rollupOptions'));
  const inputs = object(property(rollup, 'input'));
  const inputPaths = Object.fromEntries(inputs.properties.map(item => {
    if (!ts.isPropertyAssignment(item) || !ts.isIdentifier(item.name) || !ts.isCallExpression(item.initializer) ||
      item.initializer.expression.getText(source) !== 'resolve' || item.initializer.arguments[0]?.getText(source) !== 'import.meta.dirname' ||
      !ts.isStringLiteral(item.initializer.arguments[1])) throw new Error(`Unexpected Vite input expression ${item.getText(source)}`);
    return [item.name.text, resolve(item.initializer.arguments[1].text)];
  }));
  return { base: property(root, 'base'), inputPaths };
}

describe('poker install entry', () => {
  it('configures Vite for the project-site base, not domain root', () => {
    const { base } = configuredSite();
    expect(ts.isStringLiteral(base) && base.text).toBe('/offline-hearts/');
  });

  it('builds both Hearts and nested poker HTML entries', () => {
    expect(configuredSite().inputPaths).toEqual({
      hearts: resolve('index.html'),
      poker: resolve('offline-texas-holdem/index.html'),
    });
  });

  it('has a separate nested page with only its own manifest', () => {
    const page = readFileSync(resolve('offline-texas-holdem/index.html'), 'utf8');
    expect(page).toContain('<title>Offline Texas Hold’em</title>');
    expect(page.match(/rel="manifest"/g)).toHaveLength(1);
    expect(page).toContain('/offline-hearts/offline-texas-holdem/poker.webmanifest');
    expect(page).not.toContain('manifest.webmanifest');
  });

  it('has a separate nested install scope and icons', () => {
    const manifest = JSON.parse(readFileSync(resolve('public/offline-texas-holdem/poker.webmanifest'), 'utf8'));
    expect(manifest.name).toBe('Offline Texas Hold’em');
    expect(manifest.start_url).toBe('/offline-hearts/offline-texas-holdem/');
    expect(manifest.scope).toBe('/offline-hearts/offline-texas-holdem/');
    expect(manifest.icons.length).toBeGreaterThan(0);
    for (const icon of manifest.icons) expect(existsSync(resolve('public/offline-texas-holdem', icon.src))).toBe(true);
  });

  it('registers the root worker without a nested worker', () => {
    const main = readFileSync(resolve('src/poker/main.tsx'), 'utf8');
    expect(main).toContain('navigator.serviceWorker.register');
    expect(main).toContain('import.meta.env.BASE_URL');
    expect(main).not.toContain('virtual:pwa-register');
  });
});
