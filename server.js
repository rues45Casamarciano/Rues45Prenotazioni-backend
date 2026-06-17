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
// ENV
// =====================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// =====================
// BROWSER CACHE (IMPORTANT FOR PERFORMANCE)
// =====================
let browser;

async function getBrowser() {
    if (!browser) {
        browser = await puppeteer.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless
        });
        console.log("🚀 Chromium avviato (cache attiva)");
    }
    return browser;
}

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
        console.log("✔ Google Sheets OK");
    } catch (err) {
        console.error("❌ Google Sheets error:", err.message);
    }
}

// =====================
// TELEGRAM
// =====================
async function inviaNotificaTelegram(nome, cognome, telefono, data, persone) {
    try {
        await axios.post(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
            chat_id: TELEGRAM_CHAT_ID,
            text:
                `🚨 NUOVA PRENOTAZIONE RUES 45 🚨\n\n` +
                `👤 Cliente: ${nome} ${cognome}\n` +
                `📞 Telefono: ${telefono}\n` +
                `📅 Data: ${data}\n` +
                `👥 Persone: ${persone}`
        });

        console.log("✔ Telegram OK");
    } catch (err) {
        console.error("❌ Telegram error:", err.message);
    }
}

// =====================
// ROUTE
// =====================
app.post('/api/prenota', async (req, res) => {
    const { nome, cognome, telefono, dataOra, persone } = req.body;

    const dataScelta = new Date(dataOra);
    const adesso = new Date();

    if (dataScelta < adesso) {
        return res.status(400).send("Non è possibile prenotare in una data passata.");
    }

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

        // async (NON blocca PDF)
        inviaNotificaTelegram(nome, cognome, telefono, dataFormattata, persone);
        salvaSuGoogleSheets(nome, cognome, telefono, dataFormattata, persone);

        // QR
        const qrCode = await QRCode.toDataURL(testoQR);

        // =====================
        // 🔥 IL TUO HTML (NON MODIFICATO)
        // =====================
        const htmlTemplate = `
            <!DOCTYPE html>
            <html lang="it">
            <head>
                <meta charset="UTF-8">
                <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.2/css/all.min.css">
                <style>
                    @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@300;400;600;800&display=swap');
                    
                    html, body {
                        margin: 0;
                        padding: 0;
                        background-color: #0d0d0d;
                        -webkit-print-color-adjust: exact;
                    }
                    body {
                        font-family: 'Montserrat', sans-serif;
                        display: block; /* Sostituito flex con block per evitare bug di calcolo altezza */
                    }
                    .ticket-container {
                        width: 400px;
                        background: #1a1a1a;
                        border: 1px solid #d4af37;
                        border-radius: 20px;
                        overflow: hidden;
                        box-shadow: 0 10px 30px rgba(0,0,0,0.5);
                        color: #ffffff;
                        page-break-inside: avoid;
                        break-inside: avoid;
                        margin: 0 auto; /* Centrato senza padding verticali esagerati */
                    }
                    .header {
                        background-color: #000000;
                        text-align: center;
                        padding: 15px;
                        font-size: 11px;
                        font-weight: 600;
                        letter-spacing: 3px;
                        color: #d4af37;
                        border-bottom: 1px solid #2a2a2a;
                        text-transform: uppercase;
                    }
                    .logo-container {
                        background: #000000;
                        padding: 25px 10px;
                        text-align: center;
                    }
                    .logo-container img {
                        width: 180px;
                        height: auto;
                    }
                    .content {
                        padding: 30px 25px;
                        text-align: center;
                    }
                    .guest-info {
                        font-size: 14px;
                        color: #aaaaaa;
                        margin-bottom: 25px;
                        text-transform: uppercase;
                        letter-spacing: 1px;
                    }
                    .guest-name {
                        font-size: 22px;
                        font-weight: 800;
                        color: #ffffff;
                        margin-top: 5px;
                        display: block;
                        letter-spacing: 0.5px;
                    }
                    .details-box {
                        background-color: #222222;
                        border-left: 4px solid #d4af37;
                        border-radius: 8px;
                        padding: 18px;
                        text-align: left;
                        margin-bottom: 30px;
                        font-size: 14px;
                        color: #dddddd;
                        line-height: 2;
                    }
                    .details-box i {
                        color: #d4af37;
                        margin-right: 8px;
                        width: 18px;
                        text-align: center;
                    }
                    .details-box strong {
                        color: #ffffff;
                        font-weight: 600;
                    }
                    .qr-section {
                        background: #ffffff;
                        padding: 15px;
                        border-radius: 12px;
                        display: inline-block;
                        margin: 10px 0 25px 0;
                        box-shadow: 0 4px 15px rgba(0,0,0,0.2);
                    }
                    .qr-section img {
                        width: 180px;
                        height: 180px;
                        display: block;
                    }
                    .warning-box {
                        border: 1px dashed #ff4d4d;
                        background: rgba(255, 77, 77, 0.05);
                        border-radius: 8px;
                        padding: 12px;
                        color: #ff4d4d;
                        font-size: 11px;
                        font-weight: 600;
                        letter-spacing: 1px;
                        text-transform: uppercase;
                    }
                    .footer {
                        font-size: 11px;
                        color: #555555;
                        margin-top: 30px;
                        letter-spacing: 1px;
                    }
                </style>
            </head>
            <body>
                <div class="ticket-container">
                    <div class="header">PRENOTAZIONE CONFERMATA</div>
                    
                    <div class="logo-container">
                        <img src="https://vostro-dominio-o-github.io/imgs/logo.jpeg" alt="Rues 45 Wine Garden" onerror="this.style.display='none';">
                        <h2 style="color: #d4af37; font-size: 20px; margin: 5px 0 0 0; font-family: 'Montserrat'; letter-spacing: 2px;">RUES 45</h2>
                    </div>

                    <div class="content">
                        <div class="guest-info">
                            Tavolo Riservato per
                            <span class="guest-name">${nome} ${cognome}</span>
                        </div>

                        <div class="details-box">
                            <i class="fa-solid fa-location-dot"></i> <strong>Location:</strong> Via San Clemente, snc - Casamarciano (NA)<br>
                            <i class="fa-solid fa-clock"></i> <strong>Data e Ora:</strong> ${dataFormattata}<br>
                            <i class="fa-solid fa-users"></i> <strong>Ospiti:</strong> ${persone} Persone<br>
                            <i class="fa-solid fa-phone"></i> <strong>Contatto:</strong> ${telefono}
                        </div>

                        <div class="qr-section">
                            <img src="${qrCode}" />
                        </div>

                        <div class="warning-box">
                            ⚠️ Mostra questo QR all'arrivo nel locale
                        </div>

                        <div class="footer">
                            Rues 45 Wine Garden • Servizio Prenotazioni
                        </div>
                    </div>
                </div>
            </body>
            </html>
        `;

        // =====================
        // BROWSER REUSE (FAST)
        // =====================
        const browserInstance = await getBrowser();
        const page = await browserInstance.newPage();

        await page.setContent(htmlTemplate, {
            waitUntil: 'domcontentloaded'
        });

        const pdf = await page.pdf({
            format: 'A6',
            printBackground: true
        });

        await page.close(); // IMPORTANT: libera memoria

        res.contentType("application/pdf");
        res.send(pdf);

    } catch (err) {
        console.error("❌ Server error:", err);
        res.status(500).send("Errore generazione prenotazione");
    }
});

// =====================
// START
// =====================
app.listen(PORT, () => {
    console.log(`🚀 Server attivo sulla porta ${PORT}`);
});