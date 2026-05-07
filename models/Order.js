const mongoose = require("mongoose");

const orderSchema = new mongoose.Schema(
    {
        shortId: {
            type: String,
        },
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
        assignedDriver: {
            type: String,
            default: null,
        }
    },
    { timestamps: true }
);

orderSchema.pre('save', function(next) {
    if (!this.shortId) {
        this.shortId = Math.floor(1000 + Math.random() * 9000).toString();
    }
    next();
});

const Order = mongoose.model("Order", orderSchema);

module.exports = Order;
