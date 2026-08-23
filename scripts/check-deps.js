#!/usr/bin/env node
/**
 * Verify every Expo-managed dependency matches what this SDK expects.
 *
 * `npx expo install --check` does this, but it calls the Expo API and so needs
 * network. The same answer is already on disk: `expo/bundledNativeModules.json`
 * is the exact table `expo install` consults. This reads it directly, which
 * means the check also runs in CI and offline.
 *
 * Why this exists: the first scaffold of this project used plain `npm install`,
 * which writes `^` ranges and resolves to the newest release rather than the one
 * the SDK was built against. That drifted react-native-gesture-handler a whole
 * major version ahead and split the reanimated/worklets pair — the kind of thing
 * that fails at runtime on a device, not at compile time.
 *
 *   node scripts/check-deps.js        exit 1 on any mismatch
 */

const fs = require('fs');
const path = require('path');
const semver = require('semver');

const root = path.join(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const bundled = require(path.join(root, 'node_modules/expo/bundledNativeModules.json'));

const declared = { ...pkg.dependencies, ...pkg.devDependencies };
const problems = [];
const checked = [];

for (const [name, declaredRange] of Object.entries(declared)) {
  const expected = bundled[name];
  if (!expected) continue; // not managed by the SDK

  let installed = null;
  try {
    installed = JSON.parse(
      fs.readFileSync(path.join(root, 'node_modules', name, 'package.json'), 'utf8'),
    ).version;
  } catch {
    problems.push(`${name}: not installed`);
    continue;
  }

  const installedOk = semver.satisfies(installed, expected);
  // The declared range must not be able to drift outside what the SDK expects.
  const rangeOk = semver.subset
    ? semver.subset(declaredRange, expected, { loose: true })
    : installedOk;

  checked.push({ name, declaredRange, expected, installed, installedOk, rangeOk });

  if (!installedOk) {
    problems.push(
      `${name}: installed ${installed}, SDK expects ${expected} (declared "${declaredRange}")`,
    );
  } else if (!rangeOk) {
    problems.push(
      `${name}: declared "${declaredRange}" can drift outside the SDK's "${expected}" ` +
        `— pin it, even though ${installed} happens to be fine right now`,
    );
  }
}

const pad = (s, n) => String(s).padEnd(n);
console.log(
  pad('PACKAGE', 34) + pad('DECLARED', 14) + pad('SDK EXPECTS', 16) + 'INSTALLED',
);
console.log('-'.repeat(84));
for (const c of checked) {
  const flag = c.installedOk && c.rangeOk ? '' : '   <-- FIX';
  console.log(pad(c.name, 34) + pad(c.declaredRange, 14) + pad(c.expected, 16) + c.installed + flag);
}

if (problems.length > 0) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error('\nFix with:  npx expo install --fix');
  process.exit(1);
}

console.log(`\nAll ${checked.length} Expo-managed dependencies match SDK ${pkg.dependencies.expo}.`);
