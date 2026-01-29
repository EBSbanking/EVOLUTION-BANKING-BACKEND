// services/userService.js
import bcrypt from 'bcrypt';
import User from '../models/User.js';

class UserService {
  async createUser(userData) {
    const defaultPassword = 'Evolution@123'; // Your default password
    const hashedPassword = await bcrypt.hash(defaultPassword, 10);
    const hashedDefaultPassword = await bcrypt.hash(defaultPassword, 10); // Store separately
    
    const user = await User.create({
      ...userData,
      password: hashedPassword,
      default_password: hashedDefaultPassword,
      is_first_login: true,
      force_password_change: true,
      password_expiry_date: null // No expiry until first change
    });
    
    return user;
  }
  
  async bulkImportUsers(usersData) {
    const defaultPassword = 'Evolution@123';
    const hashedDefaultPassword = await bcrypt.hash(defaultPassword, 10);
    
    const usersWithDefaults = usersData.map(user => ({
      ...user,
      password: hashedDefaultPassword,
      default_password: hashedDefaultPassword,
      is_first_login: true,
      force_password_change: true,
      password_expiry_date: null
    }));
    
    return User.bulkCreate(usersWithDefaults);
  }
}

export default new UserService();