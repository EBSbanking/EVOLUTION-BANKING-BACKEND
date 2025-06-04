import CreditApplication from './models/CreditApplication.js';

const createNewCreditApplication = async (custID) => {
    const newApplication = new CreditApplication({
        cust_ID: custID, // Provide the cust_ID here
        BU_ID: '',
        RSN_ID: '',
        // Add other fields as necessary
    });

    await newApplication.save();
    console.log('New credit application created with cust_ID:', newApplication.cust_ID, 'and LOAN_CYCLE:', newApplication.LOAN_CYCLE);
};

// Example usage:
createNewCreditApplication(12345).catch(err => console.error(err));
