const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const creds = require('./secrets.json'); 

const SHEET_ID = '1G1momh208WIeQrAbabsaOPn2w587gNSkZ3tWnsyTamk'; 

const serviceAccountAuth = new JWT({
  email: creds.client_email,
  key: creds.private_key,
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

const doc = new GoogleSpreadsheet(SHEET_ID, serviceAccountAuth);

async function initSheet() {
    await doc.loadInfo();
    const sheet = doc.sheetsByIndex[0];
    await sheet.loadHeaderRow();
    
    // UPDATE: Added Industry and Location
    if (sheet.headerValues.length === 0) {
        await sheet.setHeaderRow(['Agency Name', 'Website', 'Email', 'AI Subject', 'AI Body', 'Status', 'Date Found', 'Industry', 'Location']);
    }
    return sheet;
}

async function isDuplicate(websiteUrl) {
    if (!websiteUrl) return true;
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    
    const cleanUrl = websiteUrl.replace(/(^\w+:|^)\/\//, '').toLowerCase();
    
    return rows.some(row => {
        const rowUrl = row.get('Website') ? row.get('Website').replace(/(^\w+:|^)\/\//, '').toLowerCase() : '';
        return rowUrl.includes(cleanUrl) || cleanUrl.includes(rowUrl);
    });
}

// UPDATE: Accepting new fields
async function addLead(data) {
    const sheet = doc.sheetsByIndex[0];
    await sheet.addRow({
        'Agency Name': data.name,
        'Website': data.website,
        'Email': data.email,
        'AI Subject': data.subject,
        'AI Body': data.body,
        'Status': 'Ready',
        'Date Found': new Date().toISOString().split('T')[0],
        'Industry': data.industry,   // <--- NEW
        'Location': data.location    // <--- NEW
    });
}

async function getPendingLeads() {
    const sheet = doc.sheetsByIndex[0];
    const rows = await sheet.getRows();
    return rows.filter(row => row.get('Status') === 'Ready');
}

module.exports = { initSheet, isDuplicate, addLead, getPendingLeads };