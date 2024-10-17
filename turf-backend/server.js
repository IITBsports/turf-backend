const express = require('express')
const app = express();
const mongoose = require('mongoose')
const student = require('./model/student.js')
const bannedDb = require('./model/banned.js')
const mainInfo = require('./model/main.js')
const cors = require('cors')

mongoose.connect("mongodb+srv://mndalwee:upiyQLuNAH6gmhK3@usersignup.ze0r2.mongodb.net/?retryWrites=true&w=majority&appName=userSignUp")
    .then(() => {
        console.log("connected to databse")
        app.listen(3010, () => console.log("server has started on 3010"))
    })
    .catch((err) => {
        console.log("connection to database failed", err)
    })

app.use(cors());
app.use(express.json());
app.get('/', async (req, res) => {
  try {
    // Fetch data from both collections
    const students = await Student.find();
    const mainInfos = await MainInfo.find();

    // Find intersection based on rollno
    const intersection = students.filter(student =>
      mainInfos.some(mainInfo => mainInfo.rollno === student.rollno)
    );

    // Prepare the combined data
    const combinedData = intersection.map(student => {
      const mainInfo = mainInfos.find(info => info.rollno === student.rollno);
      return {
        ...student.toObject(),
        mainInfo: mainInfo || null // Add mainInfo if it exists
      };
    });

    // Send the combined data in the response
    res.json({
      requests: combinedData, // Rename to requests for clarity
    });
  } catch (error) {
    console.error('Error fetching data:', error);
    res.status(500).send('Server error');
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});


app.get('/slot', async (req, res) => {
    try {
        const bl = await mainInfo.find({});
        //res.status(200).json( bl );
        res.status(200).json(bl);
    } catch (e) {
        res.status(500).json({ message: e.message })
    }
})

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





app.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const info = await student.findByIdAndDelete(id);

        if (!info) {
            return res.status(404).json({ message: "Request not found" });
        }

        res.status(200).json({ message: "User deleted successfully" });
    } catch (e) {
        res.status(500).json({ message: e.message })
    }
})


app.get('/slots', async (req, res) => {
    try {
        const slots = await mainInfo.find();  
        
        if (slots.length === 0) {
            return res.status(404).json({ message: "No slots found" });
        }
        
        res.status(200).json(slots);
    } catch (e) {
        res.status(500).json({ message: e.message });
    }
});

app.put('/student/:id/status', async (req, res) => {
    //status of entry in mainInfo not of student
    try {
        const { id } = req.params;
        const { status } = req.body; //new status from the request body

        if (!['accepted', 'declined'].includes(status)) {
            return res.status(400).json({ message: 'Invalid status' });
        }

        const updatedStudent = await mainInfo.findByIdAndUpdate(id, { status }, { new: true });

        if (!updatedStudent) {
            return res.status(404).json({ message: 'Student not found' });
        }

        res.status(200).json({ message: 'Status updated successfully', mainInfo: updatedStudent });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});



app.post('/banUser', async (req, res) => {
    const { rollno } = req.body;
    try {
        const banneduser = await bannedDb.create({ rollno });
        //res.status(200).json( bl );
        res.status(200).json({ "student": banneduser });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/update-status/:id', async (req, res) => {
  const { id } = req.params;
  const { status } = req.body; // Expect 'accepted' or 'declined'

  try {
    const student = await Student.findByIdAndUpdate(id, { status: status }, { new: true });
    if (!student) {
      return res.status(404).json({ message: 'Student not found' });
    }
    res.json(student); // Return updated student
  } catch (error) {
    res.status(500).json({ message: 'Error updating status' });
  }
});


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
