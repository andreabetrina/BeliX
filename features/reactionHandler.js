const fs = require('fs');
const path = require('path');

const POINTS_FILE = path.join(__dirname, '../points.json');

// Load points data
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

module.exports = {
    handleReactionPoints: (client) => {
        // Track reactions to prevent duplicate points
        const reactionTracked = new Set();

        console.log('✓ Reaction handler loaded');

        client.on('messageReactionAdd', async (reaction, user) => {
            console.log(`Reaction detected: ${user.username} reacted with ${reaction.emoji.name}`);
            
            // Ignore bot reactions
            if (user.bot) {
                console.log('Ignoring bot reaction');
                return;
            }

            try {
                // Fetch full reaction if needed
                if (reaction.partial) {
                    await reaction.fetch();
                }

                // Create unique key for this reaction
                const reactionKey = `${reaction.message.id}-${user.id}-${reaction.emoji.name}`;
                
                // Check if we already tracked this reaction
                if (reactionTracked.has(reactionKey)) {
                    console.log('Reaction already tracked');
                    return;
                }

                const points = loadPoints();
                const pointsToAward = 1; // 1 point per emoji reaction

                if (!points[user.id]) {
                    points[user.id] = {
                        username: user.username,
                        points: 0,
                        lastUpdate: new Date().toISOString()
                    };
                }

                points[user.id].points += pointsToAward;
                points[user.id].lastUpdate = new Date().toISOString();

                savePoints(points);
                reactionTracked.add(reactionKey);

                console.log(`✓ Awarded ${pointsToAward} point to ${user.username} for reacting with ${reaction.emoji.name}! Total: ${points[user.id].points}`);

            } catch (error) {
                console.error('Error handling reaction:', error);
            }
        });

        client.on('messageReactionRemove', async (reaction, user) => {
            // Ignore bot reactions
            if (user.bot) return;

            try {
                // Remove the reaction from tracking when undone
                const reactionKey = `${reaction.message.id}-${user.id}-${reaction.emoji.name}`;
                reactionTracked.delete(reactionKey);

                console.log(`Reaction removed by ${user.username}`);

            } catch (error) {
                console.error('Error handling reaction removal:', error);
            }
        });
    }
};
