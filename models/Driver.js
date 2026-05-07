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
    }
});

module.exports = mongoose.model("Driver", driverSchema);
