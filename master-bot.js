const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { OpenAI } = require('openai');
const sheetManager = require('./sheet-manager');

puppeteer.use(StealthPlugin());

// --- CONFIGURATION ---
const OPENAI_KEY = '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';
const RUNS_PER_DAY = 20; // Din mein kitni baar chalana hai
const LEADS_TO_FIND_PER_RUN = 20; // Ek run mein kitne leads
const GOOGLE_MAPS_SEARCH_QUERY = 'Digital Marketing Agencies in Dubai';

const openai = new OpenAI({ apiKey: OPENAI_KEY });

// --- HELPER FUNCTIONS (Purane scripts se logic liya hai) ---

async function getMapsLeads(page, query, limit) {
    console.log(`\n🔍 Searching Google Maps for: ${query}`);
    await page.goto(`https://www.google.com/maps/search/${query.split(' ').join('+')}`);
    try { await page.waitForSelector('div[role="feed"]', { timeout: 10000 }); } catch (e) {}

    // Auto-scroll logic
    await page.evaluate(async () => {
        const wrapper = document.querySelector('div[role="feed"]');
        if(wrapper) {
            for(let i=0; i<5; i++) { 
                wrapper.scrollTop = wrapper.scrollHeight;
                await new Promise(r => setTimeout(r, 1500)); 
            }
        }
    });

    // Extract Data
    const rawLeads = await page.evaluate(() => {
        const items = document.querySelectorAll('div[role="article"]');
        return Array.from(items).map(item => {
            const link = Array.from(item.querySelectorAll('a')).find(l => l.href.includes('http') && !l.href.includes('google.com'));
            return {
                name: item.getAttribute('aria-label') || 'Unknown',
                website: link ? link.href : null
            };
        });
    });
    
    return rawLeads.filter(l => l.website); // Return only ones with website
}

async function findEmail(page, url) {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const email = await page.evaluate(() => {
            const mailto = document.querySelector('a[href^="mailto:"]');
            return mailto ? mailto.href.replace('mailto:', '').split('?')[0] : null;
        });
        return email;
    } catch (e) { return null; }
}

async function generateAIEmail(name, website, page) {
    // 1. Scrape Context
    let context = "Marketing Agency";
    try {
        context = await page.evaluate(() => document.body.innerText.substring(0, 1500));
    } catch (e) {}

    // 2. Ask AI
    const prompt = `Write a short cold email (under 100 words) to ${name} (${website}). 
    Context: ${context.replace(/\n/g, ' ')}. 
    My Offer: I build WhatsApp Bots. Ask for a meeting. My Portfolio: mrkaushalshah.com`;
    
    try {
        const res = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-5.1",
        });
        return res.choices[0].message.content;
    } catch (e) { return "Error writing email"; }
}

// --- MAIN AUTOMATION LOOP ---

async function runBatch() {
    console.log('🔄 Starting New Batch...');
    await sheetManager.initSheet(); // Connect to Sheet

    const browser = await puppeteer.launch({ headless: true }); // Headless ON for automation
    const page = await browser.newPage();

    // 1. Get Leads from Maps
    const allLeads = await getMapsLeads(page, GOOGLE_MAPS_SEARCH_QUERY);
    console.log(`   📍 Found ${allLeads.length} total raw leads on Maps.`);

    let processedCount = 0;

    for (const lead of allLeads) {
        if (processedCount >= LEADS_TO_FIND_PER_RUN) break;

        // 2. CHECK DUPLICATE (Google Sheet se pucha)
        const isDup = await sheetManager.isDuplicate(lead.website);
        if (isDup) {
            console.log(`   ⚠️ Skipping Duplicate: ${lead.name}`);
            continue;
        }

        console.log(`   ⚡ New Lead Found: ${lead.name}. Processing...`);

        // 3. Find Email
        const email = await findEmail(page, lead.website);
        if (!email) {
            console.log(`   ❌ No Email found. Skipping.`);
            continue; // Skip if no email (Quality Control)
        }

        // 4. Generate AI Draft
        console.log(`   🤖 Generating Email for ${lead.name}...`);
        const draft = await generateAIEmail(lead.name, lead.website, page);

        // 5. Save to Google Sheet
        await sheetManager.addLead({
            name: lead.name,
            website: lead.website,
            email: email,
            ai_draft: draft
        });
        console.log(`   ✅ SAVED to Sheet!`);
        
        processedCount++;
    }

    await browser.close();
    console.log('💤 Batch Complete. Sleeping until next run...');
}

// --- SCHEDULER LOGIC ---

// Calculate Interval (24 hours / runs per day)
const intervalMs = (24 * 60 * 60 * 1000) / RUNS_PER_DAY;

console.log(`🚀 BOT STARTED.`);
console.log(`📅 Schedule: Running ${RUNS_PER_DAY} times/day (Every ${(intervalMs / 1000 / 60 / 60).toFixed(1)} hours).`);

// Run immediately once, then start loop
runBatch();
setInterval(runBatch, intervalMs);