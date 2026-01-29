// disable-indexes.js - Place this in project root
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Try different possible model locations
const possiblePaths = [
  path.join(__dirname, 'src', 'models'),
  path.join(__dirname, 'models'),
  path.join(__dirname, 'src', 'models', 'sequelize'),
  path.join(__dirname, 'models', 'sequelize')
];

function findModelsDirectory() {
  for (const modelsPath of possiblePaths) {
    if (fs.existsSync(modelsPath)) {
      console.log(`✅ Found models directory: ${modelsPath}`);
      return modelsPath;
    }
  }
  return null;
}

function updateModelFiles(modelsDir) {
  const files = fs.readdirSync(modelsDir);
  let updatedCount = 0;
  
  files.forEach(file => {
    if (file.endsWith('.js')) {
      const filePath = path.join(modelsDir, file);
      let content = fs.readFileSync(filePath, 'utf8');
      
      // Check if it's a Sequelize model
      const isSequelizeModel = content.includes('sequelize.define') || 
                               content.includes('DataTypes') ||
                               content.includes('sequelize, DataTypes');
      
      if (isSequelizeModel && content.includes('indexes:')) {
        console.log(`\n🔧 Updating ${file}...`);
        
        // Find and replace indexes
        const lines = content.split('\n');
        let inIndexes = false;
        let indexesStart = -1;
        let indexesEnd = -1;
        
        for (let i = 0; i < lines.length; i++) {
          if (lines[i].includes('indexes:')) {
            indexesStart = i;
            inIndexes = true;
          }
          
          if (inIndexes && lines[i].trim() === ']' && lines[i].includes(']')) {
            indexesEnd = i;
            break;
          }
        }
        
        if (indexesStart !== -1 && indexesEnd !== -1) {
          // Replace indexes array with empty one
          const newContent = [
            ...lines.slice(0, indexesStart),
            '  indexes: [], // TEMPORARILY EMPTY - to prevent sync errors',
            ...lines.slice(indexesEnd + 1)
          ].join('\n');
          
          fs.writeFileSync(filePath, newContent, 'utf8');
          console.log(`✅ Updated ${file}`);
          updatedCount++;
        }
      }
    }
  });
  
  return updatedCount;
}

async function main() {
  console.log('🔍 Looking for models directory...');
  
  const modelsDir = findModelsDirectory();
  
  if (!modelsDir) {
    console.error('❌ Could not find models directory. Tried:');
    possiblePaths.forEach(p => console.log(`  - ${p}`));
    console.log('\n📁 Please create this script in your project root directory.');
    return;
  }
  
  console.log(`\n📂 Scanning ${modelsDir} for Sequelize models...`);
  const updated = updateModelFiles(modelsDir);
  
  console.log(`\n🎉 Updated ${updated} model files.`);
  console.log('\n⚠️ IMPORTANT: Now update config/db.js to skip model syncing:');
  console.log(`
  // In config/db.js, change:
  if (NODE_ENV === 'development') {
    await sequelize.sync({ alter: false }); // Keep this or remove sync entirely
  }
  `);
}

main().catch(console.error);