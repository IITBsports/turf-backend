const express = require('express');
const app = express();
const mongoose = require('mongoose');
const student = require('./model/student.js');
const bannedDb = require('./model/banned.js');
const mainInfo = require('./model/main.js');
const cors = require('cors');
const otpRoutes = require('./otpRoutes.js'); 
const nodemailer = require('nodemailer');

// Enhanced IITB SMTP Configuration optimized for Railway deployment
const createIITBTransporter = () => {
    const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.PORT;
    
    return nodemailer.createTransporter({
        host: process.env.SMTP_HOST || "smtp-auth.iitb.ac.in",
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: false,
        requireTLS: true,
        auth: {
            user: process.env.SMTP_USER || '23b3934@iitb.ac.in',
            pass: process.env.SMTP_PASS || '0820501803972bd2b1dcb9ee225c70f1'
        },
        // Railway-optimized timeouts
        connectionTimeout: isRailway ? 60000 : 45000,
        greetingTimeout: isRailway ? 30000 : 20000,
        socketTimeout: isRailway ? 60000 : 45000,
        
        // Conservative connection pooling for Railway
        pool: true,
        maxConnections: isRailway ? 1 : 3,
        maxMessages: isRailway ? 10 : 50,
        
        // Rate limiting
        rateDelta: 2000,
        rateLimit: 1,
        
        // Railway-specific TLS settings
        ignoreTLS: false,
        requireTLS: true,
        tls: {
            rejectUnauthorized: false,
            ciphers: 'SSLv3',
            servername: 'smtp-auth.iitb.ac.in'
        },
        
        // Additional Railway compatibility options
        logger: isRailway,
        debug: isRailway
    });
};

let transporter = createIITBTransporter();

// Verify transporter on startup with enhanced error handling
const verifyTransporter = async () => {
    const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.PORT;
    
    try {
        console.log('Verifying SMTP connection...');
        await Promise.race([
            transporter.verify(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('SMTP verification timeout')), 30000)
            )
        ]);
        
        console.log('IITB SMTP server is ready to take messages');
        return true;
    } catch (error) {
        console.error('IITB SMTP connection failed:', error.message);
        
        if (isRailway) {
            console.log('Railway environment detected, attempting SMTP recreation...');
        }
        
        // Recreate transporter on verification failure
        transporter = createIITBTransporter();
        return false;
    }
};

// Enhanced email sending function with Railway-specific optimizations
const mailToId = async (receiverEmailId, message, subject = "Turf Booking System") => {
    const senderEmailId = process.env.SENDER_EMAIL || "noreply.23b3934@iitb.ac.in";
    const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.PORT;
    
    const mailOptions = {
        from: senderEmailId,
        to: receiverEmailId,
        subject: subject,
        text: message
    };

    const maxRetries = isRailway ? 5 : 3;
    const baseRetryDelay = isRailway ? 3000 : 2000;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[${isRailway ? 'RAILWAY' : 'LOCAL'}] Sending email to ${receiverEmailId} (attempt ${attempt}/${maxRetries})`);
            
            // Create a promise with adaptive timeout
            const emailPromise = new Promise((resolve, reject) => {
                const timeoutDuration = isRailway ? 45000 : 30000;
                const timeout = setTimeout(() => {
                    reject(new Error(`Email timeout after ${timeoutDuration/1000} seconds (attempt ${attempt})`));
                }, timeoutDuration);

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
            console.log(`✓ Email sent successfully to ${receiverEmailId} on attempt ${attempt}`);
            console.log('Email details:', {
                messageId: info.messageId,
                accepted: info.accepted,
                rejected: info.rejected,
                preview: `${messagePreview}...`
            });
            
            return { success: true, info, attempt, isRailway };
            
        } catch (error) {
            console.error(`✗ Email attempt ${attempt} failed:`, {
                error: error.message,
                code: error.code,
                command: error.command,
                receiverEmailId,
                isRailway
            });
            
            // Progressive retry delay
            if (attempt < maxRetries) {
                const retryDelay = baseRetryDelay * attempt;
                console.log(`Waiting ${retryDelay}ms before retry...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                
                // Recreate transporter on specific connection errors
                if (['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'ENOTFOUND'].includes(error.code)) {
                    console.log('Recreating transporter due to connection error...');
                    transporter = createIITBTransporter();
                    
                    // Re-verify after recreation
                    try {
                        await transporter.verify();
                        console.log('Transporter recreated and verified successfully');
                    } catch (verifyError) {
                        console.error('Transporter verification failed after recreation:', verifyError.message);
                    }
                }
            } else {
                console.error(`Failed to send email to ${receiverEmailId} after ${maxRetries} attempts`);
                return { 
                    success: false, 
                    error: error.message,
                    finalAttempt: attempt,
                    isRailway
                };
            }
        }
    }
    
    return { success: false, error: 'Max retries exceeded', isRailway };
};

