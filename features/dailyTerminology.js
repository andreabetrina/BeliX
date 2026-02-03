const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const TERMINOLOGY_FILE = path.join(__dirname, '../terminologies.json');

/**
 * Load terminologies from file
 */
function loadTerminologies() {
    try {
        const data = fs.readFileSync(TERMINOLOGY_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Failed to load terminologies:', error);
        return { terminologies: [], currentIndex: 0, lastPostedDate: '' };
    }
}

/**
 * Save terminologies to file
 */
function saveTerminologies(data) {
    try {
        fs.writeFileSync(TERMINOLOGY_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Failed to save terminologies:', error);
    }
}

/**
 * Find the common hall channel
 */
function findCommonHallChannel(guild) {
    // Look for channels with "common", "hall", "general" in name
    const channelNames = ['common-hall', 'commonhall', 'common', 'hall', 'general'];
    
    return guild.channels.cache.find(ch => 
        ch.isTextBased() && 
        channelNames.some(name => ch.name.toLowerCase().includes(name))
    );
}

/**
 * Post daily terminology
 */
async function postDailyTerminology(client) {
    const data = loadTerminologies();
    
    if (!data.terminologies || data.terminologies.length === 0) {
        console.log('No terminologies available to post.');
        return;
    }
    
    // Get current terminology
    const terminology = data.terminologies[data.currentIndex];
    
    // Create embed
    const embed = new EmbedBuilder()
        .setColor('#4a90e2')
        .setTitle(`📚 Daily Tech Term: ${terminology.term}`)
        .setDescription(terminology.definition)
        .addFields(
            { name: '📂 Category', value: terminology.category, inline: true },
            { name: '📅 Term #', value: `${data.currentIndex + 1}/${data.terminologies.length}`, inline: true }
        )
        .setFooter({ text: 'Learn something new every day! 🚀' })
        .setTimestamp();
    
    // Post to all guilds
    for (const guild of client.guilds.cache.values()) {
        const channel = findCommonHallChannel(guild);
        
        if (channel) {
            try {
                await channel.send({ embeds: [embed] });
                console.log(`✓ Posted daily terminology to ${channel.name} in ${guild.name}`);
            } catch (error) {
                console.error(`Failed to post terminology in ${guild.name}:`, error.message);
            }
        } else {
            console.log(`⚠ No common hall channel found in ${guild.name}`);
        }
    }
    
    // Update index for next day (cycle through)
    data.currentIndex = (data.currentIndex + 1) % data.terminologies.length;
    data.lastPostedDate = new Date().toISOString();
    saveTerminologies(data);
    
    console.log(`Next terminology index: ${data.currentIndex}`);
}

/**
 * Schedule daily terminology posting at 8:00 PM
 */
function scheduleDailyTerminology(client) {
    // Calculate time until next 8:00 PM
    function getTimeUntil8PM() {
        const now = new Date();
        const target = new Date();
        target.setHours(20, 0, 0, 0); // 8:00 PM
        
        // If it's already past 8 PM today, schedule for tomorrow
        if (now > target) {
            target.setDate(target.getDate() + 1);
        }
        
        return target - now;
    }
    
    // Schedule the first posting
    function scheduleNext() {
        const delay = getTimeUntil8PM();
        console.log(`📅 Next terminology post scheduled in ${Math.round(delay / 1000 / 60)} minutes (8:00 PM)`);
        
        setTimeout(async () => {
            await postDailyTerminology(client);
            // Schedule the next one (24 hours later)
            scheduleNext();
        }, delay);
    }
    
    scheduleNext();
}

/**
 * Initialize daily terminology feature
 */
function handleDailyTerminology(client) {
    client.once('ready', () => {
        console.log('✓ Daily terminology scheduler initialized');
        scheduleDailyTerminology(client);
    });
}

module.exports = { 
    handleDailyTerminology, 
    postDailyTerminology,
    loadTerminologies,
    saveTerminologies
};
