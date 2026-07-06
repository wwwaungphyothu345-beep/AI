const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai'); 
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

// API Setup (ပြင်ဆင်ပြီး)
const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const sheets = google.sheets({ version: 'v4', auth: process.env.GOOGLE_API_KEY });

// ၁။ Facebook Webhook စစ်ဆေးခြင်း (Meta Verification Endpoint)
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        // Meta Console ထဲတွင် 'myshopbot' ဟု ရိုက်ရမည်
        if (mode === 'subscribe' && token === 'myshopbot') {
            console.log('WEBHOOK_VERIFIED');
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    }
    return res.status(200).send('Cannot GET /webhook - Server is running!');
});

// ၂။ Messenger မှ စာ သို့မဟုတ် ပုံ ဝင်လာလျှင် လက်ခံမည့်နေရာ (POST)
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(async (entry) => {
            if (entry.messaging && entry.messaging[0]) {
                const webhookEvent = entry.messaging[0];
                const senderId = webhookEvent.sender.id;

                if (webhookEvent.message) {
                    await handleMessage(senderId, webhookEvent.message);
                }
            }
        });
        return res.status(200).send('EVENT_RECEIVED');
    } else {
        return res.sendStatus(404);
    }
});

// ၃။ Message များကို စီမံခန့်ခွဲမည့် Logic
async function handleMessage(senderId, incomingMessage) {
    let userMessage = incomingMessage.text || "";

    if (incomingMessage.attachments && incomingMessage.attachments[0].type === 'image') {
        const imageUrl = incomingMessage.attachments[0].payload.url;
        await sendToTelegram(process.env.TELEGRAM_FINANCE_CHAT_ID, `💰 ငွေလွှဲပုံ ရောက်လာပါပြီ။ စစ်ပေးပါ။\nCustomer ID: ${senderId}\nURL: ${imageUrl}`);
        await sendFacebookMessage(senderId, "ငွေလွှဲ Screenshot ကို လက်ခံရရှိပါပြီဗျာ။ စာရင်းကိုင်အဖွဲ့က စစ်ဆေးနေပါသဖြင့် ခေတ္တစောင့်ဆိုင်းပေးပါရန်။");
        return;
    }

    if (userMessage) {
        try {
            const products = await getSheetData('Product_List!A:E');
            const model = ai.getGenerativeModel({ model: "gemini-1.5-pro" });
            const prompt = `မင်းက မြန်မာအွန်လိုင်းရှော့ပင်းက လူသား Admin တစ်ယောက်ပါ။ ဒီပစ္စည်းစာရင်းအတိုင်းပဲ ယဉ်ကျေးပျူငှာစွာ ဖြေပေးပါ: ${JSON.stringify(products)}။ Customer ရဲ့ မေးခွန်းက: ${userMessage}`;
            
            const result = await model.generateContent(prompt);
            const aiResponse = result.response.text();

            await sendFacebookMessage(senderId, aiResponse);
        } catch (error) {
            console.error("AI or Sheet Error:", error);
            await sendFacebookMessage(senderId, "ခေတ္တ စနစ်ချို့ယွင်းနေပါသဖြင့် ခဏနေမှ ပြန်မေးပေးပါခင်ဗျာ။");
        }
    }
}

async function sendToTelegram(chatId, text) {
    const telegramUrl = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`;
    await axios.post(telegramUrl, { chat_id: chatId, text: text });
}

async function sendFacebookMessage(senderId, text) {
    const fbUrl = `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`;
    await axios.post(fbUrl, { recipient: { id: senderId }, message: { text: text } });
}

async function getSheetData(range) {
    const res = await sheets.spreadsheets.values.get({
        spreadsheetId: process.env.SPREADSHEET_ID,
        range: range,
    });
    return res.data.values;
}

app.listen(3000, () => console.log('🚀 Server is running on port 3000'));
