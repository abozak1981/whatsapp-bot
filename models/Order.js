const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
    {
        customerPhone: {
            type: String,
            required: true,
        },
        items: [
            {
                product_retailer_id: String,
                quantity: Number,
                item_price: Number,
                currency: String,
            },
        ],
        status: {
            type: String,
            enum: ["Pending", "Confirmed", "Cancelled", "Delivered"],
            default: "Pending",
        },
        location: {
            latitude: String,
            longitude: String,
            address: String,
        },
    },
    { timestamps: true }
);

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