// Enhanced queue-based email system with Railway optimizations
class EmailQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.successCount = 0;
        this.failureCount = 0;
        this.lastError = null;
        this.isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.PORT;
    }

    async addToQueue(receiverEmailId, message, subject) {
        this.queue.push({ 
            receiverEmailId, 
            message, 
            subject, 
            timestamp: new Date(),
            id: Date.now() + Math.random() 
        });
        
        console.log(`[QUEUE] Email added for ${receiverEmailId}. Queue length: ${this.queue.length}`);
        
        if (!this.processing) {
            this.processQueue();
        }
    }

    async processQueue() {
        if (this.queue.length === 0) {
            this.processing = false;
            console.log('✓ Email queue processing completed');
            return;
        }

        this.processing = true;
        const emailData = this.queue.shift();
        
        try {
            const result = await mailToId(emailData.receiverEmailId, emailData.message, emailData.subject);
            
            if (result.success) {
                this.successCount++;
                console.log(`✓ Queue email sent successfully to ${emailData.receiverEmailId}`);
            } else {
                this.failureCount++;
                this.lastError = result.error;
                console.error(`✗ Queue email failed for ${emailData.receiverEmailId}:`, result.error);
            }
            
        } catch (error) {
            this.failureCount++;
            this.lastError = error.message;
            console.error(`✗ Queue processing error for ${emailData.receiverEmailId}:`, error.message);
        }

        // Railway-optimized processing delay
        const processDelay = this.isRailway ? 3000 : 1500;
        setTimeout(() => this.processQueue(), processDelay);
    }

    getStats() {
        return {
            queueLength: this.queue.length,
            processing: this.processing,
            successCount: this.successCount,
            failureCount: this.failureCount,
            lastError: this.lastError,
            environment: this.isRailway ? 'railway' : 'local'
        };
    }

    clearQueue() {
        this.queue = [];
        console.log('Email queue cleared');
    }
}

const emailQueue = new EmailQueue();

// Enhanced MongoDB connection with Railway optimizations
const mongoUri = process.env.MONGODB_URI || "mongodb+srv://aryanshtechhead:XdtUr6uOOCtwkgxE@turf-booking.ydar6gc.mongodb.net/turf-booking?retryWrites=true&w=majority";

const connectToDatabase = async () => {
    try {
        await mongoose.connect(mongoUri, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
            maxPoolSize: 10,
            minPoolSize: 1,
            maxIdleTimeMS: 30000,
            bufferMaxEntries: 0
        });
        
        console.log("✓ Connected to MongoDB database");
        
        // Verify email transporter after DB connection
        await verifyTransporter();
        
        return true;
    } catch (err) {
        console.error("✗ Database connection failed:", err.message);
        throw err;
    }
};

