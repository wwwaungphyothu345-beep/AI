const express = require('express');
const bodyParser = require('body-parser');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai'); 
require('dotenv').config();

const app = express();
app.use(bodyParser.json());

const ai = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// ၁။ Facebook Webhook စစ်ဆေးခြင်း
app.get('/webhook', (req, res) => {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode && token) {
        if (mode === 'subscribe' && token === 'myshopbot') {
            console.log('✅ WEBHOOK_VERIFIED');
            return res.status(200).send(challenge);
        } else {
            return res.sendStatus(403);
        }
    }
    return res.status(200).send('Server is running!');
});

// ၂။ Messenger မှ စာ ဝင်လာလျှင် လက်ခံမည့်နေရာ
app.post('/webhook', async (req, res) => {
    const body = req.body;

    if (body.object === 'page') {
        body.entry.forEach(async (entry) => {
            if (entry.messaging && entry.messaging[0]) {
                const webhookEvent = entry.messaging[0];
                const senderId = webhookEvent.sender.id;

                if (webhookEvent.message) {
                    console.log(`📩 Message Received: "${webhookEvent.message.text}"`);
                    await handleMessage(senderId, webhookEvent.message);
                }
            }
        });
        return res.status(200).send('EVENT_RECEIVED');
    } else {
        return res.sendStatus(404);
    }
});

// ၃။ Message စီမံခန့်ခွဲမည့် Logic
async function handleMessage(senderId, incomingMessage) {
    let userMessage = incomingMessage.text || "";

    if (incomingMessage.attachments && incomingMessage.attachments[0].type === 'image') {
        await sendFacebookMessage(senderId, "ငွေလွှဲ Screenshot ကို လက်ခံရရှိပါပြီဗျာ။ စာရင်းကိုင်အဖွဲ့က စစ်ဆေးနေပါသဖြင့် ခေတ္တစောင့်ဆိုင်းပေးပါရန်။");
        return;
    }

    if (userMessage) {
        try {
            console.log("📊 Google Sheet Web App ထံမှ ဒေတာ ဖတ်ယူနေပါပြီ...");
            // 🌟 Render Env ထဲက GOOGLE_SHEET_WEBAPP_URL ကို လှမ်းခေါ်ခြင်း
            const response = await axios.get(process.env.GOOGLE_SHEET_WEBAPP_URL);
            const products = response.data;
            console.log("✅ Sheet Data ရရှိပါပြီ၊ AI ဆီ ပို့နေပါပြီ...");
            
            const model = ai.getGenerativeModel({ model: "gemini-1.5-pro" });
            const prompt = `မင်းက မြန်မာအွန်လိုင်းရှော့ပင်းက လူသား Admin တစ်ယောက်ပါ။ ဒီပစ္စည်းစာရင်းအတိုင်းပဲ ယဉ်ကျေးပျူငှာစွာ ဖြေပေးပါ: ${JSON.stringify(products)}။ Customer ရဲ့ မေးခွန်းက: ${userMessage}`;
            
            const result = await model.generateContent(prompt);
            const aiResponse = result.response.text();

            await sendFacebookMessage(senderId, aiResponse);
            console.log("🚀 Messenger ဆီ စာပြန်လိုက်ပါပြီ!");
        } catch (error) {
            console.error("❌ Error:", error.message);
            await sendFacebookMessage(senderId, "ခေတ္တ စနစ်ချို့ယွင်းနေပါသဖြင့် ခဏနေမှ ပြန်မေးပေးပါခင်ဗျာ။");
        }
    }
}

// ၄။ Facebook Messenger သို့ စာပြန်ပို့ခြင်း
async function sendFacebookMessage(senderId, text) {
    const fbUrl = `https://graph.facebook.com/v19.0/me/messages?access_token=${process.env.FB_PAGE_ACCESS_TOKEN}`;
    await axios.post(fbUrl, { recipient: { id: senderId }, message: { text: text } });
}

app.listen(3000, () => console.log('🚀 Server is running on port 3000'));
