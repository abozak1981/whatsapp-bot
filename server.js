require('dotenv').config();
const express = require("express");
const axios = require("axios");
const connectDB = require("./database");
const User = require("./models/User");
const Order = require("./models/Order");
const app = express();
app.use(express.json());

const { WEBHOOK_VERIFY_TOKEN, GRAPH_API_TOKEN, PORT } = process.env;

// Webhook Verification (Required by Meta)
app.get("/webhook", (req, res) => {
    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    if (mode && token) {
        if (mode === "subscribe" && token === WEBHOOK_VERIFY_TOKEN) {
            console.log("✅ WEBHOOK_VERIFIED");
            res.status(200).send(challenge);
        } else {
            console.log("❌ Webhook verification failed");
            res.sendStatus(403);
        }
    } else {
        res.sendStatus(400);
    }
});

// Receive and Reply to Messages
app.post("/webhook", async (req, res) => {
    let body = req.body;

    // Check if this is an event from a WhatsApp API
    if (body.object) {
        if (
            body.entry &&
            body.entry[0].changes &&
            body.entry[0].changes[0] &&
            body.entry[0].changes[0].value.messages &&
            body.entry[0].changes[0].value.messages[0]
        ) {
            let message = body.entry[0].changes[0].value.messages[0];
            let phone_number_id = body.entry[0].changes[0].value.metadata.phone_number_id;
            let from = message.from; // sender's phone number

            // Save user to database
            try {
                let user = await User.findOne({ phoneNumber: from });
                if (!user) {
                    await User.create({ phoneNumber: from });
                    console.log(`🆕 New user saved: ${from}`);
                } else {
                    user.lastMessageAt = Date.now();
                    await user.save();
                }
            } catch (dbError) {
                console.error("❌ Database Error:", dbError.message);
            }

            let replyText = "مرحباً بكم في متجرنا!";

            if (message.type === "order") {
                console.log(`🛒 Received an order from ${from}`);
                let orderItems = message.order.product_items;
                
                try {
                    // Save the order
                    await Order.create({
                        customerPhone: from,
                        items: orderItems,
                        status: "Pending"
                    });
                    console.log(`✅ Order saved to database for ${from}`);
                    replyText = "تم استلام طلبك بنجاح! جاري التجهيز. برجاء إرسال موقعك (Location) لتأكيد التوصيل.";
                } catch (err) {
                    console.error("Error saving order:", err);
                    replyText = "عذراً، حدث خطأ أثناء تسجيل طلبك.";
                }
            } else if (message.type === "text") {
                let msg_body = message.text.body;
                console.log(`📩 Received text: "${msg_body}" from ${from}`);
                replyText = `أهلاً بك! لعرض منتجاتنا، يرجى الضغط على زر (التسوق - Shop) بأعلى المحادثة واختيار ما يناسبك وإرسال السلة.`;
            } else if (message.type === "location") {
                console.log(`📍 Received location from ${from}`);
                replyText = "تم استلام موقعك بنجاح! سيصلك المندوب في أسرع وقت.";
            }

            // Send a reply
            try {
                await axios({
                    method: "POST",
                    url: `https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
                    data: {
                        messaging_product: "whatsapp",
                        to: from,
                        text: { body: replyText },
                    },
                    headers: {
                        Authorization: `Bearer ${GRAPH_API_TOKEN}`,
                        "Content-Type": "application/json",
                    },
                });
                console.log("✅ Reply sent successfully!");
            } catch (error) {
                console.error("❌ Error sending message:", error.response ? error.response.data : error.message);
            }
        }
        res.sendStatus(200);
    } else {
        res.sendStatus(404);
    }
});

const port = PORT || 3000;

connectDB().then(() => {
    app.listen(port, () => {
        console.log(`🚀 Server running on port ${port}`);
    });
});