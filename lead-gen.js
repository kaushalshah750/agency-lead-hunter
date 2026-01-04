// lead-gen.js
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { OpenAI } = require('openai');
const sheetManager = require('./sheet-manager');

puppeteer.use(StealthPlugin());

// --- CONFIGURATION ---
const OPENAI_KEY = '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';

// 🔥 DYNAMIC SEARCH ARRAYS 🔥
// Jitni zyada cities, utna kam duplication.
const TARGET_LOCATIONS = [
    'Berlin, Germany', 
    'Pune, India', 
    'Mumbai, India', 
    'Surat, India', 
    'Ahmedabad, India', 
    'Vadodra, India', 
    'Munich, Germany', 
    'Hamburg, Germany', 
    'Frankfurt, Germany', 
    'Cologne, Germany', 
    'Dubai, UAE',
    'Abu Dhabi, UAE'
];

// Keywords change karte raho taaki alag results milein
const TARGET_NICHES = [
    'Digital Marketing Agency', 
    'SEO Agency', 
    'Web Design Agency', 
    'Advertising Agency',
    'Social Media Marketing Agency'
];

const RUNS_PER_DAY = 50; 
const LEADS_TO_FIND_PER_RUN = 500; 

const openai = new OpenAI({ apiKey: OPENAI_KEY });

// --- HELPER: PICK RANDOM ITEM ---
function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function safeGoto(page, url, waitUntil) {
    try {
        // 60 second wait karega, agar nahi khula toh error nahi dega, bas false return karega
        await page.goto(url, { waitUntil: waitUntil, timeout: 60000 });
        return true;
    } catch (error) {
        console.log(`   ❌ Failed to load URL: ${url} (Error: ${error.message})`);
        return false;
    }
}

async function getMapsLeads(page, query) {
    console.log(`\n🔍 Searching Google Maps for: ${query}`);
    let rawLeads = []; // ERROR 1 FIX: Changed 'const' to 'let'

    // ERROR 2 FIX: Corrected URL and added '$' before {query}
    const url = `https://www.google.com/maps/search/${query.split(' ').join('+')}`;
    
    // ERROR 3 FIX: Wait logic thoda loose rakha hai taaki crash na ho
    const isLoaded = await safeGoto(page, url, 'domcontentloaded');

    // ERROR 4 FIX: Removed '!' (Logic was inverted)
    if (isLoaded) { 
        try {
            // Wait for feed to appear
            await page.waitForSelector('div[role="feed"]', { timeout: 15000 });
        } catch (e) {
            console.log("   ⚠️ No results found or Feed selector changed.");
            return []; // Return empty array instead of undefined
        }

        await page.evaluate(async () => {
            const wrapper = document.querySelector('div[role="feed"]');
            if(wrapper) {
                for(let i=0; i<6; i++) { 
                    wrapper.scrollTop = wrapper.scrollHeight;
                    await new Promise(r => setTimeout(r, 2000)); 
                }
            }
        });
    
        rawLeads = await page.evaluate(() => {
            const items = document.querySelectorAll('div[role="article"]');
            return Array.from(items).map(item => {
                const link = Array.from(item.querySelectorAll('a')).find(l => l.href.includes('http') && !l.href.includes('google.com'));
                return {
                    name: item.getAttribute('aria-label') || 'Unknown',
                    website: link ? link.href : null
                };
            });
        });
    } else {
        console.log("   ❌ Page failed to load, returning empty list.");
        return [];
    }

    return rawLeads.filter(l => l.website);
}

async function findEmail(page, url) {
    try {
        const isLoaded = await safeGoto(page, url, 'domcontentloaded');
        if (!isLoaded) {
            let email = await page.evaluate(() => {
                const mailto = document.querySelector('a[href^="mailto:"]');
                return mailto ? mailto.href.replace('mailto:', '').split('?')[0] : null;
            });
            return email;
        }    
    } catch (e) { return null; }
}

