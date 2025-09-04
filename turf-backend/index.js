const express = require('express');
const app = express();
const mongoose = require('mongoose');
const student = require('./model/student.js');
const bannedDb = require('./model/banned.js');
const mainInfo = require('./model/main.js');
const cors = require('cors');
const otpRoutes = require('./otpRoutes.js'); 
const nodemailer = require('nodemailer');

// IITB SMTP Configuration (similar to your Python mailToId function)
const transporter = nodemailer.createTransport({
    host: "smtp-auth.iitb.ac.in",
    port: 587,
    secure: false,        // false for 587
    requireTLS: true,     // Force TLS (similar to starttls() in Python)
    auth: {
        user: '23b3934@iitb.ac.in',  // Your IITB email
        pass: '082050180397bd2b1dcb9ee225c70f1'  // Your access token from the image
    },
    connectionTimeout: 100000,  // 100 seconds (matching Python timeout)
    greetingTimeout: 30000,     // 30 seconds  
    socketTimeout: 100000,      // 100 seconds
    debug: true,               // Enable debug output
    logger: true              // Log information to console
});

// Verify transporter on startup
transporter.verify((error, success) => {
    if (error) {
        console.error('IITB SMTP connection failed:', error);
    } else {
        console.log('IITB SMTP server is ready to take messages');
    }
});

// Enhanced email sending function (JavaScript version of your Python mailToId function)
const mailToId = (receiverEmailId, message, subject = "Turf Booking System") => {
    return new Promise((resolve, reject) => {
        const senderEmailId = "noreply.23b3934@iitb.ac.in";  // Similar to Python format
        
        const mailOptions = {
            from: senderEmailId,
            to: receiverEmailId,
            subject: subject,
            text: message
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Email error details:', {
                    error: error.message,
                    code: error.code,
                    command: error.command,
                    response: error.response,
                    responseCode: error.responseCode
                });
                console.log("Something went wrong....", error);
                resolve({ success: false, error }); // Don't reject to prevent app crashes
            } else {
                // Log success message (similar to Python version)
                const messageList = message.split(' ').slice(0, 6);
                const messageFinal = messageList.join(' ');
                console.log(`Message '${messageFinal}...' sent successfully to ${receiverEmailId}`);
                
                console.log('Email sent successfully:', {
                    messageId: info.messageId,
                    accepted: info.accepted,
                    rejected: info.rejected,
                    response: info.response
                });
                resolve({ success: true, info });
            }
        });
    });
};

// Use environment variable for MongoDB connection
const mongoUri = process.env.MONGODB_URI || "mongodb+srv://aryanshtechhead:XdtUr6uOOCtwkgxE@turf-booking.ydar6gc.mongodb.net/?retryWrites=true&w=majority&appName=Turf-Booking";

mongoose.connect(mongoUri)
    .then(() => {
        console.log("connected to database");
        // Use PORT environment variable for Back4App compatibility
        const port = process.env.PORT || 3010;
        // IMPORTANT: Bind to 0.0.0.0 for container environments
        app.listen(port, '0.0.0.0', () => {
            console.log(`server has started on port ${port}`);
            console.log(`Health check available at http://localhost:${port}/health`);
        });
    })
    .catch((err) => {
        console.log("connection to database failed", err);
        process.exit(1); // Exit with error code if DB connection fails
    });

app.use(cors());
app.use(express.json());

// Health check endpoint for container monitoring
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Test email endpoint for debugging
app.get('/test-email', async (req, res) => {
    const testMessage = 'This is a test email to verify IITB SMTP configuration.';
    const result = await mailToId('test@example.com', testMessage, 'Test Email Configuration');
    res.json(result);
});

// Your existing routes remain the same...
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

