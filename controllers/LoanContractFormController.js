import LoanContractForm from '../models/LoanContractForm.js';
import LoanAccount from '../models/LoanAccount.js';
import moment from 'moment';

class LoanContractController {

    // Utility to generate unique contract ID
    static generateId(length) {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        let result = '';
        for (let i = 0; i < length; i++) {
            result += chars[Math.floor(Math.random() * chars.length)];
        }
        return result;
    }

    // Create contract directly from application object
    static async createLoanContractFromApplication(application, userContext = {}) {
        try {
            const loanContractNo = `LCN-${LoanContractController.generateId(8)}`;

            const newContract = new LoanContractForm({
                loan_contract_no: loanContractNo,
                customer_id: application.CUST_ID,
                bank_name: userContext.bank_name || "Default Bank",
                bank_short: userContext.bank_short || "DB",
                borrower_name: application.BORROWER_NAME,
                borrower_address: application.BORROWER_ADDRESS,
                loan_purpose: application.LOAN_PURPOSE,
                loan_amount: application.LOAN_AMOUNT,
                loan_term: application.LOAN_TERM,
                interest_rate: application.INTEREST_RATE,
                USER_ID: application.USER_ID,
            });

            await newContract.save();

            // Optionally send notification without workflow reference
            await NotificationService.send({
                role: userContext.targetRole || "Manager",
                message: `Loan Contract ${loanContractNo} has been created.`,
            });

            return {
                success: true,
                contract: newContract
            };

        } catch (err) {
            console.error('Failed to create loan contract from application:', err.message);
            return { success: false, error: err.message };
        }
    }


    // Fetch contract by loan_contract_no from URL param
    static async getLoanContract(req, res) {
        try {
            const { id } = req.params; // e.g. LCN-XXXXXXXX

            const contract = await LoanContractForm.findOne({ loan_contract_no: id });

            if (!contract) {
                return res.status(404).json({ message: 'Loan contract not found' });
            }

            return res.status(200).json({ contract });
        } catch (error) {
            console.error('Error fetching loan contract:', error);
            return res.status(500).json({
                message: 'Error fetching loan contract',
                error: error.message,
            });
        }
    }


    // Create contract from HTTP request
    static async createLoanContract(req, res) {
        try {
            const loanContractNo = `LCN-${LoanContractController.generateId(8)}`;

            const newContract = new LoanContractForm({
                ...req.body,
                loan_contract_no: loanContractNo,
            });

            await newContract.save();

            // Extract roles from request body
            const {
                USER_ID,
                BU_ID,
                ORIGINATOR_USER_ROLE_ID = "Credit Support Officer",
                TARGET_USER_ROLE_ID = "Manager",
            } = req.body;

            const allowedRoles = ['Credit Support Officer', 'Supervisor', 'Manager', 'Branch Head'];
            if (!allowedRoles.includes(ORIGINATOR_USER_ROLE_ID) || !allowedRoles.includes(TARGET_USER_ROLE_ID)) {
                return res.status(400).json({ message: 'Invalid role specified' });
            }

            // Optionally send notification without workflow reference
            await NotificationService.send({
                role: TARGET_USER_ROLE_ID,
                message: `Loan Contract ${loanContractNo} has been created.`,
            });

            const contractText = LoanContractController.generateContractText(newContract);

            return res.status(201).json({
                message: 'Loan contract created successfully.',
                loan_contract_no: loanContractNo,
                contractText,
            });

        } catch (error) {
            console.error('Error creating loan contract:', error);
            return res.status(500).json({
                message: 'Error occurred while creating loan contract.',
                error: error.message,
            });
        }
    }