async function generateAIContent(name, website, page, niche, location) {
    let context = "Business";
    try {
        context = await page.evaluate(() => document.body.innerText.substring(0, 800));
    } catch (e) {
        console.log(`   ⚠️ Context Scrape Failed for ${name}`);
    }

    const prompt = `
    Context: Writing a cold email to ${name}, a ${niche} in ${location}.
    Website Context: "${context.replace(/\n/g, ' ').substring(0, 500)}".
    
    My Identity: Kaushal Shah, Senior Full-Stack Developer (Sparqal).
    My Offer: White-Label WhatsApp Automation Bot.
    
    EMAIL STRUCTURE (Strictly follow this order):
    1. Greeting: Hi ${name} Team,
    2. The Hook: Direct statement about how an AI Receptionist/Automation can scale a ${niche}.
    3. The Pitch: Briefly mention you have a "Ready-to-deploy" white-label WhatsApp Bot.
    4. Your Credibility: Mention you are a Senior Developer.
    5. The Ask: Ask if they are available for a short 15-min call to see a live demo.
    6. Portfolio: "For my portfolio & technical background, please check: https://www.mrkaushalshah.com/"
    
    INSTRUCTIONS:
    - Output strictly in JSON format: {"subject": "...", "body": "..."}
    - Subject Line: Needs to be high-impact.
    - DO NOT include a signature.
    `;

    try {
        console.log(`   🤖 Asking AI to write for: ${name}...`);
        const res = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-5.1",
            response_format: { type: "json_object" }
        });
        return JSON.parse(res.choices[0].message.content);
    } catch (e) { 
        console.error(`   ❌ AI Error: ${e.message}`);
        return { 
            subject: `Partnership Opportunity: AI for ${name}`, 
            body: `Hi ${name} Team,\n\nI noticed you are doing great work in ${location}. I have built a specialized WhatsApp Automation tool tailored for agencies like yours.\n\nCheck my portfolio: https://www.mrkaushalshah.com/\n\nAre you open for a quick chat?` 
        }; 
    }
}

// --- MAIN SCRAPER LOOP ---
async function runScraper() {
    console.log('🔄 Starting Lead Gen Batch...');
    await sheetManager.initSheet(); 

    // 🔥 RANDOMIZE SELECTION 🔥
    const currentNiche = getRandomItem(TARGET_NICHES);
    const currentLocation = getRandomItem(TARGET_LOCATIONS);
    const searchQuery = `${currentNiche} in ${currentLocation}`;

    console.log(`🎲 Strategy: Hunting for '${currentNiche}' in '${currentLocation}'`);

    const browser = await puppeteer.launch({ headless: false });
    const page = await browser.newPage();

    const allLeads = await getMapsLeads(page, searchQuery);
    console.log(`   📍 Found ${allLeads.length} leads.`);

    let processedCount = 0;

    for (const lead of allLeads) {
        if (processedCount >= LEADS_TO_FIND_PER_RUN) break;

        const isDup = await sheetManager.isDuplicate(lead.website);
        if (isDup) {
            console.log(`   ⚠️ Skipping Duplicate: ${lead.name}`);
            continue;
        }

        console.log(`   ⚡ Processing: ${lead.name}`);
        const email = await findEmail(page, lead.website);
        
        if (!email) {
            console.log(`   ❌ No Email. Skipping.`);
            continue; 
        }

        console.log(`   🤖 Generating AI Content...`);
        // Pass Niche and Location to AI for better context
        const aiContent = await generateAIContent(lead.name, lead.website, page, currentNiche, currentLocation);
        
        await sheetManager.addLead({
            name: lead.name,
            website: lead.website,
            email: email,
            subject: aiContent.subject,
            body: aiContent.body,
            industry: currentNiche,     // Saving Niche
            location: currentLocation   // Saving Location
        });

        console.log(`   💾 Saved to Sheet (Status: Ready)`);
        processedCount++;
    }

    await browser.close();
    console.log('💤 Scraper Batch Complete.');
}

const intervalMs = (24 * 60 * 60 * 1000) / RUNS_PER_DAY;
runScraper();
setInterval(runScraper, intervalMs);