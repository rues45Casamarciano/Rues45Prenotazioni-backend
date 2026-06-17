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

    // -------------------------------------------------------------
    // CONFIGURAZIONE VALIDAZIONE TEMPORALE
    // -------------------------------------------------------------
    const MINUTI_ANTICIPO_MINIMO = 60; // Modifica questo valore per cambiare il margine richiesto

    // Otteniamo il timestamp corrente del server
    const adesso = new Date();
    
    // Convertiamo la stringa "dataOra" ricevuta dal frontend in un oggetto Date
    const dataScelta = new Date(dataOra);

    // Controllo 1 & 2: La data scelta è nel passato o coincide esattamente con adesso?
    if (dataScelta <= adesso) {
        return res.status(400).send("Non è possibile prenotare in una data o un orario già trascorso.");
    }

    // Controllo 3: Calcolo del margine minimo di anticipo richiesto
    const limiteMinimoSpesa = new Date(adesso.getTime() + MINUTI_ANTICIPO_MINIMO * 60 * 1000);

    if (dataScelta < limiteMinimoSpesa) {
        // Formattiamo l'orario minimo accettabile in formato locale italiano per renderlo chiaro all'utente
        const orarioMinimoValido = limiteMinimoSpesa.toLocaleTimeString('it-IT', {
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Rome'
        });
        
        return res.status(400).send(`Le prenotazioni richiedono un preavviso minimo di ${MINUTI_ANTICIPO_MINIMO} minuti. La prima prenotazione utile per oggi è a partire dalle ore ${orarioMinimoValido}.`);
    }
    // -------------------------------------------------------------

    try {
        // Formattazione della data finale da stampare nel biglietto e inviare ai gestori
        const dataFormattata = new Date(dataOra).toLocaleString('it-IT', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            timeZone: 'Europe/Rome'
        });

        const testoQR =
            `Rues45 Prenotazione\n` +
            `${nome} ${cognome}\n` +
            `${telefono}\n` +
            `${dataFormattata}\n` +
            `${persone}`;

        // async (NON blocca il processo di rendering del PDF)
        inviaNotificaTelegram(nome, cognome, telefono, dataFormattata, persone);
        salvaSuGoogleSheets(nome, cognome, telefono, dataFormattata, persone);

        // QR Code Generation
        const qrCode = await QRCode.toDataURL(testoQR);

        // =====================
        // 🔥 HTML TICKET CON ICONE SVG INLINE (STABILI SU PUPPETEER)
        // =====================
        const htmlTemplate = `
            <!DOCTYPE html>
            <html lang="it">
            <head>
                <meta charset="UTF-8">
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
                        display: block;
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
                        margin: 0 auto;
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
                        line-height: 2.2;
                    }
                    .details-row {
                        display: block;
                        margin-bottom: 5px;
                    }
                    .details-box svg {
                        fill: #d4af37;
                        margin-right: 10px;
                        width: 16px;
                        height: 16px;
                        vertical-align: middle;
                        display: inline-block;
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
                        <h2 style="color: #d4af37; font-size: 24px; margin: 0; font-family: 'Montserrat'; letter-spacing: 3px; font-weight: 800;">RUES 45</h2>
                    </div>

                    <div class="content">
                        <div class="guest-info">
                            Tavolo Riservato per
                            <span class="guest-name">${nome} ${cognome}</span>
                        </div>

                        <div class="details-box">
                            <span class="details-row">
                                <svg viewBox="0 0 384 512"><path d="M215.7 499.2C267 435 384 279.4 384 192C384 86 298 0 192 0S0 86 0 192c0 87.4 117 243 168.3 307.2c12.3 15.3 35.1 15.3 47.4 0zM192 128a64 64 0 1 1 0 128 64 64 0 1 1 0-128z"/></svg>
                                <strong>Location:</strong> Via San Clemente, snc - Casamarciano (NA)
                            </span>
                            <span class="details-row">
                                <svg viewBox="0 0 512 512"><path d="M256 0a256 256 0 1 1 0 512A256 256 0 1 1 256 0zM232 120V256c0 8 4.3 15.5 11.3 19.5l112 64c9.8 5.6 22.1 2.2 27.7-7.6s2.2-22.1-7.6-27.7L280 243.2V120c0-11.3-9.1-20-20-20s-20 8.7-20 20z"/></svg>
                                <strong>Data e Ora:</strong> ${dataFormattata}
                            </span>
                            <span class="details-row">
                                <svg viewBox="0 0 640 512"><path d="M144 0a80 80 0 1 1 0 160A80 80 0 1 1 144 0zM512 0a80 80 0 1 1 0 160A80 80 0 1 1 512 0zM0 298.1C0 244.9 43.1 201.8 96.3 201.8H191.7C244.9 201.8 288 244.9 288 298.1V352H0V298.1zM448 201.8H543.7C596.9 201.8 640 244.9 640 298.1V352H352V298.1c0-53.2 43.1-96.3 96.3-96.3zM288 432v16c0 17.7-14.3 32-32 32H32c-17.7 0-32-14.3-32-32V432c0-17.7 14.3-32 32-32H256c17.7 0 32 14.3 32 32zm352 0v16c0 17.7-14.3 32-32 32H384c-17.7 0-32-14.3-32-32V432c0-17.7 14.3-32 32-32H608c17.7 0 32 14.3 32 32z"/></svg>
                                <strong>Ospiti:</strong> ${persone} Persone
                            </span>
                            <span class="details-row">
                                <svg viewBox="0 0 512 512"><path d="M164.9 24.6c-7.7-18.6-28-28.5-47.4-23.2l-88 24C12.1 30.2 0 46 0 64C0 311.4 200.6 512 448 512c18 0 33.8-12.1 38.6-29.5l24-88c5.3-19.4-4.6-39.7-23.2-47.4l-96-40c-16.3-6.8-35.2-2.1-46.3 11.6L304.7 368C234.3 334.7 177.3 277.7 144 207.3L193.3 167c13.7-11.2 18.4-30 11.6-46.3l-40-96z"/></svg>
                                <strong>Contatto:</strong> ${telefono}
                            </span>
                        </div>

                        <div class="qr-section">
                            <img src="${qrCode}" alt="QR Code Rues 45">
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
        // BROWSER REUSE & CALCOLO MILLIMETRICO
        // =====================
        const browserInstance = await getBrowser();
        const page = await browserInstance.newPage();

        // 1. Carichiamo l'HTML
        await page.setContent(htmlTemplate, { waitUntil: 'domcontentloaded' });
        
        // 2. Forza Puppeteer ad aspettare che i font esterni siano carichi
        await page.evaluateHandle('document.fonts.ready');

        // 3. Calcola l'altezza reale del div contenitore
        const dimensions = await page.evaluate(() => {
            const ticket = document.querySelector('.ticket-container');
            return {
                width: ticket ? Math.ceil(ticket.getBoundingClientRect().width) : 400,
                height: ticket ? Math.ceil(ticket.getBoundingClientRect().height) : 800
            };
        });

        // 4. Genera il PDF dinamico su misura singola pagina
        const pdf = await page.pdf({
            width: `${dimensions.width}px`,
            height: `${dimensions.height + 20}px`, // 20px di tolleranza di sicurezza
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
        });

        await page.close();

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