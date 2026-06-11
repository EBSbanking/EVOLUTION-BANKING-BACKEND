import LoginPolicy from '../models/LoginPolicy.js';

// Ensure the table exists (safe to call multiple times)
const ensureTableExists = async () => {
  try {
    await LoginPolicy.sync();
    console.log('✅ LoginPolicy table synced');
  } catch (error) {
    console.error('❌ Failed to sync LoginPolicy table:', error);
  }
};

// Get the current global login policy (always exists – create default if missing)
export const getLoginPolicy = async (req, res) => {
  try {
    await ensureTableExists();  // ensures table exists
    let policy = await LoginPolicy.findOne();
    if (!policy) {
      policy = await LoginPolicy.create({
        earliest_login_time: '00:00',
        latest_login_time: '23:59',
        enabled: false,
        updated_by: 'system',
      });
    }
    res.json({
      success: true,
      data: {
        earliest_login_time: policy.earliest_login_time,
        latest_login_time: policy.latest_login_time,
        enabled: policy.enabled,
        updated_by: policy.updated_by,
        updated_at: policy.updated_at,
      },
    });
  } catch (error) {
    console.error('Error fetching login policy:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update the global login policy (admin only)
export const updateLoginPolicy = async (req, res) => {
  try {
    await ensureTableExists();  // ensures table exists

    const { earliest_login_time, latest_login_time, enabled } = req.body;
    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

    if (earliest_login_time && !timeRegex.test(earliest_login_time)) {
      return res.status(400).json({ success: false, message: 'Invalid earliest time format (HH:MM)' });
    }
    if (latest_login_time && !timeRegex.test(latest_login_time)) {
      return res.status(400).json({ success: false, message: 'Invalid latest time format (HH:MM)' });
    }

    let policy = await LoginPolicy.findOne();
    if (!policy) {
      policy = await LoginPolicy.create({});
    }

    if (earliest_login_time !== undefined) policy.earliest_login_time = earliest_login_time;
    if (latest_login_time !== undefined) policy.latest_login_time = latest_login_time;
    if (enabled !== undefined) policy.enabled = enabled;
    policy.updated_by = req.user?.user_name || req.user?.id || 'admin';
    await policy.save();

    res.json({
      success: true,
      message: 'Login policy updated successfully',
      data: {
        earliest_login_time: policy.earliest_login_time,
        latest_login_time: policy.latest_login_time,
        enabled: policy.enabled,
        updated_by: policy.updated_by,
        updated_at: policy.updated_at,
      },
    });
  } catch (error) {
    console.error('Error updating login policy:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};