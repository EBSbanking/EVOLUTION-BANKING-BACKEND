// scripts/extractModules.js
import fs from 'fs';
import path from 'path';
import { parse } from '@babel/parser';
import traverse from '@babel/traverse';
import * as t from '@babel/types';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// === CONFIGURATION ===
const DATA_FOLDER = path.resolve(__dirname, '../../EVOLUTION BANKING FRONTEND/src/data');

// Map each file base name to role ID (from ROLE_MAPPING)
const FILE_ROLE_MAP = {
  'ModulesData': 1,          // Administrator
  'ModulesDataTeller': 29,   // Teller
  'ModulesDataCSO': 28,      // Customer Service Officer
  'ModulesDataCEO': 15,      // Chief Executive Officer
  'ModulesDataBM': 19,       // Branch Manager
  'ModulesDataDIGITAL': 35,  // Head of Digital Banking
  // add others if needed
};

// === FALLBACK ROLE MAPPING (full list) ===
const fallbackRoles = {
  1: { id: 1, ROLE_NM: 'Administrator' },
  2: { id: 2, ROLE_NM: 'Head Banking Services' },
  3: { id: 3, ROLE_NM: 'Loan Processing Officer' },
  4: { id: 4, ROLE_NM: 'Senior Financial Accountant' },
  5: { id: 5, ROLE_NM: 'Internal Control Officer' },
  6: { id: 6, ROLE_NM: 'Internal Control Manager' },
  7: { id: 7, ROLE_NM: 'Head of Credit' },
  8: { id: 8, ROLE_NM: 'Internal Audit Manager' },
  9: { id: 9, ROLE_NM: 'Head Human Resources' },
  10: { id: 10, ROLE_NM: 'Human Resource Officer' },
  11: { id: 11, ROLE_NM: 'IT Manager' },
  12: { id: 12, ROLE_NM: 'Financial Accountant' },
  13: { id: 13, ROLE_NM: 'Financial Accountant Manager' },
  14: { id: 14, ROLE_NM: 'Chief Financial Officer' },
  15: { id: 15, ROLE_NM: 'Chief Executive Officer' },
  16: { id: 16, ROLE_NM: 'Treasurer' },
  17: { id: 17, ROLE_NM: 'Loan Processing Supervisor' },
  18: { id: 18, ROLE_NM: 'Senior Financial Accountant' },
  19: { id: 19, ROLE_NM: 'Branch Manager' },
  20: { id: 20, ROLE_NM: 'Branch Operation Supervisor' },
  21: { id: 21, ROLE_NM: 'Chief Operation Officer' },
  22: { id: 22, ROLE_NM: 'Marketing Manager' },
  23: { id: 23, ROLE_NM: 'Payment and Reconciliation NGN' },
  24: { id: 24, ROLE_NM: 'EOD Operator' },
  25: { id: 25, ROLE_NM: 'Recovery Officer' },
  26: { id: 26, ROLE_NM: 'Relationship Development Officer' },
  27: { id: 27, ROLE_NM: 'Customer Relationship Officer' },
  28: { id: 28, ROLE_NM: 'Customer Service Officer' },
  29: { id: 29, ROLE_NM: 'Teller' },
  30: { id: 30, ROLE_NM: 'Head Teller' },
  31: { id: 31, ROLE_NM: 'Customer Relationship Supervisor' },
  32: { id: 32, ROLE_NM: 'Recovery Team Lead' },
  33: { id: 33, ROLE_NM: 'Business Analyst' },
  34: { id: 34, ROLE_NM: 'Credit Risk Analyst' },
  35: { id: 35, ROLE_NM: 'Head of Digital Banking' },
  36: { id: 36, ROLE_NM: 'Agency Banking Officer' },
  37: { id: 37, ROLE_NM: 'Channel Manager' },
  38: { id: 38, ROLE_NM: 'Vault Manager' },
};

