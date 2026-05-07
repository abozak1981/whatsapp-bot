require('dotenv').config();
const express = require("express");
const axios = require("axios");
const connectDB = require("./database");
const User = require("./models/User");
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
            let phone_number_id = body.entry[0].changes[0].value.metadata.phone_number_id;
            let from = body.entry[0].changes[0].value.messages[0].from; // sender's phone number
            let msg_body = body.entry[0].changes[0].value.messages[0].text.body; // text message content

            console.log(`📩 Received message: "${msg_body}" from ${from}`);

            // Save user to database
            try {
                let user = await User.findOne({ phoneNumber: from });
                if (!user) {
                    user = await User.create({ phoneNumber: from });
                    console.log(`🆕 New user saved: ${from}`);
                } else {
                    user.lastMessageAt = Date.now();
                    await user.save();
                    console.log(`🔄 Existing user updated: ${from}`);
                }
            } catch (dbError) {
                console.error("❌ Database Error:", dbError.message);
            }

            // Send a reply
            try {
                await axios({
                    method: "POST",
                    url: `https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
                    data: {
                        messaging_product: "whatsapp",
                        to: from,
                        text: { body: `أهلاً بك! لقد استلمنا رسالتك: "${msg_body}"\nهذا رد تلقائي من البوت.` },
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