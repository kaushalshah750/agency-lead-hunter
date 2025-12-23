# 🕵️ Agency Lead Hunter Bot

> **Automated Lead Generation Suite built during the "₹1 Lakh in 30 Days" Challenge.**

A high-performance Node.js automation tool designed to scrape, filter, and enrich B2B leads from Google Maps and Agency Directories. This bot automates the process of finding high-ticket agencies in specific regions (e.g., Dubai) and extracting decision-maker contact details.

## 🚀 Features

* **Google Maps Sniper:** Auto-scrolls and scrapes unlimited business listings (Name, Website, Ratings) from Google Maps.
* **Stealth Mode:** Uses `puppeteer-extra-plugin-stealth` to bypass Cloudflare and anti-bot detections.
* **Email Hunter:** autonomously visits scraped websites, scans "Contact" pages, and extracts hidden emails (CEO/Info).
* **CSV Pipeline:** Automatically saves and organizes data into clean CSV formats for CRM integration.
* **Error Handling:** Robust retry logic for network timeouts and navigation errors.

## 🛠️ Tech Stack

* **Runtime:** Node.js
* **Automation:** Puppeteer (Headless Chrome)
* **Data Handling:** `csv-writer`, `csv-parser`
* **Bypass Techniques:** User-Agent Rotation, Stealth Plugin

## 📦 Installation

1.  **Clone the repository:**
    ```bash
    git clone [https://github.com/mrkaushalshah/agency-lead-hunter.git](https://github.com/mrkaushalshah/agency-lead-hunter.git)
    cd agency-lead-hunter
    ```

2.  **Install dependencies:**
    ```bash
    npm install
    ```

## ⚡ Usage

### Step 1: Scrape Google Maps
Target a specific niche (e.g., "Marketing Agencies in Dubai") and generate a base list.

```bash
node maps.js
```
Output: dubai_maps_leads.csv

Step 2: Extract Emails
Feed the list into the hunter bot to visit websites and find contact info.

```bash
node email-hunter.js
```
Output: dubai_final_leads.csv

⚠️ Disclaimer
This tool is created for educational purposes and personal workflow automation as part of a public business challenge. Please respect robots.txt and terms of service of target websites.

👨‍💻 Author
Kaushal Shah

Portfolio: www.mrkaushalshah.com

LinkedIn: Kaushal Shah

Challenge: The ₹1 Lakh Roadmap

Built with 💻 and ☕ by Kaushal.