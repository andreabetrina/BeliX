const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildLeaderboardEmbed, getLeaderboardButtons, buildMyPointsEmbed } = require('./leaderboard');
const { loadTerminologies, postDailyTerminology } = require('./dailyTerminology');
const { parseReminderContent, addReminder, generateReminderId, formatDateTime } = require('./reminder');
const { getLeaderboard, getMember, getPoints, initializePoints } = require('../database/db');

// Cache for guild members to avoid rate limiting
const memberCache = new Map();

function buildHelpEmbed() {
    return new EmbedBuilder()
        .setColor('#5b9bd5')
        .setTitle('🤖 Bot Commands')
        .setDescription('Here are all available slash commands and what they do:')
        .addFields(
            { name: '/help', value: 'Show all commands and their usage.' },
            { name: '/leaderboard', value: 'Show top 10 users.' },
            { name: '/mypoints', value: 'Show your personal points and last update.' },
            { name: '/terminology', value: 'Show today\'s terminology.' },
            { name: '/next', value: 'Preview the next terminology (without changing today\'s).' },
            { name: '/prev', value: 'Preview the previous terminology.' },
            { name: '/remind', value: 'Set a reminder (e.g., "submit assignment tomorrow at 6 PM").' },
        )
        .setTimestamp();
}

function getTerminologyEmbed() {
    const data = loadTerminologies();

    if (!data.terminologies || data.terminologies.length === 0) {
        return null;
    }

    const terminology = data.terminologies[data.currentIndex];

    return new EmbedBuilder()
        .setColor('#4a90e2')
        .setTitle(`📚 Today's Tech Term: ${terminology.term}`)
        .setDescription(terminology.definition)
        .addFields(
            { name: '📂 Category', value: terminology.category, inline: true },
            { name: '📅 Term #', value: `${data.currentIndex + 1}/${data.terminologies.length}`, inline: true }
        )
        .setFooter({ text: 'Posted daily at 8:00 PM' })
        .setTimestamp();
}

function getNextTerminologyEmbed() {
    const data = loadTerminologies();

    if (!data.terminologies || data.terminologies.length === 0) {
        return null;
    }

    const nextIndex = (data.currentIndex + 1) % data.terminologies.length;
    const terminology = data.terminologies[nextIndex];

    return new EmbedBuilder()
        .setColor('#4a90e2')
        .setTitle(`📚 Next Tech Term: ${terminology.term}`)
        .setDescription(terminology.definition)
        .addFields(
            { name: '📂 Category', value: terminology.category, inline: true },
            { name: '📅 Term #', value: `${nextIndex + 1}/${data.terminologies.length}`, inline: true }
        )
        .setFooter({ text: 'Preview only - use /nextterm to post' })
        .setTimestamp();
}

function getPreviousTerminologyEmbed() {
    const data = loadTerminologies();

    if (!data.terminologies || data.terminologies.length === 0) {
        return null;
    }

    const prevIndex = (data.currentIndex - 1 + data.terminologies.length) % data.terminologies.length;
    const terminology = data.terminologies[prevIndex];

    return new EmbedBuilder()
        .setColor('#4a90e2')
        .setTitle(`📚 Previous Tech Term: ${terminology.term}`)
        .setDescription(terminology.definition)
        .addFields(
            { name: '📂 Category', value: terminology.category, inline: true },
            { name: '📅 Term #', value: `${prevIndex + 1}/${data.terminologies.length}`, inline: true }
        )
        .setFooter({ text: 'Previous terminology' })
        .setTimestamp();
}

function buildCommands() {
    return [
        new SlashCommandBuilder()
            .setName('help')
            .setDescription('Show all available commands.'),
        new SlashCommandBuilder()
            .setName('leaderboard')
            .setDescription('Show the leaderboard (top 10 users).'),
        new SlashCommandBuilder()
            .setName('mypoints')
            .setDescription('Show your personal points.'),
        new SlashCommandBuilder()
            .setName('terminology')
            .setDescription('Show today\'s terminology.'),
        new SlashCommandBuilder()
            .setName('next')
            .setDescription('Preview the next terminology (without changing today\'s).'),
        new SlashCommandBuilder()
            .setName('prev')
            .setDescription('Preview the previous terminology.'),
        new SlashCommandBuilder()
            .setName('remind')
            .setDescription('Set a reminder using natural language.')
            .addStringOption(option =>
                option
                    .setName('text')
                    .setDescription('What and when to remind you')
                    .setRequired(true)
            )
    ].map(cmd => cmd.toJSON());
}

