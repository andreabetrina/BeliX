const fs = require('fs');
const path = require('path');
const chrono = require('chrono-node');

const REMINDER_FILE = path.join(__dirname, '..', 'reminders.json');
const reminderTimers = new Map();

let reminders = [];

function readRemindersFromDisk() {
    try {
        const raw = fs.readFileSync(REMINDER_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
        if (err.code !== 'ENOENT') {
            console.error('Failed to read reminders file', err);
        }
        return [];
    }
}

function persistReminders() {
    try {
        fs.writeFileSync(REMINDER_FILE, JSON.stringify(reminders, null, 2));
    } catch (err) {
        console.error('Failed to save reminders', err);
    }
}

function generateReminderId() {
    return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatDateTime(date) {
    return date.toLocaleString('en-US', {
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        dateStyle: 'medium',
        timeStyle: 'short',
    });
}

function parseReminderContent(content) {
    const match = content.match(/remind me\s*(to)?\s*(.+)/i);
    if (!match || !match[2]) {
        return { error: 'format' };
    }

    const reminderText = match[2].trim();
    const parsed = chrono.parse(reminderText, new Date(), { forwardDate: true });

    if (!parsed.length) {
        return { error: 'missing-time' };
    }

    const best = parsed[0];
    const remindAt = best.start?.date();

    if (!remindAt || Number.isNaN(remindAt.getTime())) {
        return { error: 'invalid-time' };
    }

    const action = reminderText
        .replace(best.text, '')
        .replace(/^[,;:\-\s]+/, '')
        .trim() || reminderText;

    if (!action.length) {
        return { error: 'missing-action' };
    }

    return { action, remindAt };
}

function scheduleReminder(reminder, client) {
    const delay = reminder.timestamp - Date.now();

    if (delay <= 0) {
        sendReminder(reminder.id, client);
        return;
    }

    const maxDelay = 2147483647; // Max for setTimeout (~24.8 days)
    const timeoutDelay = Math.min(delay, maxDelay);
    const timer = setTimeout(() => {
        reminderTimers.delete(reminder.id);
        if (delay <= maxDelay) {
            sendReminder(reminder.id, client);
        } else {
            scheduleReminder(reminder, client);
        }
    }, timeoutDelay);

    reminderTimers.set(reminder.id, timer);
}

async function sendReminder(reminderId, client) {
    const reminder = reminders.find(r => r.id === reminderId);
    if (!reminder) return;

    reminders = reminders.filter(r => r.id !== reminderId);
    persistReminders();
    reminderTimers.delete(reminderId);

    const payload = `⏰ Reminder: ${reminder.message} <@${reminder.userId}>`;

    try {
        const channel = await client.channels.fetch(reminder.channelId).catch(() => null);

        if (channel?.isTextBased()) {
            await channel.send(payload);
            return;
        }

        const user = await client.users.fetch(reminder.userId).catch(() => null);
        if (user) {
            await user.send(payload);
        }
    } catch (err) {
        console.error('Failed to deliver reminder', err);
    }
}

function initializeReminders() {
    reminders = readRemindersFromDisk().filter(r => typeof r.timestamp === 'number' && r.timestamp > Date.now());
    persistReminders();
    return reminders;
}

function handleReminderMessage(client) {
    client.on('messageCreate', async message => {
        if (message.author.bot) return;

        const lower = message.content.toLowerCase();
        console.log(`Message received: "${message.content}" from ${message.author.tag}`);
        if (!lower.startsWith('remind me')) return;
        
        console.log('Processing reminder request...');

        const parsed = parseReminderContent(message.content);

        if (parsed.error === 'missing-time') {
            await message.reply('Please include when to remind you, e.g., "remind me to submit my assignment tomorrow at 6 PM".');
            return;
        }

        if (parsed.error === 'invalid-time') {
            await message.reply('That time looks invalid. Try something like "in 20 minutes" or "tomorrow at 6 PM".');
            return;
        }

        if (parsed.error === 'missing-action' || parsed.error === 'format') {
            await message.reply('Please include what to remind you about, e.g., "remind me to call Alex at 4 PM".');
            return;
        }

        const remindAtMs = parsed.remindAt.getTime();

        if (remindAtMs <= Date.now()) {
            await message.reply('That time seems to be in the past. Please provide a future time.');
            return;
        }

        const reminder = {
            id: generateReminderId(),
            userId: message.author.id,
            channelId: message.channel.id,
            message: parsed.action,
            timestamp: remindAtMs,
            createdAt: Date.now(),
        };

        reminders.push(reminder);
        persistReminders();
        scheduleReminder(reminder, client);

        const confirmationTime = formatDateTime(new Date(remindAtMs));
        await message.reply(`✅ Reminder set! I'll remind you ${confirmationTime}.`);
    });
}

function loadRemindersOnReady(client) {
    reminders.forEach(reminder => scheduleReminder(reminder, client));
}

module.exports = {
    readRemindersFromDisk,
    persistReminders,
    generateReminderId,
    formatDateTime,
    parseReminderContent,
    scheduleReminder,
    sendReminder,
    initializeReminders,
    handleReminderMessage,
    loadRemindersOnReady,
    reminderTimers,
};
