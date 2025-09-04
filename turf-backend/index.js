const express = require('express');
const app = express();
const mongoose = require('mongoose');
const student = require('./model/student.js');
const bannedDb = require('./model/banned.js');
const mainInfo = require('./model/main.js');
const cors = require('cors');
const otpRoutes = require('./otpRoutes.js'); 
const nodemailer = require('nodemailer');

// Enhanced IITB SMTP Configuration with better timeout and connection handling
const createIITBTransporter = () => {
    return nodemailer.createTransport({
        host: "smtp-auth.iitb.ac.in",
        port: 587,
        secure: false,
        requireTLS: true,
        auth: {
            user: '23b3934@iitb.ac.in',
            pass: '0820501803972bd2b1dcb9ee225c70f1'
        },
        // Optimized timeouts for institutional SMTP
        connectionTimeout: 45000,  // 45 seconds
        greetingTimeout: 20000,    // 20 seconds  
        socketTimeout: 45000,      // 45 seconds
        
        // Connection pooling for better performance
        pool: true,
        maxConnections: 3,         // Conservative connection limit
        maxMessages: 50,           // Messages per connection
        
        // Rate limiting to avoid overwhelming the server
        rateDelta: 1000,          // 1 second window
        rateLimit: 2,             // Max 2 emails per second
        
        // Disable debugging in production
        debug: false,
        logger: false,
        
        // Additional stability options
        ignoreTLS: false,
        requireTLS: true,
        tls: {
            rejectUnauthorized: false // Help with certificate issues
        }
    });
};

let transporter = createIITBTransporter();

// Verify transporter on startup with better error handling
const verifyTransporter = async () => {
    try {
        await transporter.verify();
        console.log('IITB SMTP server is ready to take messages');
        return true;
    } catch (error) {
        console.error('IITB SMTP connection failed:', error.message);
        // Recreate transporter on verification failure
        transporter = createIITBTransporter();
        return false;
    }
};

// Enhanced email sending function with improved retry logic
const mailToId = async (receiverEmailId, message, subject = "Turf Booking System") => {
    const senderEmailId = "noreply.23b3934@iitb.ac.in";
    
    const mailOptions = {
        from: senderEmailId,
        to: receiverEmailId,
        subject: subject,
        text: message
    };

    const maxRetries = 3;
    const retryDelay = 2000; // 2 seconds between retries
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempting to send email to ${receiverEmailId} (attempt ${attempt}/${maxRetries})`);
            
            // Create a promise with timeout
            const emailPromise = new Promise((resolve, reject) => {
                const timeout = setTimeout(() => {
                    reject(new Error(`Email timeout after 30 seconds (attempt ${attempt})`));
                }, 30000); // 30 second timeout per attempt

                transporter.sendMail(mailOptions, (error, info) => {
                    clearTimeout(timeout);
                    if (error) {
                        reject(error);
                    } else {
                        resolve(info);
                    }
                });
            });

            const info = await emailPromise;
            
            // Log success
            const messagePreview = message.split(' ').slice(0, 6).join(' ');
            console.log(`Message '${messagePreview}...' sent successfully to ${receiverEmailId} on attempt ${attempt}`);
            console.log('Email sent successfully:', {
                messageId: info.messageId,
                accepted: info.accepted,
                rejected: info.rejected
            });
            
            return { success: true, info, attempt };
            
        } catch (error) {
            console.error(`Email attempt ${attempt} failed:`, {
                error: error.message,
                code: error.code,
                command: error.command,
                receiverEmailId
            });
            
            // If this isn't the last attempt, wait before retrying
            if (attempt < maxRetries) {
                console.log(`Waiting ${retryDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                
                // Recreate transporter on connection errors
                if (error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
                    console.log('Recreating transporter due to connection error...');
                    transporter = createIITBTransporter();
                }
            } else {
                // Final attempt failed
                console.error(`Failed to send email to ${receiverEmailId} after ${maxRetries} attempts`);
                return { 
                    success: false, 
                    error: error.message,
                    finalAttempt: attempt
                };
            }
        }
    }
    
    return { success: false, error: 'Max retries exceeded' };
};

// Queue-based email system for better reliability
class EmailQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.successCount = 0;
        this.failureCount = 0;
        this.lastError = null;
    }

    async addToQueue(receiverEmailId, message, subject) {
        this.queue.push({ 
            receiverEmailId, 
            message, 
            subject, 
            timestamp: new Date(),
            id: Date.now() + Math.random() 
        });
        
        console.log(`Email added to queue for ${receiverEmailId}. Queue length: ${this.queue.length}`);
        
        if (!this.processing) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.queue.length === 0) {
            this.processing = false;
            console.log('Email queue processing completed');
            return;
        }

        this.processing = true;
        const emailData = this.queue.shift();
        
        try {
            const result = await mailToId(emailData.receiverEmailId, emailData.message, emailData.subject);
            
            if (result.success) {
                this.successCount++;
                console.log(`Email sent successfully from queue to ${emailData.receiverEmailId}`);
            } else {
                this.failureCount++;
                this.lastError = result.error;
                console.error(`Failed to send queued email to ${emailData.receiverEmailId}:`, result.error);
            }
            
        } catch (error) {
            this.failureCount++;
            this.lastError = error.message;
            console.error(`Queue processing error for ${emailData.receiverEmailId}:`, error.message);
        }

        // Process next email in queue after a delay
        setTimeout(() => this.processQueue(), 1500); // 1.5 second delay between emails
    }

    getStats() {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            successCount: this.successCount,
            failureCount: this.failureCount,
            lastError: this.lastError
        };
    }

    clearQueue() {
        this.queue = [];
        console.log('Email queue cleared');
    }
}