// NEW ENDPOINT: Get pending requests sorted by request time (FIFO)
app.get('/pending-requests/:slotno/:date', async (req, res) => {
    try {
        const { slotno, date } = req.params;
        
        // Find all pending requests for the specific slot and date, sorted by creation time
        const pendingRequests = await student.find({
            slot: slotno,
            date: date,
            status: 'pending'
        }).sort({ createdAt: 1 }); // Sort by creation time (earliest first)

        res.status(200).json(pendingRequests);
    } catch (error) {
        console.error('Error fetching pending requests:', error);
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

// Create new student record with timestamp
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

        // Create new student record with automatic timestamp
        const newStudent = await student.create({
            name,
            rollno,
            email,
            player_roll_no,
            slot,
            no_of_players,
            status,
            date,  // Add the date field to the new student record
            requestTime: new Date() // Add explicit request timestamp
        });

        // Create new mainInfo record with the same timestamp
        const MainInfo = await mainInfo.create({
            rollno: newStudent.rollno,
            slotno: newStudent.slot,
            status: newStudent.status,
            date: date,
            requestTime: newStudent.createdAt // Use the same timestamp
        });

        // Prepare acknowledgment email message
        const message = `Greetings,

This email acknowledges your request to book the Gymkhana Football Turf. Please find the details of your request below:

Name: ${name}
Requested Time: ${slotTime}
Requested Date: ${date}
Request submitted at: ${newStudent.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

Please note that this is just an acknowledgment of your booking request. You will receive a final email confirming your booking if it is approved by the Institute Football Secretary.

Requests are processed on a first-come-first-served basis based on submission time.

We kindly request you to await the confirmation email before making any plans regarding the turf usage.

If you have any questions or need further assistance, feel free to reach out.

Warm regards,
Yash Shah
Institute Sports Football Secretary, 2025-26
Ph: +91 8849468317`;

        // Use the new mailToId function
        const emailResult = await mailToId(email, message, 'Turf Booking Request Received');
        if (!emailResult.success) {
            console.error('Failed to send acknowledgment email, but booking was successful');
        }

        res.status(200).json({
            student: newStudent,
            mainInfo: MainInfo,
            message: `Request submitted successfully. You are in queue position based on ${newStudent.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
            emailSent: emailResult.success
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

        // Also delete corresponding mainInfo entry
        await mainInfo.findOneAndDelete({ rollno: info.rollno, slotno: info.slot });

        res.status(200).json({ message: "User deleted successfully" });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Updated endpoint to handle FIFO approval
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

        // Update corresponding mainInfo record
        await mainInfo.findOneAndUpdate(
            { rollno: updatedStudent.rollno, slotno: updatedStudent.slot },
            { status: status }
        );

        // If accepting a request, check if this is the earliest pending request for this slot/date
        if (status === 'accepted') {
            const earliestPendingRequest = await student.findOne({
                slot: updatedStudent.slot,
                date: updatedStudent.date,
                status: 'pending'
            }).sort({ createdAt: 1 }); // Get the earliest pending request

            if (earliestPendingRequest && earliestPendingRequest._id.toString() !== id) {
                // Log a warning if accepting a request that's not the earliest
                console.warn(`Warning: Accepting request ${id} but earlier pending request ${earliestPendingRequest._id} exists for slot ${updatedStudent.slot} on ${updatedStudent.date}`);
            }

            // Auto-decline all other pending requests for the same slot and date
            const otherPendingRequests = await student.find({
                slot: updatedStudent.slot,
                date: updatedStudent.date,
                status: 'pending',
                _id: { $ne: id } // Exclude the current request being accepted
            });

            // Update all other pending requests to 'declined'
            await student.updateMany(
                {
                    slot: updatedStudent.slot,
                    date: updatedStudent.date,
                    status: 'pending',
                    _id: { $ne: id }
                },
                { status: 'declined' }
            );

            // Update corresponding mainInfo records
            await mainInfo.updateMany(
                {
                    slotno: updatedStudent.slot,
                    status: 'pending'
                },
                { status: 'declined' }
            );

            // Send decline emails to other pending requests with async handling
            for (const otherRequest of otherPendingRequests) {
                const declineMessage = `Greetings,

We regret to inform you that your booking request for the Gymkhana Football Turf has been declined as the slot has been allocated to an earlier request.

Slot: ${updatedStudent.slot}
Date: ${updatedStudent.date}

We process requests on a first-come-first-served basis. Please try booking another available slot.

If you have any questions or need further clarification, feel free to reach out.

Warm regards,
Yash Shah
Institute Sports Football Secretary, 2025-26
Ph: +91 9022513006`;

                const declineEmailResult = await mailToId(otherRequest.email, declineMessage, 'Booking Declined - Slot Already Booked');
                if (!declineEmailResult.success) {
                    console.error(`Failed to send decline email to: ${otherRequest.email}`);
                }
            }
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

        // Prepare mail message and subject based on status
        let message = '';
        let emailSubject = '';

        if (status === 'accepted') {
            emailSubject = 'Turf Booking Confirmation';
            message = `Greetings,

This email is to confirm your booking of the Gymkhana Football Turf. Please find the booking details below:

Name: ${updatedStudent.name}
Time: ${updatedslotTime}
Date: ${updatedStudent.date}
Original Request Time: ${updatedStudent.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}

We kindly request you to make the most of this facility while adhering to the rules and regulations that help us maintain it for everyone's enjoyment.

If you have any questions or need further assistance, feel free to reach out.

Warm regards,
Yash Shah
Institute Sports Football Secretary, 2025-26
Ph: +91 9022513006`;
        } else if (status === 'declined') {
            emailSubject = 'Booking Declined';
            message = `Greetings,

We regret to inform you that your booking request for the Gymkhana Football Turf has been declined. We apologize for any inconvenience this may cause.

If you have any questions or need further clarification, feel free to reach out.

Warm regards,
Yash Shah
Institute Sports Football Secretary, 2025-26
Ph: +91 9022513006`;
        }

        // Send the email with new function
        const statusEmailResult = await mailToId(updatedStudent.email, message, emailSubject);

        res.status(200).json({ 
            message: 'Status updated successfully', 
            student: updatedStudent,
            autoDeclinedCount: status === 'accepted' ? otherPendingRequests?.length || 0 : 0,
            emailSent: statusEmailResult.success
        });
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

// Updated main info endpoint to work with the FIFO system
app.get('/maininfo/:slotno/:date', async (req, res) => {
    const { slotno, date } = req.params;

    try {
        // Find an entry in mainInfo where the slotno, status is 'accepted' and date matches
        const mainInfoInstance = await mainInfo.findOne({
            slotno: slotno, 
            status: 'accepted',
            date: date
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

// NEW ENDPOINT: Get queue position for a specific request
app.get('/queue-position/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
        // Find the specific student request
        const studentRequest = await student.findById(id);
        
        if (!studentRequest) {
            return res.status(404).json({ message: 'Request not found' });
        }

        if (studentRequest.status !== 'pending') {
            return res.status(200).json({ 
                message: `Request is ${studentRequest.status}`,
                position: null,
                status: studentRequest.status
            });
        }

        // Find all pending requests for the same slot and date that were created before this one
        const earlierRequests = await student.countDocuments({
            slot: studentRequest.slot,
            date: studentRequest.date,
            status: 'pending',
            createdAt: { $lt: studentRequest.createdAt }
        });

        const queuePosition = earlierRequests + 1; // +1 because position starts from 1, not 0

        res.status(200).json({
            message: 'Queue position calculated',
            position: queuePosition,
            status: studentRequest.status,
            requestTime: studentRequest.createdAt,
            slot: studentRequest.slot,
            date: studentRequest.date
        });

    } catch (error) {
        console.error('Error calculating queue position:', error);
        res.status(500).send('Server error');
    }
});
