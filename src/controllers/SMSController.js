import SMS from '../models/SMS.js'; // Assuming this is your Sequelize model
import axios from 'axios';

class SMSController {
    // Method to send SMS after transaction creation
    static async sendSMSAfterTransaction(req, res) {
        const { DEPOSITOR_NAME, AMOUNT, ACCT_NO, RECIPIENT_PHONE_NUMBER, transactionRefNo, newBalance } = req.body;

        if (!DEPOSITOR_NAME || !AMOUNT || !ACCT_NO || !RECIPIENT_PHONE_NUMBER || !transactionRefNo || !newBalance) {
            return res.status(400).json({ message: 'Missing required fields' });
        }

        // Create the message content
        const messageContent = `Dear ${DEPOSITOR_NAME}, your deposit of ${AMOUNT} has been successfully processed. New balance: ${newBalance}. Transaction Ref: ${transactionRefNo}.`;

        // Create a new SMS record using Sequelize
        try {
            const newSMS = await SMS.create({
                RECIPIENT_PHONE_NUMBER,
                MESSAGE_CONTENT: messageContent,
                DISPLAY_ACCT_NO: `******${ACCT_NO.toString().slice(-4)}`,
                Sender_Id: "WareLog", // Sender ID (max 11 characters)
                EXTERNAL_SMS_ID: "1", // External ID for SMS tracking
                REC_ST: "PENDING", // Initial status
                ROW_TS: new Date(),
                USER_ID: req.user?.id || "user123", // Dynamic based on current user
                CREATE_DT: new Date(),
                SYS_CREATE_TS: new Date(),
                CREATED_BY: req.user?.username || "System",
                ACCT_BALANCE: newBalance,
            });

            // Send SMS via Kudisms API
            const smsData = new URLSearchParams();
            smsData.append("token", process.env.KUDISMS_API_KEY);
            smsData.append("senderID", "WareLog");
            smsData.append("recipients", RECIPIENT_PHONE_NUMBER);
            smsData.append("message", messageContent);

            const response = await axios.post(
                'https://my.kudisms.net/api/sms', 
                smsData.toString(), 
                {
                    headers: { 
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Accept": "application/json"
                    },
                    timeout: 10000 // 10 second timeout
                }
            );

            // Update SMS record with response from SMS provider
            if (response.data && response.data.status === 'success') {
                await newSMS.update({
                    REC_ST: 'SENT',
                    EXTERNAL_SMS_ID: response.data.message_id || response.data.id || "1",
                    SMS_PROVIDER_RESPONSE: JSON.stringify(response.data),
                    SENT_AT: new Date()
                });
            } else {
                await newSMS.update({
                    REC_ST: 'FAILED',
                    SMS_PROVIDER_RESPONSE: JSON.stringify(response.data),
                    ERROR_MESSAGE: 'Failed to send SMS via provider'
                });
            }

            if (response.data && response.data.status === 'success') {
                return res.status(201).json({
                    message: 'Transaction created successfully, and SMS sent.',
                    transactionRefNo,
                    smsId: newSMS.id,
                    providerResponse: response.data
                });
            } else {
                // SMS record was saved but API call failed
                return res.status(200).json({
                    message: 'Transaction created successfully, but SMS sending failed.',
                    transactionRefNo,
                    smsId: newSMS.id,
                    warning: 'SMS not delivered',
                    providerResponse: response.data
                });
            }

        } catch (error) {
            console.error('Error in SMS sending process:', error.message);
            
            // Try to save a failed SMS record for audit purposes
            try {
                await SMS.create({
                    RECIPIENT_PHONE_NUMBER,
                    MESSAGE_CONTENT: messageContent,
                    DISPLAY_ACCT_NO: `******${ACCT_NO.toString().slice(-4)}`,
                    Sender_Id: "WareLog",
                    EXTERNAL_SMS_ID: "ERROR",
                    REC_ST: "ERROR",
                    ROW_TS: new Date(),
                    USER_ID: req.user?.id || "user123",
                    CREATE_DT: new Date(),
                    SYS_CREATE_TS: new Date(),
                    CREATED_BY: req.user?.username || "System",
                    ACCT_BALANCE: newBalance,
                    ERROR_MESSAGE: error.message,
                    SMS_PROVIDER_RESPONSE: error.response ? JSON.stringify(error.response.data) : null
                });
            } catch (dbError) {
                console.error('Failed to save error SMS record:', dbError.message);
            }

            if (error.response) {
                // API error
                return res.status(500).json({ 
                    message: 'Error sending SMS via provider', 
                    error: error.response.data,
                    transactionRefNo 
                });
            } else if (error.code === 'ECONNREFUSED' || error.code === 'ETIMEDOUT') {
                // Connection error
                return res.status(503).json({ 
                    message: 'SMS service temporarily unavailable', 
                    error: error.message,
                    transactionRefNo 
                });
            } else {
                // General error
                return res.status(500).json({ 
                    message: 'Error in SMS sending process', 
                    error: error.message,
                    transactionRefNo 
                });
            }
        }
    }

