const { getMemberByDiscordUsername, addPoints, incrementProblemsSolved } = require('../database/db');
const { TIMEZONE } = require('../utils/timezoneUtils');
const fs = require('fs');
const path = require('path');

const VIBE_CODING_CHANNEL_ID = '1362052133570220123';
const MOTIVATION_MESSAGE = '💪 Keep going! Errors are part of learning. Fix it and try again!';
const ROOKIES_DATA = path.join(__dirname, '../json/rookiesData.json');
const DAILY_POINTS_FILE = path.join(__dirname, '../json/dailyPoints.json');

// Helper function to log unfound members to JSON file
async function rookiesData(username, userId, channel) {
    try {
        let data = { rookiesmembersData: [], lastUpdated: null };
        
        // Read existing file if it exists
        if (fs.existsSync(ROOKIES_DATA)) {
            const fileContent = fs.readFileSync(ROOKIES_DATA, 'utf-8');
            data = JSON.parse(fileContent);
        }

        // Check if member already exists in the list
        const existingEntry = data.rookiesmembersData.find(m => m.username === username);
        
        const timestamp = new Date().toISOString();
        
        if (existingEntry) {
            // Update count and last seen
            existingEntry.count = (existingEntry.count || 1) + 1;
            existingEntry.lastSeen = timestamp;
        } else {
            // Add new entry
            data.rookiesmembersData.push({
                username,
                userId,
                channel,
                firstSeen: timestamp,
                lastSeen: timestamp,
                count: 1,
            });
        }

        data.lastUpdated = timestamp;

        // Write back to file
        fs.writeFileSync(ROOKIES_DATA, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error logging unfound member:', error.message);
    }
}

function getTodayKey() {
    return new Intl.DateTimeFormat('en-CA', {
        timeZone: TIMEZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    }).format(new Date());
}

function readDailyPointsLog() {
    if (!fs.existsSync(DAILY_POINTS_FILE)) {
        return { awards: {}, lastUpdated: null };
    }

    try {
        const fileContent = fs.readFileSync(DAILY_POINTS_FILE, 'utf-8');
        if (!fileContent.trim()) {
            return { awards: {}, lastUpdated: null };
        }
        return JSON.parse(fileContent);
    } catch (error) {
        console.error('Error reading daily points log:', error.message);
        writeDailyPointsLog({ awards: {}, lastUpdated: null });
        return { awards: {}, lastUpdated: null };
    }
}

function writeDailyPointsLog(data) {
    try {
        fs.writeFileSync(DAILY_POINTS_FILE, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing daily points log:', error.message);
    }
}

module.exports = {
    handleProgressUpdate: (client) => {
        client.on('messageCreate', async (message) => {

            // Only process messages from "I Run Code" bot in vibe-coding channel
            if (message.author.bot && 
                message.author.username === 'I Run Code' && 
                message.channel?.id === VIBE_CODING_CHANNEL_ID) {
                
                const isSuccessOutput = message.content.includes('Here is your ') &&
                    message.content.includes(' output') &&
                    !message.content.includes('error output');
                const isErrorOutput = message.content.includes('error output') ||
                    message.content.includes('I only received ');

                if (isErrorOutput) {
                    const mentionedUser = message.mentions.users.first();
                    if (mentionedUser) {
                        try {
                            await message.reply({
                                content: `👋 <@${mentionedUser.id}> ${MOTIVATION_MESSAGE}`,
                            });
                        } catch (error) {
                            console.error('Could not send motivation reply:', error.message);
                        }
                    }
                    return;
                }

                // Check if message contains "Here is your <language>(...) output"
                if (isSuccessOutput) {
                    
                    // Get the mentioned user from the message
                    const mentionedUser = message.mentions.users.first();
                    
                    if (mentionedUser) {
                        const userId = mentionedUser.id;
                        const username = mentionedUser.username;
                        const pointsToAward = 5; // 5 points for successful code execution
                        
                        const existingMember = await getMemberByDiscordUsername(username);
                        let newPoints = null;

                        if (existingMember) {
                            const dailyLog = readDailyPointsLog();
                            const todayKey = getTodayKey();
                            const memberId = String(existingMember.member_id);
                            const lastAwardedDate = dailyLog.awards[memberId]?.lastAwardedDate;

                            if (lastAwardedDate === todayKey) {
                                try {
                                    await message.reply({
                                        content: `✅ <@${userId}> You already earned today's **+${pointsToAward} points**. Keep solving and come back tomorrow!`,
                                    });
                                } catch (error) {
                                    console.error('Could not send daily limit reply:', error.message);
                                }
                                return;
                            }

                            newPoints = await addPoints(existingMember.member_id, pointsToAward);
                            if (newPoints !== null) {
                                await incrementProblemsSolved(existingMember.member_id);
                                dailyLog.awards[memberId] = {
                                    username,
                                    lastAwardedDate: todayKey,
                                    lastAwardedAt: new Date().toISOString(),
                                };
                                dailyLog.lastUpdated = new Date().toISOString();
                                writeDailyPointsLog(dailyLog);
                            }
                        } else {
                            // Log unfound member to JSON file
                            await rookiesData(username, userId, message.channel?.name);
                        }
                        
                        // Reply to acknowledge
                        try {
                            const totalLabel = newPoints !== null ? newPoints : '(updating)';
                            await message.reply({
                                content: `🎉 <@${userId}> earned **+${pointsToAward} points** for running code successfully! Total: **${totalLabel}**`
                            });
                        } catch (error) {
                            console.error('Could not send reply:', error.message);
                        }
                    }
                }
            }
        });
    }
};
