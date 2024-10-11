const mongoose = require('mongoose');

const bannedUserSchema = new mongoose.Schema({
    rollno: {
        type: String,
        required: true,
        unique: true
    },
    bannedAt: {
        type: Date,
        default: Date.now, 
        expires: '14d' 
    }
});

const BannedUser = mongoose.model('BannedTudents', bannedUserSchema);

module.exports = BannedUser;
