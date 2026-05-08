const mongoose = require("mongoose");

const settingsSchema = new mongoose.Schema({
    key: { 
        type: String, 
        default: "APP_SETTINGS", 
        unique: true 
    },
    companyName: { 
        type: String, 
        default: "Blogo" 
    },
    crNumber: { 
        type: String, 
        default: "1029600671" 
    },
    taxNumber: { 
        type: String, 
        default: "غير محدد" 
    }
});

module.exports = mongoose.model("Settings", settingsSchema);
