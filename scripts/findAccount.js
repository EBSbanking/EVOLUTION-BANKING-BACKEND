import mongoose from 'mongoose';

// Connect to your MongoDB instance (adjust the connection string if needed)
mongoose.connect('mongodb+srv://Administrator:Fo$th3DR$=083@cluster0.zpuy3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('Error connecting to MongoDB:', err));

// Define the GLAccount schema and model (you should adjust this according to your schema)
const glAccountSchema = new mongoose.Schema({
  ACCT_NO: String,
  LEDGER_BAL: Number,
  TRANSACTION_TYPE: String,
  GL_ACCT_ID: String,
  __v: Number
});

const GLAccount = mongoose.model('GLAccount', glAccountSchema);

// Query for the account with ACCT_NO '1008549000'
async function findAccount() {
  try {
    const account = await GLAccount.findOne({ ACCT_NO: '1008549000' });
    console.log(account);  // Logs the account document to the console
  } catch (err) {
    console.error('Error finding account:', err);
  }
}

// Run the findAccount function
findAccount();
