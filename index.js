require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
const { handleWelcomeMessage } = require('./features/welcome');
const { initializeReminders, handleReminderMessage, loadRemindersOnReady } = require('./features/reminder');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel],
});

// Initialize reminders from disk
const reminders = initializeReminders();

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    loadRemindersOnReady(client);
    console.log(`Loaded ${reminders.length} reminder(s).`);
});

// Setup features
handleWelcomeMessage(client);
handleReminderMessage(client);

client.login(process.env.DISCORD_TOKEN);
