const mongoose = require("mongoose");

const purposeEnum = [
    'match among friends', 'council match', 'frisbee club'
];

const statusEnum = [
    'pending', 'accepted', 'declined'
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
            type: Number,
            required: true,
        },
        no_of_players: {  
            type: Number,
            required: false, 
            trim: true
        },
        status: {
            type: String,
            enum: statusEnum,
            default: 'pending',  // By default set to 'pending'
            required: true
        }
    },
    { timestamps: true }  // Automatically adds createdAt and updatedAt timestamps
);

const Student = mongoose.model("Student", StudentSchema);
module.exports = Student;
