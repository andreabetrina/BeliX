const { ChannelType, PermissionFlagsBits } = require('discord.js');

/**
 * Ensures the chamber-of-chess channel exists in all guilds
 */
async function ensureChessChannel(guild) {
    const channelName = 'chamber-of-chess';
    
    // Check if the channel already exists
    const existingChannel = guild.channels.cache.find(
        channel => channel.name === channelName && channel.type === ChannelType.GuildText
    );
    
    if (existingChannel) {
        console.log(`✓ Channel #${channelName} already exists in ${guild.name}`);
        return existingChannel;
    }
    
    try {
        // Check if bot has permission to manage channels
        const botMember = guild.members.cache.get(guild.client.user.id);
        if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
            console.warn(`⚠ Bot lacks "Manage Channels" permission in ${guild.name}. Cannot create #${channelName}.`);
            console.warn(`   Please grant the bot "Manage Channels" permission in Server Settings > Roles.`);
            return null;
        }

        // Create the chamber-of-chess channel
        const channel = await guild.channels.create({
            name: channelName,
            type: ChannelType.GuildText,
            topic: '♟️ A place for all chess enthusiasts to discuss strategies, games, and challenges!',
            reason: 'Automatic channel creation by BeliX bot',
        });
        
        console.log(`✓ Created #${channelName} channel in ${guild.name}`);
        return channel;
    } catch (error) {
        console.error(`Failed to create #${channelName} in ${guild.name}:`, error.message);
        return null;
    }
}

/**
 * Setup automatic channel creation
 */
function handleChannelSetup(client) {
    // Create channel when bot is ready (for existing guilds)
    client.once('ready', async () => {
        console.log('Setting up chamber-of-chess channel in all servers...');
        
        for (const guild of client.guilds.cache.values()) {
            await ensureChessChannel(guild);
        }
    });
    
    // Create channel when bot joins a new guild
    client.on('guildCreate', async (guild) => {
        console.log(`Joined new server: ${guild.name}`);
        await ensureChessChannel(guild);
    });
}

module.exports = { handleChannelSetup, ensureChessChannel };

        channel => channel.name === channelName && channel.type === ChannelType.GuildT