// migrations/XXXXXXXXXXXXXX-create-emtl-tables.js
'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    // Create EMTL Policies table
    await queryInterface.createTable('emtl_policies', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      policy_code: {
        type: Sequelize.STRING(20),
        unique: true,
        allowNull: false,
        defaultValue: 'EMTL'
      },
      policy_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'Electronic Money Transfer Levy'
      },
      description: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      enabled: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      priority: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 10
      },
      threshold: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 10000.00
      },
      levy_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 50.00
      },
      levy_type: {
        type: Sequelize.ENUM('FLAT', 'PERCENTAGE'),
        allowNull: false,
        defaultValue: 'FLAT'
      },
      percentage_rate: {
        type: Sequelize.DECIMAL(5, 2),
        allowNull: true
      },
      apply_on: {
        type: Sequelize.JSON,
        allowNull: false
      },
      exemptions: {
        type: Sequelize.JSON,
        allowNull: false
      },
      effective_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      expiry_date: {
        type: Sequelize.DATEONLY,
        allowNull: true
      },
      gl_account: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: '2401000001'
      },
      gl_account_name: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'EMTL Payable'
      },
      beneficiary: {
        type: Sequelize.STRING(100),
        allowNull: false,
        defaultValue: 'FIRS'
      },
      beneficiary_account: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: '0000000001'
      },
      beneficiary_bank: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'CBN'
      },
      is_active: {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: true
      },
      version: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 1
      },
      created_by: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'SYSTEM'
      },
      created_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_by: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      updated_date: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Create EMTL Audit Logs table
    await queryInterface.createTable('emtl_audit_logs', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      policy_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: {
          model: 'emtl_policies',
          key: 'id'
        },
        onDelete: 'CASCADE'
      },
      field_changed: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      old_value: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      new_value: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      changed_by: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      change_reason: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      ip_address: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      user_agent: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      changed_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Create EMTL Transactions table
    await queryInterface.createTable('emtl_transactions', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      transaction_id: {
        type: Sequelize.STRING(50),
        unique: true,
        allowNull: false
      },
      transaction_reference: {
        type: Sequelize.STRING(50),
        allowNull: false
      },
      customer_no: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      account_no: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      transfer_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false
      },
      transfer_date: {
        type: Sequelize.DATE,
        allowNull: false
      },
      channel: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      transaction_type: {
        type: Sequelize.STRING(20),
        allowNull: false
      },
      status: {
        type: Sequelize.ENUM('PENDING_REMITTANCE', 'IN_REMITTANCE', 'REMITTED', 'FAILED'),
        allowNull: false,
        defaultValue: 'PENDING_REMITTANCE'
      },
      remittance_batch_id: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      remitted_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      remittance_reference: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      journal_entry_id: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      gl_account: {
        type: Sequelize.STRING(20),
        allowNull: false,
        defaultValue: '2401000001'
      },
      levy_calculation: {
        type: Sequelize.JSON,
        allowNull: true
      },
      created_by: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'SYSTEM'
      },
      created_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      updated_by: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      updated_date: {
        type: Sequelize.DATE,
        allowNull: true
      }
    });

    // Create Remittance Batches table
    await queryInterface.createTable('remittance_batches', {
      id: {
        type: Sequelize.INTEGER,
        primaryKey: true,
        autoIncrement: true
      },
      batch_id: {
        type: Sequelize.STRING(50),
        unique: true,
        allowNull: false
      },
      start_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      end_date: {
        type: Sequelize.DATEONLY,
        allowNull: false
      },
      total_transactions: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0
      },
      total_amount: {
        type: Sequelize.DECIMAL(15, 2),
        allowNull: false,
        defaultValue: 0.00
      },
      status: {
        type: Sequelize.ENUM('GENERATED', 'IN_REMITTANCE', 'REMITTED', 'FAILED'),
        allowNull: false,
        defaultValue: 'GENERATED'
      },
      remitted_date: {
        type: Sequelize.DATE,
        allowNull: true
      },
      remittance_reference: {
        type: Sequelize.STRING(50),
        allowNull: true
      },
      generated_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      },
      csv_path: {
        type: Sequelize.STRING(255),
        allowNull: true
      },
      csv_content: {
        type: Sequelize.TEXT,
        allowNull: true
      },
      upload_response: {
        type: Sequelize.JSON,
        allowNull: true
      },
      created_by: {
        type: Sequelize.STRING(50),
        allowNull: false,
        defaultValue: 'SYSTEM'
      },
      created_date: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
      }
    });

    // Add indexes
    await queryInterface.addIndex('emtl_policies', ['policy_code']);
    await queryInterface.addIndex('emtl_policies', ['enabled', 'is_active']);
    await queryInterface.addIndex('emtl_policies', ['effective_date', 'expiry_date']);

    await queryInterface.addIndex('emtl_audit_logs', ['policy_id']);
    await queryInterface.addIndex('emtl_audit_logs', ['changed_by']);
    await queryInterface.addIndex('emtl_audit_logs', ['changed_date']);

    await queryInterface.addIndex('emtl_transactions', ['transaction_id']);
    await queryInterface.addIndex('emtl_transactions', ['customer_no']);
    await queryInterface.addIndex('emtl_transactions', ['account_no']);
    await queryInterface.addIndex('emtl_transactions', ['status']);
    await queryInterface.addIndex('emtl_transactions', ['remittance_batch_id']);
    await queryInterface.addIndex('emtl_transactions', ['transfer_date']);

    await queryInterface.addIndex('remittance_batches', ['batch_id']);
    await queryInterface.addIndex('remittance_batches', ['status']);
    await queryInterface.addIndex('remittance_batches', ['start_date', 'end_date']);
    await queryInterface.addIndex('remittance_batches', ['generated_date']);
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.dropTable('remittance_batches');
    await queryInterface.dropTable('emtl_transactions');
    await queryInterface.dropTable('emtl_audit_logs');
    await queryInterface.dropTable('emtl_policies');
  }
};