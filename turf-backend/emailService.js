
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: 'techheadisc@gmail.com', // replace with your email
        pass: 'Techhead@2024', // replace with your password
    }
});

const sendOtp = async (email, otp) => {
    const mailOptions = {
        from: 'your-email@gmail.com',
        to: email,
        subject: 'Your OTP for Booking',
        text: `Your OTP is ${otp}. It is valid for 5 minutes.`
    };

    await transporter.sendMail(mailOptions);
};

module.exports = { sendOtp };
