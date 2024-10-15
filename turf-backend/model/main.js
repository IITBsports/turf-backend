const mongoose = require("mongoose");

const statusEnum = ['pending', 'accepted', 'declined'];

const MainSchema =new mongoose.Schema(
    {
        rollno:{
            type: String,
            trim: true
        },
        status: {
            type: String,
            enum: statusEnum,
            default: 'pending' 
        },
        slotno: {
            type: String,
            required: true,
        },
        createdAt: {
            type: Date,
            default: Date.now,
            expires: '7d',  
        },      
    },
    {
        timestamps: true,
    }
);

const MainInfo = mongoose.model('MainInfo',MainSchema);

module.exports = MainInfo;