function handleSlashCommands(client) {
    client.once('ready', async () => {
        try {
            const commands = buildCommands();
            const guildId = process.env.GUILD_ID;
            if (guildId) {
                const guild = client.guilds.cache.get(guildId);
                if (guild) {
                    await guild.commands.set(commands);
                    await client.application.commands.set([]);
                    console.log(`✓ Slash commands registered for guild ${guildId}`);
                    
                    // Fetch and cache all guild members once at startup
                    try {
                        const members = await guild.members.fetch({ limit: 0 });
                        memberCache.set(guildId, Array.from(members.values()));
                        console.log(`✓ Cached ${members.size} guild members`);
                    } catch (error) {
                        console.warn('Could not cache guild members:', error.message);
                    }
                } else {
                    await client.application.commands.set(commands);
                }
            } else {
                await client.application.commands.set(commands);
            }
        } catch (error) {
            console.error('Failed to register slash commands:', error);
        }
    });

    client.on('messageCreate', async (message) => {
        if (message.author.bot) return;
        const content = message.content.trim().toLowerCase();
        if (content === '/help') {
            return message.reply({ embeds: [buildHelpEmbed()] });
        }
    });

    client.on('interactionCreate', async (interaction) => {
        // Handle leaderboard pagination buttons
        if (interaction.isButton()) {
            if (interaction.customId.startsWith('leaderboard_')) {
                const [, direction, page] = interaction.customId.split('_');
                const currentPage = parseInt(page);
                const leaderboardData = await getLeaderboard();
                const totalPages = Math.ceil(leaderboardData.length / 10);
                
                let newPage = currentPage;
                if (direction === 'next') newPage = Math.min(currentPage + 1, totalPages);
                if (direction === 'back') newPage = Math.max(currentPage - 1, 1);

                const embed = buildLeaderboardEmbed(leaderboardData, newPage);
                const buttons = getLeaderboardButtons(newPage, totalPages);

                return interaction.update({ embeds: [embed], components: [buttons] });
            }
            return;
        }

        if (!interaction.isChatInputCommand()) return;

        const { commandName } = interaction;

        if (commandName === 'help') {
            return interaction.reply({ embeds: [buildHelpEmbed()] });
        }

        if (commandName === 'leaderboard') {
            const leaderboardData = await getLeaderboard();
            
            const totalPages = Math.ceil(leaderboardData.length / 10);
            const embed = buildLeaderboardEmbed(leaderboardData, 1);
            const buttons = getLeaderboardButtons(1, totalPages);

            return interaction.reply({ embeds: [embed], components: [buttons] });
        }

        if (commandName === 'mypoints') {
            await initializePoints(interaction.user.id);
            const memberData = await getMember(interaction.user.id);
            const pointsData = await getPoints(interaction.user.id);

            const embed = buildMyPointsEmbed(memberData, { points: pointsData, last_update: new Date().toISOString() });
            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'terminology') {
            const embed = getTerminologyEmbed();

            if (!embed) {
                return interaction.reply('No terminologies available.');
            }

            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'next') {
            const embed = getNextTerminologyEmbed();

            if (!embed) {
                return interaction.reply('No terminologies available.');
            }

            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'prev') {
            const embed = getPreviousTerminologyEmbed();

            if (!embed) {
                return interaction.reply('No terminologies available.');
            }

            return interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'remind') {
            const text = interaction.options.getString('text', true);
            const parsed = parseReminderContent(text);

            if (parsed.error === 'missing-time') {
                return interaction.reply('Please include when to remind you, e.g., "submit my assignment tomorrow at 6 PM".');
            }

            if (parsed.error === 'invalid-time') {
                return interaction.reply('That time looks invalid. Try something like "in 20 minutes" or "tomorrow at 6 PM".');
            }

            if (parsed.error === 'missing-action' || parsed.error === 'format') {
                return interaction.reply('Please include what to remind you about, e.g., "call Alex at 4 PM".');
            }

            const remindAtMs = parsed.remindAt.getTime();

            if (remindAtMs <= Date.now()) {
                return interaction.reply('That time seems to be in the past. Please provide a future time.');
            }

            const reminder = {
                id: generateReminderId(),
                userId: interaction.user.id,
                channelId: interaction.channelId,
                message: parsed.action,
                timestamp: remindAtMs,
                createdAt: Date.now(),
            };

            addReminder(reminder, client);
            const confirmationTime = formatDateTime(new Date(remindAtMs));
            return interaction.reply(`✅ Reminder set! I'll remind you ${confirmationTime}.`);
        }
    });
}

module.exports = { handleSlashCommands };
