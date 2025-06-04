import bcrypt from 'bcryptjs';
import User from '../models/User.js'; // Import the User model
import auth from '../middlewares/auth.js';

// Controller for registering a new user
const registerUser = async (req, res) => {
  try {
    // Destructure the request body to extract user data
    const {
      user_name,
      password,
      employer_number,
      first_name,
      last_name,
      middle_name,
      preferred_name,
      job_title,
      email,
      customer_number,
      main_business_unit,
      responsibility_centre,
      primary_business_role,
      start_date,
      expiry_date,
      earliest_login_time,
      latest_login_time,
      internal_employee_enabled,
      relationship_officer,
      enable_multi_session,
      validate_ip_address,
      note,
      ip_address,
      is_supervisor,
      is_main_BU,
      status
    } = req.body;

    // Check if the email or user_name already exists
    const existingUser = await User.findOne({
      $or: [
        { email: { $regex: new RegExp(`^${email}$`, 'i') } },
        { user_name: { $regex: new RegExp(`^${user_name}$`, 'i') } }
      ]
    });
    

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create new user object with hashed password
    const newUser = new User({
      user_name,
      password: hashedPassword, // Save the hashed password
      employer_number,
      first_name,
      last_name,
      middle_name,
      preferred_name,
      job_title,
      email,
      customer_number,
      main_business_unit,
      responsibility_centre,
      primary_business_role,
      start_date,
      expiry_date,
      earliest_login_time,
      latest_login_time,
      internal_employee_enabled,
      relationship_officer,
      enable_multi_session,
      validate_ip_address,
      note,
      ip_address,
      is_supervisor,
      is_main_BU,
      status
    });

    // Save the new user to the database
    await newUser.save();

    // Send success response
    res.status(201).json({ message: "User registered successfully", user: newUser });
  } catch (error) {
    console.error("Error registering user:", error);
    res.status(500).json({ message: "Error registering user", error: error.message });
  }
};

// Controller for updating user details
// Controller for updating user details
const updateUser = async (req, res) => {
    try {
      const { userId } = req.params; // Get userId from URL params (which is actually user_name here)
      const updateData = req.body; // Get updated data from request body
  
      // Check if the user exists by user_name instead of _id
      const user = await User.findOne({ user_name: userId });
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
  
      // If password is being updated, hash it first
      if (updateData.password) {
        updateData.password = await bcrypt.hash(updateData.password, 10);
      }
  
      // Update the user's details
      const updatedUser = await User.findOneAndUpdate({ user_name: userId }, updateData, { new: true });
  
      // Send success response
      res.status(200).json({ message: "User updated successfully", user: updatedUser });
    } catch (error) {
      console.error("Error updating user:", error);
      res.status(500).json({ message: "Error updating user", error: error.message });
    }
  };
  
// Controller for deactivating a user
const deactivateUser = async (req, res) => {
  try {
    const { userId } = req.params; // Get userId from URL params (which is actually user_name here)

    // Check if the user exists by user_name instead of _id
    const user = await User.findOne({ user_name: userId });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Set user status to 'Deactivated'
    user.status = 'Deactivated';

    // Save the updated user status
    await user.save();

    // Send success response
    res.status(200).json({ message: "User deactivated successfully", user: user });
  } catch (error) {
    console.error("Error deactivating user:", error);
    res.status(500).json({ message: "Error deactivating user", error: error.message });
  }
};

// Controller for getting a user by employer number
const getUserByEmployerNumber = async (req, res) => {
  try {
    const { employer_number } = req.params; // Get employer_number from URL params

    // Find the user by employer_number
    const user = await User.findOne({ employer_number });

    // If the user is not found
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Send success response with user data
    res.status(200).json({ message: "User found", user });
  } catch (error) {
    console.error("Error fetching user by employer number:", error);
    res.status(500).json({ message: "Error fetching user", error: error.message });
  }
};

// Controller for getting all users
const getAllUsers = async (req, res) => {
  try {
    // Fetch all users from the database
    const users = await User.find(); // This will return all users

    // If no users are found
    if (users.length === 0) {
      return res.status(404).json({ message: "No users found" });
    }

    // Send success response with all users
    res.status(200).json({ message: "Users fetched successfully", users });
  } catch (error) {
    console.error("Error fetching all users:", error);
    res.status(500).json({ message: "Error fetching users", error: error.message });
  }
};

// Export the controller functions
export { registerUser, updateUser, deactivateUser, getUserByEmployerNumber, getAllUsers };

