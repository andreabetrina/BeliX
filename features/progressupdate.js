const fs = require('fs');
const path = require('path');

const POINTS_FILE = path.join(__dirname, '../points.json');

// Load or initialize points data
function loadPoints() {
    if (fs.existsSync(POINTS_FILE)) {
        return JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8'));
    }
    return {};
}

// Save points data
function savePoints(points) {
    fs.writeFileSync(POINTS_FILE, JSON.stringify(points, null, 2));
}

// Track which users have posted progress today
const progressPostedToday = new Set();

module.exports = {
    handleProgressUpdate: (client) => {
        // Reset daily tracker at midnight
        const resetDailyTracker = () => {
            progressPostedToday.clear();
        };

        // Set interval to reset at midnight
        setInterval(() => {
            const now = new Date();
            const nextMidnight = new Date(now);
            nextMidnight.setHours(24, 0, 0, 0);
            const timeUntilMidnight = nextMidnight - now;
            setTimeout(resetDailyTracker, timeUntilMidnight);
        }, 86400000); // Check every 24 hours

        client.on('messageCreate', async (message) => {
            // Ignore bot messages
            if (message.author.bot) return;

            // Log all messages for debugging
            console.log(`Message in ${message.channel.name}: ${message.author.username}`);

            // Check if message is in the daily progress channel
            const progressChannelNames = ['blitz-daily-progress', 'daily-progress', 'progress', 'daily'];
            const channelMatch = progressChannelNames.some(name => 
                message.channel.name?.toLowerCase().includes(name.toLowerCase())
            );

            if (channelMatch) {
                const userId = message.author.id;
                
                // Award points only once per user per day
                if (!progressPostedToday.has(userId)) {
                    const points = loadPoints();
                    const pointsToAward = 5; // 5 points for daily progress update
                    
                    if (!points[userId]) {
                        points[userId] = {
                            username: message.author.username,
                            points: 0,
                            lastUpdate: new Date().toISOString()
                        };
                    }
                    
                    points[userId].points += pointsToAward;
                    points[userId].lastUpdate = new Date().toISOString();
                    
                    savePoints(points);
                    progressPostedToday.add(userId);
                    
                    console.log(`✓ Awarded ${pointsToAward} points to ${message.author.username} for daily progress update!`);
                    
                    // Reply to user
                    try {
                        await message.reply({
                            content: `✅ **Daily Progress Recorded!**\nYou earned **+${pointsToAward} points**!\nTotal Points: **${points[userId].points}**`
                        });
                    } catch (error) {
                        console.error('Could not send reply:', error.message);
                    }
                } else {
                    try {
                        await message.reply({
                            content: '⚠️ You\'ve already posted your daily progress today! Check back tomorrow.'
                        });
                    } catch (error) {
                        console.error('Could not send reply:', error.message);
                    }
                }
            }
        });
    }
};
