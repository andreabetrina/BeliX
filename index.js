require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { handleWelcomeMessage } = require('./features/welcome');
const { initializeReminders, handleReminderMessage, loadRemindersOnReady } = require('./features/reminder');
const { handleChannelSetup } = require('./features/channelSetup');
const { handleProgressUpdate } = require('./features/progressupdate');
const { handlePointsCommand } = require('./features/leaderboard');
const { handleReactionPoints } = require('./features/reactionHandler');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildMessageReactions,
    ],
    partials: [Partials.Channel, Partials.Message, Partials.Reaction],
});

// Initialize reminders from disk
const reminders = initializeReminders();

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    loadRemindersOnReady(client);
    console.log(`Loaded ${reminders.length} reminder(s).`);
});

// Setup features
console.log('Setting up bot features...');
handleWelcomeMessage(client);
handleReminderMessage(client);
handleChannelSetup(client);
handleProgressUpdate(client);
handlePointsCommand(client);
handleReactionPoints(client);
console.log('✓ All features loaded');

client.login(process.env.DISCORD_TOKEN);
