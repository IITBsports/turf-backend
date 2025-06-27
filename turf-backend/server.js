const express = require('express');
const app = express();
const mongoose = require('mongoose');
const student = require('./model/student.js');
const bannedDb = require('./model/banned.js');
const mainInfo = require('./model/main.js');
const cors = require('cors');
const otpRoutes = require('./otpRoutes'); 
const nodemailer = require('nodemailer');

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
    service: 'gmail', // Use your email provider
    auth: {
        user: 'techheadisc@gmail.com', // Replace with your email
        pass: 'opvddcbaufmzbaes'  // Replace with your app-specific password
    }
});


mongoose.connect("mongodb+srv://mndalwee:upiyQLuNAH6gmhK3@usersignup.ze0r2.mongodb.net/?retryWrites=true&w=majority&appName=userSignUp")
    .then(() => {
        console.log("connected to database");
        app.listen(3010, () => console.log("server has started on 3010"));
    })
    .catch((err) => {
        console.log("connection to database failed", err);
    });

app.use(cors());
app.use(express.json());

app.use('/api/otp', otpRoutes);

// Get all students
app.get('/students', async (req, res) => {
    try {
        const students = await student.find();
        res.json(students);
    } catch (error) {
        console.error('Error fetching students:', error);
        res.status(500).send('Server error');
    }
});

// Get all main info
app.get('/maininfos', async (req, res) => {
    try {
        const mainInfos = await mainInfo.find();
        res.json(mainInfos);
    } catch (error) {
        console.error('Error fetching main info:', error);
        res.status(500).send('Server error');
    }
});

app.get('/api/slots', async (req, res) => {
    try {
        // Fetch all student records from the database
        const mainInfos = await student.find();

        // Helper function to convert UTC time to IST time and format as 'YYYY-MM-DD'
        const formatDateToIST = (date) => {
            // Convert the time to IST (UTC + 5:30)
            const istOffset = 5 * 60 + 30; // Offset in minutes (5 hours 30 minutes)
            const istDate = new Date(date.getTime() + istOffset * 60 * 1000); // Adjust date by IST offset

            // Format the IST date as 'YYYY-MM-DD'
            return istDate.toISOString().split('T')[0];
        };

        // Get today's and tomorrow's dates in IST
        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);

        // Format the dates in IST
        const todayDate = formatDateToIST(today);
        const tomorrowDate = formatDateToIST(tomorrow);

        // Initialize an array for slots 1 to 14 for both today and tomorrow, defaulting all to 'available'
        const slotsStatus = [
            ...Array.from({ length: 14 }, (_, index) => ({
                slot: index + 1,
                status: 'available',  // Default status for each slot is 'available'
                date: todayDate        // Today's slots in IST
            })),
            ...Array.from({ length: 14 }, (_, index) => ({
                slot: index + 1,
                status: 'available',   // Default status for each slot is 'available'
                date: tomorrowDate     // Tomorrow's slots in IST
            }))
        ];

        // Group main info entries by slot number and date
        const slotGroups = {};
        mainInfos.forEach(info => {
            const slotNumber = info.slot;  // Assuming 'slot' contains the slot number
            const slotDate = info.date;    // Assuming 'date' contains the date (in 'YYYY-MM-DD' format)
            if (!slotGroups[slotNumber]) {
                slotGroups[slotNumber] = {};
            }
            if (!slotGroups[slotNumber][slotDate]) {
                slotGroups[slotNumber][slotDate] = [];
            }
            slotGroups[slotNumber][slotDate].push(info.status);  // Collect statuses for each slot and date
        });

        // Determine the status for each slot
        for (let i = 1; i <= 14; i++) {
            ['todayDate', 'tomorrowDate'].forEach(dateKey => {
                const slotDate = dateKey === 'todayDate' ? todayDate : tomorrowDate;
                const statuses = (slotGroups[i] && slotGroups[i][slotDate]) || [];

                // Priority 1: If any record has 'accepted', mark the slot as 'booked'
                if (statuses.includes('accepted')) {
                    slotsStatus.find(slot => slot.slot === i && slot.date === slotDate).status = 'booked';
                } 
                // Priority 2: If no 'accepted', but there is 'pending', mark the slot as 'requested'
                else if (statuses.includes('pending')) {
                    slotsStatus.find(slot => slot.slot === i && slot.date === slotDate).status = 'requested';
                } 
                // Priority 3: If 'rejected', mark it as 'available'
                else if (statuses.every(status => status === 'rejected')) {
                    slotsStatus.find(slot => slot.slot === i && slot.date === slotDate).status = 'available';
                } 
                // Default: If no relevant statuses, the slot stays 'available'
            });
        }

        // Send the updated slots status as a JSON response
        res.status(200).json(slotsStatus);
    } catch (error) {
        console.error('Error fetching slot statuses:', error);
        res.status(500).send('Server error');
    }
});









