// otpRoutes.js
const express = require('express');
const otpGenerator = require('otp-generator');
const Otp = require('./models/otp');
const { sendOtp } = require('./emailService');

const router = express.Router();

// Route to generate and send OTP
router.post('/send-otp', async (req, res) => {
    const { email } = req.body;

    if (!email.endsWith('@iitb.ac.in')) {
        return res.status(400).json({ message: 'Invalid IITB email address' });
    }

    try {
        // Generate a 6-digit OTP
        const otp = otpGenerator.generate(6, { digits: true, alphabets: false, upperCase: false, specialChars: false });

        // Save OTP to database with expiration
        await Otp.create({ email, otp });

        // Send OTP to the user's email
        await sendOtp(email, otp);

        res.status(200).json({ message: 'OTP sent successfully' });
    } catch (error) {
        console.error('Error sending OTP:', error);
        res.status(500).json({ message: 'Error sending OTP' });
    }
});

// Route to verify OTP
router.post('/verify-otp', async (req, res) => {
    const { email, otp } = req.body;

    try {
        // Find OTP record in the database
        const otpRecord = await Otp.findOne({ email, otp });

        if (!otpRecord) {
            return res.status(400).json({ message: 'Invalid or expired OTP' });
        }

        // If valid, OTP is verified
        res.status(200).json({ message: 'OTP verified successfully' });
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ message: 'Error verifying OTP' });
    }
});

module.exports = router;
