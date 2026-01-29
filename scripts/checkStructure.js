// scripts/checkStructure.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('📁 Checking project structure...');
console.log('Current directory:', __dirname);
console.log('Project root:', path.resolve(__dirname, '..'));

// Check for src/models/index.js
const srcModelsPath = path.resolve(__dirname, '../src/models/index.js');
console.log('\n🔍 Checking for src/models/index.js...');
console.log('Path:', srcModelsPath);
console.log('Exists:', fs.existsSync(srcModelsPath) ? '✅ YES' : '❌ NO');

// Check for models/index.js (root)
const rootModelsPath = path.resolve(__dirname, '../models/index.js');
console.log('\n🔍 Checking for models/index.js (root)...');
console.log('Path:', rootModelsPath);
console.log('Exists:', fs.existsSync(rootModelsPath) ? '✅ YES' : '❌ NO');

// List directories
console.log('\n📋 Directory listing (from scripts folder):');
try {
  const files = fs.readdirSync(path.resolve(__dirname, '..'));
  console.log('Root directory files/folders:');
  files.forEach(file => {
    const fullPath = path.resolve(__dirname, '..', file);
    const isDir = fs.statSync(fullPath).isDirectory();
    console.log(`  ${isDir ? '📁' : '📄'} ${file}`);
  });
} catch (error) {
  console.error('Error reading directory:', error.message);
}