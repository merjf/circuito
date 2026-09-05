#!/usr/bin/env node

/**
 * Cross-platform entry point for the local APK build.
 *
 * The original shell script remains the macOS/Linux implementation. Windows
 * must not invoke `bash`: on a typical setup that resolves to WSL, whose JDK
 * and Android SDK are not the ones Android Studio installed for Windows.
 */

const { existsSync, mkdirSync, copyFileSync, writeFileSync } = require('node:fs');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');

const root = resolve(__dirname, '..');
const args = process.argv.slice(2);

if (process.platform !== 'win32') {
  const result = spawnSync('bash', [join(__dirname, 'build-apk.sh'), ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  process.exit(result.status ?? 1);
}

const usage = `
Build an installable Android APK locally.

  npm run apk                  release APK
  npm run apk -- --install     release APK and install it to the connected device
  npm run apk -- --debug       debug APK (requires Metro to run)
  npm run apk -- --keep-native reuse android/ for a faster incremental build
`;

if (args.includes('-h') || args.includes('--help')) {
  process.stdout.write(usage);
  process.exit(0);
}

const allowed = new Set(['--debug', '--release', '--keep-native', '--install']);
const unknown = args.find((arg) => !allowed.has(arg));
if (unknown) {
  console.error(`Unknown option: ${unknown}\n${usage}`);
  process.exit(2);
}

const run = (command, commandArgs, options = {}) => {
  // `.cmd` (npx) and `.bat` (Gradle) are command-shell scripts, not native
  // executables. `spawnSync` cannot launch them directly on Windows and
  // otherwise reports EINVAL before Expo/Gradle receive any arguments.
  const result = spawnSync(command, commandArgs, {
    cwd: root,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    ...options,
  });
  if (result.error) {
    console.error(`Could not start ${command}: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
};

const java = spawnSync('java.exe', ['-version'], { stdio: 'ignore' });
if (java.error || java.status !== 0) {
  console.error('JDK 17 or newer is required. Install it through Android Studio or Temurin.');
  process.exit(1);
}

const localSdk = process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'Android', 'Sdk') : '';
const sdkDir = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT, localSdk].find(
  (candidate) => candidate && existsSync(candidate),
);
if (!sdkDir) {
  console.error('Android SDK not found. Open Android Studio once to install it, or set ANDROID_HOME.');
  process.exit(1);
}

const debug = args.includes('--debug');
const install = args.includes('--install');
const keepNative = args.includes('--keep-native');
const variant = debug ? 'debug' : 'release';

console.log(`▸ Android SDK  ${sdkDir}`);
console.log(`▸ Variant      ${variant}`);

if (!keepNative || !existsSync(join(root, 'android'))) {
  console.log('▸ Generating android/ from app.json');
  run('npx.cmd', ['expo', 'prebuild', '--platform', 'android', '--clean', '--no-install']);
} else {
  console.log('▸ Reusing existing android/ (--keep-native)');
}

writeFileSync(join(root, 'android', 'local.properties'), `sdk.dir=${sdkDir.replace(/\\/g, '/')}\n`);

const gradleTask = debug ? 'assembleDebug' : 'assembleRelease';
console.log(`▸ Gradle ${gradleTask} — the first run can take a while`);
run(join(root, 'android', 'gradlew.bat'), [gradleTask, '--console=plain'], { cwd: join(root, 'android') });

const apkSource = join(root, 'android', 'app', 'build', 'outputs', 'apk', variant, `app-${variant}.apk`);
if (!existsSync(apkSource)) {
  console.error(`Gradle finished but no APK exists at ${apkSource}`);
  process.exit(1);
}

const version = require(join(root, 'app.json')).expo.version;
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13).replace('T', '-');
const buildDir = join(root, 'build');
mkdirSync(buildDir, { recursive: true });
const apkOutput = join(buildDir, `circuito-${version}-${variant}-${stamp}.apk`);
copyFileSync(apkSource, apkOutput);

if (install) {
  const adb = join(sdkDir, 'platform-tools', 'adb.exe');
  if (!existsSync(adb)) {
    console.error(`adb was not found at ${adb}`);
    process.exit(1);
  }
  console.log('▸ Installing to connected device');
  run(adb, ['install', '-r', apkOutput]);
}

console.log(`\n✓ ${apkOutput}`);