// === HELPER FUNCTIONS ===
function getPermissionString(node) {
  if (t.isIdentifier(node)) return node.name;
  if (t.isMemberExpression(node)) {
    const object = getPermissionString(node.object);
    const property = getPermissionString(node.property);
    return object && property ? `${object}.${property}` : null;
  }
  if (t.isStringLiteral(node)) return node.value;
  return null;
}

function getIconName(node) {
  if (t.isJSXElement(node) && t.isJSXIdentifier(node.openingElement.name)) {
    return node.openingElement.name.name;
  }
  if (t.isJSXFragment(node)) return null;
  if (t.isIdentifier(node)) return node.name;
  return null;
}

// === EXTRACTION FROM FILE ===
function extractModulesFromFile(filePath) {
  const code = fs.readFileSync(filePath, 'utf-8');
  const ast = parse(code, {
    sourceType: 'module',
    plugins: ['jsx', 'classProperties', 'objectRestSpread', 'optionalChaining'],
  });

  let modules = [];
  let roleActionKeys = [];

  traverse(ast, {
    // Look for: const getAllModules = () => [ ... ]
    VariableDeclarator(path) {
      const id = path.node.id;
      const init = path.node.init;

      // Check if variable is named 'getAllModules'
      if (t.isIdentifier(id) && id.name === 'getAllModules') {
        // The initializer should be an arrow function or function expression
        if (t.isArrowFunctionExpression(init) || t.isFunctionExpression(init)) {
          // Find the return statement inside the function body
          // For arrow functions with block body, find return; for concise body, the body itself is the expression
          if (t.isBlockStatement(init.body)) {
            init.body.body.forEach(statement => {
              if (t.isReturnStatement(statement) && t.isArrayExpression(statement.argument)) {
                processArray(statement.argument);
              }
            });
          } else if (t.isArrayExpression(init.body)) {
            // Concise arrow function: () => [ ... ]
            processArray(init.body);
          }
        }
      }
    }
  });

  function processArray(arrayExpr) {
    arrayExpr.elements.forEach(group => {
      if (t.isObjectExpression(group)) {
        let groupTitle = '', groupId = '', items = [];
        group.properties.forEach(prop => {
          if (t.isObjectProperty(prop) || t.isObjectMethod(prop)) {
            const key = t.isIdentifier(prop.key) ? prop.key.name : prop.key.value;
            if (key === 'title') groupTitle = prop.value.value;
            if (key === 'id') groupId = prop.value.value;
            if (key === 'items' && t.isArrayExpression(prop.value)) {
              prop.value.elements.forEach(item => {
                if (t.isObjectExpression(item)) {
                  let label = '', actionKey = '', permission = null, icon = null, isModal = true, category = 'all', description = '';
                  item.properties.forEach(itemProp => {
                    const itemKey = t.isIdentifier(itemProp.key) ? itemProp.key.name : itemProp.key.value;
                    if (itemKey === 'label') label = itemProp.value.value;
                    if (itemKey === 'actionKey') actionKey = itemProp.value.value;
                    if (itemKey === 'permission') permission = getPermissionString(itemProp.value);
                    if (itemKey === 'icon') icon = getIconName(itemProp.value);
                    if (itemKey === 'isModal') isModal = itemProp.value.value;
                    if (itemKey === 'category') category = itemProp.value.value;
                    if (itemKey === 'description') description = itemProp.value.value;
                  });
                  if (actionKey) {
                    items.push({ label, actionKey, permission, icon, isModal, category, description });
                    roleActionKeys.push(actionKey);
                  }
                }
              });
            }
          }
        });
        if (groupTitle && items.length) {
          modules.push({
            title: groupTitle,
            id: groupId || groupTitle.toLowerCase().replace(/\s/g, ''),
            items
          });
        }
      }
    });
  }

  return { modules, roleActionKeys };
}

