// src/controllers/moduleController.js
import { Module, Role, RoleModule } from '../models/index.js';

/**
 * GET /modules - Admin only
 * Fetch all modules with their assigned roles
 */
export const getAllModules = async (req, res) => {
  try {
    const modules = await Module.findAll({
      include: [
        {
          model: Role,
          as: 'roles',
          through: { attributes: [] }, // exclude join table fields
          attributes: ['role_id', 'role_name'], // map to id/name later
        },
      ],
      order: [['title', 'ASC'], ['displayOrder', 'ASC']],
    });

    // Transform to match frontend expectations: role.id, role.name
    const formatted = modules.map(mod => {
      const plain = mod.get({ plain: true });
      plain.roles = plain.roles.map(role => ({
        id: role.role_id,
        name: role.role_name,
      }));
      return plain;
    });

    res.json({ success: true, modules: formatted });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /roles - Admin only
 * Fetch all active roles (for role assignment checkboxes)
 */
export const getRoles = async (req, res) => {
  try {
    const roles = await Role.findAll({
      where: { active: true },
      attributes: ['role_id', 'role_name'],
      order: [['role_name', 'ASC']],
    });

    const formatted = roles.map(role => ({
      id: role.role_id,
      name: role.role_name,
    }));

    res.json({ success: true, roles: formatted });
  } catch (error) {
    console.error('Error fetching roles:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * POST /modules - Admin only
 * Create a new module
 */
export const createModule = async (req, res) => {
  try {
    const { title, label, actionKey, permission, icon, isModal, category, description } = req.body;

    // Validate required fields
    if (!title || !label || !actionKey) {
      return res.status(400).json({
        success: false,
        message: 'Title, label, and actionKey are required.',
      });
    }

    // Check for duplicate actionKey
    const existing = await Module.findOne({ where: { actionKey } });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `A module with actionKey "${actionKey}" already exists.`,
      });
    }

    const module = await Module.create({
      title,
      label,
      actionKey,
      permission: permission || null,
      icon: icon || null,
      isModal: isModal !== undefined ? isModal : true,
      category: category || 'all',
      description: description || '',
      displayOrder: 0,
    });

    // If roles are provided, assign them (optional)
    // The frontend will call PUT /modules/:id/roles separately, so we don't assign here.

    res.status(201).json({ success: true, module });
  } catch (error) {
    console.error('Error creating module:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /modules/:id - Admin only
 * Update an existing module
 */
export const updateModule = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, label, actionKey, permission, icon, isModal, category, description, displayOrder } = req.body;

    const module = await Module.findByPk(id);
    if (!module) {
      return res.status(404).json({ success: false, message: 'Module not found.' });
    }

    // Check duplicate actionKey if it's being changed
    if (actionKey && actionKey !== module.actionKey) {
      const existing = await Module.findOne({ where: { actionKey } });
      if (existing) {
        return res.status(400).json({
          success: false,
          message: `Another module already uses actionKey "${actionKey}".`,
        });
      }
    }

    await module.update({
      title: title || module.title,
      label: label || module.label,
      actionKey: actionKey || module.actionKey,
      permission: permission !== undefined ? permission : module.permission,
      icon: icon !== undefined ? icon : module.icon,
      isModal: isModal !== undefined ? isModal : module.isModal,
      category: category || module.category,
      description: description !== undefined ? description : module.description,
      displayOrder: displayOrder !== undefined ? displayOrder : module.displayOrder,
    });

    res.json({ success: true, module });
  } catch (error) {
    console.error('Error updating module:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * DELETE /modules/:id - Admin only
 * Delete a module (cascade will remove role assignments)
 */
export const deleteModule = async (req, res) => {
  try {
    const { id } = req.params;
    const module = await Module.findByPk(id);
    if (!module) {
      return res.status(404).json({ success: false, message: 'Module not found.' });
    }

    await module.destroy();
    res.json({ success: true, message: 'Module deleted successfully.' });
  } catch (error) {
    console.error('Error deleting module:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * PUT /modules/:id/roles - Admin only
 * Replace all role assignments for a module
 * Expects: { roleIds: [1, 2, 3] }
 */
export const updateModuleRoles = async (req, res) => {
  try {
    const { id } = req.params;
    const { roleIds } = req.body; // array of role IDs

    const module = await Module.findByPk(id);
    if (!module) {
      return res.status(404).json({ success: false, message: 'Module not found.' });
    }

    // Delete all existing assignments
    await RoleModule.destroy({ where: { moduleId: id } });

    // Insert new assignments
    if (roleIds && roleIds.length > 0) {
      // Validate that all roleIds exist
      const validRoles = await Role.findAll({
        where: { role_id: roleIds, active: true },
        attributes: ['role_id'],
      });
      const validIds = validRoles.map(r => r.role_id);
      const invalid = roleIds.filter(id => !validIds.includes(id));
      if (invalid.length > 0) {
        // Rollback? Or just warn? We'll proceed with valid ones.
        console.warn(`Invalid role IDs ignored: ${invalid.join(', ')}`);
      }
      const toInsert = validIds.map(roleId => ({ roleId, moduleId: id }));
      await RoleModule.bulkCreate(toInsert);
    }

    res.json({ success: true, message: 'Role assignments updated.' });
  } catch (error) {
    console.error('Error updating module roles:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

/**
 * GET /modules/me - for current user
 * Return modules grouped by title for the logged-in user's role.
 */
export const getUserModules = async (req, res) => {
  try {
    const roleId = req.user?.roleId; // from auth middleware (JWT)
    if (!roleId) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const modules = await Module.findAll({
      include: [
        {
          model: Role,
          as: 'roles',
          where: { role_id: roleId },
          through: { attributes: [] },
          required: true,
        },
      ],
      order: [['title', 'ASC'], ['displayOrder', 'ASC']],
    });

    // Group by title
    const grouped = modules.reduce((acc, mod) => {
      const key = mod.title;
      if (!acc[key]) {
        acc[key] = {
          id: key, // use title as id (or you could use a slug)
          title: key,
          items: [],
        };
      }
      acc[key].items.push({
        label: mod.label,
        actionKey: mod.actionKey,
        permission: mod.permission,
        icon: mod.icon,
        isModal: mod.isModal,
      });
      return acc;
    }, {});

    const result = Object.values(grouped);
    res.json({ success: true, modules: result });
  } catch (error) {
    console.error('Error fetching user modules:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};