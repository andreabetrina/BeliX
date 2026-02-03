require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { handleWelcomeMessage } = require('./features/welcome');
const { handleChannelSetup } = require('./features/channelSetup');
const { handleProgressUpdate } = require('./features/progressupdate');
const { handleDailyTerminology } = require('./features/dailyTerminology');
const { handleSlashCommands } = require('./features/slashCommands');
const { handleMeetingTracker } = require('./features/meetingTracker');
const { handleMemberSync } = require('./features/memberSync');
const { handleBirthdayAnnouncement } = require('./features/birthdayAnnouncement');
const { handleScheduledReminders } = require('./features/scheduledReminders');
const { setupDailyQuestion } = require('./features/dailyQuestionPoster');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildVoiceStates,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

// Initialize reminders from disk
const reminders = [];

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`Loaded reminders system`);
});

// Setup features
console.log('Setting up bot features...');
handleWelcomeMessage(client);
handleProgressUpdate(client);
handleDailyTerminology(client);
handleSlashCommands(client);
handleMeetingTracker(client);
handleMemberSync(client);
handleBirthdayAnnouncement(client);
handleScheduledReminders(client);
setupDailyQuestion(client);
console.log('✓ All features loaded');

client.login(process.env.DISCORD_TOKEN);
