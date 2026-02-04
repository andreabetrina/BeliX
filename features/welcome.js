const { EmbedBuilder } = require('discord.js');

// Create welcome embed
function createWelcomeEmbed(member, memberNumber) {
    const displayName = member.displayName || member.user.username;
    return new EmbedBuilder()
        .setColor('#d5a147')
        .setTitle('🎉 Welcome to Belmonts!')
        .setDescription(
            `**Welcome ${displayName}!**\n\n` +
            `You're officially part of a community where developers, sysadmins, AI/ML explorers, data scientists, and hardware tinkerers all come together. 🎉\n\n` +
            `You are member **#${memberNumber}**`
        )
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setTimestamp()
        .setFooter({ text: 'Belmonts Server' });
}

function findWelcomeChannel(guild) {
    // First try environment variable
    const channelId = process.env.introduction;
    if (channelId) {
        const channel = guild.channels.cache.get(channelId);
        if (channel && channel.isTextBased() && channel.permissionsFor(guild.members.me)?.has('SendMessages')) {
            return channel;
        }
    }
    // Fallback to name matching
    const preferred = ['introduction', 'introductions', 'welcome', 'general'];
    return guild.channels.cache.find(
        ch => ch.isTextBased()
            && ch.permissionsFor(guild.members.me)?.has('SendMessages')
            && preferred.includes(ch.name.toLowerCase())
    ) || guild.systemChannel || guild.channels.cache.find(
        ch => ch.isTextBased() && ch.permissionsFor(guild.members.me)?.has('SendMessages')
    );
}

// Welcome message when a new member joins
function handleWelcomeMessage(client) {
    client.on('guildMemberAdd', async member => {
        try {
            console.log(`[NEW MEMBER] ${member.user.tag} joined!`);
            
            const memberNumber = member.guild.memberCount;
            console.log(`Total members: ${memberNumber}`);
            
            // Find introduction channel
            const channel = findWelcomeChannel(member.guild);
            
            console.log(`Channel found: ${channel ? channel.name : 'not found'}`);
            
            if (!channel) {
                console.log('No welcome channel found!');
                return;
            }

            const welcomeEmbed = createWelcomeEmbed(member, memberNumber);
            await channel.send({
                content: `${member}`,
                embeds: [welcomeEmbed],
            });
            console.log(`Welcome message sent to ${member.user.tag}`);
        } catch (err) {
            console.error('Failed to send welcome message', err);
        }
    });
}

module.exports = {
    createWelcomeEmbed,
    findWelcomeChannel,
    handleWelcomeMessage,
};
