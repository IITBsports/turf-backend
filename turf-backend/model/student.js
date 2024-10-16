const mongoose = require("mongoose");

const purposeEnum = [
    'match among friends', 'council match', 'frisbee club'
];

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
        purpose: {
            type: String,
            enum: purposeEnum,
            trim: true,
            required: [true, "Enter your purpose of booking"]
        },
        player_roll_no: {
            type: String,
            required: [true, 'Player roll numbers are required'],
            trim: true,
        },
        slot: {
            type: Number,  // Ensure this is a string to match the frontend
            required: true,
        },
        no_of_players: {  // Optional if not required from the frontend
            type: Number,
            required: false, // Make it optional if not sent from frontend
            trim: true
        },
    }
);

const student = mongoose.model("Student", StudentSchema);
module.exports = student;
