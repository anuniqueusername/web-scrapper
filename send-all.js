const fs = require('fs');
const path = require('path');
const axios = require('axios');
require('dotenv').config();

const OUTPUT_FILE = path.join(__dirname, 'data', 'listings.json');
const discordWebhookUrl = process.env.DISCORD_WEBHOOK_URL;

async function sendAllListings() {
  if (!discordWebhookUrl) {
    console.error('❌ Discord webhook URL not configured in .env file');
    process.exit(1);
  }

  try {
    // Read existing listings
    if (!fs.existsSync(OUTPUT_FILE)) {
      console.error('❌ No listings.json file found. Run the scraper first.');
      process.exit(1);
    }

    const listings = JSON.parse(fs.readFileSync(OUTPUT_FILE, 'utf-8'));

    if (!Array.isArray(listings) || listings.length === 0) {
      console.error('❌ No listings found in listings.json');
      process.exit(1);
    }

    console.log(`📝 Found ${listings.length} total listings. Sending to Discord...`);

    // Send in batches of 10 (Discord limit)
    const batchSize = 10;
    for (let i = 0; i < listings.length; i += batchSize) {
      const batch = listings.slice(i, i + batchSize);
      const batchNumber = Math.floor(i / batchSize) + 1;
      const totalBatches = Math.ceil(listings.length / batchSize);

      console.log(`\n📤 Sending batch ${batchNumber}/${totalBatches}...`);

      // Create embeds for this batch
      const embeds = batch.map(listing => {
        const embed = {
          title: listing.title || 'Untitled',
          url: listing.url || undefined,
          color: 3447003, // Blue color
          fields: [
            {
              name: 'Price',
              value: listing.price || 'N/A',
              inline: true
            },
            {
              name: 'Location',
              value: listing.location || 'N/A',
              inline: true
            },
            {
              name: 'Posted',
              value: listing.date || 'N/A',
              inline: false
            }
          ],
          timestamp: listing.scrapedAt || new Date().toISOString()
        };

        if (listing.description) {
          embed.description = listing.description.substring(0, 200) + (listing.description.length > 200 ? '...' : '');
        }

        if (listing.image) {
          embed.image = { url: listing.image };
        }

        return embed;
      });

      const payload = {
        content: `📋 **Batch ${batchNumber}/${totalBatches}** - ${batch.length} listings`
      };

      if (embeds.length > 0) {
        payload.embeds = embeds;
      }

      try {
        const response = await axios.post(discordWebhookUrl, payload, {
          headers: {
            'Content-Type': 'application/json'
          }
        });
        console.log(`   ✅ Batch ${batchNumber} sent successfully! Status: ${response.status}`);
        console.log(`   📋 Listings in this batch:`);
        batch.forEach((listing, index) => {
          console.log(`      ${index + 1}. "${listing.title}" - ${listing.price} (${listing.location})`);
          console.log(`         URL: ${listing.url}`);
        });
      } catch (error) {
        console.error(`   ❌ Failed to send batch ${batchNumber}`);
        if (error.response) {
          console.error(`   Status: ${error.response.status}`);
          console.error(`   Response: ${JSON.stringify(error.response.data)}`);
        } else {
          console.error(`   Message: ${error.message}`);
        }
      }

      // Add delay between batches to avoid rate limiting
      if (i + batchSize < listings.length) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`\n✅ All ${listings.length} listings sent to Discord!`);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

sendAllListings();
