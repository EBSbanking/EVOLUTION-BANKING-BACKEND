// find-models.js
import fs from 'fs';
import path from 'path';

function findModels(startPath) {
  const files = [];
  
  function scan(dir) {
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        scan(fullPath);
      } else if (item.endsWith('.js')) {
        const content = fs.readFileSync(fullPath, 'utf8');
        if (content.includes('sequelize.define') || content.includes('DataTypes')) {
          files.push(fullPath);
          console.log(`✅ Found: ${fullPath}`);
        }
      }
    }
  }
  
  scan(startPath);
  return files;
}

console.log('🔍 Searching for Sequelize models...');
const modelFiles = findModels(process.cwd());
console.log(`\n📊 Found ${modelFiles.length} Sequelize model files`);