const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secrets.json'); // Teri download ki hui key file

// CONFIGURATION
const SHEET_ID = '1G1momh208WIeQrAbabsaOPn2w587gNSkZ3tWnsyTamk'; // <--- PASTE YOUR SHEET ID HERE

const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);

// Function: Initialize Sheet (Headers set karega agar nahi hain)
async function initSheet() {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0]; // First tab use karega
    
    // Check headers
    await sheet.loadHeaderRow();
    if (sheet.headerValues.length === 0) {
        await sheet.setHeaderRow(['Agency Name', 'Website', 'Email', 'AI Email Draft', 'Status', 'Date Found']);
    }
    return sheet;
}

// Function: Check if Website already exists
async function isDuplicate(websiteUrl) {
    if (!websiteUrl) return true;
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    
    // Normalize URL (http/https hata ke check karenge for better matching)
    const cleanUrl = websiteUrl.replace(/(^\w+:|^)\/\//, '').toLowerCase();
    
    const exists = rows.some(row => {
        const rowUrl = row.get('Website') ? row.get('Website').replace(/(^\w+:|^)\/\//, '').toLowerCase() : '';
        return rowUrl.includes(cleanUrl) || cleanUrl.includes(rowUrl);
    });
    
    return exists;
}

// Function: Add New Lead
async function addLead(data) {
    const sheet = doc.sheetsByIndex[0];
    await sheet.addRow({
        'Agency Name': data.name,
        'Website': data.website,
        'Email': data.email,
        'AI Email Draft': data.ai_draft,
        'Status': 'Ready',
        'Date Found': new Date().toISOString().split('T')[0]
    });
}

module.exports = { initSheet, isDuplicate, addLead };