    // Add this method to your LoanContractController class
static async getLoanContractsByCustomerId(req, res) {
    try {
        const { cust_id } = req.params;

        // Validate the customer ID
        if (!cust_id) {
            return res.status(400).json({ message: 'Customer ID is required' });
        }

        // Find all loan contracts for this customer
        const contracts = await LoanContractForm.find({ customer_id: cust_id });

        if (!contracts || contracts.length === 0) {
            return res.status(404).json({ 
                message: 'No loan contracts found for this customer',
                customer_id: cust_id
            });
        }

        return res.status(200).json({
            count: contracts.length,
            contracts
        });

    } catch (error) {
        console.error('Error fetching loan contracts by customer ID:', error);
        return res.status(500).json({
            message: 'Error fetching loan contracts',
            error: error.message,
        });
    }
}

    // Get loan contract by account number
static async getLoanContractByAcctNo(req, res) {
    try {
        const { acct_no } = req.params;

        // Step 1: Find loan account using ACCT_NO
        const loanAccount = await LoanAccount.findOne({ ACCT_NO: acct_no });

        if (!loanAccount) {
            return res.status(404).json({ message: 'Loan account not found' });
        }

        // Step 2: Extract customer_id or USER_ID (adjust based on your schema)
        const customerId = loanAccount.CUST_ID || loanAccount.USER_ID;

        if (!customerId) {
            return res.status(400).json({ message: 'Loan account does not have a valid customer ID or USER ID' });
        }

        // Step 3: Find the contract using customer_id or USER_ID
        const loanContract = await LoanContractForm.findOne({
            $or: [
                { customer_id: customerId },
                { USER_ID: customerId }
            ]
        });

        if (!loanContract) {
            return res.status(404).json({ message: 'Loan contract not found for this account' });
        }

        return res.status(200).json({ contract: loanContract });

    } catch (error) {
        console.error('Error fetching contract by account number:', error);
        return res.status(500).json({ message: 'Internal server error', error: error.message });
    }
}