// Server startup
const startServer = async () => {
    try {
        await connectToDatabase();
        
        const port = process.env.PORT || 3010;
        const host = process.env.RAILWAY_ENVIRONMENT ? '0.0.0.0' : 'localhost';
        
        app.listen(port, host, () => {
            console.log(`✓ Server started on ${host}:${port}`);
            console.log(`Environment: ${process.env.RAILWAY_ENVIRONMENT ? 'Railway Production' : 'Local Development'}`);
            console.log(`Health check: http://${host === '0.0.0.0' ? 'your-app' : 'localhost'}:${port}/health`);
        });
    } catch (error) {
        console.error('✗ Server startup failed:', error);
        process.exit(1);
    }
};

app.use(cors());
app.use(express.json());

// Enhanced health check endpoint
app.get('/health', async (req, res) => {
    const emailStats = emailQueue.getStats();
    let emailHealth = 'unknown';
    let dbHealth = 'unknown';
    
    try {
        await transporter.verify();
        emailHealth = 'connected';
    } catch (error) {
        emailHealth = 'failed';
    }
    
    try {
        await mongoose.connection.db.admin().ping();
        dbHealth = 'connected';
    } catch (error) {
        dbHealth = 'failed';
    }
    
    res.status(200).json({ 
        status: 'OK', 
        timestamp: new Date().toISOString(),
        environment: process.env.RAILWAY_ENVIRONMENT ? 'railway' : 'local',
        emailHealth,
        dbHealth,
        emailStats,
        uptime: process.uptime()
    });
});

// Network diagnostics endpoint
app.get('/debug-network', async (req, res) => {
    const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.PORT;
    const diagnostics = {
        environment: isRailway ? 'railway' : 'local',
        port: process.env.PORT || 3010,
        nodeEnv: process.env.NODE_ENV,
        railwayEnv: process.env.RAILWAY_ENVIRONMENT,
        timestamp: new Date().toISOString(),
        nodeVersion: process.version
    };

    // Test SMTP connectivity with timeout
    try {
        await Promise.race([
            transporter.verify(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('SMTP verification timeout (15s)')), 15000)
            )
        ]);
        diagnostics.smtpStatus = 'connected';
    } catch (error) {
        diagnostics.smtpStatus = 'failed';
        diagnostics.smtpError = error.message;
    }

    // Network information
    const os = require('os');
    diagnostics.networkInfo = {
        hostname: os.hostname(),
        platform: os.platform(),
        arch: os.arch(),
        uptime: os.uptime()
    };

    res.json(diagnostics);
};

// Enhanced test email endpoint
app.get('/test-email/:email?', async (req, res) => {
    const testEmail = req.params.email || 'test@example.com';
    const isRailway = process.env.RAILWAY_ENVIRONMENT || process.env.PORT;
    
    const testMessage = `IITB SMTP Test Email - ${new Date().toISOString()}

Environment: ${isRailway ? 'Railway Production' : 'Local Development'}
Server Time: ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
Port: ${process.env.PORT || 3010}
Node Version: ${process.version}

This email confirms that the IITB SMTP configuration is working correctly.

Technical Details:
- SMTP Host: smtp-auth.iitb.ac.in:587
- TLS: Enabled
- Authentication: Successful
- Transport: ${isRailway ? 'Railway Optimized' : 'Standard'}`;
    
    try {
        const startTime = Date.now();
        const result = await mailToId(testEmail, testMessage, `IITB SMTP Test - ${isRailway ? 'Railway' : 'Local'}`);
        const endTime = Date.now();
        
        res.json({
            success: result.success,
            message: result.success ? 'Test email sent successfully via IITB SMTP' : 'Failed to send test email',
            attempt: result.attempt || result.finalAttempt,
            error: result.error || null,
            environment: isRailway ? 'railway' : 'local',
            duration: `${endTime - startTime}ms`,
            smtpHost: 'smtp-auth.iitb.ac.in'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Error sending test email',
            error: error.message,
            environment: isRailway ? 'railway' : 'local'
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

// Start the server
startServer();
