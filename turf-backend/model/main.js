const mongoose = require("mongoose");

const statusEnum = ['pending', 'accepted', 'declined'];

const MainSchema = new mongoose.Schema({
    rollno: {
        type: String,
        trim: true
    },
    status: {
        type: String,
        enum: ['pending', 'accepted', 'declined'],
        default: 'pending'  // Set default status to 'pending'
    },
    slotno: {
        type: String,
        required: true
    },
    date: {
        type: String,  // Format: YYYY-MM-DD
        required: true
    },
    requestTime: {
        type: Date,
        default: Date.now  // Store the request submission time
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: '7d',
    },
}, {
    timestamps: true,
});

// Index for efficient querying
MainSchema.index({ slotno: 1, date: 1, status: 1, requestTime: 1 });

const MainInfo = mongoose.model('MainInfo', MainSchema);

module.exports = MainInfo;