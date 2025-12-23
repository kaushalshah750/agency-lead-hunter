const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const createCsvWriter = require('csv-writer').createObjectCsvWriter;

// TARGET: Dubai Digital Marketing Agencies
const TARGET_URL = 'https://clutch.co/ae/agencies/digital-marketing';

const csvWriter = createCsvWriter({
    path: 'dubai_leads.csv',
    header: [
        {id: 'name', title: 'AGENCY NAME'},
        {id: 'website', title: 'WEBSITE'},
        {id: 'location', title: 'LOCATION'}
    ]
});

(async () => {
    console.log('🚀 LAUNCHING DUBAI SNIPER BOT...');
    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    // Set a large screen so everything loads
    await page.setViewport({ width: 1366, height: 768 });

    console.log(`\n🕵️  Navigating to Target...`);
    await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });

    // // --- MANUAL BYPASS TIME ---
    // console.log('⚠️  WAITING 15 SECONDS... PLEASE CLICK THE CHECKBOX IF VISIBLE ⚠️');
    // await new Promise(resolve => setTimeout(resolve, 15000)); 

    // Auto-scroll to trigger lazy loading
    await page.evaluate(async () => {
        window.scrollBy(0, window.innerHeight);
    });

    console.log('🔍 Extracting Data...');

    const leads = await page.evaluate(() => {
        // The container for every agency card
        const cards = document.querySelectorAll('li.provider-row');
        const data = [];

        cards.forEach(card => {
            // 1. NAME (Universal Selector based on your findings)
            const nameEl = card.querySelector('.provider__title-link');
            const name = nameEl ? nameEl.innerText.trim() : null;

            // 2. WEBSITE (Universal Selector)
            const websiteEl = card.querySelector('.website-link__item');
            let website = websiteEl ? websiteEl.getAttribute('href') : null;

            // 3. LOCATION (Standard selector)
            const locEl = card.querySelector('.locality');
            const location = locEl ? locEl.innerText.trim() : 'Dubai, AE';

            if (name && website) {
                // CLEAN THE URL (Remove the r.clutch.co redirect mess)
                if (website.includes('u=')) {
                    try {
                        const urlParams = new URLSearchParams(website.split('?')[1]);
                        website = decodeURIComponent(urlParams.get('u'));
                    } catch (e) {
                        // If cleaning fails, keep the original messy link (better than nothing)
                    }
                }
                data.push({ name, website, location });
            }
        });
        return data;
    });

    console.log(`✅ Found ${leads.length} Agencies`);
    
    // LOGS FOR THE VIDEO (Film this part!)
    leads.forEach(lead => {
        console.log(`   👉 [EXTRACTED]: ${lead.name} | 🌍 ${lead.website}`);
    });

    if (leads.length > 0) {
        await csvWriter.writeRecords(leads);
        console.log('\n\x1b[32m%s\x1b[0m', '💾 SAVED TO dubai_leads.csv');
    } else {
        console.log('\n\x1b[31m%s\x1b[0m', '❌ STILL 0 RESULTS? CLUTCH MIGHT BE BLOCKING THE DOM.');
    }
    
    await browser.close();
})();