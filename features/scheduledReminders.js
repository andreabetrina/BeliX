const { EmbedBuilder, ChannelType } = require('discord.js');
const { getDelayUntilNextScheduledTime, getTimeWithTimezoneInfo, formatTimeInTimeZone } = require('../utils/timezoneUtils');

// Scheduled reminder times (24-hour format)
const REMINDERS = [
    {
        name: 'Daily Progress Reminder',
        hour: 21,
        minute: 30,
        message: '📊 Belmonts Daily Progress Reminder 📊',
        description: `Hey Belmonts! It's time to check in 🚀
What progress did you make today in **Byte Bash Blitz**?
Post your updates, celebrate your wins, and keep pushing forward 💪✨`,
        color: '#00D9FF',
        channelId: '1304853237471510639',
    },
    {
        name: 'Last Call Progress Reminder',
        hour: 23,
        minute: 0,
        message: '⏰ Last Call - Belmonts Daily Progress ⏰',
        description: `🚨 This is your last call, Belmonts! 
Don't miss out on sharing your progress in **Byte Bash Blitz** today!
Post your final updates now and celebrate your achievements before we wrap up! 🎯✨`,
        color: '#FF6B6B',
        channelId: '1304853237471510639',
    },
];

/**
 * Find a channel by ID or name
 */
function findTargetChannel(client, reminder) {
    // First try by channel ID if provided
    if (reminder.channelId) {
        const channel = client.channels.cache.get(reminder.channelId);
        if (channel && channel.type === ChannelType.GuildText && channel.permissionsFor(channel.guild.members.me)?.has('SendMessages')) {
            return channel;
        }
    }
    return null;
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
 * Send scheduled reminder
 */
async function sendScheduledReminder(client, reminder) {
    try {
        console.log(`⏰ Sending scheduled reminder: "${reminder.name}"`);

        const channel = findTargetChannel(client, reminder);

        if (!channel) {
            console.warn(`⚠ Channel ${reminder.channelId} not found for "${reminder.name}"`);
            return;
        }

        const embed = createReminderEmbed(reminder);

        await channel.send({
            embeds: [embed],
        });

        console.log(`✓ Reminder sent in #${channel.name}`);
    } catch (error) {
        console.error(`Error sending reminder "${reminder.name}":`, error);
    }
}

/**
 * Schedule a reminder to run at a specific time daily
 */
function scheduleReminder(client, reminder) {
    const msUntilReminder = getDelayUntilNextScheduledTime(reminder.hour, reminder.minute);
    const hoursUntil = Math.floor(msUntilReminder / (1000 * 60 * 60));
    const minutesUntil = Math.floor((msUntilReminder % (1000 * 60 * 60)) / (1000 * 60));

    console.log(
        `📅 "${reminder.name}" scheduled in ${hoursUntil}h ${minutesUntil}m ` +
        `(${reminder.hour.toString().padStart(2, '0')}:${reminder.minute.toString().padStart(2, '0')} Asia/Kolkata)`
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
