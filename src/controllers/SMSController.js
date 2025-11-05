import mongoose from 'mongoose';
import SMS from '../models/SMS.js';
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

        // Create a new SMS record
        const newSMS = new SMS({
            RECIPIENT_PHONE_NUMBER,
            MESSAGE_CONTENT: messageContent,
            DISPLAY_ACCT_NO: `******${ACCT_NO.toString().slice(-4)}`,
            Sender_Id: "WareLog", // Sender ID (max 11 characters)
            EXTERNAL_SMS_ID: "1", // External ID for SMS tracking
            REC_ST: "status", // Example status, could be modified based on the actual use case
            ROW_TS: new Date().toISOString(),
            USER_ID: "user123", // This should be dynamic based on the current user
            CREATE_DT: new Date().toISOString(),
            SYS_CREATE_TS: new Date().toISOString(),
            CREATED_BY: "System", // Created by system for now, can be dynamic based on your application
            ACCT_BALANCE: newBalance, // Account balance after the transaction
        });

        // Save the SMS record in the database
        try {
            await newSMS.save();
             // Assuming you want to notify via SMS after creating the transaction
        await NotificationService.sendDepositNotification({
            DEPOSITOR_NAME,
            AMOUNT,
            TRANSACTION_REF_NO: transactionRefNo,
            NEW_BALANCE: newBalance,
            RECIPIENT_PHONE_NUMBER: req.body.RECIPIENT_PHONE_NUMBER // Ensure the phone number is passed in the request body
        });

            // Prepare data for SMS API
            const smsData = new URLSearchParams();
            smsData.append("token", process.env.KUDISMS_API_KEY); // API key from .env file
            smsData.append("senderID", "WareLog"); // Sender ID (max 11 characters)
            smsData.append("recipients", RECIPIENT_PHONE_NUMBER);
            smsData.append("message", messageContent);

            // Send SMS via Kudisms API
            const response = await axios.post('https://my.kudisms.net/api/sms', smsData.toString(), {
                headers: { "Content-Type": "application/x-www-form-urlencoded" }
            });

            if (response.data.status === 'success') {
                return res.status(201).json({
                    message: 'Transaction created successfully, and SMS sent.',
                    transactionRefNo // Include the transaction reference number in the response
                });
            } else {
                return res.status(400).json({ message: 'Failed to send SMS via Kudisms', error: response.data });
            }

        } catch (error) {
            console.error('Error saving SMS record or sending SMS:', error.message);
            return res.status(500).json({ message: 'Error sending SMS or saving SMS record', error: error.message });
        }
    }
}

// Export the class method correctly
export default SMSController.sendSMSAfterTransaction;
