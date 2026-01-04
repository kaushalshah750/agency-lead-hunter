const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secrets.json');

// CONFIGURATION
const SHEET_ID = '1G1momh208WIeQrAbabsaOPn2w587gNSkZ3tWnsyTamk';

const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);

// 🔥 RETRY HELPER FUNCTION (Ye bot ko crash hone se bachayega) 🔥
async function withRetry(operation, actionName = 'Sheet Operation') {
    const maxRetries = 5;
    for (let i = 1; i <= maxRetries; i++) {
        try {
            return await operation();
        } catch (error) {
            console.log(`   ⚠️ ${actionName} Failed (Attempt ${i}/${maxRetries}). Waiting 5s...`);
            console.log(`      Error: ${error.message}`);
            if (i === maxRetries) throw error; // Agar 5 baar fail hua toh hi error dega
            await new Promise(r => setTimeout(r, 5000 * i)); // Wait badhate jayenge (5s, 10s, 15s...)
        }
    }
}

async function initSheet() {
    return await withRetry(async () => {
        await doc.loadInfo();
        const sheet = doc.sheetsByIndex[0];
        await sheet.loadHeaderRow();
        if (sheet.headerValues.length === 0) {
            await sheet.setHeaderRow(['Agency Name', 'Website', 'Email', 'AI Subject', 'AI Body', 'Status', 'Date Found', 'Industry', 'Location']);
        }
        return sheet;
    }, 'Init Sheet');
}

async function isDuplicate(websiteUrl) {
    if (!websiteUrl) return true;
    return await withRetry(async () => {
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        const cleanUrl = websiteUrl.replace(/(^\w+:|^)\/\//, '').toLowerCase();
        return rows.some(row => {
            const rowUrl = row.get('Website') ? row.get('Website').replace(/(^\w+:|^)\/\//, '').toLowerCase() : '';
            return rowUrl.includes(cleanUrl) || cleanUrl.includes(rowUrl);
        });
    }, 'Check Duplicate');
}

async function addLead(data) {
    return await withRetry(async () => {
        const sheet = doc.sheetsByIndex[0];
        // Ensure all fields match headers to avoid errors
        await sheet.addRow({
            'Agency Name': data.name,
            'Website': data.website,
            'Email': data.email,
            'AI Subject': data.subject,
            'AI Body': data.body,
            'Status': data.status || 'Ready',
            'Date Found': new Date().toISOString().split('T')[0],
            'Industry': data.industry || 'Unknown',
            'Location': data.location || 'Unknown'
        });
    }, 'Add Lead');
}

// Ye function sender.js use karta hai pending emails lane ke liye
async function getPendingLeads() {
    return await withRetry(async () => {
        const sheet = doc.sheetsByIndex[0];
        const rows = await sheet.getRows();
        return rows.filter(row => row.get('Status') === 'Ready');
    }, 'Fetch Pending Leads');
}

// Ye update zaroori hai taki sender.js mein save karte waqt retry ho
// NOTE: Isse sender.js mein direct use karna padega
module.exports = { initSheet, isDuplicate, addLead, getPendingLeads, withRetry };