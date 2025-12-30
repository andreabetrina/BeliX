const { EmbedBuilder } = require('discord.js');

// Create welcome embed
function createWelcomeEmbed(member, memberNumber) {
    const displayName = member.displayName || member.user.username;
    return new EmbedBuilder()
        .setColor('#d5a147')
        .setTitle('🎉 Welcome to Belmonts!')
        .setDescription(`**Welcome ${displayName}!**\n\nYou are member **#${memberNumber}**`)
        .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setTimestamp()
        .setFooter({ text: 'Belmonts Server' });
}

function findWelcomeChannel(guild) {
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
            
            // Find introduction channel with emoji
            const channel = member.guild.channels.cache.find(ch => 
                ch.isTextBased() && 
                (ch.name.toLowerCase().includes('introduction') || ch.name.includes('⌛'))
            );
            
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
