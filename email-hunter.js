const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// CONFIGURATION
const INPUT_FILE = 'dubai_maps_leads.csv';
const OUTPUT_FILE = 'dubai_final_leads.csv';

const csvWriter = createCsvWriter({
    path: OUTPUT_FILE,
    header: [
        {id: 'name', title: 'AGENCY NAME'},
        {id: 'website', title: 'WEBSITE'},
        {id: 'email', title: 'EMAIL FOUND'},
        {id: 'status', title: 'STATUS'}
    ]
});

(async () => {
    console.log('\x1b[33m%s\x1b[0m', '🚀 LAUNCHING EMAIL HUNTER BOT...');
    
    // 1. Read the CSV File
    const agencies = [];
    await new Promise((resolve) => {
        fs.createReadStream(INPUT_FILE)
            .pipe(csv())
            .on('data', (row) => {
                // Map the CSV columns correctly (Google Maps CSV headers might be generic)
                // We assume the previous script saved 'AGENCY NAME' and 'WEBSITE'
                if(row['WEBSITE'] && row['WEBSITE'].startsWith('http')) {
                    agencies.push(row);
                }
            })
            .on('end', () => resolve());
    });

    console.log(`\x1b[36m%s\x1b[0m`, `📂 Loaded ${agencies.length} Agencies from CSV.`);

    const browser = await puppeteer.launch({ headless: true }); // Headless TRUE for speed, FALSE if you want to film it
    const page = await browser.newPage();
    
    // Anti-bot detection
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36');

    const finalResults = [];

    // 2. Loop through each website
    for (let i = 0; i < agencies.length; i++) {
        const agency = agencies[i];
        const url = agency['WEBSITE'];
        const name = agency['AGENCY NAME'];

        console.log(`\n🕵️  [${i+1}/${agencies.length}] Visiting: ${name}`);
        
        let email = 'Not Found';
        let status = 'Failed';

        try {
            // Set timeout to 10s so we don't get stuck on slow sites
            await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });

            // STRATEGY A: Look for mailto: links immediately
            email = await page.evaluate(() => {
                // Find all links starting with mailto:
                const mailto = document.querySelector('a[href^="mailto:"]');
                return mailto ? mailto.href.replace('mailto:', '').split('?')[0] : null;
            });

            // STRATEGY B: If no email, check for "Contact" page
            if (!email) {
                // Find a link that says "Contact"
                const contactLink = await page.evaluate(() => {
                    const links = Array.from(document.querySelectorAll('a'));
                    const contact = links.find(l => l.innerText.toLowerCase().includes('contact') || l.href.includes('contact'));
                    return contact ? contact.href : null;
                });

                if (contactLink) {
                    // Go to contact page
                    await page.goto(contactLink, { waitUntil: 'domcontentloaded', timeout: 10000 });
                    // Check for mailto again
                    email = await page.evaluate(() => {
                        const mailto = document.querySelector('a[href^="mailto:"]');
                        return mailto ? mailto.href.replace('mailto:', '').split('?')[0] : null;
                    });
                }
            }

            if (email) {
                console.log(`   ✅ EMAIL FOUND: \x1b[32m${email}\x1b[0m`);
                status = 'Success';
            } else {
                console.log(`   ❌ No Email Found on Website.`);
            }

        } catch (error) {
            console.log(`   ⚠️  Error visiting site: ${error.message}`);
        }

        finalResults.push({
            name: name,
            website: url,
            email: email || 'Manual Search Req',
            status: status
        });
    }

    console.log('\n\x1b[32m%s\x1b[0m', '💾 SAVING FINAL LIST TO dubai_final_leads.csv...');
    await csvWriter.writeRecords(finalResults);
    
    await browser.close();
})();