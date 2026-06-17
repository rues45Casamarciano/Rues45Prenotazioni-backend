const express = require('express');
const QRCode = require('qrcode');
const puppeteer = require('puppeteer');
const cors = require('cors');
const axios = require('axios'); 

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// CONFIGURAZIONE TELEGRAM
const TELEGRAM_TOKEN = '8646717687:AAEqjPVfijBIxdjUzIMdwwPhFtpUvfGRzI0';
const TELEGRAM_CHAT_ID = '-5538020067';

// Funzione helper per inviare il messaggio a Telegram
async function inviaNotificaTelegram(nome, cognome, telefono, data, persone) {
    const messaggio = `🚨 *NUOVA PRENOTAZIONE RUES 45* 🚨\n\n` +
                      `👤 *Cliente:* ${nome} ${cognome}\n` +
                      `📞 *Telefono:* ${telefono}\n` +
                      `📅 *Data e Ora:* ${data}\n` +
                      `👥 *Coperti:* ${persone} Persone`;

    const url = `https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`;

    try {
        await axios.post(url, {
            chat_id: TELEGRAM_CHAT_ID,
            text: messaggio,
            parse_mode: 'Markdown'
        });
        console.log("Notifica Telegram inviata con successo!");
    } catch (error) {
        console.error("Errore invio notifica Telegram:", error.response ? error.response.data : error.message);
    }
}

// Rotta principale per gestire la prenotazione
app.post('/api/prenota', async (req, res) => {
    const { nome, cognome, telefono, dataOra, persone } = req.body;

    const dataFormattata = new Date(dataOra).toLocaleString('it-IT', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });

    const datiQR = `Prenotazione Rues 45\nCliente: ${nome} ${cognome}\nTel: ${telefono}\nData: ${dataFormattata}\nPersone: ${persone}`;

    try {
        // Notifica in background
        inviaNotificaTelegram(nome, cognome, telefono, dataFormattata, persone).catch(err => {
            console.error("Errore asincrono Telegram (non blocca il PDF):", err);
        });

        // 2. Genera il QR Code in formato Base64
        const qrCodeBase64 = await QRCode.toDataURL(datiQR);

        // 3. HTML intero del biglietto (Sistemato CSS per layout rigido anti-taglio)
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
                        <img src="${qrCodeBase64}" alt="QR Code Rues 45">
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

        // 4. Avvia Puppeteer per creare il PDF
        const browser = await puppeteer.launch({ 
            headless: "new",
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const page = await browser.newPage();

        await page.setContent(htmlTemplate);
        await page.evaluateHandle('document.fonts.ready');

        // MODIFICA CRITICA: Calcoliamo l'altezza prendendo l'elemento esatto del biglietto, non tutta la pagina
        const dimensions = await page.evaluate(() => {
            const ticket = document.querySelector('.ticket-container');
            return {
                width: ticket ? Math.ceil(ticket.getBoundingClientRect().width) : 400,
                height: ticket ? Math.ceil(ticket.getBoundingClientRect().height) : 800
            };
        });

        // Genera il PDF lasciando 15px di tolleranza in altezza per le ombre CSS
        const pdfBuffer = await page.pdf({
            width: `${dimensions.width}px`,
            height: `${dimensions.height + 15}px`, 
            printBackground: true,
            preferCSSPageSize: true,
            margin: { top: '0px', right: '0px', bottom: '0px', left: '0px' }
        });

        await browser.close();

        // 5. Invia il file PDF indietro al browser del cliente
        res.contentType("application/pdf");
        res.send(pdfBuffer);

    } catch (error) {
        console.error("Errore generazione PDF:", error);
        res.status(500).send("Errore del server durante la generazione della prenotazione.");
    }
});

app.listen(PORT, () => {
    console.log(`Server attivo sulla porta ${PORT}`);
});