const express = require('express');
const app = express();
const mongoose = require('mongoose');
const student = require('./model/student.js');
const bannedDb = require('./model/banned.js');
const mainInfo = require('./model/main.js');
const cors = require('cors');
const otpRoutes = require('./otpRoutes.js'); 
const nodemailer = require('nodemailer');

// Create multiple transporter configurations as fallbacks
const createTransporters = () => {
    const transporters = [];
    
    // Primary: Gmail SMTP with service configuration
    transporters.push(nodemailer.createTransporter({
        service: 'gmail',
        auth: {
            user: 'aryansh.techhead@gmail.com',
            pass: 'zlsttvscsjwlflqs'
        },
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 75000,
        tls: {
            rejectUnauthorized: false
        }
    }));
    
    // Fallback: Port 465 configuration
    transporters.push(nodemailer.createTransporter({
        host: "smtp.gmail.com",
        port: 465,
        secure: true,
        auth: {
            user: 'aryansh.techhead@gmail.com',
            pass: 'zlsttvscsjwlflqs'
        },
        connectionTimeout: 60000,
        greetingTimeout: 30000,
        socketTimeout: 75000,
        tls: {
            rejectUnauthorized: false
        }
    }));
    
    return transporters;
};

// Enhanced email sending with retry logic
const sendEmailWithRetry = async (mailOptions, maxRetries = 3) => {
    const transporters = createTransporters();
    let lastError;
    
    for (let transporterIndex = 0; transporterIndex < transporters.length; transporterIndex++) {
        const transporter = transporters[transporterIndex];
        
        for (let retry = 0; retry < maxRetries; retry++) {
            try {
                console.log(`Attempting to send email - Transporter ${transporterIndex + 1}, Attempt ${retry + 1}`);
                
                const emailPromise = new Promise((resolve, reject) => {
                    transporter.sendMail(mailOptions, (error, info) => {
                        if (error) {
                            reject(error);
                        } else {
                            resolve({ success: true, info });
                        }
                    });
                });
                
                // Race between email sending and timeout
                const timeoutPromise = new Promise((_, reject) => {
                    setTimeout(() => reject(new Error('Email timeout after 90 seconds')), 90000);
                });
                
                const result = await Promise.race([emailPromise, timeoutPromise]);
                console.log('Email sent successfully:', result.info?.messageId);
                return result;
                
            } catch (error) {
                lastError = error;
                console.error(`Email attempt failed - Transporter ${transporterIndex + 1}, Attempt ${retry + 1}:`, error.message);
                
                // Wait before retry (exponential backoff)
                if (retry < maxRetries - 1) {
                    await new Promise(resolve => setTimeout(resolve, Math.pow(2, retry) * 1000));
                }
            }
        }
    }
    
    console.error('All email sending attempts failed:', lastError?.message);
    return { success: false, error: lastError };
};

// Queue-based Email System
class EmailQueue {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.maxRetries = 3;
        this.retryDelay = 5000;
    }
    
    async addEmail(mailOptions) {
        return new Promise((resolve) => {
            this.queue.push({
                mailOptions,
                resolve,
                retries: 0,
                timestamp: Date.now()
            });
            
            if (!this.processing) {
                this.processQueue();
            }
        });
    }
    
    async processQueue() {
        if (this.processing || this.queue.length === 0) return;
        
        this.processing = true;
        console.log(`Processing email queue - ${this.queue.length} emails pending`);
        
        while (this.queue.length > 0) {
            const emailJob = this.queue.shift();
            
            try {
                const result = await sendEmailWithRetry(emailJob.mailOptions, 2);
                emailJob.resolve(result);
            } catch (error) {
                console.error('Queue email processing failed:', error);
                
                if (emailJob.retries < this.maxRetries) {
                    emailJob.retries++;
                    this.queue.push(emailJob);
                    await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                } else {
                    emailJob.resolve({ success: false, error });
                }
            }
        }
        
        this.processing = false;
        console.log('Email queue processing completed');
    }
}

// Initialize email queue
const emailQueue = new EmailQueue();

