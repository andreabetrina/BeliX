const fs = require('fs');
const path = require('path');
const { EmbedBuilder } = require('discord.js');

const POINTS_FILE = path.join(__dirname, '../points.json');

// Load points data
function loadPoints() {
    if (fs.existsSync(POINTS_FILE)) {
        return JSON.parse(fs.readFileSync(POINTS_FILE, 'utf8'));
    }
    return {};
}

module.exports = {
    handlePointsCommand: (client) => {
        client.on('messageCreate', async (message) => {
            // Ignore bot messages
            if (message.author.bot) return;

            // Check for !points or !leaderboard command
            if (message.content.toLowerCase() === '!points' || message.content.toLowerCase() === '!leaderboard') {
                const points = loadPoints();
                
                if (Object.keys(points).length === 0) {
                    return message.reply('📊 No points have been awarded yet!');
                }

                // Sort users by points (highest first)
                const sortedUsers = Object.entries(points)
                    .sort((a, b) => b[1].points - a[1].points)
                    .slice(0, 10); // Top 10

                let leaderboardText = '';
                sortedUsers.forEach((entry, index) => {
                    const [userId, userData] = entry;
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '📍';
                    leaderboardText += `${medal} **${index + 1}. ${userData.username}** - ${userData.points} points\n`;
                });

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setTitle('🏆 Leaderboard')
                    .setDescription(leaderboardText)
                    .setFooter({ text: 'Use !mypoints to check your personal points' })
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            }

            // Check for !mypoints command
            if (message.content.toLowerCase() === '!mypoints') {
                const points = loadPoints();
                const userPoints = points[message.author.id];

                if (!userPoints) {
                    return message.reply('📊 You don\'t have any points yet! Post in #blitz-daily-progress to earn points.');
                }

                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('📊 Your Points')
                    .addFields(
                        { name: 'Username', value: userPoints.username, inline: true },
                        { name: 'Total Points', value: `${userPoints.points}`, inline: true },
                        { name: 'Last Update', value: new Date(userPoints.lastUpdate).toLocaleString(), inline: false }
                    )
                    .setTimestamp();

                return message.reply({ embeds: [embed] });
            }
        });
    }
};
