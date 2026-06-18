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

// ==========================================
// ENVIRONMENT VARIABLES
// ==========================================
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// ==========================================
// BOOKING VALIDATION CONFIGURATION
// ==========================================
const MIN_ADVANCE_MINUTES = 60;
const FIRST_ALLOWED_HOUR = 20;
const FIRST_ALLOWED_MINUTE = 30;

// NUOVE VARIABILI CONFIGURABILI PER GLI SLOT
const SLOT_START_HOUR = 20;
const SLOT_START_MINUTE = 30;
const SLOT_END_HOUR = 23;
const SLOT_END_MINUTE = 30;
const SLOT_INCREMENT_MINUTES = 15; // <-- MODIFICA QUESTO PER CAMBIARE L'INCREMENTO (Es. 15, 30, 45)

// ==========================================
// BROWSER CACHE & INSTANCE MANAGEMENT
// ==========================================
let browserInstance = null;

/**
 * Retrieves or initializes the shared Puppeteer browser instance.
 * @returns {Promise<import('puppeteer-core').Browser>} The browser instance.
 */
async function getBrowser() {
    if (!browserInstance) {
        browserInstance = await puppeteer.launch({
            args: chromium.args,
            executablePath: await chromium.executablePath(),
            headless: chromium.headless
        });
        console.log('Chromium browser instance started successfully with cache active');
    }
    return browserInstance;
}

// ==========================================
// GOOGLE SHEETS INTEGRATION
// ==========================================

/**
 * Saves the booking details into Google Sheets via Web App script.
 * @param {string} nome - Customer first name.
 * @param {string} cognome - Customer last name.
 * @param {string} telefono - Customer phone number.
 * @param {string} dataPrenotazione - Formatted booking date and time.
 * @param {number|string} persone - Number of guests.
 * @returns {Promise<void>}
 */
async function salvaSuGoogleSheets(nome, cognome, telefono, dataPrenotazione, persone) {
    try {
        await axios.post(GOOGLE_SCRIPT_URL, {
            action: 'save',
            nome,
            cognome,
            telefono,
            dataPrenotazione,
            persone
        });
        console.log('Google Sheets integration sync completed successfully');
    } catch (err) {
        console.error('Google Sheets integration error:', err.message);
    }
}

// ==========================================
// DATA UTILITIES & VALIDATION
// ==========================================

/**
 * Formats a Date object or string into the format required by Google Apps Script (DD/MM/YYYY, HH:mm).
 * @param {Date|string} data - The date input to format.
 * @returns {string} Formatted date string or empty string if invalid.
 */
function formattaDataPrenotazionePerScript(data) {
    const date = new Date(data);

    if (Number.isNaN(date.getTime())) {
        return '';
    }

    const giorno = String(date.getDate()).padStart(2, '0');
    const mese = String(date.getMonth() + 1).padStart(2, '0');
    const anno = date.getFullYear();
    const ore = String(date.getHours()).padStart(2, '0');
    const minuti = String(date.getMinutes()).padStart(2, '0');

    return `${giorno}/${mese}/${anno}, ${ore}:${minuti}`;
}

/**
 * Checks for duplicate bookings via the Google Sheets script web app.
 * @param {string} telefono - The phone number to check.
 * @param {Date|string} dataOra - The target booking date and time.
 * @returns {Promise<{duplicato: boolean, stessoSlot: boolean, risposta: object}>} Duplicate verification details.
 */
async function verificaDuplicatoPrenotazione(telefono, dataOra) {
    try {
        const response = await axios.post(GOOGLE_SCRIPT_URL, {
            action: 'check',
            telefono: String(telefono).trim(),
            dataPrenotazione: formattaDataPrenotazionePerScript(dataOra)
        });

        const data = response.data || {};

        return {
            duplicato: Boolean(data.isDuplicate),
            stessoSlot: Boolean(data.isSameSlot),
            risposta: data
        };
    } catch (err) {
        console.error('Duplicate verification API error:', err.message);
        throw new Error('Unable to verify duplicate bookings at this moment.');
    }
}

