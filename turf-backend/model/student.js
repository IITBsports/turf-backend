const mongoose = require("mongoose");
const purposeEnum = [
    'match among friends', 'council match', 'frisbee club'
];
// const statusEnum = ['pending', 'accepted', 'declined'];

const StudentSchema = mongoose.Schema(
    {
        name:{
            type: String,
            required: [true,'Please enter your name'],
            trim: true
        },
        rollno:{
            type: String,
            required: [true,"Enter your Roll Number"],
            trim: true
        },
        purpose:{
            type: [String],
            enum: purposeEnum,
            trim: true,
            required: [true,"Enter your Roll Number"]
        },
        no_of_players:{
            type: Number,
            required: [true,"Enter your Roll Number"],
            trim: true
        },
        player_roll_no:{
            type:String,
            required:true,
            trim:true,
        },
        // status: {
        //     type: String,
        //     enum: statusEnum,
        //     default: 'pending' 
        // },
        slot: {
            type: Number,
            required: true,
        }
    }
);

// StudentSchema.post('save', async function (doc, next) {
//     try {
//         const MainInfo = require('./main.js');  // Require the MainInfo model

//         // Create a new document in MainInfo using the saved student document's data
//         const mainInfoDoc = new MainInfo({
//             rollno: doc.rollno,
//             slotno: doc.slot
//         });

//         // Save the MainInfo document
//         await mainInfoDoc.save();

//         next();
//     } catch (err) {
//         next(err);
//     }
// });

const student = mongoose.model("Student",StudentSchema)
module.exports = student