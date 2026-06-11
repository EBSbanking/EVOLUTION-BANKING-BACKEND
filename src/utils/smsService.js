// utils/smsService.js
import axios from 'axios';

class SMSService {
  constructor() {
    this.apiKey = process.env.TERMII_LIVE_API_KEY;
    this.senderId = process.env.TERMII_SENDER_ID || 'WareLogTech';
    this.baseUrl = process.env.TERMII_BASE_URL || 'https://v3.api.termii.com';
  }

  async sendSMS(phoneNumber, message) {
    try {
      // Clean phone number (remove any non-digit characters and ensure proper format)
      let cleanedPhone = phoneNumber.toString().replace(/\D/g, '');
      
      // Ensure Nigerian phone number format (234 prefix)
      if (cleanedPhone.startsWith('0')) {
        cleanedPhone = '234' + cleanedPhone.substring(1);
      } else if (cleanedPhone.startsWith('234')) {
        // Already in correct format
      } else if (cleanedPhone.length === 10) {
        cleanedPhone = '234' + cleanedPhone;
      } else if (cleanedPhone.length === 11 && cleanedPhone.startsWith('0')) {
        cleanedPhone = '234' + cleanedPhone.substring(1);
      }

      const payload = {
        to: cleanedPhone,
        from: this.senderId,
        sms: message,
        type: 'plain',
        channel: 'generic',
        api_key: this.apiKey
      };

      console.log(`📱 Sending SMS to ${cleanedPhone}:`, message.substring(0, 50) + '...');

      const response = await axios.post(`${this.baseUrl}/api/sms/send`, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`✅ SMS sent successfully to ${phoneNumber}:`, response.data);
      return {
        success: true,
        data: response.data,
        phoneNumber: cleanedPhone
      };
    } catch (error) {
      console.error('❌ Failed to send SMS:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message,
        phoneNumber
      };
    }
  }

  async sendBulkSMS(recipients, message) {
    try {
      const payload = {
        to: recipients,
        from: this.senderId,
        sms: message,
        type: 'plain',
        channel: 'generic',
        api_key: this.apiKey
      };

      const response = await axios.post(`${this.baseUrl}/api/sms/send/bulk`, payload, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      console.log(`✅ Bulk SMS sent successfully to ${recipients.length} recipients`);
      return {
        success: true,
        data: response.data
      };
    } catch (error) {
      console.error('❌ Failed to send bulk SMS:', error.response?.data || error.message);
      return {
        success: false,
        error: error.response?.data || error.message
      };
    }
  }
}

export default new SMSService();