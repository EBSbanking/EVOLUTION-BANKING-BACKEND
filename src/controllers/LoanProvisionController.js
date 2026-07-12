import LoanProvision from '../models/LoanProvision.js';
import LoanAccount from '../models/LoanAccount.js';
import sequelize from '../../config/db.js';

// ================ GET PROVISIONS FOR A LOAN ================
export const getProvisionsByLoan = async (req, res) => {
  try {
    const { acct_no } = req.params;
    const provisions = await LoanProvision.findAll({
      where: { acct_no },
      order: [['provision_date', 'DESC']]
    });
    return res.status(200).json({
      success: true,
      data: provisions
    });
  } catch (error) {
    console.error('Error fetching provisions:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch provisions',
      error: error.message
    });
  }
};

// ================ GET SUMMARY BY BRANCH / PRODUCT ================
export const getProvisionSummary = async (req, res) => {
  try {
    const { branch, productId, startDate, endDate } = req.query;
    const where = {};
    if (branch) where['$LoanAccount.BU_ID$'] = branch;
    if (productId) where['$LoanAccount.LOAN_PRODUCT_ID$'] = productId;
    if (startDate) where.provision_date = { [Op.gte]: new Date(startDate) };
    if (endDate) where.provision_date = { [Op.lte]: new Date(endDate) };

    const provisions = await LoanProvision.findAll({
      where,
      include: [{
        model: LoanAccount,
        as: 'LoanAccount',
        attributes: ['ACCT_NO', 'ACCT_NM', 'BU_ID', 'LOAN_PRODUCT_ID']
      }],
      order: [['provision_date', 'DESC']]
    });

    const totalProvision = provisions.reduce((sum, p) => sum + parseFloat(p.provision_amount), 0);
    const activeProvisions = provisions.filter(p => p.status === 'ACTIVE');
    const activeTotal = activeProvisions.reduce((sum, p) => sum + parseFloat(p.provision_amount), 0);

    return res.status(200).json({
      success: true,
      data: {
        totalProvisions: provisions.length,
        totalAmount: totalProvision,
        activeProvisions: activeProvisions.length,
        activeAmount: activeTotal,
        provisions
      }
    });
  } catch (error) {
    console.error('Error fetching provision summary:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch provision summary',
      error: error.message
    });
  }
};

// ================ REVERSE PROVISION (e.g., loan written off) ================
export const reverseProvision = async (req, res) => {
  const transaction = await sequelize.transaction();
  try {
    const { provisionId } = req.params;
    const { reason } = req.body;

    const provision = await LoanProvision.findByPk(provisionId, { transaction });
    if (!provision) {
      await transaction.rollback();
      return res.status(404).json({
        success: false,
        message: 'Provision not found'
      });
    }

    if (provision.status !== 'ACTIVE') {
      await transaction.rollback();
      return res.status(400).json({
        success: false,
        message: 'Provision already reversed or not active'
      });
    }

    await provision.update({
      status: 'REVERSED',
      reversed_at: new Date(),
      reversal_reason: reason || 'Manual reversal'
    }, { transaction });

    // Optionally post reversing GL entries
    // (DR provision GL, CR expense GL)
    // For simplicity, we skip GL reversal here – you can extend.

    await transaction.commit();
    return res.status(200).json({
      success: true,
      message: 'Provision reversed successfully',
      data: provision
    });
  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error('Error reversing provision:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to reverse provision',
      error: error.message
    });
  }
};