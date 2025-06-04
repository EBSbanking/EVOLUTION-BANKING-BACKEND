import TermDeposit from '../models/TermDeposit.js';

// Create a new term deposit
export const createTermDeposit = async (req, res) => {
  try {
    const {
      acctNm,
      startDt,
      rolloverOptCd,
      term,
      maturityDt,
      noticeAmount,
      primaryOfficer,
      intSetlmentOptionCd,
      settlementAccount,
      customerName,
      principalSettlementMethod,
      rateType,
      ratePattern,
      absoluteRateInterest,
      fixedRate,
      marginRate,
      effectiveRate,
      effectiveDate,
      accrualBasis,
      settlementFrequency,
      nextSettlementDate,
      versionNo,
      CUST_ID,
      primaryOfficerId,
      secondaryOfficerId,
      BU_ID,
      crncyId,
      prodId,
      openingRsnId,
      mktCampaignRef,
      acctId,
      autoCloseOnExpiryFg
    } = req.body;

    // Automatically generate the acctNo (between 2000000000 and 2000000020)
    const generatedAcctNo = Math.floor(Math.random() * 21) + 2000000000;

    const termDeposit = new TermDeposit({
      acctNm,
      acctNo: generatedAcctNo,  // Automatically set the generated account number
      startDt,
      rolloverOptCd,
      term,
      maturityDt,
      noticeAmount,
      primaryOfficer,
      intSetlmentOptionCd,
      settlementAccount,
      customerName,
      principalSettlementMethod,
      rateType,
      ratePattern,
      absoluteRateInterest,
      fixedRate,
      marginRate,
      effectiveRate,
      effectiveDate,
      accrualBasis,
      settlementFrequency,
      nextSettlementDate,
      versionNo,
      CUST_ID,
      primaryOfficerId,
      secondaryOfficerId,
      BU_ID,
      crncyId,
      prodId,
      openingRsnId,
      mktCampaignRef,
      acctId,
      autoCloseOnExpiryFg
    });

    const result = await termDeposit.save();
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Get all term deposits
export const getAllTermDeposits = async (req, res) => {
  try {
    const termDeposits = await TermDeposit.find();
    res.status(200).json(termDeposits);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get a term deposit by ID
export const getTermDepositById = async (req, res) => {
  try {
    const termDeposit = await TermDeposit.findById(req.params.id);
    if (!termDeposit) {
      return res.status(404).json({ message: 'Term Deposit not found' });
    }
    res.status(200).json(termDeposit);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update a term deposit by ID
export const updateTermDeposit = async (req, res) => {
  try {
    const updatedDeposit = await TermDeposit.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    if (!updatedDeposit) {
      return res.status(404).json({ message: 'Term Deposit not found' });
    }
    res.status(200).json(updatedDeposit);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// Delete a term deposit by ID
export const deleteTermDeposit = async (req, res) => {
  try {
    const termDeposit = await TermDeposit.findById(req.params.id);
    if (!termDeposit) {
      return res.status(404).json({ message: 'Term Deposit not found' });
    }
    await termDeposit.remove();
    res.status(200).json({ message: 'Term Deposit deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
