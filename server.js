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
// CONFIGURAZIONE VALIDAZIONE PRENOTAZIONI
// =====================
const MIN_ADVANCE_MINUTES = 60; // modifica qui il margine minimo di anticipo
const FIRST_ALLOWED_HOUR = 20;
const FIRST_ALLOWED_MINUTE = 30;

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
// VALIDAZIONE PRENOTAZIONI (SERVER SIDE)
// =====================
function validaPrenotazione(dataOra) {
    const selectedDate = new Date(dataOra);

    // Controllo formato data
    if (Number.isNaN(selectedDate.getTime())) {
        return {
            valido: false,
            errore: 'Il campo dataOra non è un formato valido.'
        };
    }

    const now = new Date();
    const minAllowedDate = new Date(now.getTime() + (MIN_ADVANCE_MINUTES * 60 * 1000));

    // Non permettere slot già iniziati o passati
    if (selectedDate <= now) {
        return {
            valido: false,
            errore: 'La data e l\'orario selezionati sono già passati o già iniziati.'
        };
    }

    // Margine minimo di anticipo configurabile
    if (selectedDate < minAllowedDate) {
        return {
            valido: false,
            errore: `La prenotazione deve essere effettuata con almeno ${MIN_ADVANCE_MINUTES} minuti di anticipo.`
        };
    }

    // Prima prenotazione valida: dalle 20:30 in poi
    const selectedMinutes = (selectedDate.getHours() * 60) + selectedDate.getMinutes();
    const firstAllowedMinutes = (FIRST_ALLOWED_HOUR * 60) + FIRST_ALLOWED_MINUTE;

    if (selectedMinutes < firstAllowedMinutes) {
        return {
            valido: false,
            errore: `La prima prenotazione valida è disponibile dalle ${String(FIRST_ALLOWED_HOUR).padStart(2, '0')}:${String(FIRST_ALLOWED_MINUTE).padStart(2, '0')}.`
        };
    }

    return {
        valido: true,
        selectedDate,
        now
    };
}

// =====================
// ROUTE
// =====================
app.post('/api/prenota', async (req, res) => {
    const { nome, cognome, telefono, dataOra, persone } = req.body;

    const validazione = validaPrenotazione(dataOra);

    if (!validazione.valido) {
        return res.status(400).json({
            error: 'INVALID_BOOKING_TIME',
            message: validazione.errore
        });
    }
    
    try {
        const dataFormattata = validazione.selectedDate.toLocaleString('it-IT', {
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
        // 🔥 IL TUO HTML RISTRUTTURATO PER PAGINA SINGOLA
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
                        <h2 style="color: #d4af37; font-size: 24px; margin: 0; font-family: 'Montserrat'; letter-spacing: 3px; font-weight: 800;">RUES 45</h2>
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
        
        // 2. Forza Puppeteer ad aspettare che i font esterni siano caricati
        await page.evaluateHandle('document.fonts.ready');

        // 3. Calcola l'altezza reale del div contenitore
        const dimensions = await page.evaluate(() => {
            const ticket = document.querySelector('.ticket-container');
            return {
                width: ticket ? Math.ceil(ticket.getBoundingClientRect().width) : 400,
                height: ticket ? Math.ceil(ticket.getBoundingClientRect().height) : 800
            };
        });

        // 4. Genera il PDF dinamico senza layout A6 rigido
        const pdf = await page.pdf({
            width: `${dimensions.width}px`,
            height: `${dimensions.height + 20}px`, // 20px di margine di sicurezza
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
        });

        await page.close();

        res.contentType("application/pdf");
        res.send(pdf);

    } catch (err) {
        console.error("Server error:", err);
        res.status(500).send("Errore generazione prenotazione");
    }
});

// =====================
// START
// =====================
app.listen(PORT, () => {
    console.log(`Server attivo sulla porta ${PORT}`);
});