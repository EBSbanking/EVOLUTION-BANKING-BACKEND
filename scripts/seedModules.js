// scripts/seedModules.js
import { Module, RoleModule, Role } from '../src/models/index.js';  // 👈 fixed path
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const seedData = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, '../seed/modules.json'), 'utf-8')
);

async function seedModules() {
  console.log('🌱 Seeding modules...');

  // 1. Ensure roles exist in the database
  const roleNames = Object.keys(seedData.roles);
  for (const roleName of roleNames) {
    const roleId = seedData.roles[roleName];
    const [role, created] = await Role.findOrCreate({
      where: { role_id: roleId },
      defaults: {
        role_name: roleName,
        active: 1,
        description: `Role: ${roleName}`
      }
    });
    if (created) {
      console.log(`✅ Created role: ${roleName} (ID: ${roleId})`);
    } else {
      console.log(`ℹ️  Role already exists: ${roleName} (ID: ${roleId})`);
    }
  }

  // 2. Get all roles from database (by role_name) for mapping
  const roles = await Role.findAll({ attributes: ['role_id', 'role_name'] });
  const roleMap = {};
  roles.forEach(role => {
    roleMap[role.role_name] = role.role_id;
  });

  // 3. Insert modules (deduplicate by actionKey)
  let moduleCount = 0;
  for (const group of seedData.modules) {
    for (const item of group.items) {
      const [module, created] = await Module.findOrCreate({
        where: { actionKey: item.actionKey },
        defaults: {
          title: group.title,
          label: item.label,
          permission: item.permission || null,
          icon: item.icon || null,
          isModal: item.isModal !== undefined ? item.isModal : true,
          category: item.category || 'all',
          description: item.description || '',
          displayOrder: 0,
        }
      });
      if (created) {
        console.log(`✅ Created module: ${item.actionKey}`);
        moduleCount++;
      } else {
        console.log(`ℹ️  Module already exists: ${item.actionKey}`);
      }
    }
  }

  // 4. Assign modules to roles
  let assignmentCount = 0;
  for (const [roleName, actionKeys] of Object.entries(seedData.roleModules)) {
    const roleId = roleMap[roleName];
    if (!roleId) {
      console.warn(`⚠️  Role "${roleName}" not found in database. Skipping.`);
      continue;
    }

    for (const actionKey of actionKeys) {
      const module = await Module.findOne({ where: { actionKey } });
      if (module) {
        await RoleModule.findOrCreate({
          where: { roleId, moduleId: module.id }
        });
        console.log(`✅ Assigned ${actionKey} to ${roleName}`);
        assignmentCount++;
      } else {
        console.warn(`⚠️  Module ${actionKey} not found for role ${roleName}`);
      }
    }
  }

  console.log(`🎉 Seeding complete! ${moduleCount} modules inserted, ${assignmentCount} role assignments created.`);
}

seedModules().catch(console.error);