// Create new student record
// Create new student record
app.post('/', async (req, res) => {
    try {
        const {
            name,
            rollno,
            email,
            purpose,
            player_roll_no,
            no_of_players,
            status,
            slot,
            date,  // Accept date from request body
        } = req.body;

        // Check if user is banned
        const isBanned = await bannedDb.findOne({ rollno });
        if (isBanned) {
            return res.status(403).json({ message: 'Booking denied: You are currently restricted from this service' });
        }

        const slotTimeMap = {
            1: "6:30 AM - 7:30 AM",
            2: "7:30 AM - 8:30 AM",
            3: "8:30 AM - 9:30 AM",
            4: "9:30 AM - 10:30 AM",
            5: "10:30 AM - 11:30 AM",
            6: "11:30 AM - 12:30 PM",
            7: "12:30 PM - 1:30 PM",
            8: "1:30 PM - 2:30 PM",
            9: "2:30 PM - 3:30 PM",
            10: "3:30 PM - 5:00 PM",
            11: "5:00 PM - 6:00 PM",
            12: "6:00 PM - 7:00 PM",
            13: "7:00 PM - 8:00 PM",
            14: "8:00 PM - 9:30 PM"
        };

        const slotTime = slotTimeMap[slot] || 'Unknown time range';

        // Create new student record
        const newStudent = await student.create({
            name,
            rollno,
            email,
            player_roll_no,
            slot,
            no_of_players,
            status,
            date,  // Add the date field to the new student record
        });

        // Create new mainInfo record
        // Create new mainInfo record
        const MainInfo = await mainInfo.create({
            rollno: newStudent.rollno,
            slotno: newStudent.slot,
            status: newStudent.status,
        });

        // Send a notification email to the student
        const mailOptions = {
            from: 'techheadisc@gmail.com',  // Replace with your email
            to: email,                     // Student's email
            subject: 'Turf Booking Request Received',
            text: `Greetings,\n
This email acknowledges your request to book the Gymkhana Football Turf. Please find the details of your request below:\n
Name: ${name}\n
Requested Time: ${slotTime}\n
Requested Date: ${date}\n
Please note that this is just an acknowledgment of your booking request. You will receive a final email confirming your booking if it is approved by the Institute Football Secretary.\n
We kindly request you to await the confirmation email before making any plans regarding the turf usage.\n
If you have any questions or need further assistance, feel free to reach out.\n
Warm regards,\n
Yash Shah\n
Institute Sports Football Secretary, 2025-26\n
Ph: +91 8849468317\n`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
            } else {
                console.log('Booking confirmation email sent:', info.response);
            }
        });

        res.status(200).json({
            student: newStudent,
            mainInfo: MainInfo,
        });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});


// Delete student request by ID
app.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const info = await student.findByIdAndDelete(id);

        if (!info) {
            return res.status(404).json({ message: "Request not found" });
        }

        res.status(200).json({ message: "User deleted successfully" });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Update status of a student based on request
