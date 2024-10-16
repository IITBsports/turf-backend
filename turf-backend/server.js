const express = require('express');
const app = express();
const mongoose = require('mongoose');
const student = require('./model/student.js');
const bannedDb = require('./model/banned.js');
const mainInfo = require('./model/main.js');
const cors = require('cors');

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

        // Initialize an array for slots 1 to 14, defaulting all to 'available'
        const slotsStatus = Array.from({ length: 14 }, (_, index) => ({
            slot: index + 1,
            status: 'available'  // Default status for each slot is 'available'
        }));

        // Group main info entries by slot number
        const slotGroups = {};
        mainInfos.forEach(info => {
            const slotNumber = info.slot;  // Assuming 'slot' contains the slot number
            if (!slotGroups[slotNumber]) {
                slotGroups[slotNumber] = [];
            }
            slotGroups[slotNumber].push(info.status);  // Collect all statuses for each slot
        });

        // Determine the status for each slot
        for (let i = 1; i <= 14; i++) {
            const statuses = slotGroups[i] || [];

            // Priority 1: If any record has 'accepted', mark the slot as 'booked'
            if (statuses.includes('accepted')) {
                slotsStatus[i - 1].status = 'booked';
            } 
            // Priority 2: If no 'accepted', but there is 'pending', mark the slot as 'requested'
            else if (statuses.includes('pending')) {
                slotsStatus[i - 1].status = 'requested';
            } 
            // Priority 3: If 'rejected', mark it as 'available'
            else if (statuses.every(status => status === 'rejected')) {
                slotsStatus[i - 1].status = 'available';
            } 
            // Default: If no relevant statuses (accepted/pending/rejected), the slot stays 'available'
        }

        // Send the updated slots status as a JSON response
        res.status(200).json(slotsStatus);
    } catch (error) {
        console.error('Error fetching slot statuses:', error);
        res.status(500).send('Server error');
    }
});







// Create new student record
app.post('/', async (req, res) => {
    try {
        const {
            name,
            rollno,
            purpose,
            player_roll_no,
            no_of_players,
            status,
            slot,
        } = req.body;

        // Check if user is banned
        const isBanned = await bannedDb.findOne({ rollno });
        if (isBanned) {
            return res.status(403).json({ message: 'Booking denied: You are currently restricted from this service' });
        }

        // Create new student record
        const newStudent = await student.create({
            name,
            rollno,
            purpose,
            player_roll_no,
            slot,
            no_of_players,
            status,
        });

        // Create new mainInfo record
        const MainInfo = await mainInfo.create({
            rollno: newStudent.rollno,
            slotno: newStudent.slot,
            status: newStudent.status,
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

        res.status(200).json({ message: 'Status updated successfully', mainInfo: updatedStudent });
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