// Use MongoDB connection string directly
const mongoUri = "mongodb+srv://aryanshtechhead:XdtUr6uOOCtwkgxE@turf-booking.ydar6gc.mongodb.net/?retryWrites=true&w=majority&appName=Turf-Booking";

mongoose.connect(mongoUri)
    .then(() => {
        console.log("connected to database");
        const port = 3010;
        app.listen(port, '0.0.0.0', () => {
            console.log(`server has started on port ${port}`);
            console.log(`Health check available at http://localhost:${port}/health`);
        });
    })
    .catch((err) => {
        console.log("connection to database failed", err);
        process.exit(1);
    });

app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Email health check endpoint
app.get('/email-health', async (req, res) => {
    try {
        const transporters = createTransporters();
        const results = [];
        
        for (let i = 0; i < transporters.length; i++) {
            try {
                await transporters[i].verify();
                results.push({ transporter: i + 1, status: 'OK' });
            } catch (error) {
                results.push({ transporter: i + 1, status: 'FAILED', error: error.message });
            }
        }
        
        res.json({ emailHealth: results });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Test email endpoint
app.get('/test-email', async (req, res) => {
    const testMailOptions = {
        from: 'aryansh.techhead@gmail.com',
        to: 'aryansh.techhead@gmail.com', // Send to yourself for testing
        subject: 'Test Email Configuration',
        text: 'This is a test email to verify SMTP configuration.'
    };

    const result = await sendEmailWithRetry(testMailOptions);
    res.json(result);
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
        const mainInfos = await student.find();

        const formatDateToIST = (date) => {
            const istOffset = 5 * 60 + 30;
            const istDate = new Date(date.getTime() + istOffset * 60 * 1000);
            return istDate.toISOString().split('T')[0];
        };

        const today = new Date();
        const tomorrow = new Date();
        tomorrow.setDate(today.getDate() + 1);

        const todayDate = formatDateToIST(today);
        const tomorrowDate = formatDateToIST(tomorrow);

        const slotsStatus = [
            ...Array.from({ length: 14 }, (_, index) => ({
                slot: index + 1,
                status: 'available',
                date: todayDate
            })),
            ...Array.from({ length: 14 }, (_, index) => ({
                slot: index + 1,
                status: 'available',
                date: tomorrowDate
            }))
        ];

        const slotGroups = {};
        mainInfos.forEach(info => {
            const slotNumber = info.slot;
            const slotDate = info.date;
            if (!slotGroups[slotNumber]) {
                slotGroups[slotNumber] = {};
            }
            if (!slotGroups[slotNumber][slotDate]) {
                slotGroups[slotNumber][slotDate] = [];
            }
            slotGroups[slotNumber][slotDate].push(info.status);
        });

        for (let i = 1; i <= 14; i++) {
            ['todayDate', 'tomorrowDate'].forEach(dateKey => {
                const slotDate = dateKey === 'todayDate' ? todayDate : tomorrowDate;
                const statuses = (slotGroups[i] && slotGroups[i][slotDate]) || [];

                if (statuses.includes('accepted')) {
                    slotsStatus.find(slot => slot.slot === i && slot.date === slotDate).status = 'booked';
                } else if (statuses.includes('pending')) {
                    slotsStatus.find(slot => slot.slot === i && slot.date === slotDate).status = 'requested';
                } else if (statuses.every(status => status === 'rejected')) {
                    slotsStatus.find(slot => slot.slot === i && slot.date === slotDate).status = 'available';
                }
            });
        }

        res.status(200).json(slotsStatus);
    } catch (error) {
        console.error('Error fetching slot statuses:', error);
        res.status(500).send('Server error');
    }
});

// Create new student record with improved email handling
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

        // Create new student record
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

        // Create new mainInfo record
        const MainInfo = await mainInfo.create({
            rollno: newStudent.rollno,
            slotno: newStudent.slot,
            status: newStudent.status,
            date: date,
            requestTime: newStudent.createdAt
        });

        // Prepare acknowledgment email
        const mailOptions = {
            from: 'aryansh.techhead@gmail.com',
            to: email,
            subject: 'Turf Booking Request Received',
            text: `Greetings,

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
Ph: +91 8849468317`
        };

        // Send email using queue system (non-blocking)
        emailQueue.addEmail(mailOptions).then(result => {
            console.log(`Email result for ${email}:`, result.success ? 'Success' : 'Failed');
        }).catch(error => {
            console.error(`Email queue error for ${email}:`, error.message);
        });

        // Return success immediately (don't wait for email)
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

        await mainInfo.findOneAndDelete({ rollno: info.rollno, slotno: info.slot });

        res.status(200).json({ message: "User deleted successfully" });
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Updated endpoint to handle FIFO approval with improved email handling
app.put('/student/:id/status', async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

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

        if (status === 'accepted') {
            const earliestPendingRequest = await student.findOne({
                slot: updatedStudent.slot,
                date: updatedStudent.date,
                status: 'pending'
            }).sort({ createdAt: 1 });

            if (earliestPendingRequest && earliestPendingRequest._id.toString() !== id) {
                console.warn(`Warning: Accepting request ${id} but earlier pending request ${earliestPendingRequest._id} exists for slot ${updatedStudent.slot} on ${updatedStudent.date}`);
            }

            // Auto-decline all other pending requests
            const otherPendingRequests = await student.find({
                slot: updatedStudent.slot,
                date: updatedStudent.date,
                status: 'pending',
                _id: { $ne: id }
            });

            await student.updateMany(
                {
                    slot: updatedStudent.slot,
                    date: updatedStudent.date,
                    status: 'pending',
                    _id: { $ne: id }
                },
                { status: 'declined' }
            );

            await mainInfo.updateMany(
                {
                    slotno: updatedStudent.slot,
                    status: 'pending'
                },
                { status: 'declined' }
            );

            // Send decline emails to other pending requests
            for (const otherRequest of otherPendingRequests) {
                const declineMailOptions = {
                    from: 'aryansh.techhead@gmail.com',
                    to: otherRequest.email,
                    subject: 'Booking Declined - Slot Already Booked',
                    text: `Greetings,

We regret to inform you that your booking request for the Gymkhana Football Turf has been declined as the slot has been allocated to an earlier request.

Slot: ${updatedStudent.slot}
Date: ${updatedStudent.date}

We process requests on a first-come-first-served basis. Please try booking another available slot.

If you have any questions or need further clarification, feel free to reach out.

Warm regards,
Yash Shah
Institute Sports Football Secretary, 2025-26
Ph: +91 9022513006`
                };

                emailQueue.addEmail(declineMailOptions);
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

        // Send status email
        let mailOptions = {};
        if (status === 'accepted') {
            mailOptions = {
                from: 'aryansh.techhead@gmail.com',
                to: updatedStudent.email,
                subject: 'Turf Booking Confirmation',
                text: `Greetings,

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
Ph: +91 9022513006`
            };
        } else if (status === 'declined') {
            mailOptions = {
                from: 'aryansh.techhead@gmail.com',
                to: updatedStudent.email,
                subject: 'Booking Declined',
                text: `Greetings,

We regret to inform you that your booking request for the Gymkhana Football Turf has been declined. We apologize for any inconvenience this may cause.

If you have any questions or need further clarification, feel free to reach out.

Warm regards,
Yash Shah
Institute Sports Football Secretary, 2025-26
Ph: +91 9022513006`
            };
        }

        // Send status email using queue
        emailQueue.addEmail(mailOptions);

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

// Get main info for specific slot and date
app.get('/maininfo/:slotno/:date', async (req, res) => {
    const { slotno, date } = req.params;

    try {
        const mainInfoInstance = await mainInfo.findOne({
            slotno: slotno, 
            status: 'accepted',
            date: date
        });

        if (!mainInfoInstance) {
            return res.status(404).json({ message: 'Empty slot' });
        }

        res.status(200).json({
            message: 'Slot found',
            data: mainInfoInstance
        });

    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

// Get queue position for a specific request
app.get('/queue-position/:id', async (req, res) => {
    try {
        const { id } = req.params;
        
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

        const earlierRequests = await student.countDocuments({
            slot: studentRequest.slot,
            date: studentRequest.date,
            status: 'pending',
            createdAt: { $lt: studentRequest.createdAt }
        });

        const queuePosition = earlierRequests + 1;

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