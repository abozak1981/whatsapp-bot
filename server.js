require('dotenv').config();
const express = require("express");
const axios = require("axios");
const connectDB = require("./database");
const User = require("./models/User");
const Order = require("./models/Order");
const Ledger = require("./models/Ledger");
const Store = require("./models/Store");
const Driver = require("./models/Driver");
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
                let totalAmount = 0;
                let storeCode = "UNKNOWN";

                // Calculate total and extract storeCode
                orderItems.forEach(item => {
                    totalAmount += (parseFloat(item.item_price) * parseInt(item.quantity));
                    // Assuming retailer id is like "KFC_meal_1", we extract "KFC"
                    if (item.product_retailer_id && item.product_retailer_id.includes("_")) {
                        storeCode = item.product_retailer_id.split("_")[0];
                    }
                });

                // Calculate Commission
                let commissionRate = process.env.COMMISSION_RATE ? parseFloat(process.env.COMMISSION_RATE) : 0.10;
                let commissionAmount = totalAmount * commissionRate;
                let storeOwedAmount = totalAmount - commissionAmount;
                
                try {
                    // Save the order
                    const newOrder = await Order.create({
                        customerPhone: from,
                        items: orderItems,
                        status: "Pending"
                    });

                    // Save the ledger
                    await Ledger.create({
                        orderId: newOrder._id,
                        storeCode: storeCode,
                        totalAmount: totalAmount,
                        commissionAmount: commissionAmount,
                        storeOwedAmount: storeOwedAmount,
                        isPaidToStore: false
                    });

                    console.log(`✅ Order & Ledger saved for ${from}. Profit: ${commissionAmount}`);
                    
                    try {
                        const store = await Store.findOne({ storeCode: storeCode });
                        if (store && store.phoneNumber) {
                            let storeMessage = `🔔 *طلب جديد من التطبيق!*\n\n`;
                            storeMessage += `رقم العميل: ${from}\n`;
                            storeMessage += `إجمالي الطلب: ${totalAmount} ريال\n`;
                            storeMessage += `عمولة التطبيق: ${commissionAmount} ريال\n`;
                            storeMessage += `الصافي للمطعم: ${storeOwedAmount} ريال\n\n`;
                            storeMessage += `الرجاء تجهيز الطلب في أسرع وقت.`;

                            await axios({
                                method: "POST",
                                url: `https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
                                data: {
                                    messaging_product: "whatsapp",
                                    to: store.phoneNumber,
                                    text: { body: storeMessage },
                                },
                                headers: {
                                    Authorization: `Bearer ${GRAPH_API_TOKEN}`,
                                    "Content-Type": "application/json",
                                },
                            });
                            console.log(`✅ Order forwarded to Store ${storeCode} at ${store.phoneNumber}`);
                        } else {
                            console.log(`⚠️ No phone number found for Store ${storeCode}, skipping forwarding.`);
                        }
                    } catch (forwardErr) {
                        console.error("❌ Error forwarding to store:", forwardErr.message);
                    }

                    replyText = `تم استلام طلبك بنجاح! الإجمالي: ${totalAmount}. برجاء إرسال موقعك (Location) لتأكيد التوصيل.`;
                } catch (err) {
                    console.error("Error saving order:", err);
                    replyText = "عذراً، حدث خطأ أثناء تسجيل طلبك.";
                }
            } else if (message.type === "text") {
                let msg_body = message.text.body;
                console.log(`📩 Received text: "${msg_body}" from ${from}`);
                
                if (msg_body.trim() === "أرباحي") {
                    try {
                        const ledgers = await Ledger.find({});
                        let totalProfit = 0;
                        let totalSales = 0;
                        ledgers.forEach(l => {
                            totalProfit += l.commissionAmount;
                            totalSales += l.totalAmount;
                        });
                        replyText = `📊 تقرير الأرباح:\n- إجمالي المبيعات: ${totalSales}\n- إجمالي أرباحك (العمولة): ${totalProfit}`;
                    } catch(e) {
                        replyText = "حدث خطأ في حساب الأرباح.";
                    }
                } else if (msg_body.trim().startsWith("قبول")) {
                    let parts = msg_body.split(" ");
                    if (parts.length >= 2) {
                        let shortId = parts[1];
                        try {
                            const orderToClaim = await Order.findOne({ shortId: shortId });
                            if (!orderToClaim) {
                                replyText = "رقم الطلب غير صحيح أو غير موجود.";
                            } else if (orderToClaim.assignedDriver) {
                                if (orderToClaim.assignedDriver === from) {
                                    replyText = "أنت قمت باستلام هذا الطلب بالفعل!";
                                } else {
                                    replyText = "عذراً، هذا الطلب تم استلامه من قبل مندوب آخر. حظاً أوفر!";
                                }
                            } else {
                                // Assign the driver
                                orderToClaim.assignedDriver = from;
                                await orderToClaim.save();

                                // Update Driver Wallet
                                const ledgerEntry = await Ledger.findOne({ orderId: orderToClaim._id });
                                let orderTotal = ledgerEntry ? ledgerEntry.totalAmount : 0;
                                
                                let deliveryFee = process.env.DELIVERY_FEE ? parseFloat(process.env.DELIVERY_FEE) : 15.0;
                                let cashToCollect = orderTotal + deliveryFee;

                                const driver = await Driver.findOne({ phoneNumber: from });
                                if (driver) {
                                    driver.totalDeliveries += 1;
                                    driver.totalEarnings += deliveryFee;
                                    driver.cashCollected += cashToCollect;
                                    driver.walletBalance = driver.totalEarnings - driver.cashCollected;
                                    await driver.save();
                                }

                                let mapsLink = `https://maps.google.com/?q=${orderToClaim.location.latitude},${orderToClaim.location.longitude}`;
                                replyText = `✅ تم تخصيص الطلب لك بنجاح!\n\nرقم العميل للتواصل: ${orderToClaim.customerPhone}\nالموقع: ${mapsLink}\nإجمالي تحصيل الكاش من العميل: ${cashToCollect} ريال\n\nالرجاء التوجه للمطعم فوراً لاستلام الطلب.`;
                            }
                        } catch (e) {
                            replyText = "حدث خطأ أثناء معالجة القبول.";
                        }
                    } else {
                        replyText = "صيغة غير صحيحة. أرسل: قبول [رقم الطلب]";
                    }
                } else if (msg_body.trim() === "محفظتي") {
                    try {
                        const driver = await Driver.findOne({ phoneNumber: from });
                        if (driver) {
                            let owedToApp = Math.abs(driver.walletBalance);
                            replyText = `💼 *محفظة المندوب (${driver.driverName})*\n\n`;
                            replyText += `📦 الطلبات المنجزة: ${driver.totalDeliveries}\n`;
                            replyText += `💰 أرباحك (رسوم التوصيل): ${driver.totalEarnings} ريال\n`;
                            replyText += `💵 الكاش المُحصل (العهدة): ${driver.cashCollected} ريال\n\n`;
                            replyText += `🔻 المطلوب توريده لإدارة التطبيق: ${owedToApp} ريال`;
                        } else {
                            replyText = "لم يتم العثور على حسابك في قاعدة بيانات المناديب.";
                        }
                    } catch (e) {
                        replyText = "حدث خطأ أثناء عرض المحفظة.";
                    }
                } else if (msg_body.trim().startsWith("حساب المندوب")) {
                    let parts = msg_body.split(" ");
                    if (parts.length >= 3) {
                        let phone = parts[parts.length - 1];
                        try {
                            const driver = await Driver.findOne({ phoneNumber: phone });
                            if (driver) {
                                let owedToApp = Math.abs(driver.walletBalance);
                                replyText = `💼 *حساب المندوب (${driver.driverName} - ${phone})*\nالطلبات: ${driver.totalDeliveries}\nأرباحه: ${driver.totalEarnings}\nالعهدة (كاش): ${driver.cashCollected}\nالمطلوب توريده منه: ${owedToApp} ريال`;
                            } else {
                                replyText = "رقم المندوب غير موجود.";
                            }
                        } catch (e) {
                            replyText = "حدث خطأ أثناء البحث.";
                        }
                    } else {
                        replyText = "صيغة غير صحيحة. استخدم: حساب المندوب [رقم المندوب]";
                    }
                } else if (msg_body.trim().startsWith("إضافة مطعم")) {
                    let parts = msg_body.split(" ");
                    if (parts.length >= 4) {
                        let code = parts[2];
                        let phone = parts[parts.length - 1];
                        let name = parts.slice(3, parts.length - 1).join(" ");
                        
                        try {
                            await Store.findOneAndUpdate(
                                { storeCode: code },
                                { storeName: name, phoneNumber: phone },
                                { upsert: true }
                            );
                            replyText = `✅ تم حفظ المطعم بنجاح:\nالاسم: ${name}\nالرمز: ${code}\nالرقم: ${phone}`;
                        } catch (e) {
                            replyText = "حدث خطأ أثناء حفظ المطعم.";
                        }
                    } else {
                        replyText = "صيغة غير صحيحة. استخدم:\nإضافة مطعم [الرمز] [الاسم] [رقم الواتساب بالدولة]";
                    }
                } else if (msg_body.trim().startsWith("إضافة مندوب")) {
                    let parts = msg_body.split(" ");
                    if (parts.length >= 3) {
                        let phone = parts[parts.length - 1];
                        let name = parts.slice(2, parts.length - 1).join(" ");
                        try {
                            await Driver.findOneAndUpdate(
                                { phoneNumber: phone },
                                { driverName: name },
                                { upsert: true }
                            );
                            replyText = `✅ تم تسجيل المندوب بنجاح:\nالاسم: ${name}\nالرقم: ${phone}`;
                        } catch (e) {
                            replyText = "حدث خطأ أثناء حفظ بيانات المندوب.";
                        }
                    } else {
                        replyText = "صيغة غير صحيحة. استخدم:\nإضافة مندوب [الاسم] [رقم الواتساب بالدولة]";
                    }
                } else {
                    replyText = `أهلاً بك! لعرض منتجاتنا، يرجى الضغط على زر (التسوق - Shop) بأعلى المحادثة واختيار ما يناسبك وإرسال السلة.`;
                }
            } else if (message.type === "location") {
                console.log(`📍 Received location from ${from}`);
                let lat = message.location.latitude;
                let long = message.location.longitude;
                let mapsLink = `https://maps.google.com/?q=${lat},${long}`;

                try {
                    // Find customer's pending order
                    const pendingOrder = await Order.findOne({ customerPhone: from, status: "Pending" }).sort({ createdAt: -1 });
                    
                    if (pendingOrder) {
                        // Update order status and location
                        pendingOrder.status = "Confirmed";
                        pendingOrder.location = { latitude: lat, longitude: long };
                        await pendingOrder.save(); // This generates shortId
                        
                        // Extract store code
                        let storeCode = "UNKNOWN";
                        if (pendingOrder.items && pendingOrder.items.length > 0) {
                            let item = pendingOrder.items[0];
                            if (item.product_retailer_id && item.product_retailer_id.includes("_")) {
                                storeCode = item.product_retailer_id.split("_")[0];
                            }
                        }

                        // Broadcast to ALL drivers
                        const drivers = await Driver.find({ isAvailable: true }); 
                        
                        let driverMsg = `🚨 *إشعار توصيل جديد!*\n\n`;
                        driverMsg += `المطعم: ${storeCode}\n`;
                        driverMsg += `الموقع الجغرافي: ${mapsLink}\n\n`;
                        driverMsg += `لقبول هذا الطلب، أرسل الكود التالي:\n`;
                        driverMsg += `قبول ${pendingOrder.shortId}`;

                        for (let driver of drivers) {
                            if (driver.phoneNumber) {
                                try {
                                    await axios({
                                        method: "POST",
                                        url: `https://graph.facebook.com/v18.0/${phone_number_id}/messages`,
                                        data: {
                                            messaging_product: "whatsapp",
                                            to: driver.phoneNumber,
                                            text: { body: driverMsg },
                                        },
                                        headers: {
                                            Authorization: `Bearer ${GRAPH_API_TOKEN}`,
                                            "Content-Type": "application/json",
                                        },
                                    });
                                } catch (e) {
                                    console.error(`Failed to send to driver ${driver.phoneNumber}`);
                                }
                            }
                        }

                        replyText = "تم تأكيد طلبك وموقعك بنجاح! جاري توجيه المندوب إليك 🛵.";
                    } else {
                        replyText = "لم يتم العثور على طلب قيد التنفيذ. يرجى إرسال السلة أولاً.";
                    }
                } catch (e) {
                    console.error("Error dispatching driver:", e);
                    replyText = "تم استلام موقعك، ولكن حدث خطأ أثناء توجيه المندوب.";
                }
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