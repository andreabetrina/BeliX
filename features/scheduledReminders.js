const { EmbedBuilder, ChannelType } = require('discord.js');

// Scheduled reminder times (24-hour format)
const REMINDERS = [
    {
        name: 'Daily Gathering',
        hour: 18,
        minute: 30,
        message: '🎯 **Daily Gathering Time!** 🎯',
        description: 'It\'s time for our daily gathering! Let\'s connect, share, and grow together. See you in the voice channel! 🎤',
        color: '#FFD700',
        channelNames: ['announcements', 'general', 'common-hall', 'common hall'],
        envKey: 'announcements',
    },
    {
        name: 'Progress Update (1st)',
        hour: 21,
        minute: 30,
        message: '📊 **Progress Update Time - Round 1** 📊',
        description: 'Time to share your progress! What have you accomplished today? Share your wins in Byte Bash Blitz! 💪',
        color: '#00D9FF',
        channelNames: ['byte-bash-blitz', 'progress', 'updates', 'announcements'],
        envKey: 'announcements',
    },
    {
        name: 'Progress Update (2nd)',
        hour: 22,
        minute: 0,
        message: '📈 **Progress Update Time - Round 2** 📈',
        description: 'Second round of progress updates! Keep sharing your achievements and updates. Let\'s celebrate every milestone! 🎉',
        color: '#00FF88',
        channelNames: ['byte-bash-blitz', 'progress', 'updates', 'announcements'],
        envKey: 'announcements',
    },
];

/**
 * Find a channel that matches the provided names or environment variable
 */
function findTargetChannel(guild, channelNames, envKey) {
    // First try environment variable if provided
    if (envKey) {
        const channelId = process.env[envKey];
        if (channelId) {
            const channel = guild.channels.cache.get(channelId);
            if (channel && channel.type === ChannelType.GuildText && channel.permissionsFor(guild.members.me)?.has('SendMessages')) {
                return channel;
            }
        }
    }
    // Fallback to name matching
    return guild.channels.cache.find(ch =>
        ch.type === ChannelType.GuildText &&
        ch.permissionsFor(guild.members.me)?.has('SendMessages') &&
        channelNames.some(name => ch.name.toLowerCase().includes(name))
    );
}

/**
 * Create reminder embed
 */
function createReminderEmbed(reminder) {
    return new EmbedBuilder()
        .setColor(reminder.color)
        .setTitle(reminder.message)
        .setDescription(reminder.description)
        .setTimestamp();
}

/**
 * Send scheduled reminder to all guilds
 */
async function sendScheduledReminder(client, reminder) {
    try {
        console.log(`⏰ Sending scheduled reminder: "${reminder.name}"`);

        for (const guild of client.guilds.cache.values()) {
            const channel = findTargetChannel(guild, reminder.channelNames, reminder.envKey);

            if (!channel) {
                console.warn(`⚠ No suitable channel found in ${guild.name} for "${reminder.name}"`);
                continue;
            }

            const embed = createReminderEmbed(reminder);

            await channel.send({
                embeds: [embed],
            });

            console.log(`✓ Reminder sent in ${guild.name} > #${channel.name}`);
        }
    } catch (error) {
        console.error(`Error sending reminder "${reminder.name}":`, error);
    }
}

/**
 * Schedule a reminder to run at a specific time daily
 */
function scheduleReminder(client, reminder) {
    const now = new Date();
    const scheduled = new Date(now);
    scheduled.setHours(reminder.hour, reminder.minute, 0, 0);

    // If the time has already passed today, schedule for tomorrow
    if (now >= scheduled) {
        scheduled.setDate(scheduled.getDate() + 1);
    }

    const msUntilReminder = scheduled.getTime() - now.getTime();
    const hoursUntil = Math.floor(msUntilReminder / (1000 * 60 * 60));
    const minutesUntil = Math.floor((msUntilReminder % (1000 * 60 * 60)) / (1000 * 60));

    console.log(
        `📅 "${reminder.name}" scheduled in ${hoursUntil}h ${minutesUntil}m ` +
        `(${reminder.hour.toString().padStart(2, '0')}:${reminder.minute.toString().padStart(2, '0')})`
    );

    // Schedule first execution
    setTimeout(() => {
        sendScheduledReminder(client, reminder);

        // Then repeat daily
        setInterval(() => {
            sendScheduledReminder(client, reminder);
        }, 24 * 60 * 60 * 1000); // Every 24 hours
    }, msUntilReminder);
}

/**
 * Initialize all scheduled reminders
 */
function handleScheduledReminders(client) {
    client.once('ready', () => {
        console.log('✓ Scheduled reminders system initialized');
        
        // Schedule all reminders
        for (const reminder of REMINDERS) {
            scheduleReminder(client, reminder);
        }
    });
}

module.exports = {
    handleScheduledReminders,
};
