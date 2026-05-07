const mongoose = require("mongoose");

const ledgerSchema = new mongoose.Schema(
    {
        orderId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Order",
            required: true,
        },
        storeCode: {
            type: String,
            required: true,
        },
        totalAmount: {
            type: Number,
            required: true,
        },
        commissionAmount: {
            type: Number,
            required: true,
        },
        storeOwedAmount: {
            type: Number,
            required: true,
        },
        isPaidToStore: {
            type: Boolean,
            default: false,
        },
    },
    { timestamps: true }
);

const Ledger = mongoose.model("Ledger", ledgerSchema);

module.exports = Ledger;
