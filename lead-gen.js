const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { OpenAI } = require('openai');
const sheetManager = require('./sheet-manager');

puppeteer.use(StealthPlugin());

// --- CONFIGURATION ---
const OPENAI_KEY = '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';
const TARGET_NICHE = 'Digital Marketing Agency'; 
const TARGET_LOCATION = 'Germany';
const GOOGLE_MAPS_SEARCH_QUERY = `${TARGET_NICHE} in ${TARGET_LOCATION}`;
const RUNS_PER_DAY = 50; 
const LEADS_TO_FIND_PER_RUN = 50; 

const openai = new OpenAI({ apiKey: OPENAI_KEY });

// --- HELPER FUNCTIONS ---

async function getMapsLeads(page, query) {
    console.log(`\n🔍 Searching Google Maps for: ${query}`);
    await page.goto(`https://www.google.com/maps/search/${query.split(' ').join('+')}`, { waitUntil: 'networkidle2' });
    try { await page.waitForSelector('div[role="feed"]', { timeout: 15000 }); } catch (e) {}

    await page.evaluate(async () => {
        const wrapper = document.querySelector('div[role="feed"]');
        if(wrapper) {
            for(let i=0; i<5; i++) { 
                wrapper.scrollTop = wrapper.scrollHeight;
                await new Promise(r => setTimeout(r, 2000)); 
            }
        }
    });

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
    return rawLeads.filter(l => l.website);
}

async function findEmail(page, url) {
    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        let email = await page.evaluate(() => {
            const mailto = document.querySelector('a[href^="mailto:"]');
            return mailto ? mailto.href.replace('mailto:', '').split('?')[0] : null;
        });
        return email;
    } catch (e) { return null; }
}

async function generateAIContent(name, website, page) {
    let context = "Business";
    try {
        context = await page.evaluate(() => document.body.innerText.substring(0, 800));
    } catch (e) {}

    const prompt = `
    Context: You are writing a cold email to ${name}, which is a ${TARGET_NICHE} based in or targeting ${TARGET_LOCATION}.
    Their Website Content Snippet: "${context.replace(/\n/g, ' ')}".
    
    Your Identity: Kaushal Shah, Senior Full-Stack Developer & Founder of Sparqal.
    Your Asset: A Live Portfolio (mrkaushalshah.com) and a proven Automation System.
    
    EMAIL STRUCTURE (Strictly follow this order):
    1. Greeting: Hi ${name} Team,
    2. The Hook: Direct statement about how an AI Receptionist/Automation can scale a ${TARGET_NICHE}.
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
        const res = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-5.1",
            response_format: { type: "json_object" }
        });
        return JSON.parse(res.choices[0].message.content);
    } catch (e) { 
        return { subject: "Partnership Opportunity", body: "Hi, check my portfolio mrkaushalshah.com" }; 
    }
}

// --- MAIN SCRAPER LOOP ---
async function runScraper() {
    console.log('🔄 Starting Lead Gen Batch...');
    await sheetManager.initSheet(); 

    const browser = await puppeteer.launch({ headless: true }); // Headless False for Maps
    const page = await browser.newPage();

    const allLeads = await getMapsLeads(page, GOOGLE_MAPS_SEARCH_QUERY);
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
        const aiContent = await generateAIContent(lead.name, lead.website, page);
        
        await sheetManager.addLead({
            name: lead.name,
            website: lead.website,
            email: email,
            subject: aiContent.subject,
            body: aiContent.body
        });

        console.log(`   💾 Saved to Sheet (Status: Ready)`);
        processedCount++;
    }

    await browser.close();
    console.log('💤 Scraper Batch Complete.');
}

// Schedule
const intervalMs = (24 * 60 * 60 * 1000) / RUNS_PER_DAY;
runScraper();
setInterval(runScraper, intervalMs);