const emailQueue = new EmailQueue();

// Use environment variable for MongoDB connection
const mongoUri = process.env.MONGODB_URI || "mongodb+srv://aryanshtechhead:XdtUr6uOOCtwkgxE@turf-booking.ydar6gc.mongodb.net/?retryWrites=true&w=majority&appName=Turf-Booking";

mongoose.connect(mongoUri)
    .then(async () => {
        console.log("Connected to database");
        
        // Verify email transporter
        await verifyTransporter();
        
        const port = process.env.PORT || 3010;
        app.listen(port, '0.0.0.0', () => {
            console.log(`Server has started on port ${port}`);
            console.log(`Health check available at http://localhost:${port}/health`);
        });
    })
    .catch((err) => {
        console.log("Connection to database failed", err);
        process.exit(1);
    });

app.use(cors());
app.use(express.json());

// Health check endpoint with email system status
app.get('/health', async (req, res) => {
    const emailStats = emailQueue.getStats();
    let emailHealth = 'unknown';
    
    try {
        await transporter.verify();
        emailHealth = 'ok';
    } catch (error) {
        emailHealth = 'failed';
    }
    
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        emailHealth,
        emailStats
    });
});

// Enhanced test email endpoint
app.get('/test-email/:email?', async (req, res) => {
    const testEmail = req.params.email || 'test@example.com';
    const testMessage = 'This is a test email to verify IITB SMTP configuration. If you receive this, the email system is working correctly.';
    
    try {
        const result = await mailToId(testEmail, testMessage, 'Test Email Configuration');
        res.json({
            success: result.success,
            message: result.success ? 'Test email sent successfully' : 'Failed to send test email',
            attempt: result.attempt || result.finalAttempt,
            error: result.error || null
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error sending test email',
            error: error.message
        });
    }
});

// Email queue management endpoints
app.get('/email-queue-status', (req, res) => {
    res.json(emailQueue.getStats());
});

app.post('/retry-email-queue', (req, res) => {
    if (!emailQueue.processing && emailQueue.queue.length > 0) {
        emailQueue.processQueue();
        res.json({ message: 'Email queue processing restarted', queueLength: emailQueue.queue.length });
    } else if (emailQueue.processing) {
        res.json({ message: 'Email queue is already processing', queueLength: emailQueue.queue.length });
    } else {
        res.json({ message: 'Email queue is empty', queueLength: 0 });
    }
});

app.delete('/clear-email-queue', (req, res) => {
    emailQueue.clearQueue();
    res.json({ message: 'Email queue cleared successfully' });
});

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

// Get pending requests sorted by request time (FIFO)
app.get('/pending-requests/:slotno/:date', async (req, res) => {
    try {
        const { slotno, date } = req.params;
        
        const pendingRequests = await student.find({
            slot: slotno,
            date: date,
            status: 'pending'
        }).sort({ createdAt: 1 });

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

// Create new student record with queued email
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
            date,
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
            date,
            requestTime: new Date()
        });

        // Create new mainInfo record with the same timestamp
        const MainInfo = await mainInfo.create({
            rollno: newStudent.rollno,
            slotno: newStudent.slot,
            status: newStudent.status,
            date: date,
            requestTime: newStudent.createdAt
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

        // Add email to queue instead of sending immediately
        emailQueue.addToQueue(email, message, 'Turf Booking Request Received');

        res.status(200).json({
            student: newStudent,
            mainInfo: MainInfo,
            message: `Request submitted successfully. You are in queue position based on ${newStudent.createdAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}`,
            emailQueued: true
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

// Updated endpoint to handle FIFO approval with queued emails
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
            }).sort({ createdAt: 1 });

            if (earliestPendingRequest && earliestPendingRequest._id.toString() !== id) {
                console.warn(`Warning: Accepting request ${id} but earlier pending request ${earliestPendingRequest._id} exists for slot ${updatedStudent.slot} on ${updatedStudent.date}`);
            }

            // Auto-decline all other pending requests for the same slot and date
            const otherPendingRequests = await student.find({
                slot: updatedStudent.slot,
                date: updatedStudent.date,
                status: 'pending',
                _id: { $ne: id }
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

            // Queue decline emails for other pending requests
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

                emailQueue.addToQueue(otherRequest.email, declineMessage, 'Booking Declined - Slot Already Booked');
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

        // Add status update email to queue
        emailQueue.addToQueue(updatedStudent.email, message, emailSubject);

        res.status(200).json({ 
            message: 'Status updated successfully', 
            student: updatedStudent,
            autoDeclinedCount: status === 'accepted' ? otherPendingRequests?.length || 0 : 0,
            emailQueued: true
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

// Get queue position for a specific request
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