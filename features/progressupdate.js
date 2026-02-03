const fs = require('fs');
const path = require('path');
const { getMemberByDiscordUsername, addBelmontsPointsByDiscordUsername, addPoints } = require('../database/db');

const pointsFilePath = path.join(__dirname, '..', 'json', 'points.json');

function loadPointsFile() {
    try {
        const raw = fs.readFileSync(pointsFilePath, 'utf8');
        return JSON.parse(raw);
    } catch (error) {
        return {};
    }
}

function savePointsFile(data) {
    fs.writeFileSync(pointsFilePath, JSON.stringify(data, null, 2));
}

module.exports = {
    handleProgressUpdate: (client) => {
        client.on('messageCreate', async (message) => {
            // Only process messages from "I Run Code" bot in vibe-coding channel
            if (message.author.bot && 
                message.author.username === 'I Run Code' && 
                message.channel.name?.includes('vibe-coding')) {
                
                // Check if message contains "Here is your python(...) output"
                if (message.content.includes('Here is your python') && 
                    message.content.includes('output')) {
                    
                    // Get the mentioned user from the message
                    const mentionedUser = message.mentions.users.first();
                    
                    if (mentionedUser) {
                        const userId = mentionedUser.id;
                        const username = mentionedUser.username;
                        const pointsToAward = 5; // 5 points for successful code execution
                        
                        const existingMember = await getMemberByDiscordUsername(username);
                        let newPoints = null;

                        if (existingMember) {
                            // Award points and also add to points table for history
                            newPoints = await addBelmontsPointsByDiscordUsername(username, pointsToAward);
                            
                            // Also add to points table
                            await addPoints(existingMember.member_id, pointsToAward);
                        } else {
                            const pointsData = loadPointsFile();
                            const current = pointsData[userId]?.points || 0;
                            newPoints = current + pointsToAward;
                            pointsData[userId] = {
                                username,
                                points: newPoints,
                                lastUpdate: new Date().toISOString(),
                            };
                            savePointsFile(pointsData);
                        }

                        console.log(`✓ Awarded ${pointsToAward} points to ${username} for code execution! Total: ${newPoints ?? pointsToAward}`);
                        
                        // Reply to acknowledge
                        try {
                            await message.reply({
                                content: `🎉 <@${userId}> earned **+${pointsToAward} points** for running code successfully! Total: **${newPoints ?? pointsToAward}**`
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
