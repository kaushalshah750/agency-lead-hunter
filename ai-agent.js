const fs = require('fs');
const csv = require('csv-parser');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { OpenAI } = require('openai');

puppeteer.use(StealthPlugin());

// --- CONFIGURATION ---
const API_KEY = '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'; // <--- PASTE YOUR KEY HERE
const INPUT_FILE = 'dubai_final_leads.csv'; // Your list with emails
const OUTPUT_FILE = 'dubai_ready_to_send.csv'; // Final list with scripts

const openai = new OpenAI({ apiKey: API_KEY });

const csvWriter = createCsvWriter({
    path: OUTPUT_FILE,
    header: [
        {id: 'name', title: 'AGENCY NAME'},
        {id: 'website', title: 'WEBSITE'},
        {id: 'email', title: 'EMAIL'},
        {id: 'generated_email', title: 'AI_DRAFTED_EMAIL'}
    ]
});

// Function to Scrape "About Us" or "Home" text
async function scrapeSiteContext(page, url) {
    try {
        console.log(`   Trying to read: ${url}`);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 15000 });
        
        // Extract H1, H2, and Paragraphs to understand what they do
        const content = await page.evaluate(() => {
            const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map(h => h.innerText);
            const paragraphs = Array.from(document.querySelectorAll('p')).slice(0, 5).map(p => p.innerText); // First 5 paragraphs
            return [...headings, ...paragraphs].join('\n').substring(0, 2000); // Limit to 2000 chars to save tokens
        });
        return content;
    } catch (error) {
        console.log(`   ⚠️ Could not read website content.`);
        return "Digital Marketing Agency in Dubai."; // Fallback context
    }
}

// Function to Call OpenAI
async function generateColdEmail(agencyName, agencyContext) {
    const prompt = `
    You are an expert sales copywriter. Write a "Trojan Horse" cold email to the CEO of ${agencyName}.
    
    CONTEXT ON AGENCY:
    ${agencyContext}
    
    MY OFFER:
    I am Kaushal Shah, a Senior Full-Stack Developer (Node.js/React). 
    I have built a "WhatsApp Automation Bot with 2-way Google Calendar Sync" for Dentists/Real Estate.
    I want to partner with this agency: They sell my bot to their clients (white-label), I handle the tech.
    
    INSTRUCTIONS:
    1. Keep it under 150 words.
    2. Mention something specific from their context (e.g. "I saw your work on X" or "I saw your blog on Y") if available.
    3. Tone: Professional, direct, peer-to-peer (not begging).
    4. Call To Action: "Are you open to a 5-min chat?"
    5. Include my portfolio: www.mrkaushalshah.com
    6. Include my demo link: https://youtu.be/8LzFZKeCnfY
    
    Output ONLY the email body. No subject line.
    `;

    try {
        const completion = await openai.chat.completions.create({
            messages: [{ role: "user", content: prompt }],
            model: "gpt-5.1", // Using the cheap/free model you have access to
        });
        return completion.choices[0].message.content;
    } catch (error) {
        console.log('   ❌ OpenAI API Error:', error.message);
        return "Error generating email.";
    }
}

(async () => {
    console.log('\x1b[33m%s\x1b[0m', '🚀 LAUNCHING AI SALES AGENT...');
    
    const leads = [];
    
    // Read CSV
    await new Promise((resolve) => {
        fs.createReadStream(INPUT_FILE)
            .pipe(csv())
            .on('data', (row) => leads.push(row))
            .on('end', resolve);
    });

    console.log(`📂 Loaded ${leads.length} Leads. Starting processing...`);

    const browser = await puppeteer.launch({ headless: true });
    const page = await browser.newPage();
    
    const finalData = [];

    // Process only first 10 for testing (Remove limit later)
    for (let i = 0; i < leads.length; i++) {
        const lead = leads[i];
        
        // Only process if we have a website
        if (lead['WEBSITE'] && lead['WEBSITE'].includes('http')) {
            console.log(`\n🤖 Processing [${i+1}/${leads.length}]: ${lead['AGENCY NAME']}...`);
            
            // 1. Scrape Context
            const context = await scrapeSiteContext(page, lead['WEBSITE']);
            
            // 2. Write Email
            console.log('   ✍️  AI is writing the email...');
            const emailScript = await generateColdEmail(lead['AGENCY NAME'], context);
            
            // 3. Save
            finalData.push({
                name: lead['AGENCY NAME'],
                website: lead['WEBSITE'],
                email: lead['EMAIL found'] || lead['email'] || 'Manual Search', // Adjust based on your CSV header
                generated_email: emailScript
            });
            
            console.log('   ✅ Draft Saved.');
            
            // Small delay to avoid rate limits
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    await csvWriter.writeRecords(finalData);
    console.log('\n\x1b[32m%s\x1b[0m', '💾 ALL EMAILS GENERATED. Saved to dubai_ready_to_send.csv');
    
    await browser.close();
})();