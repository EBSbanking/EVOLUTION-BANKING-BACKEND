// services/authService.js
import bcrypt from 'bcrypt';
import Login from '../models/Login.js';
import User from '../models/User.js';
import { Op } from 'sequelize';

class AuthService {
  constructor() {
    this.MAX_FAILED_ATTEMPTS = 5;
    this.LOCKOUT_DURATION = 30 * 60 * 1000; // 30 minutes in milliseconds
  }

  async authenticate(credentials, loginData) {
    const {
      username,
      password,
      ip_address,
      user_agent,
      login_type = 'password',
      device_type = 'unknown',
      location_data = {}
    } = credentials;

    const {
      session_id = null,
      business_unit = null,
      role = null
    } = loginData;

    try {
      // Step 1: Find user
      const user = await User.findOne({
        where: {
          [Op.or]: [
            { username: username },
            { email: username }
          ],
          status: 'Active' // Assuming you have a status field
        }
      });

      if (!user) {
        await this.logFailedAttempt(null, username, ip_address, user_agent, 'USER_NOT_FOUND', 'User not found', session_id, login_type, device_type, location_data);
        return {
          success: false,
          error: 'Invalid credentials',
          error_code: 'USER_NOT_FOUND',
          requires_password_change: false
        };
      }

      // Step 2: Check if account is locked
      if (user.is_locked && user.locked_until > new Date()) {
        await this.logFailedAttempt(user.id, user.username, ip_address, user_agent, 'ACCOUNT_LOCKED', 'Account is locked', session_id, login_type, device_type, location_data);
        return {
          success: false,
          error: 'Account is locked. Please try again later.',
          error_code: 'ACCOUNT_LOCKED',
          requires_password_change: false
        };
      }

      // Step 3: Verify password
      const isPasswordValid = await bcrypt.compare(password, user.password);
      
      if (!isPasswordValid) {
        // Check if using default password
        const isDefaultPassword = user.default_password 
          ? await bcrypt.compare(password, user.default_password)
          : false;

        await this.handleFailedLogin(user, username, ip_address, user_agent, 
          isDefaultPassword ? 'FIRST_LOGIN_REQUIRED' : 'INVALID_PASSWORD',
          isDefaultPassword ? 'Default password detected - change required' : 'Invalid password',
          session_id, login_type, device_type, location_data);

        if (isDefaultPassword) {
          return {
            success: false,
            error: 'Please change your default password',
            error_code: 'FIRST_LOGIN_REQUIRED',
            requires_password_change: true,
            user_id: user.id,
            temp_token: await this.generateTempToken(user.id)
          };
        }

        return {
          success: false,
          error: 'Invalid credentials',
          error_code: 'INVALID_PASSWORD',
          requires_password_change: false
        };
      }

      // Step 4: Check if password change is required
      if (user.force_password_change || user.is_first_login) {
        await this.logLoginAttempt(user.id, user.username, ip_address, user_agent, 
          'Success', null, session_id, login_type, device_type, location_data, 
          true, business_unit, role);
        
        return {
          success: true,
          message: 'Login successful but password change required',
          requires_password_change: true,
          user_id: user.id,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name
          },
          temp_token: await this.generateTempToken(user.id)
        };
      }

      // Step 5: Check password expiry
      if (user.password_expiry_date && new Date() > user.password_expiry_date) {
        await this.logLoginAttempt(user.id, user.username, ip_address, user_agent, 
          'Success', null, session_id, login_type, device_type, location_data, 
          true, business_unit, role);
        
        return {
          success: true,
          message: 'Login successful but password has expired',
          requires_password_change: true,
          error_code: 'PASSWORD_EXPIRED',
          user_id: user.id,
          user: {
            id: user.id,
            username: user.username,
            email: user.email,
            first_name: user.first_name,
            last_name: user.last_name
          },
          temp_token: await this.generateTempToken(user.id)
        };
      }

      // Step 6: Successful login without password change requirement
      await this.handleSuccessfulLogin(user, username, ip_address, user_agent, 
        session_id, login_type, device_type, location_data, 
        business_unit, role);

      return {
        success: true,
        message: 'Login successful',
        requires_password_change: false,
        user_id: user.id,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          first_name: user.first_name,
          last_name: user.last_name,
          role: user.role
        },
        session_token: await this.generateSessionToken(user.id)
      };

    } catch (error) {
      console.error('Authentication error:', error);
      await this.logFailedAttempt(null, username, ip_address, user_agent, 
        'SYSTEM_ERROR', error.message, session_id, login_type, device_type, location_data);
      
      return {
        success: false,
        error: 'Authentication failed',
        error_code: 'SYSTEM_ERROR',
        requires_password_change: false
      };
    }
  }

  async handleFailedLogin(user, username, ip_address, user_agent, error_code, error_message, session_id, login_type, device_type, location_data) {
    // Increment failed attempts
    user.failed_login_attempts = (user.failed_login_attempts || 0) + 1;
    
    // Lock account if exceeded max attempts
    if (user.failed_login_attempts >= this.MAX_FAILED_ATTEMPTS) {
      user.is_locked = true;
      user.locked_until = new Date(Date.now() + this.LOCKOUT_DURATION);
    }
    
    await user.save();
    
    // Log the failed attempt
    await this.logFailedAttempt(user?.id, username, ip_address, user_agent, 
      error_code, error_message, session_id, login_type, device_type, location_data);
  }

  async handleSuccessfulLogin(user, username, ip_address, user_agent, session_id, login_type, device_type, location_data, business_unit, role) {
    // Reset failed attempts on successful login
    user.failed_login_attempts = 0;
    user.is_locked = false;
    user.locked_until = null;
    user.last_login = new Date();
    await user.save();
    
    // Log the successful attempt
    await this.logLoginAttempt(user.id, username, ip_address, user_agent, 
      'Success', null, session_id, login_type, device_type, location_data, 
      false, business_unit, role);
  }

  async logLoginAttempt(user_id, username, ip_address, user_agent, status, error, session_id, login_type, device_type, location_data, password_changed = false, business_unit = null, role = null) {
    try {
      const login = await Login.create({
        user_id: user_id,
        user_name: username,
        username: username,
        ip_address: ip_address,
        user_agent: user_agent,
        session_id: session_id,
        status: status,
        success: status === 'Success',
        error: error,
        error_code: null,
        attempt_identifier: username,
        login_type: login_type,
        device_type: device_type,
        location_data: location_data,
        failed_attempts_count: 0,
        password_changed: password_changed,
        business_unit: business_unit,
        role: role
      });
      
      return login;
    } catch (error) {
      console.error('Error logging login attempt:', error);
    }
  }

  async logFailedAttempt(user_id, username, ip_address, user_agent, error_code, error_message, session_id, login_type, device_type, location_data) {
    try {
      const login = await Login.create({
        user_id: user_id,
        user_name: username,
        username: username,
        ip_address: ip_address,
        user_agent: user_agent,
        session_id: session_id,
        status: 'Failed',
        success: false,
        error: error_message,
        error_code: error_code,
        attempt_identifier: username,
        login_type: login_type,
        device_type: device_type,
        location_data: location_data,
        failed_attempts_count: 1,
        password_changed: false
      });
      
      return login;
    } catch (error) {
      console.error('Error logging failed attempt:', error);
    }
  }

  async generateTempToken(userId) {
    // Generate a temporary token for password change flow
    // You can use JWT or any other method
    const crypto = await import('crypto');
    const token = crypto.randomBytes(32).toString('hex');
    
    // Store token in database with expiry (e.g., 10 minutes)
    // Implementation depends on your token storage strategy
    
    return token;
  }

  async generateSessionToken(userId) {
    // Generate session token for regular login
    // Implementation depends on your JWT/session strategy
    return `session_${userId}_${Date.now()}`;
  }

  async changePassword(userId, oldPassword, newPassword, tempToken = null) {
    try {
      const user = await User.findByPk(userId);
      
      if (!user) {
        return {
          success: false,
          error: 'User not found'
        };
      }

      // If using temp token (for first login/forced change), skip old password check
      if (!tempToken) {
        const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
        if (!isOldPasswordValid) {
          return {
            success: false,
            error: 'Current password is incorrect'
          };
        }
      } else {
        // Validate temp token here
        const isValidToken = await this.validateTempToken(userId, tempToken);
        if (!isValidToken) {
          return {
            success: false,
            error: 'Invalid or expired token'
          };
        }
      }

      // Check if new password is same as old password
      const isSameAsOld = await bcrypt.compare(newPassword, user.password);
      if (isSameAsOld) {
        return {
          success: false,
          error: 'New password cannot be the same as current password'
        };
      }

      // Check if new password is same as default password
      if (user.default_password) {
        const isSameAsDefault = await bcrypt.compare(newPassword, user.default_password);
        if (isSameAsDefault) {
          return {
            success: false,
            error: 'New password cannot be the same as default password'
          };
        }
      }

      // Validate password strength
      const passwordValidation = this.validatePasswordStrength(newPassword);
      if (!passwordValidation.valid) {
        return {
          success: false,
          error: passwordValidation.message
        };
      }

      // Hash and save new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      user.password = hashedPassword;
      user.password_changed_at = new Date();
      user.is_first_login = false;
      user.force_password_change = false;
      
      // Set password expiry (e.g., 90 days from now)
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 90);
      user.password_expiry_date = expiryDate;
      
      await user.save();

      return {
        success: true,
        message: 'Password changed successfully'
      };

    } catch (error) {
      console.error('Password change error:', error);
      return {
        success: false,
        error: 'Failed to change password'
      };
    }
  }

  validatePasswordStrength(password) {
    const minLength = 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password);

    if (password.length < minLength) {
      return { valid: false, message: `Password must be at least ${minLength} characters long` };
    }
    if (!hasUpperCase) {
      return { valid: false, message: 'Password must contain at least one uppercase letter' };
    }
    if (!hasLowerCase) {
      return { valid: false, message: 'Password must contain at least one lowercase letter' };
    }
    if (!hasNumbers) {
      return { valid: false, message: 'Password must contain at least one number' };
    }
    if (!hasSpecialChar) {
      return { valid: false, message: 'Password must contain at least one special character' };
    }

    return { valid: true, message: 'Password is strong' };
  }

  async validateTempToken(userId, token) {
    // Implement token validation logic
    // Check if token exists in database and is not expired
    return true; // Placeholder
  }
}

export default new AuthService();