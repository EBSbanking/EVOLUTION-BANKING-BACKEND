const CustomerType = require('./CustomerType'); // Make sure this is correct as well

// Function to insert customer types
const insertCustomerTypes = async () => {
    const customerTypes = [
        { TYPE_NAME: 'Individual', DESCRIPTION: 'A single person using the services.' },
        { TYPE_NAME: 'Staff', DESCRIPTION: 'An employee of the organization.' },
        { TYPE_NAME: 'Guarantor', DESCRIPTION: 'A person who guarantees the services or loans.' },
        { TYPE_NAME: 'Agent - Personal', DESCRIPTION: 'A personal agent representing a client.' },
        { TYPE_NAME: 'Minor', DESCRIPTION: 'A customer under the legal age.' },
        { TYPE_NAME: 'Restricted Customer', DESCRIPTION: 'A customer with restricted access to services.' },
        { TYPE_NAME: 'Mobile Agent', DESCRIPTION: 'An agent operating primarily through mobile platforms.' },
        { TYPE_NAME: 'Commercial Customer', DESCRIPTION: 'A business or organization using the services.' },
    ];

    try {
        await CustomerType.insertMany(customerTypes);
        console.log('Customer types inserted successfully');
    } catch (err) {
        console.error('Error inserting customer types:', err);
    }
};

// Function to fetch customer types
const fetchCustomerTypes = async () => {
    try {
        const types = await CustomerType.find();
        console.log('Customer Types:', types);
    } catch (err) {
        console.error('Error fetching customer types:', err);
    }
};

// Export the functions if needed
export default { insertCustomerTypes, fetchCustomerTypes };
