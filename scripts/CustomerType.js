import mongoose from 'mongoose';
import CustomerType from './models/CustomerType.js'; // Make sure the path to your model is correct

const customerTypes = [
    { TYPE_NAME: 'Individual', DESCRIPTION: 'An individual customer' },
    { TYPE_NAME: 'Staff', DESCRIPTION: 'A staff member of the company' },
    { TYPE_NAME: 'Guarantor', DESCRIPTION: 'A customer acting as a guarantor' },
    { TYPE_NAME: 'Agent-Personal', DESCRIPTION: 'An agent acting in a personal capacity' },
    { TYPE_NAME: 'Minor', DESCRIPTION: 'A customer who is a minor' },
    { TYPE_NAME: 'Restricted Customer', DESCRIPTION: 'A customer with restricted access' },
    { TYPE_NAME: 'Mobile', DESCRIPTION: 'A mobile customer' },
    { TYPE_NAME: 'Bank-Customer', DESCRIPTION: 'A customer of the bank' }
];

// Connect to MongoDB
const seedCustomerTypes = async () => {
    try {
        await mongoose.connect('mongodb+srv://Administrator:Fo$th3DR$=083@cluster0.zpuy3.mongodb.net', {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });

        // Insert customer types into the database
        await CustomerType.insertMany(customerTypes);
        console.log('Customer types seeded successfully.');
    } catch (error) {
        console.error('Error seeding customer types:', error);
    } finally {
        mongoose.connection.close();
    }
};

export default CustomerType;
