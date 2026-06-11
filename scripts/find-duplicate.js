import fs from 'fs';
import path from 'fs';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function searchFiles(dir, searchTerm) {
  if (!fs.existsSync(dir)) return;
  
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    try {
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory() && !filePath.includes('node_modules') && !filePath.includes('.git')) {
        searchFiles(filePath, searchTerm);
      } else if (file.endsWith('.js') || file.endsWith('.ts')) {
        const content = fs.readFileSync(filePath, 'utf8');
        if (content.includes(searchTerm)) {
          console.log(`\n🔍 Found in: ${filePath}`);
          
          // Show the line numbers where it appears
          const lines = content.split('\n');
          lines.forEach((line, index) => {
            if (line.includes(searchTerm)) {
              console.log(`  📍 Line ${index + 1}: ${line.trim()}`);
              
              // Show context (2 lines before and after)
              console.log('  Context:');
              const start = Math.max(0, index - 2);
              const end = Math.min(lines.length - 1, index + 2);
              for (let i = start; i <= end; i++) {
                const prefix = i === index ? '→' : ' ';
                console.log(`  ${prefix} Line ${i + 1}: ${lines[i].trim()}`);
              }
              console.log('');
            }
          });
        }
      }
    } catch (err) {
      // Skip files that can't be read
    }
  });
}

console.log('🔎 Searching for convertExcelDate...\n');
console.log('=' .repeat(80));

// Search in critical directories
const directories = [
  './src',
  './models',
  './controllers',
  './utils',
  './routes',
  './middleware'
];

directories.forEach(dir => {
  if (fs.existsSync(dir)) {
    console.log(`\n📁 Searching in ${dir}...`);
    searchFiles(dir, 'convertExcelDate');
  }
});

console.log('\n' + '=' .repeat(80));
console.log('✅ Search complete!');