    // Additional method to get SMS delivery status
    static async getSMSStatus(req, res) {
        try {
            const { smsId } = req.params;
            
            const smsRecord = await SMS.findByPk(smsId);
            
            if (!smsRecord) {
                return res.status(404).json({ message: 'SMS record not found' });
            }
            
            return res.status(200).json({
                status: smsRecord.REC_ST,
                recipient: smsRecord.RECIPIENT_PHONE_NUMBER,
                sentAt: smsRecord.SENT_AT,
                providerResponse: smsRecord.SMS_PROVIDER_RESPONSE ? 
                    JSON.parse(smsRecord.SMS_PROVIDER_RESPONSE) : null,
                errorMessage: smsRecord.ERROR_MESSAGE
            });
            
        } catch (error) {
            console.error('Error fetching SMS status:', error.message);
            return res.status(500).json({ 
                message: 'Error fetching SMS status', 
                error: error.message 
            });
        }
    }

    // Method to resend failed SMS
    static async resendSMS(req, res) {
        const transaction = await SMS.sequelize.transaction();
        
        try {
            const { smsId } = req.params;
            
            const smsRecord = await SMS.findByPk(smsId, { transaction });
            
            if (!smsRecord) {
                return res.status(404).json({ message: 'SMS record not found' });
            }
            
            if (smsRecord.REC_ST === 'SENT') {
                return res.status(400).json({ message: 'SMS already sent successfully' });
            }
            
            // Prepare SMS data
            const smsData = new URLSearchParams();
            smsData.append("token", process.env.KUDISMS_API_KEY);
            smsData.append("senderID", smsRecord.Sender_Id || "WareLog");
            smsData.append("recipients", smsRecord.RECIPIENT_PHONE_NUMBER);
            smsData.append("message", smsRecord.MESSAGE_CONTENT);
            
            // Send SMS via API
            const response = await axios.post(
                'https://my.kudisms.net/api/sms', 
                smsData.toString(), 
                {
                    headers: { 
                        "Content-Type": "application/x-www-form-urlencoded",
                        "Accept": "application/json"
                    },
                    timeout: 10000
                }
            );
            
            // Update SMS record
            if (response.data && response.data.status === 'success') {
                await smsRecord.update({
                    REC_ST: 'RESENT',
                    EXTERNAL_SMS_ID: response.data.message_id || response.data.id || smsRecord.EXTERNAL_SMS_ID,
                    SMS_PROVIDER_RESPONSE: JSON.stringify(response.data),
                    SENT_AT: new Date(),
                    RESENT_AT: new Date(),
                    RESENT_BY: req.user?.id || "System"
                }, { transaction });
            } else {
                await smsRecord.update({
                    REC_ST: 'FAILED',
                    SMS_PROVIDER_RESPONSE: JSON.stringify(response.data),
                    ERROR_MESSAGE: 'Failed to resend SMS via provider',
                    RESENT_ATTEMPTS: (smsRecord.RESENT_ATTEMPTS || 0) + 1
                }, { transaction });
            }
            
            await transaction.commit();
            
            if (response.data && response.data.status === 'success') {
                return res.status(200).json({
                    message: 'SMS resent successfully',
                    smsId: smsRecord.id,
                    providerResponse: response.data
                });
            } else {
                return res.status(400).json({
                    message: 'Failed to resend SMS',
                    smsId: smsRecord.id,
                    providerResponse: response.data
                });
            }
            
        } catch (error) {
            await transaction.rollback();
            console.error('Error resending SMS:', error.message);
            
            return res.status(500).json({ 
                message: 'Error resending SMS', 
                error: error.message 
            });
        }
    }
}

// Export the class with all methods
export default {
    sendSMSAfterTransaction: SMSController.sendSMSAfterTransaction,
    getSMSStatus: SMSController.getSMSStatus,
    resendSMS: SMSController.resendSMS
};