const express = require('express');
const QRCode = require('qrcode');
const puppeteer = require('puppeteer-core');
const chromium = require('@sparticuz/chromium');
const cors = require('cors');
const axios = require('axios');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// =====================
// ENV VARIABLES (RENDER)
// =====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// =====================
// GOOGLE SHEETS
// =====================
async function salvaSuGoogleSheets(nome, cognome, telefono, dataPrenotazione, persone) {
    try {
        await axios.post(GOOGLE_SCRIPT_URL, {
            nome,
            cognome,
            telefono,
            dataPrenotazione,
            persone
        });
        console.log("✔ Google Sheets salvato");
    } catch (err) {
        console.error("❌ Google Sheets error:", err.message);
    }
}

// =====================
// TELEGRAM NOTIFICA
// =====================
async function inviaNotificaTelegram(nome, cognome, telefono, data, persone) {
    const messaggio =
        `🚨 NUOVA PRENOTAZIONE RUES 45 🚨\n\n` +
        `👤 Cliente: ${nome} ${cognome}\n` +
        `📞 Telefono: ${telefono}\n` +
        `📅 Data: ${data}\n` +
        `👥 Persone: ${persone}`;

    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text: messaggio
        });
        console.log("✔ Telegram inviato");
    } catch (err) {
        console.error("❌ Telegram error:", err.message);
    }
}

// =====================
// ROUTE PRINCIPALE
// =====================
app.post('/api/prenota', async (req, res) => {
    const { nome, cognome, telefono, dataOra, persone } = req.body;

    try {
        const dataFormattata = new Date(dataOra).toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const testoQR =
            `Rues45 Prenotazione\n` +
            `${nome} ${cognome}\n` +
            `${telefono}\n` +
            `${dataFormattata}\n` +
            `${persone}`;

        // async background tasks (non bloccano PDF)
        inviaNotificaTelegram(nome, cognome, telefono, dataFormattata, persone);
        salvaSuGoogleSheets(nome, cognome, telefono, dataFormattata, persone);

        const qrCode = await QRCode.toDataURL(testoQR);

        const html = `
        <!DOCTYPE html>
        <html>
        <head>
        <meta charset="utf-8">
        <style>
            body {
                margin: 0;
                font-family: Arial;
                background: #111;
                color: white;
            }
            .ticket {
                width: 400px;
                margin: auto;
                background: #1c1c1c;
                padding: 20px;
                border-radius: 15px;
                border: 1px solid gold;
                text-align: center;
            }
            .qr img {
                width: 180px;
            }
        </style>
        </head>
        <body>
            <div class="ticket">
                <h2>RUES 45</h2>
                <p>${nome} ${cognome}</p>
                <p>${dataFormattata}</p>
                <p>${persone} persone</p>
                <p>${telefono}</p>

                <div class="qr">
                    <img src="${qrCode}" />
                </div>
            </div>
        </body>
        </html>
        `;

        const browser = await puppeteer.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless
        });

        const page = await browser.newPage();
        await page.setContent(html, { waitUntil: 'networkidle0' });

        const pdf = await page.pdf({
            format: 'A6',
            printBackground: true
        });

        await browser.close();

        res.contentType("application/pdf");
        res.send(pdf);

    } catch (err) {
        console.error("❌ Server error:", err);
        res.status(500).send("Errore generazione prenotazione");
    }
});

// =====================
// START SERVER
// =====================
app.listen(PORT, () => {
    console.log(`🚀 Server attivo sulla porta ${PORT}`);
});