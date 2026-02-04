const { EmbedBuilder, ChannelType } = require('discord.js');
const { getMembersWithBirthdayToday } = require('../database/db');

const BIRTHDAY_CHECK_HOUR = 6; // 6:00 AM
const BIRTHDAY_CHECK_MINUTE = 0;

/**
 * Find the announcements channel
 */
function findAnnouncementsChannel(guild) {
    const channelId = process.env.announcements;
    if (channelId) {
        const channel = guild.channels.cache.get(channelId);
        if (channel && channel.type === ChannelType.GuildText && channel.permissionsFor(guild.members.me)?.has('SendMessages')) {
            return channel;
        }
    }
    // Fallback to name matching
    return guild.channels.cache.find(ch => 
        ch.type === ChannelType.GuildText &&
        ch.permissionsFor(guild.members.me)?.has('SendMessages') &&
        (ch.name.toLowerCase().includes('announcement') || 
         ch.name.includes('📢'))
    );
}

/**
 * Create birthday embed
 */
function createBirthdayEmbed(members) {
    const embed = new EmbedBuilder()
        .setColor('#ff69b4')
        .setTitle('🎉 Birthday Celebration! 🎂')
        .setTimestamp();

    if (members.length === 1) {
        const member = members[0];
        const displayName = member.display_name || member.username;
        embed.setDescription(
            `🎊 **Happy Birthday ${displayName}!** 🎊\n\n` +
            `Wishing you an amazing day filled with joy, success, and wonderful memories! 🎈\n` +
            `May this year bring you closer to all your dreams! 🌟`
        );
        if (member.avatar_url) {
            embed.setThumbnail(member.avatar_url);
        }
    } else {
        const names = members.map(m => `🎂 **${m.display_name || m.username}**`).join('\n');
        embed.setDescription(
            `🎊 **Multiple Birthday Celebrations Today!** 🎊\n\n${names}\n\n` +
            `Wishing you all an incredible day filled with happiness and success! 🎈🌟`
        );
    }

    return embed;
}

/**
 * Check and announce birthdays
 */
async function checkAndAnnounceBirthdays(client) {
    try {
        console.log('🎂 Checking for birthdays...');
        
        const birthdayMembers = await getMembersWithBirthdayToday();
        
        if (!birthdayMembers || birthdayMembers.length === 0) {
            console.log('No birthdays today.');
            return;
        }

        console.log(`🎉 Found ${birthdayMembers.length} birthday(s) today!`);

        // Post to all guilds
        for (const guild of client.guilds.cache.values()) {
            const announcementsChannel = findAnnouncementsChannel(guild);
            
            if (!announcementsChannel) {
                console.warn(`⚠ No announcements channel found in ${guild.name}`);
                continue;
            }

            const embed = createBirthdayEmbed(birthdayMembers);
            
            // Get mentions for birthday members if they're in this guild
            const mentions = [];
            for (const member of birthdayMembers) {
                try {
                    const guildMember = await guild.members.fetch(member.member_id.toString());
                    if (guildMember) {
                        mentions.push(`<@${member.member_id}>`);
                    }
                } catch (err) {
                    // Member not in this guild, skip
                }
            }

            const mentionText = mentions.length > 0 ? mentions.join(' ') : '';
            
            await announcementsChannel.send({
                content: mentionText,
                embeds: [embed]
            });
            
            console.log(`✓ Birthday announcement posted in ${guild.name} > #${announcementsChannel.name}`);
        }
    } catch (error) {
        console.error('Error checking/announcing birthdays:', error);
    }
}

/**
 * Schedule birthday checks
 */
function scheduleBirthdayCheck(client) {
    // Calculate time until next 6:00 AM
    const now = new Date();
    const scheduled = new Date(now);
    scheduled.setHours(BIRTHDAY_CHECK_HOUR, BIRTHDAY_CHECK_MINUTE, 0, 0);
    
    // If it's already past 6 AM today, schedule for tomorrow
    if (now >= scheduled) {
        scheduled.setDate(scheduled.getDate() + 1);
    }
    
    const msUntilCheck = scheduled.getTime() - now.getTime();
    const hoursUntil = Math.floor(msUntilCheck / (1000 * 60 * 60));
    const minutesUntil = Math.floor((msUntilCheck % (1000 * 60 * 60)) / (1000 * 60));
    
    console.log(`📅 Birthday check scheduled in ${hoursUntil}h ${minutesUntil}m (${BIRTHDAY_CHECK_HOUR}:${BIRTHDAY_CHECK_MINUTE.toString().padStart(2, '0')} AM)`);
    
    setTimeout(() => {
        checkAndAnnounceBirthdays(client);
        // Reschedule for next day
        setInterval(() => {
            checkAndAnnounceBirthdays(client);
        }, 24 * 60 * 60 * 1000); // Every 24 hours
    }, msUntilCheck);
}

/**
 * Initialize birthday announcement system
 */
function handleBirthdayAnnouncement(client) {
    client.once('ready', () => {
        console.log('✓ Birthday announcement system initialized');
        scheduleBirthdayCheck(client);
        
        // Optional: Check immediately on startup (for testing)
        // Uncomment the line below if you want to test immediately
        // checkAndAnnounceBirthdays(client);
    });
}

module.exports = {
    handleBirthdayAnnouncement,
    checkAndAnnounceBirthdays, // Export for manual testing
};
