const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { confirmGathering, cancelGathering, getGatheringStatus } = require('../database/db');

const GATHERING_MANAGERS = new Set(['geonithin', 'sriiiharshiii', 'michalnithesh']);
const GATHERING_PROMPT_HOUR = 18; // 6:00 PM
const GATHERING_PROMPT_MINUTE = 0;

function normalizeName(value) {
    return (value || '').toLowerCase().trim();
}

function isGatheringManager(member) {
    if (!member) return false;
    const username = normalizeName(member.user.username);
    const displayName = normalizeName(member.displayName);
    return GATHERING_MANAGERS.has(username) || GATHERING_MANAGERS.has(displayName);
}

function findTinkeringChannel(guild) {
    const channelId = process.env.tinkering;
    if (channelId) {
        return guild.channels.cache.get(channelId);
    }
    // Fallback to name matching
    return guild.channels.cache.find(channel =>
        channel.isTextBased() &&
        channel.name?.toLowerCase().includes('tinkering')
    );
}

function findCommonHallChannel(guild) {
    const channelId = process.env['common-hall'];
    if (channelId) {
        return guild.channels.cache.get(channelId);
    }
    // Fallback to name matching
    return guild.channels.cache.find(channel =>
        channel.isTextBased() &&
        ['common hall', 'common-hall', 'commonhall'].some(name =>
            channel.name?.toLowerCase().includes(name)
        )
    );
}

function buildGatheringPromptEmbed() {
    return new EmbedBuilder()
        .setColor('#7f56d9')
        .setTitle('📡 Daily Gathering Confirmation')
        .setDescription('It\'s 6:00 PM! Is the daily gathering confirmed for today?')
        .addFields(
            { name: 'Location', value: '📡 tinkering channel', inline: true },
            { name: 'Time', value: '6:00 PM', inline: true }
        )
        .setFooter({ text: 'Only Geo, Harshini, and Michal can confirm' })
        .setTimestamp();
}

function buildConfirmationEmbed(confirmedBy) {
    return new EmbedBuilder()
        .setColor('#12b76a')
        .setTitle('✅ Daily Gathering Confirmed!')
        .setDescription(`The daily gathering has been confirmed by ${confirmedBy}!`)
        .addFields(
            { name: 'Location', value: '📡 tinkering channel', inline: true },
            { name: 'Time', value: '6:00 PM', inline: true },
            { name: 'Status', value: '✨ Gathering is ON!', inline: false }
        )
        .setTimestamp();
}

function buildGatheringPromptButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('gather_confirm')
            .setLabel('✅ Confirm')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('gather_cancel')
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Danger)
    );
}

function scheduleDailyGatheringPrompt(client, guild) {
    const scheduleNext = () => {
        const now = new Date();
        const next = new Date(now);
        next.setHours(GATHERING_PROMPT_HOUR, GATHERING_PROMPT_MINUTE, 0, 0);

        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }

        const delay = next - now;
        const hours = Math.floor(delay / (1000 * 60 * 60));
        const minutes = Math.floor((delay % (1000 * 60 * 60)) / (1000 * 60));
        
        console.log(`📅 Daily gathering scheduled in ${hours}h ${minutes}m (${next.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}) for guild: ${guild.name}`);
        
        setTimeout(async () => {
            await sendGatheringPrompt(client, guild);
            scheduleNext();
        }, delay);
    };

    scheduleNext();
}

async function sendGatheringPrompt(client, guild) {
    const channel = findTinkeringChannel(guild);
    if (!channel) {
        console.warn(`⚠️ Tinkering channel not found in ${guild.name}`);
        return;
    }

    const embed = buildGatheringPromptEmbed();
    const buttons = buildGatheringPromptButtons();

    try {
        console.log(`📡 Sending gathering prompt to ${guild.name} - ${channel.name}`);
        await channel.send({
            embeds: [embed],
            components: [buttons],
        });
        console.log(`✅ Gathering prompt sent successfully to ${channel.name}`);
    } catch (error) {
        console.error('Error sending gathering prompt:', error);
    }
}

function handleGatheringConfirmation(client) {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;

        if (interaction.customId === 'gather_confirm' || interaction.customId === 'gather_cancel') {
            // Check if user is a gathering manager
            if (!isGatheringManager(interaction.member)) {
                await interaction.reply({
                    content: '❌ Only Geo and Harshini can confirm or cancel gatherings!',
                    ephemeral: true,
                });
                return;
            }

            const guild = interaction.guild;
            const today = new Date();
            const memberId = parseInt(interaction.user.id, 10);

            if (interaction.customId === 'gather_confirm') {
                // Store confirmation in database
                await confirmGathering(memberId, interaction.user.username, today);

                // Send confirmation to common-hall
                const commonHall = findCommonHallChannel(guild);
                if (commonHall) {
                    const embed = buildConfirmationEmbed(interaction.user.username);
                    await commonHall.send({ embeds: [embed] });
                }

                // Acknowledge in tinkering channel
                await interaction.reply({
                    content: '✅ Gathering confirmed! Message sent to 🗻 common-hall',
                    ephemeral: true,
                });
            } else if (interaction.customId === 'gather_cancel') {
                // Cancel gathering in database
                await cancelGathering(today);

                await interaction.reply({
                    content: '❌ Gathering cancelled for today.',
                    ephemeral: true,
                });
            }
        }
    });
}

function handleGatheringScheduler(client) {
    // Setup scheduler function
    const setupScheduler = () => {
        const guilds = client.guilds.cache;
        console.log(`\n🔔 Setting up daily gathering scheduler for ${guilds.size} guild(s)`);
        
        let successCount = 0;
        for (const guild of guilds.values()) {
            const tinkeringChannel = findTinkeringChannel(guild);
            if (tinkeringChannel) {
                console.log(`✓ Found tinkering channel in ${guild.name}: #${tinkeringChannel.name}`);
                scheduleDailyGatheringPrompt(client, guild);
                successCount++;
            } else {
                console.warn(`⚠️ Tinkering channel NOT found in ${guild.name}`);
            }
        }
        console.log(`✓ Daily gathering scheduler initialized (${successCount}/${guilds.size} guilds)\n`);
    };

    // Try both events for maximum compatibility
    if (client.isReady()) {
        // If bot is already ready, schedule immediately
        console.log('Bot already ready, setting up gathering scheduler now...');
        setupScheduler();
    } else {
        // Otherwise wait for ready event
        const readyHandler = () => {
            setupScheduler();
            // Remove listener after first use
            client.removeListener('ready', readyHandler);
            client.removeListener('clientReady', readyHandler);
        };
        
        client.on('ready', readyHandler);
        client.on('clientReady', readyHandler);
    }

    // Handle new guild joins
    client.on('guildCreate', (guild) => {
        console.log(`📍 Bot joined new guild: ${guild.name}`);
        scheduleDailyGatheringPrompt(client, guild);
    });

    // Handle button interactions for confirmation
    handleGatheringConfirmation(client);
}

module.exports = {
    handleGatheringScheduler,
};
