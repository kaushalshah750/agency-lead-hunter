const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteer.use(StealthPlugin());

const createCsvWriter = require('csv-writer').createObjectCsvWriter;

const csvWriter = createCsvWriter({
    path: 'dubai_maps_leads.csv',
    header: [
        {id: 'name', title: 'AGENCY NAME'},
        {id: 'website', title: 'WEBSITE'}
    ]
});

(async () => {
    console.log('\x1b[33m%s\x1b[0m', '🚀 LAUNCHING GOOGLE MAPS SNIPER...');
    console.log('\x1b[36m%s\x1b[0m', '🎯 Target: Dubai Marketing Agencies');

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();
    
    // 1. Go to Google Maps (Dubai Agencies)
    // This URL searches for "Marketing Agency Dubai" directly
    await page.goto('https://www.google.com/maps/search/marketing+agency+in+dubai/@25.2048,55.2708,12z');
    
    console.log('⏳ Waiting for Google Maps to load...');
    try {
        await page.waitForSelector('div[role="feed"]', { timeout: 15000 });
    } catch (e) {
        console.log("⚠️  Feed not found immediately. Please click on the list if needed.");
    }

    console.log('⬇️  SCROLLING TO EXTRACT LEADS...');
    
    // 2. Auto-Scroll loop to load more agencies
    // This looks VERY cool in the video (the list scrolls itself)
    await page.evaluate(async () => {
        const wrapper = document.querySelector('div[role="feed"]');
        if(wrapper) {
            for(let i=0; i<10; i++) { // Scrolls 10 times
                wrapper.scrollTop = wrapper.scrollHeight;
                await new Promise(resolve => setTimeout(resolve, 1500)); 
            }
        }
    });

    // 3. Extract Data
    console.log('🔍 READING DATA...');
    const leads = await page.evaluate(() => {
        // Find all listing cards
        const items = document.querySelectorAll('div[role="article"]');
        const data = [];
        
        items.forEach(item => {
            const name = item.getAttribute('aria-label');
            
            // Try to find the website link
            const links = Array.from(item.querySelectorAll('a'));
            const websiteLink = links.find(l => l.href && !l.href.includes('google.com/maps') && !l.href.includes('google.com/search'));
            
            if (name) {
                data.push({ 
                    name: name, 
                    website: websiteLink ? websiteLink.href : 'Search Manually' 
                });
            }
        });
        return data;
    });

    // 4. Console Logs for the Video (Matrix Style)
    leads.forEach(lead => {
        console.log(`   👉 [EXTRACTED]: ${lead.name} | 🌍 ${lead.website}`);
    });

    console.log(`\n✅ MISSION SUCCESS. Found ${leads.length} Agencies.`);
    
    await csvWriter.writeRecords(leads);
    console.log('\x1b[32m%s\x1b[0m', '💾 SAVED TO dubai_maps_leads.csv');
    
    await browser.close();
})();