const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { buildLeaderboardEmbed, getLeaderboardButtons, buildMyPointsEmbed } = require('./leaderboard');
const { loadTerminologies, postDailyTerminology } = require('./dailyTerminology');
const { getLeaderboard, getMember, getPoints, initializePoints, syncMember } = require('../database/db');
const fs = require('fs');
const path = require('path');

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
            { name: '/dailyquestions', value: 'Browse daily programming questions with pagination.' },
            { name: '/question <number>', value: 'View a specific question (1-129) with full details.' }
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

function loadQuestions() {
    const questionsPath = path.join(__dirname, '../json/dailyQuestion.json');
    const data = fs.readFileSync(questionsPath, 'utf-8');
    return JSON.parse(data);
}

function buildQuestionsEmbed(questions, startIndex = 0, itemsPerPage = 5) {
    const questions_list = questions.slice(startIndex, startIndex + itemsPerPage);
    
    const embed = new EmbedBuilder()
        .setColor('#f39c12')
        .setTitle('📝 Daily Programming Questions')
        .setDescription('Select a question to view details')
        .setFooter({ text: `Showing ${startIndex + 1}-${Math.min(startIndex + itemsPerPage, questions.length)} of ${questions.length} questions` });
    
    questions_list.forEach(q => {
        const value = `**Input:** ${q.Input}\n**Output:** ${q.Output}`;
        embed.addField(`Day ${q.Day}: ${q.Question}`, value, false);
    });
    
    return embed;
}

function getQuestionsNavigationButtons(currentPage, totalPages) {
    const buttons = new ActionRowBuilder();
    
    if (currentPage > 1) {
        buttons.addComponents(
            new ButtonBuilder()
                .setCustomId(`questions_back_${currentPage - 1}`)
                .setLabel('⬅️ Previous')
                .setStyle(ButtonStyle.Primary)
        );
    }
    
    buttons.addComponents(
        new ButtonBuilder()
            .setCustomId('questions_page')
            .setLabel(`Page ${currentPage}/${totalPages}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true)
    );
    
    if (currentPage < totalPages) {
        buttons.addComponents(
            new ButtonBuilder()
                .setCustomId(`questions_next_${currentPage + 1}`)
                .setLabel('Next ➡️')
                .setStyle(ButtonStyle.Primary)
        );
    }
    
    return buttons;
}

function buildQuestionDetailEmbed(question) {
    const embed = new EmbedBuilder()
        .setColor('#27ae60')
        .setTitle(`Day ${question.Day}: ${question.Question}`)
        .addFields(
            { name: '📥 Input', value: question.Input, inline: false },
            { name: '📤 Output', value: String(question.Output), inline: false },
            { name: '📝 Explanation', value: question.Explain, inline: false }
        );
    
    if (question.Formula) {
        embed.addField('📐 Formula', question.Formula, false);
    }
    
    if (question.Method) {
        embed.addFields(
            { name: '🔧 Method', value: question.Method, inline: true },
            { name: '📞 Main Call', value: question['Main Call'], inline: true }
        );
    }
    
    embed.setFooter({ text: `Question ${question.Day}/129` });
    embed.setTimestamp();
    
    return embed;
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
            .setName('dailyquestions')
            .setDescription('Browse daily programming questions with solutions.'),
        new SlashCommandBuilder()
            .setName('question')
            .setDescription('Get a specific programming question by number (1-129).')
            .addIntegerOption(option =>
                option.setName('number')
                    .setDescription('Question number (1-129)')
                    .setRequired(true)
                    .setMinValue(1)
                    .setMaxValue(129)
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
            
            // Handle questions pagination buttons
            if (interaction.customId.startsWith('questions_')) {
                const [, direction, page] = interaction.customId.split('_');
                const currentPage = parseInt(page);
                const questions = loadQuestions();
                const totalPages = Math.ceil(questions.length / 5);
                
                let newPage = currentPage;
                if (direction === 'next') newPage = Math.min(currentPage + 1, totalPages);
                if (direction === 'back') newPage = Math.max(currentPage - 1, 1);

                const startIndex = (newPage - 1) * 5;
                const embed = buildQuestionsEmbed(questions, startIndex);
                const buttons = getQuestionsNavigationButtons(newPage, totalPages);

                return interaction.update({ embeds: [embed], components: [buttons] });
            }
            return;
        }

        if (!interaction.isCommand()) return;

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
            // Ensure member exists in database first
            await syncMember(interaction.member, interaction.guild);
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

        if (commandName === 'dailyquestions') {
            const questions = loadQuestions();
            const totalPages = Math.ceil(questions.length / 5);
            const embed = buildQuestionsEmbed(questions, 0);
            const buttons = getQuestionsNavigationButtons(1, totalPages);

            return interaction.reply({ embeds: [embed], components: [buttons] });
        }

        if (commandName === 'question') {
            const questionNumber = interaction.options.getInteger('number');
            const questions = loadQuestions();
            
            // Find question by Day number
            const question = questions.find(q => q.Day === questionNumber);
            
            if (!question) {
                return interaction.reply({
                    content: `❌ Question #${questionNumber} not found. Available questions: 1-129`,
                    ephemeral: true
                });
            }
            
            const embed = buildQuestionDetailEmbed(question);
            return interaction.reply({ embeds: [embed] });
        }
    });
}

module.exports = { handleSlashCommands };