// ==========================================
// TELEGRAM NOTIFICATION SYSTEM
// ==========================================

/**
 * Sends a notification message to the configured Telegram chat.
 * @param {string} nome - Customer first name.
 * @param {string} cognome - Customer last name.
 * @param {string} telefono - Customer phone number.
 * @param {string} data - Formatted booking date string.
 * @param {number|string} persone - Number of guests.
 * @returns {Promise<void>}
 */
async function inviaNotificaTelegram(nome, cognome, telefono, data, persone) {
    const isTelegramEnabled = process.env.ENABLE_TELEGRAM_NOTIFICATIONS === 'true';

    if (!isTelegramEnabled) {
        console.log('Telegram notifications are currently disabled via environment configuration');
        return;
    }

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

        console.log('Telegram notification sent successfully');
    } catch (err) {
        console.error('Telegram notification dispatch error:', err.message);
    }
}

/**
 * Validates the requested booking timestamp against business constraints.
 * @param {Date|string} dataOra - The requested booking date and time.
 * @returns {{valido: boolean, errore?: string, selectedDate?: Date, now?: Date}} Validation result object.
 */
function validaPrenotazione(dataOra) {
    const selectedDate = new Date(dataOra);

    if (Number.isNaN(selectedDate.getTime())) {
        return {
            valido: false,
            errore: 'Il campo dataOra non è un formato valido.'
        };
    }

    const now = new Date();
    const minAllowedDate = new Date(now.getTime() + (MIN_ADVANCE_MINUTES * 60 * 1000));

    if (selectedDate <= now) {
        return {
            valido: false,
            errore: 'La data e l\'orario selezionati sono già passati o già iniziati.'
        };
    }

    if (selectedDate < minAllowedDate) {
        return {
            valido: false,
            errore: `La prenotazione deve essere effettuata con almeno ${MIN_ADVANCE_MINUTES} minuti di anticipo.`
        };
    }

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

// ==========================================
// TEMPLATE ENGINE / HTML GENERATION
// ==========================================

/**
 * Generates the HTML ticket structure required for PDF rendering.
 * @param {string} nome - Customer first name.
 * @param {string} cognome - Customer last name.
 * @param {string} telefono - Customer phone number.
 * @param {string} dataFormattata - Localized formatted date.
 * @param {number|string} persone - Number of guests.
 * @param {string} qrCode - Base64 DataURL representation of the QR Code.
 * @returns {string} Compiled HTML string.
 */
function generateTicketHtml(nome, cognome, telefono, dataFormattata, persone, qrCode) {
    return `
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
}

// ==========================================
// ROUTE HANDLERS
// ==========================================

// Analizza e mappa lo stato dei posti con generazione automatica degli slot
app.post('/api/verifica-giorno', async (req, res) => {
    const { dataGiorno, persone } = req.body;

    if (!dataGiorno || !persone) {
        return res.status(400).json({ error: 'MISSING_PARAMETERS', message: 'I parametri dataGiorno e persone sono obbligatori.' });
    }

    try {
        // GENERAZIONE DINAMICA DEGLI SLOT ORARI
        const slotOrari = [];
        let oraCorrente = SLOT_START_HOUR;
        let minutoCorrente = SLOT_START_MINUTE;

        const fineInMinuti = (SLOT_END_HOUR * 60) + SLOT_END_MINUTE;

        while ((oraCorrente * 60) + minutoCorrente <= fineInMinuti) {
            const oraFormattata = String(oraCorrente).padStart(2, '0');
            const minutoFormattato = String(minutoCorrente).padStart(2, '0');
            slotOrari.push(`${oraFormattata}:${minutoFormattato}`);

            // Avanza del valore dell'incremento configurato
            minutoCorrente += SLOT_INCREMENT_MINUTES;
            if (minutoCorrente >= 60) {
                oraCorrente += Math.floor(minutoCorrente / 60);
                minutoCorrente = minutoCorrente % 60;
            }
        }

        const resocontoGiorno = {};
        const numeroPersoneRichieste = parseInt(persone, 10) || 1;

        // Esegue le verifiche in parallelo
        await Promise.all(slotOrari.map(async (ora) => {
            const dataOraVirtuale = `${dataGiorno}T${ora}:00`;
            
            try {
                const controllo = await verificaDuplicatoPrenotazione("0000000000", dataOraVirtuale);
                const capienza = controllo.risposta;

                const postiRimasti = capienza.hasOwnProperty('availableSeatsRemaining') 
                    ? parseInt(capienza.availableSeatsRemaining, 10) 
                    : 0;

                resocontoGiorno[ora] = {
                    pieno: Boolean(capienza.isVenueFull),
                    postiRimasti: postiRimasti,
                    disponibilePerGruppo: !capienza.isVenueFull && (postiRimasti >= numeroPersoneRichieste)
                };
            } catch (err) {
                resocontoGiorno[ora] = { pieno: true, postiRimasti: 0, disponibilePerGruppo: false };
            }
        }));

        return res.json(resocontoGiorno);
    } catch (globalErr) {
        console.error('Errore globale mdf verifica-giorno:', globalErr.message);
        return res.status(500).json({ error: 'INTERNAL_SERVER_ERROR' });
    }
});

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
        // Interroghiamo Google Script (che esegue in un colpo solo duplicati + controllo posti)
        const controlloDatabase = await verificaDuplicatoPrenotazione(telefono, dataOra);
        const infoCapacita = controlloDatabase.risposta;

        // 1. CONTROLlo DUPLICATI
        if (controlloDatabase.duplicato) {
            return res.status(409).json({
                error: 'DUPLICATE_BOOKING',
                message: controlloDatabase.stessoSlot
                    ? 'Hai già una prenotazione per questo stesso slot. Se vuoi modificare i coperti, contatta il locale.'
                    : 'Hai già una prenotazione futura attiva con questo numero di telefono.'
            });
        }

        // 2. CONTROLLO DISPONIBILITÀ POSTI
        if (infoCapacita.isVenueFull) {
            return res.status(400).json({
                error: 'VENUE_FULLY_BOOKED',
                message: `Ci dispiace, non ci sono abbastanza posti disponibili per questo orario. Posti rimasti: ${infoCapacita.availableSeatsRemaining || 0}.`
            });
        }

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

        // Lancio delle integrazioni asincrone background
        inviaNotificaTelegram(nome, cognome, telefono, dataFormattata, persone);
        salvaSuGoogleSheets(nome, cognome, telefono, dataFormattata, persone);

        // Generazione QR code
        const qrCode = await QRCode.toDataURL(testoQR);

        // Generazione HTML template
        const htmlTemplate = generateTicketHtml(nome, cognome, telefono, dataFormattata, persone, qrCode);

        // Pipeline di elaborazione Puppeteer
        const browserInstance = await getBrowser();
        const page = await browserInstance.newPage();
        let pdfBuffer;

        try {
            await page.setContent(htmlTemplate, { waitUntil: 'domcontentloaded' });
            await page.evaluateHandle('document.fonts.ready');

            const dimensions = await page.evaluate(() => {
                const ticket = document.querySelector('.ticket-container');
                return {
                    width: ticket ? Math.ceil(ticket.getBoundingClientRect().width) : 400,
                    height: ticket ? Math.ceil(ticket.getBoundingClientRect().height) : 800
                };
            });

            pdfBuffer = await page.pdf({
                width: `${dimensions.width}px`,
                height: `${dimensions.height + 20}px`,
                printBackground: true,
                preferCSSPageSize: true,
                margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
            });
        } finally {
            await page.close().catch((closeErr) => console.error('Error closing Puppeteer page instance:', closeErr.message));
        }

        res.contentType('application/pdf');
        return res.send(pdfBuffer);

    } catch (err) {
        console.error('Critical internal error inside reservation orchestration system:', err);
        return res.status(500).send('Errore generazione prenotazione');
    }
});

// ==========================================
// SERVER INITIALIZATION
// ==========================================
app.listen(PORT, () => {
    console.log(`Production server instance successfully mounted on port ${PORT}`);
});