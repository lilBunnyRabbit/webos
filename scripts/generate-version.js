import { execSync } from 'child_process';
import { writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function getGitCommitHash() {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim();
  } catch (error) {
    console.warn('Could not get git commit hash:', error.message);
    return 'unknown';
  }
}

function getGitBranch() {
  try {
    return execSync('git rev-parse --abbrev-ref HEAD').toString().trim();
  } catch (error) {
    console.warn('Could not get git branch:', error.message);
    return 'unknown';
  }
}

function getPackageVersion() {
  try {
    const packageJson = JSON.parse(
      readFileSync(join(__dirname, '../package.json'), 'utf-8')
    );
    return packageJson.version;
  } catch (error) {
    console.warn('Could not read package.json version:', error.message);
    return '0.0.0';
  }
}

const version = {
  version: getPackageVersion(),
  commit: getGitCommitHash(),
  branch: getGitBranch(),
  buildTime: new Date().toISOString(),
  buildTimestamp: Date.now(),
};

// Write to public directory so it gets copied to dist
const publicPath = join(__dirname, '../public/version.json');
writeFileSync(publicPath, JSON.stringify(version, null, 2));

console.log('✓ Generated version.json:', version);

// Also write to src for import during development
const srcPath = join(__dirname, '../src/assets/version.json');
writeFileSync(srcPath, JSON.stringify(version, null, 2));

export default version;

