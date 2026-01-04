require('dotenv').config();
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { OpenAI } = require('openai');
const sheetManager = require('./sheet-manager');

puppeteer.use(StealthPlugin());

// 🔥 DYNAMIC SEARCH ARRAYS 🔥
const TARGET_LOCATIONS = [
    // 🇪🇺 Europe (Rich & English Friendly)
    'London, UK',
    'Manchester, UK',
    'Birmingham, UK',
    'Berlin, Germany',
    'Munich, Germany',
    'Amsterdam, Netherlands',
    'Dublin, Ireland',
    'Zurich, Switzerland',

    // 🇦🇪 Middle East (High Ticket)
    'Dubai, UAE',
    'Abu Dhabi, UAE',
    'Doha, Qatar',
    'Riyadh, Saudi Arabia',

    // 🇺🇸 North America (Avoid NYC/SF - Too saturated. Go for Tier 2)
    'Austin, USA',
    'Miami, USA',
    'Denver, USA',
    'Toronto, Canada',
    'Vancouver, Canada',

    // 🌏 APAC
    'Singapore',
    'Sydney, Australia',
    'Melbourne, Australia'
];

const TARGET_NICHES = [
    // These agencies serve clients who NEED appointments
    'Real Estate Marketing Agency',
    'Dental Marketing Agency',
    'Medical Marketing Agency',
    'Recruitment Agency',
    'Event Management Agency',
    'Gym Marketing Agency',
    'Web Design Agency',
    'SEO Agency',
    'Lead Generation Agency'
];

const RUNS_PER_DAY = 50; 
const LEADS_TO_FIND_PER_RUN = 50; 

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// --- HELPER: PICK RANDOM ITEM ---
function getRandomItem(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}

async function safeGoto(page, url) {
    try {
        // 1. Load karo aur DOM (Basic HTML) aane ka wait karo
        const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });

        // 2. 🛑 4 SECOND RUKO (Ye sabse zaroori line hai)
        // Site ko scripts run karne ka time do
        await new Promise(r => setTimeout(r, 4000));

        // 3. Agar response error wala hai (404/500), toh fail karo
        if (!response || !response.ok()) {
             // 403 Forbidden aksar bot detection hota hai, usse fail maano
             if(response && response.status() >= 400) {
                 console.log(`   ⚠️ Server returned ${response.status()}`);
                 return false; 
             }
        }
        
        // 4. Check karo ki kya sach mein body load hui hai?
        try {
            await page.waitForSelector('body', { timeout: 5000 });
        } catch(e) {
            console.log("   ⚠️ Body tag not found (Blank Page)");
            return false;
        }

        return true;
    } catch (error) {
        console.log(`   ❌ Failed to load URL: ${url} (Error: ${error.message})`);
        return false;
    }
}

async function getMapsLeads(page, query) {
    let rawLeads = [];

    // 1. Standard Google Maps Search URL use karo (Zyada reliable hai)
    console.log(`\n🔍 Searching Google Maps for: ${query}`);
    
    // 🟢 2. STANDARD URL (Ye best hai desktop view ke liye)
    const url = `https://www.google.com/maps/search/${query.split(' ').join('+')}?hl=en`;
    // Page load hone ka wait karo
    const isLoaded = await safeGoto(page, url);

    if (isLoaded) { 
        try {
            // 🛑 CONSENT FORM HANDLE (Ye zaroori hai Europe/USA ke liye)
            try {
                // Check karo agar 'Accept all' button hai (Google ka popup)
                const consentSelector = 'button[aria-label="Accept all"], button[aria-label="Accept all cookies"], form[action*="consent"] button';
                const consentButton = await page.$(consentSelector);
                if (consentButton) {
                    console.log("   🍪 Clicking Google Consent Cookie...");
                    await consentButton.click();
                    // Click ke baad thoda wait taaki map load ho jaye
                    await new Promise(r => setTimeout(r, 3000));
                }
            } catch (err) {
                // Agar consent button nahi mila toh koi baat nahi, aage badho
            }

            // Ab Feed (List) ka wait karo
            await page.waitForSelector('div[role="feed"]', { timeout: 20000 });
        } catch (e) {
            console.log("   ⚠️ No results found or Feed selector changed.");
            
            // 📸 DEBUG SCREENSHOT (Agar fail hua to ye photo save hogi)
            console.log("   📸 Saving debug screenshot: error_debug.png");
            await page.screenshot({ path: 'error_debug.png' });
            
            return []; 
        }

        // Scroll Logic (Deep Mining)
        await page.evaluate(async () => {
            const wrapper = document.querySelector('div[role="feed"]');
            if(wrapper) {
                for(let i=0; i<30; i++) {  // 30 Times Scroll
                    wrapper.scrollTop = wrapper.scrollHeight;
                    await new Promise(r => setTimeout(r, 1500)); 
                }
            }
        });
    
        // Data Extract
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
        const isLoaded = await safeGoto(page, url);
        
        // 🛑 AGAR PAGE LOAD NAHI HUA, TOH TURANT RUK JAO
        if (!isLoaded) return null; 

        // Agar load hua, tabhi scrape karo
        let email = await page.evaluate(() => {
            const mailto = document.querySelector('a[href^="mailto:"]');
            return mailto ? mailto.href.replace('mailto:', '').split('?')[0] : null;
        });
        return email;
    } catch (e) { return null; }
}