// === LOAD ROLE MAPPING (with fallback) - FIXED FOR WINDOWS ===
async function loadRoleMapping() {
  try {
    // Get the absolute path to roleMapping.js
    const roleMappingPath = path.resolve(__dirname, '../../EVOLUTION BANKING BACKEND/src/constants/roleMapping.js');
    console.log('📂 Attempting to load ROLE_MAPPING from:', roleMappingPath);
    
    // Check if file exists
    if (!fs.existsSync(roleMappingPath)) {
      console.error('❌ File not found:', roleMappingPath);
      console.log('⚠️ Using fallback mapping instead.');
      return fallbackRoles;
    }
    
    // Convert Windows path to file:// URL
    // Replace backslashes with forward slashes and encode spaces
    const normalizedPath = roleMappingPath.replace(/\\/g, '/');
    const fileUrl = new URL(`file:///${normalizedPath}`);
    console.log('📂 Using URL:', fileUrl.href);
    
    // Import using the file URL
    const module = await import(fileUrl.href);
    console.log('✅ ROLE_MAPPING loaded successfully');
    
    // Check if ROLE_MAPPING exists in the module
    if (module.ROLE_MAPPING) {
      return module.ROLE_MAPPING;
    } else {
      console.warn('⚠️ ROLE_MAPPING not found in module, using fallback');
      return fallbackRoles;
    }
  } catch (err) {
    console.error('❌ Could not load ROLE_MAPPING:', err.message);
    console.log('⚠️ Using fallback mapping instead.');
    return fallbackRoles;
  }
}

// === MAIN ===
async function main() {
  console.log('🔍 Starting module extraction...');

  const ROLE_MAPPING = await loadRoleMapping();
  const fileRoleMap = {};
  for (const [fileBase, roleId] of Object.entries(FILE_ROLE_MAP)) {
    const role = ROLE_MAPPING[roleId];
    if (role) {
      fileRoleMap[fileBase] = {
        roleId,
        roleName: role.ROLE_NM,
      };
    } else {
      console.warn(`⚠️ Role ID ${roleId} not found in ROLE_MAPPING for file ${fileBase}`);
    }
  }

  const allModules = [];
  const roleModulesMap = {};

  const files = fs.readdirSync(DATA_FOLDER);
  for (const file of files) {
    const fileBase = path.basename(file, path.extname(file));
    if (!fileRoleMap[fileBase]) continue;

    const filePath = path.join(DATA_FOLDER, file);
    console.log(`📂 Processing ${file}...`);
    const { modules, roleActionKeys } = extractModulesFromFile(filePath);
    const { roleId, roleName } = fileRoleMap[fileBase];

    allModules.push(...modules);
    if (!roleModulesMap[roleName]) roleModulesMap[roleName] = [];
    roleModulesMap[roleName].push(...roleActionKeys);
  }

  // Deduplicate modules by actionKey
  const moduleMap = new Map();
  for (const group of allModules) {
    for (const item of group.items) {
      if (!moduleMap.has(item.actionKey)) {
        moduleMap.set(item.actionKey, { group: group.title, ...item });
      }
    }
  }

  // Rebuild grouped by title
  const groupedModules = {};
  for (const [actionKey, item] of moduleMap.entries()) {
    const title = item.group;
    if (!groupedModules[title]) groupedModules[title] = { title, items: [] };
    const { group, ...rest } = item;
    groupedModules[title].items.push(rest);
  }
  const finalModules = Object.values(groupedModules);

  // Build roles object for seed script
  const rolesOutput = {};
  for (const [fileBase, { roleId, roleName }] of Object.entries(fileRoleMap)) {
    rolesOutput[roleName] = roleId;
  }

  // Final JSON
  const output = {
    roles: rolesOutput,
    modules: finalModules,
    roleModules: roleModulesMap,
  };

  const outputPath = path.join(__dirname, '../seed/modules.json');
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(output, null, 2));
  console.log(`✅ Generated ${outputPath}`);
  console.log(`📊 Modules: ${finalModules.length} groups, ${moduleMap.size} unique items`);
  console.log(`📋 Roles covered: ${Object.keys(rolesOutput).join(', ')}`);
}

main().catch(console.error);