// Update status of a student and send confirmation email if accepted
app.put('/student/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body; // Expect 'accepted' or 'declined'

    try {
        if (!['accepted', 'declined'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const updatedStudent = await student.findByIdAndUpdate(id, { status }, { new: true });

        if (!updatedStudent) {
            return res.status(404).json({ message: 'Student not found' });
        }

        const slotTimeMap = {
            1: "6:30 AM - 7:30 AM",
            2: "7:30 AM - 8:30 AM",
            3: "8:30 AM - 9:30 AM",
            4: "9:30 AM - 10:30 AM",
            5: "10:30 AM - 11:30 AM",
            6: "11:30 AM - 12:30 PM",
            7: "12:30 PM - 1:30 PM",
            8: "1:30 PM - 2:30 PM",
            9: "2:30 PM - 3:30 PM",
            10: "3:30 PM - 5:00 PM",
            11: "5:00 PM - 6:00 PM",
            12: "6:00 PM - 7:00 PM",
            13: "7:00 PM - 8:00 PM",
            14: "8:00 PM - 9:30 PM"
        };

        const updatedslotTime = slotTimeMap[updatedStudent.slot] || 'Unknown time range';


        // Prepare mail options based on the status
        let mailOptions = {};
        if (status === 'accepted') {
            mailOptions = {
                from: 'techheadisc@gmail.com',  // Replace with your email
                to: updatedStudent.email,      // Student's email
                subject: 'Turf Booking Confirmation',
                text: `Greetings,\n\nThis email is to confirm your booking of the Gymkhana Football Turf. Please find the booking details below:\n\n
Name: ${updatedStudent.name}\n
Time: ${updatedslotTime}\n
Date: ${updatedStudent.date}\n\n
We kindly request you to make the most of this facility while adhering to the rules and regulations that help us maintain it for everyone's enjoyment.\n\n
If you have any questions or need further assistance, feel free to reach out.\n\n
Warm regards,\n
Yash Shah\n
Institute Sports Football Secretary , 2025-26\n
Ph: +91 9022513006\n`
            };
        } else if (status === 'declined') {
            mailOptions = {
                from: 'techheadisc@gmail.com',  // Replace with your email
                to: updatedStudent.email,      // Student's email
                subject: 'Booking Declined',
                text: `Greetings,\n\nWe regret to inform you that your booking request for the Gymkhana Football Turf has been declined. We apologize for any inconvenience this may cause.\n\n
If you have any questions or need further clarification, feel free to reach out.\n\n
Warm regards,\n
Yash Shah\n
Institute Sports Football Secretary , 2025-26\n
Ph: +91 9022513006\n`
            };
        }

        // Send the email
        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
            } else {
                console.log('Email sent:', info.response);
            }
        });

        res.status(200).json({ message: 'Status updated successfully', student: updatedStudent });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});


// Ban a user
app.post('/banUser', async (req, res) => {
    const { rollno } = req.body;
    try {
        const bannedUser = await bannedDb.create({ rollno });
        res.status(200).json({ "student": bannedUser });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Main info by slot number
app.get('/maininfo/:slotno', async (req, res) => {
    const { slotno } = req.params;

    try {
        // Get tomorrow's date and set the time to 00:00:00 for accurate comparison
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);

        const dayAfterTomorrow = new Date(tomorrow);
        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 1);

        // Find an entry in mainInfo where the rollno, slotno, status is 'accepted' and createdAt is tomorrow
        const mainInfoInstance = await mainInfo.findOne({
            slotno: slotno, 
            status: 'accepted',
            createdAt: { $gte: tomorrow, $lt: dayAfterTomorrow }  // Ensure the date is within tomorrow's range
        });

        if (!mainInfoInstance) {
            // If no such instance exists, return "empty slot"
            return res.status(404).json({ message: 'Empty slot' });
        }

        // If an instance exists, return the instance
        res.status(200).json({
            message: 'Slot found',
            data: mainInfoInstance
        });

    } catch (e) {
        // Handle any error that occurs during the process
        res.status(500).json({ message: e.message });
    }
});