async function generateAIContent(name, website, page, niche, location) {
    let context = "Business";
    try {
        // Context thoda badhaya taaki AI better samjhe
        context = await page.evaluate(() => document.body.innerText.substring(0, 1500));
    } catch (e) {
        console.log(`   ⚠️ Context Scrape Failed for ${name}`);
    }

    const prompt = `
    ROLE: You are Kaushal Shah, a Senior Full-Stack Developer & Agency Partner at Sparqal.
    GOAL: Write a B2B cold email to an Agency Owner (${name}) to partner up for White-Label AI Automation.

    TARGET INFO:
    - Agency Name: ${name}
    - Niche: ${niche}
    - Location: ${location}
    - Website Context: "${context.replace(/\n/g, ' ').substring(0, 600)}"

    YOUR OFFER (The Product):
    - A White-Label WhatsApp AI Receptionist.
    - Agencies resell this to THEIR clients under THEIR brand.
    - It handles 24/7 replies, appointment booking, and Google Calendar sync.

    ---------------------------------------------------
    🛑 INSTRUCTIONS FOR JSON OUTPUT (STRICTLY FOLLOW) 🛑
    ---------------------------------------------------

    1. SUBJECT LINE (Make it HYPER-SPECIFIC & UNIQUE):
       - Do NOT use generic templates like "automation partner for...".
       - Read the WEBSITE CONTEXT above. What do they actually do?
       - If they do Recruitment -> Mention "candidates" or "hiring".
       - If they do Real Estate -> Mention "property inquiries" or "listings".
       - If they do SEO/Marketing -> Mention "client leads" or "bookings".
       - CONSTRAINTS:
         - Keep it SHORT (5-8 words max).
         - Casual tone.
         - No salesy words like "Boost", "Skyrocket", "Growth".

    2. BODY CONTENT:
       - Greeting: MUST start with "Hi ${name} Team," (Do not use [First Name]).
       - Opener: One specific compliment based on their website context (Show you did research).
       - The Pivot: "Most agencies I talk to struggle to offer advanced AI automations to their clients without hiring a full dev team."
       - The Solution: "I've built a plug-and-play WhatsApp AI Receptionist (Appointment Booking + Calendar Sync) that you can white-label and resell immediately."
       - Credibility: "I’m a Senior Full-Stack Dev (4.5+ years) at Sparqal, so this is built for scale."
       - CTA: "I have a 45-second demo video of how it books appointments. Mind if I send it over?"
       - ENDING: STOP HERE. DO NOT ADD "Best, Kaushal" or any signature. My code adds it automatically.

    ---------------------------------------------------
    Output strictly in JSON format: {"subject": "...", "body": "..."}
    `;

    try {
        console.log(`   🤖 Asking AI to write for: ${name}...`);
        const res = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-5.1", // Ya gpt-3.5-turbo agar budget tight hai
            response_format: { type: "json_object" }
        });
        return JSON.parse(res.choices[0].message.content);
    } catch (e) { 
        console.error(`   ❌ AI Error: ${e.message}`);
        return { 
            subject: `question for ${name} team`, 
            body: `Hi ${name} Team,\n\nI was checking out your website and loved your work in ${location}.\n\nMost agencies I talk to want to offer AI Automation to clients but lack the dev team.\n\nI've built a White-Label WhatsApp Bot (Booking + Calendar Sync) that you can resell under your brand.\n\nI have a 45-second demo video. Mind if I send it over?` 
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

    const browser = await puppeteer.launch({
        headless: "new", // ✅ Server ke liye 'true' ya 'new' compulsory hai
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });
    
    const page = await browser.newPage();

    // 🟢 1. SCREEN SIZE BADA KARO (Desktop Mode Force Karo)
    await page.setViewport({ width: 1920, height: 1080 });
    
    // 1. Fake User Agent (Server ko Windows Laptop banao)
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

    // 2. Extra Headers (Real user dikhne ke liye)
    await page.setExtraHTTPHeaders({
        'Accept-Language': 'en-US,en;q=0.9',
    });

    // 3. Block Images & CSS (Speed badhane ke liye - BOHT ZAROORI HAI)
    // 🟢 UPDATED INTERCEPTION LOGIC (Isse Copy-Paste kar)
    await page.setRequestInterception(true);
        
    page.on('request', (req) => {
        const resourceType = req.resourceType();
        
        // 1. Agar ye Main Website (document) hai, toh ROKNA MAT!
        if (resourceType === 'document') {
            req.continue();
            return;
        }

        // 2. Sirf fizool cheezein roko
        if (['image', 'media', 'font', 'stylesheet', 'imageset'].includes(resourceType)) {
            req.abort();
        } else {
            // 3. Scripts aur baki sab jaane do (React sites ke liye zaroori hai)
            req.continue();
        }
    });

    const allLeads = await getMapsLeads(page, searchQuery);
    console.log(`   📍 Found ${allLeads.length} leads.`);

    let processedCount = 0;

    for (const lead of allLeads) {
        if (processedCount >= LEADS_TO_FIND_PER_RUN) break;

        // 🧹 SAFETY FLUSH: Purani website saaf karo taaki data mix na ho
        try { await page.goto('about:blank'); } catch(e) {}

        const isDup = await sheetManager.isDuplicate(lead.website);
        if (isDup) {
            console.log(`   ⚠️ Skipping Duplicate: ${lead.name}`);
            continue;
        }

        console.log(`   ⚡ Processing: ${lead.name}`);
        const email = await findEmail(page, lead.website);
        
        if (!email) {
            console.log(`   ⚠️ No Email Found. Saving to Sheet to ignore next time.`);
            await sheetManager.addLead({
                name: lead.name,
                website: lead.website,
                email: "No Email Found", // Sheet mein ye likha aayega
                subject: "-",
                body: "-",
                industry: currentNiche,
                location: currentLocation,
                status: "No Email" // Status column update ho jayega
            });
            continue; // Ab loop aage badhega, AI generate nahi karega
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