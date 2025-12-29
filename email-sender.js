const nodemailer = require('nodemailer');
const sheetManager = require('./sheet-manager');

// --- CONFIGURATION ---
const EMAIL_USER = 'kaushalshah750@gmail.com'; 
const EMAIL_PASS = 'bobk nuel roos gfwn'; // Tera App Password

// Delay between emails (Minimum 2 mins, Max 5 mins)
const MIN_DELAY_MS = 120000; 
const MAX_DELAY_MS = 300000;

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS }
});

const SIGNATURE = `
--
Best Regards,
Kaushal Shah
Senior Software Developer
+91 99744 42525
`;

async function sendEmail(toEmail, subject, body) {
    try {
        await transporter.sendMail({
            from: `"Kaushal Shah" <${EMAIL_USER}>`,
            to: toEmail,
            subject: subject,
            text: body + "\n" + SIGNATURE
        });
        return true;
    } catch (error) {
        console.error("❌ Email Error:", error.message);
        return false;
    }
}

async function processQueue() {
    console.log('\n📧 Checking Sheet for "Ready" leads...');
    await sheetManager.initSheet();

    // Fetch leads where Status = 'Ready'
    const pendingRows = await sheetManager.getPendingLeads();

    if (pendingRows.length === 0) {
        console.log("   😴 No pending emails. Sleeping...");
        return;
    }

    console.log(`   🔥 Found ${pendingRows.length} emails to send.`);

    for (const row of pendingRows) {
        const name = row.get('Agency Name');
        const email = row.get('Email');
        const subject = row.get('AI Subject');
        const body = row.get('AI Body');

        console.log(`\n   🚀 Sending to: ${name} (${email})...`);

        const sent = await sendEmail(email, subject, body);

        if (sent) {
            row.set('Status', 'Sent'); // Memory update
            await row.save();          // Sheet update
            console.log(`   ✅ Marked as SENT.`);
            
            // Random Delay Logic
            const delay = Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS + 1) + MIN_DELAY_MS);
            console.log(`   ⏳ Waiting ${(delay/1000/60).toFixed(1)} mins to avoid SPAM filters...`);
            await new Promise(r => setTimeout(r, delay));
        } else {
            row.set('Status', 'Failed');
            await row.save();
            console.log(`   ❌ Marked as FAILED.`);
        }
    }
}

// Run loop indefinitely
(async () => {
    while(true) {
        await processQueue();
        // Batch khatam hone ke baad 5 min ka break, fir check karega
        console.log("💤 Batch finished. Checking again in 5 mins...");
        await new Promise(r => setTimeout(r, 300000)); 
    }
})();