const mongoose = require("mongoose");

const driverSchema = new mongoose.Schema({
    driverName: {
        type: String,
        required: true,
    },
    phoneNumber: {
        type: String, // WhatsApp number
        required: true,
        unique: true,
    },
    isAvailable: {
        type: Boolean,
        default: true,
    },
    totalDeliveries: {
        type: Number,
        default: 0,
    },
    totalEarnings: {
        type: Number,
        default: 0,
    },
    cashCollected: {
        type: Number,
        default: 0,
    },
    walletBalance: {
        type: Number,
        default: 0,
    }
});

module.exports = mongoose.model("Driver", driverSchema);
