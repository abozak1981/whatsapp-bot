const mongoose = require("mongoose");

const storeSchema = new mongoose.Schema({
    storeCode: {
        type: String,
        required: true,
        unique: true,
    },
    storeName: {
        type: String,
        required: true,
    },
    phoneNumber: {
        type: String, // WhatsApp number with country code
        required: true,
    }
});

module.exports = mongoose.model("Store", storeSchema);
