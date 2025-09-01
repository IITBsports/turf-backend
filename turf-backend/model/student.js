const mongoose = require("mongoose");

const statusEnum = [
    'pending', 'accepted', 'declined'
];

// Helper function to get tomorrow's date
const getTomorrowDate = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return tomorrow.toISOString().split('T')[0];  // Returns date in YYYY-MM-DD format
};

const StudentSchema = mongoose.Schema(
    {
        name: {
            type: String,
            required: [true, 'Please enter your name'],
            trim: true
        },
        rollno: {
            type: String,
            required: [true, "Enter your Roll Number"],
            trim: true
        },
        email: {
            type: String,
            required: [true, 'Please enter your email'],
            trim: true,
            match: [
                /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/,
                'Please enter a valid email address'
            ]
        },
        player_roll_no: {
            type: String,
            required: [true, 'Player roll numbers are required'],
            trim: true,
        },
        slot: {
            type: Number,
            required: true,
        },
        no_of_players: {  
            type: Number,
            required: false, 
            trim: true
        },
        date: {
            type: String,
            default: getTomorrowDate,  // Default to tomorrow's date
            required: true
        },
        status: {
            type: String,
            enum: statusEnum,
            default: 'pending',  // By default set to 'pending'
            required: true
        },
        requestTime: {
            type: Date,
            default: Date.now  // This will store the exact time when request was made
        }
    },
    { timestamps: true }  // Automatically adds createdAt and updatedAt timestamps
);

// Index for efficient querying by slot, date, and status
StudentSchema.index({ slot: 1, date: 1, status: 1, createdAt: 1 });

// Index for queue position queries
StudentSchema.index({ slot: 1, date: 1, createdAt: 1 });

const Student = mongoose.model("Student", StudentSchema);
module.exports = Student;