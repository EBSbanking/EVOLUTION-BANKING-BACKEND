// scripts/find-all-bad-imports.js
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..'); // Go up one level from scripts
const searchDir = path.join(projectRoot, 'src'); // Look in src directory

function findAllBadImports() {
  console.log('🔍 Searching for all problematic imports...');
  console.log(`📁 Searching in: ${searchDir}`);
  
  const problematicFiles = [];
  
  function searchInDirectory(dir) {
    if (!fs.existsSync(dir)) {
      console.log(`❌ Directory not found: ${dir}`);
      return;
    }
    
    const files = fs.readdirSync(dir);
    
    for (const file of files) {
      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        searchInDirectory(fullPath);
      } else if (file.endsWith('.js')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          
          // Look for imports from modelLoader.js
          if (content.includes('modelLoader.js')) {
            const lines = content.split('\n');
            lines.forEach((line, index) => {
              if (line.includes('import') && line.includes('modelLoader.js')) {
                console.log(`\n📄 Found import in ${path.relative(projectRoot, fullPath)}:`);
                console.log(`   Line ${index + 1}: ${line.trim()}`);
                
                // Check for specific imports that might be missing
                if (line.includes('getSequelize')) {
                  console.log(`   ❌ Trying to import: getSequelize`);
                  problematicFiles.push({
                    file: fullPath,
                    relativePath: path.relative(projectRoot, fullPath),
                    line: index + 1,
                    import: 'getSequelize'
                  });
                }
                if (line.includes('getCustomer')) {
                  console.log(`   ⚠️ Trying to import: getCustomer`);
                  problematicFiles.push({
                    file: fullPath,
                    relativePath: path.relative(projectRoot, fullPath),
                    line: index + 1,
                    import: 'getCustomer'
                  });
                }
                if (line.includes('getLoanAccount')) {
                  console.log(`   ⚠️ Trying to import: getLoanAccount`);
                  problematicFiles.push({
                    file: fullPath,
                    relativePath: path.relative(projectRoot, fullPath),
                    line: index + 1,
                    import: 'getLoanAccount'
                  });
                }
              }
            });
          }
        } catch (error) {
          console.log(`⚠️ Could not read ${fullPath}: ${error.message}`);
        }
      }
    }
  }
  
  searchInDirectory(searchDir);
  
  if (problematicFiles.length > 0) {
    console.log('\n🚨 PROBLEMATIC IMPORTS FOUND:');
    problematicFiles.forEach(item => {
      console.log(`   ${item.relativePath}: Line ${item.line} - ${item.import}`);
    });
    
    console.log('\n💡 SOLUTIONS:');
    console.log('   1. Use the updated modelLoader.js (already has getSequelize export)');
    console.log('   2. OR update the imports to use modelHelper.js instead');
    console.log('   3. OR fix the imports manually');
    
    // Generate fix suggestions
    console.log('\n🛠️  FIX SUGGESTIONS:');
    problematicFiles.forEach(item => {
      console.log(`\n   File: ${item.relativePath}`);
      console.log(`   Fix: Update line ${item.line} to import from modelHelper.js`);
    });
  } else {
    console.log('\n✅ No problematic imports found!');
  }
  
  return problematicFiles;
}

findAllBadImports();