    // Generate full contract text from contract data
    static generateContractText(data) {
        const {
            loan_contract_no,
            customer_id,
            bank_name,
            bank_short,
            borrower_name,
            co_signatory_name = '',
            borrower_address,
            loan_purpose,
            loan_amount,
            loan_term,
            interest_rate,
            guarantor_name = ''
        } = data;

        return `
Individual Loan Contract  
Loan Contract No.: ${loan_contract_no}  
Customer ID No.: ${customer_id}

This loan contract is between ${bank_name}, a body corporate incorporated under the Laws of the Federal Republic of Nigeria (hereinafter referred to as “${bank_short}”) of the one part, and ${borrower_name} (hereinafter referred to as "the Borrower") and  
${co_signatory_name} (hereinafter referred to as "the Co-signatory") of the other part, both residing at:  
${borrower_address}

________________________________________  
Article 1: Subject of Contract  
1.1. ${bank_short} has agreed to give a loan to the Borrower for the purpose of ${loan_purpose}.  
1.2. The loan shall be disbursed on a loan repayment account opened for the Borrower with and by ${bank_short}.

________________________________________  
Article 2: Terms  
2.1. ${bank_short} hereby agrees to make available to the Borrower a sum of ₦${loan_amount}.  
2.2. The maturity of the loan is ${loan_term} months.

________________________________________  
Article 3: Interest Rate  
3.1. The monthly interest rate of the loan is ${interest_rate}% and shall be calculated by ${bank_short} from the date of credit disbursement to the date of full repayment of the loan. The monthly interest payment is calculated daily on the outstanding loan balance.  
3.2. ${bank_short} charges a disbursement fee of 1% of the approved loan amount at disbursement, which will be deducted from the loan amount at disbursement.

________________________________________  
Article 4: Loan Repayment  
4.1. The Borrower shall repay the loan according to the attached payment plan, which forms an integral part of the contract.  
4.2. If a payment date according to the attached payment plan coincides with a holiday, then the payment takes place on the next working day.  
4.3. The payments under this contract are due in the following order: penalties, interests, principal.

________________________________________  
Article 5: Early Repayment  
5.1. Borrower should pay according to payment. Once a borrower has repaid up to 75% of the loan amount, the borrower can make an early payment of the remaining principal schedule.

________________________________________  
Article 6: Penalties  
6.1. In case of arrears, a penalty rate of 0.0333% per day of the principal of the overdue installment shall additionally apply for a maximum period of 30 days and be payable by the Borrower. This applies to each installment falling in arrears.  
6.2. The Borrower shall bear all costs and expenses related to recovery measures undertaken by ${bank_short} in case of arrears.

________________________________________  
Article 7: Guarantors and Collateral  
7.1. The following additional contracts are integral parts of this loan contract:  
• (i) The Collateral Contract(s) attached to this loan contract; and  
• (ii) The Guarantor Contract(s) attached to this loan contract (if a guarantor was requested; otherwise this contract will not be applied).  
7.2. These attached contracts cannot be annulled before the full repayment of the loan.  
7.3. If the collateral in the collateral contract disappears or deteriorates the Borrower shall inform ${bank_short} immediately and must provide replacement collateral.

________________________________________  
Article 8: Rights and Obligations of the Borrower and the Co-signatory  
8.1. The Borrower has the right to receive and use the loan according to the terms and conditions stipulated in this contract.  
8.2. The installments shall be paid at the teller of one of ${bank_short}'s branches or any of ${bank_short}’s agents.  
8.3. The Borrower shall use the loan only for the purpose stipulated under article one (1) above.  
8.4. The Borrower shall inform ${bank_short} immediately about all incidences which change his/her financial situation, the situation of his/her business or the domicile, in particular closure of business, change of business activity, change of business or domicile address.  
8.5. The Borrower shall seek ${bank_short}’s approval when:  
(a) selling partly or entirely his/her fixed business assets;  
(b) taking medium or long-term liabilities; or  
(c) pledges, creates security over, or sells, all or any of the collateral.  
8.6. The Co-signatory herein agrees to bear joint responsibility for the repayment of the loan.

________________________________________  
Article 9: Rights and Obligations of the Lender  
9.1. ${bank_short} and its authorized representatives shall have the right at any time to visit the business and household premises of the Borrower in order to verify existence and state of the collateral, to check the financial situation of the Borrower and to verify the use of the loan. ${bank_short} shall have the right to request information about the Borrower from third parties, as required.  
9.2. In the event the Borrower fails to pay any amount due to ${bank_short} under the loan contract, ${bank_short} reserves the right to debit all accounts of the Borrower with ${bank_short} in order to cover the overdue installment.  
9.3. ${bank_short} shall have the right to unilaterally terminate the contract and to demand immediate and full payment of the entire outstanding principal, accrued interests, penalties and other charges related to loan recovery where:  
(a) The Borrower has failed to pay punctually the due installment;  
(b) The credit is not used by the Borrower according to the purpose;  
(c) The Borrower is not in a position to carry out or fulfill the terms of this contract;  
(d) The Borrower has presented false or incomplete information;  
(e) The Borrower breaches terms and conditions of this contract;  
(f) The Borrower is in default under any other financial obligation;  
(g) Any distress or execution affects any of the Borrower’s assets;  
(h) The Borrower is unable to pay debts;  
(i) The Borrower ceases to carry on business.

________________________________________  
Article 10: Additional Conditions  
10.1. The Borrower acknowledges and concedes the sole evidence of the amount due or bound to pay.  
10.2. Any dispute arising shall be referred to a court of competent jurisdiction.  
10.3. This contract shall be governed by the laws of the Federal Republic of Nigeria.  
10.4. This contract remains in force until complete fulfillment of the Borrower’s obligations.

________________________________________  
Acknowledgement  
The Borrower acknowledges that they have read, understood, and agreed to this contract.

________________________________________  
FOR ${bank_name}:  
Name: ___________________________  
Function: ________________________  
Signature: ________________________

________________________________________  
FOR BORROWER  
Borrower Name: ${borrower_name}  
Signature: ___________________________

Guarantor Name: ${guarantor_name}  
Signature: ___________________________
`;
    }
};

export default LoanContractController;
