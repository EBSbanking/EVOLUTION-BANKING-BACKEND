// find-route-permissions.js
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

console.log('🔍 Scanning for route files...\n');

// Function to recursively find files
function findFiles(dir, pattern) {
  let results = [];
  const items = readdirSync(dir);
  
  for (const item of items) {
    const fullPath = join(dir, item);
    const stat = statSync(fullPath);
    
    if (stat.isDirectory()) {
      // Skip node_modules and other unnecessary directories
      if (!item.includes('node_modules') && !item.startsWith('.') && item !== 'scripts') {
        results = results.concat(findFiles(fullPath, pattern));
      }
    } else if (item.match(pattern)) {
      results.push(fullPath);
    }
  }
  
  return results;
}

// Find all route files
const routeFiles = findFiles(projectRoot, /(routes?|controllers?)\.js$/i);
const routeFiles2 = findFiles(projectRoot, /\.js$/).filter(file => 
  file.includes('route') || file.includes('vault') || file.includes('api')
);

const allRouteFiles = [...new Set([...routeFiles, ...routeFiles2])];

console.log(`📋 Found ${allRouteFiles.length} potential route files:\n`);
allRouteFiles.forEach(file => {
  console.log(`  • ${file.replace(projectRoot, '')}`);
});

// Now search for checkPermissions usage
console.log('\n🔍 Searching for checkPermissions usage...\n');

let foundCheckPermissions = false;

for (const file of allRouteFiles) {
  try {
    const content = readFileSync(file, 'utf8');
    
    // Look for checkPermissions calls
    const checkPermissionsRegex = /checkPermissions\(['"`]([^'"`]+)['"`]\)/g;
    const matches = [...content.matchAll(checkPermissionsRegex)];
    
    if (matches.length > 0) {
      console.log(`📄 File: ${file.replace(projectRoot, '')}`);
      matches.forEach((match, index) => {
        console.log(`  [${index + 1}] checkPermissions('${match[1]}')`);
      });
      console.log('');
      foundCheckPermissions = true;
    }
    
    // Also look for vault routes
    if (content.includes('vault') && (content.includes('router.') || content.includes('app.'))) {
      const lines = content.split('\n');
      lines.forEach((line, lineNumber) => {
        if (line.includes('vault') && (line.includes('router.') || line.includes('app.'))) {
          console.log(`🔍 Found vault route in ${file.replace(projectRoot, '')}:${lineNumber + 1}`);
          console.log(`   ${line.trim()}`);
          console.log('');
        }
      });
    }
    
  } catch (error) {
    console.log(`⚠️  Could not read ${file}: ${error.message}`);
  }
}

if (!foundCheckPermissions) {
  console.log('❌ No checkPermissions calls found.');
  console.log('\n🔍 Searching for permission middleware patterns...\n');
  
  // Look for other permission patterns
  const permissionPatterns = [
    /permission.*\(['"`]([^'"`]+)['"`]\)/gi,
    /auth.*\(['"`]([^'"`]+)['"`]\)/gi,
    /middleware.*\(['"`]([^'"`]+)['"`]\)/gi
  ];
  
  for (const file of allRouteFiles) {
    try {
      const content = readFileSync(file, 'utf8');
      permissionPatterns.forEach(pattern => {
        const matches = [...content.matchAll(pattern)];
        if (matches.length > 0) {
          console.log(`📄 File: ${file.replace(projectRoot, '')}`);
          matches.forEach(match => {
            if (match[1]) {
              console.log(`  Found: ${match[0].trim()}`);
            }
          });
          console.log('');
        }
      });
    } catch (error) {
      // Skip files we can't read
    }
  }
}

console.log('\n🔧 QUICK FIXES TO TRY:');
console.log('=====================\n');

console.log('1. Check your vault route file for the exact checkPermissions parameter');
console.log('2. If it\'s not "VIEW_VAULTS", update it to use "VIEW_VAULTS"');
console.log('3. Or add the module key to your MODULE_PERMISSIONS object\n');

console.log('📋 Example route fix:');
console.log(`
// Change this (if using different module key):
router.get('/vaults', checkPermissions('viewVaults'), getVaults);

// To this:
router.get('/vaults', checkPermissions('VIEW_VAULTS'), getVaults);
`);

console.log('\n📋 Or add to MODULE_PERMISSIONS in permissions.js:');
console.log(`
// Add this line to your MODULE_PERMISSIONS object:
viewVaults: PERMISSIONS.VAULT.VIEW_VAULTS,
// or
vaults: PERMISSIONS.VAULT.VIEW_VAULTS,
// or whatever module key you're using
`);