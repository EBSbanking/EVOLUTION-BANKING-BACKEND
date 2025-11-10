// passwordReset.js - Fixed to Bypass Pre-Save Hook
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = 'mongodb+srv://Administrator:Fo%24th3DR%24%3D083@cluster0.zpuy3.mongodb.net/evolution_banking?retryWrites=true&w=majority&appName=Cluster0';

async function resetPassword() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB.');

    const user = await mongoose.connection.db.collection('users').findOne({ user_name: 'PCO01' });
    if (!user) {
      console.error('User PCO01 not found.');
      return;
    }

    // Exact password from Postman (11 chars)
    const newPassword = 'Gimaro1234*';
    console.log('🔑 Setting password to:', newPassword);

    // Generate hash
    const newHash = await bcrypt.hash(newPassword, 10);
    console.log('🔑 Generated hash:', newHash.substring(0, 20) + '...');

    // Update directly (bypass pre-save hook)
    await mongoose.connection.db.collection('users').updateOne(
      { user_name: 'PCO01' },
      { $set: { password: newHash } }
    );
    console.log('✅ Hash saved to DB (bypassed pre-save hook).');

    // Verify immediately (fetch updated)
    const updatedUser = await mongoose.connection.db.collection('users').findOne({ user_name: 'PCO01' });
    const match = await bcrypt.compare(newPassword, updatedUser.password);
    console.log('🔑 Test match after save:', match); // Should be true

    if (!match) {
      console.error('❌ Verification failed - check DB manually.');
    } else {
      console.log('✅ Password reset successful. Test login now!');
    }

    await mongoose.disconnect();
  } catch (error) {
    console.error('Error resetting password:', error);
  }
}

resetPassword();