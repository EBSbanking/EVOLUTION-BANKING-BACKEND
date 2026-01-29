// src/models/Vault.js - NEW PATTERN VERSION
import { DataTypes, Model } from 'sequelize';
import sequelize from '../../config/db.js';

class Vault extends Model {}

Vault.init({
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  
  // VAULT IDENTIFICATION
  vault_id: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  vault_cd: { type: DataTypes.STRING(20), allowNull: false, unique: true },
  vault_nm: { type: DataTypes.STRING(100), allowNull: false },
  drawer_id: { type: DataTypes.INTEGER, allowNull: false },
  drawer_ref: { type: DataTypes.INTEGER },
  branch_ref: { type: DataTypes.INTEGER },
  branch_code: { type: DataTypes.STRING(10) },
  location_code: { type: DataTypes.STRING(20) },
  
  // ... rest of your fields (copy from your existing Vault model)
  vault_category: { type: DataTypes.ENUM('MAIN_VAULT','BRANCH_VAULT','TEMPORARY_VAULT','CASH_VAULT','BULLION_VAULT','HIGH_SECURITY_VAULT'), defaultValue: 'BRANCH_VAULT', allowNull: false },
  security_level: { type: DataTypes.ENUM('LEVEL_1','LEVEL_2','LEVEL_3','LEVEL_4'), defaultValue: 'LEVEL_2', allowNull: false },
  requires_dual_control: { type: DataTypes.BOOLEAN, defaultValue: true },
  min_authorized_persons: { type: DataTypes.INTEGER, defaultValue: 2 },
  max_authorized_persons: { type: DataTypes.INTEGER, defaultValue: 4 },
  vault_capacity: { type: DataTypes.DECIMAL(20,2), defaultValue: 10000000.00 },
  total_compartments: { type: DataTypes.INTEGER, defaultValue: 10 },
  available_compartments: { type: DataTypes.INTEGER, defaultValue: 10 },
  access_opening_time: { type: DataTypes.TIME },
  access_closing_time: { type: DataTypes.TIME },
  after_hours_access: { type: DataTypes.BOOLEAN, defaultValue: false },
  security_breach_count: { type: DataTypes.INTEGER, defaultValue: 0 },
  last_security_check: { type: DataTypes.DATE },
  next_security_audit: { type: DataTypes.DATE },
  insurance_policy_number: { type: DataTypes.STRING(50) },
  insurance_company: { type: DataTypes.STRING(100) },
  insurance_coverage_amount: { type: DataTypes.DECIMAL(20,2) },
  maintenance_last_date: { type: DataTypes.DATE },
  maintenance_next_date: { type: DataTypes.DATE },
  maintenance_frequency: { type: DataTypes.INTEGER, defaultValue: 90 },
  cash_on_hand: { type: DataTypes.DECIMAL(20,2) },
  limit_max_single_deposit: { type: DataTypes.DECIMAL(20,2) },
  limit_max_single_withdrawal: { type: DataTypes.DECIMAL(20,2) },
  limit_daily_deposit: { type: DataTypes.DECIMAL(20,2) },
  limit_daily_withdrawal: { type: DataTypes.DECIMAL(20,2) },
  vault_status: { type: DataTypes.ENUM('OPERATIONAL','MAINTENANCE','EMERGENCY_LOCKDOWN','INVENTORY','DECOMMISSIONED'), defaultValue: 'OPERATIONAL', allowNull: false },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  created_by: { type: DataTypes.STRING(24), allowNull: false },
  updated_by: { type: DataTypes.STRING(24) },
  last_activity_date: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  sequelize,
  modelName: 'Vault',
  tableName: 'vaults',
  timestamps: true,
  underscored: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

export default Vault;