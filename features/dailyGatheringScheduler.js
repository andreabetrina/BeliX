const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, MessageFlags } = require('discord.js');
const { confirmGathering, cancelGathering, updateGatheringTime, getGatheringStatus, createMeeting, updateMeetingEnd, recordAttendance, getMeetingAttendance } = require('../database/db');
const { getDelayUntilNextScheduledTime, getCurrentTimeInTimeZone } = require('../utils/timezoneUtils');

const GATHERING_PROMPT_HOUR = 18; // 6:00 PM
const GATHERING_PROMPT_MINUTE = 0;
const DEFAULT_GATHERING_HOUR = 20; // 8:00 PM (default)
const GATHERING_VOICE_ROOM = '1304848107095326830'; // Voice room channel ID
const GATHERING_DURATION_MS = 60 * 60 * 1000; // 1 hour

// Track active gathering sessions
const gatheringSessions = new Map();

function normalizeName(value) {
    return (value || '').toLowerCase().trim();
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

function findGatheringVoiceChannel(guild) {
    const channelId = GATHERING_VOICE_ROOM;
    if (channelId) {
        const channel = guild.channels.cache.get(channelId);
        if (channel && channel.type === ChannelType.GuildVoice) {
            return channel;
        }
    }
    // Fallback to name matching
    return guild.channels.cache.find(channel =>
        channel.isVoiceBased() &&
        ['common hall', 'common-hall', 'commonhall', 'general', 'gathering'].some(name =>
            channel.name?.toLowerCase().includes(name)
        )
    );
}

function findCommonHallChannel(guild) {
    const channelId = process.env['common-hall'];
    if (channelId) {
        const channel = guild.channels.cache.get(channelId);
        if (channel && channel.type === ChannelType.GuildText) {
            return channel;
        }
    }
    // Fallback to name matching
    return guild.channels.cache.find(channel =>
        channel.type === ChannelType.GuildText &&
        ['common hall', 'common-hall', 'commonhall'].some(name =>
            channel.name?.toLowerCase().includes(name)
        )
    );
}

function buildGatheringPromptEmbed(gatheringTime = DEFAULT_GATHERING_HOUR) {
    let timeString = '';
    
    // Handle decimal times (e.g., 19.5 for 7:30 PM)
    if (gatheringTime === 19.5) {
        timeString = '7:30 PM';
    } else {
        const hour = Math.floor(gatheringTime);
        const meridiem = gatheringTime >= 12 ? 'PM' : 'AM';
        timeString = `${hour}:00 ${meridiem}`;
    }
    
    return new EmbedBuilder()
        .setColor('#7f56d9')
        .setTitle('📡 Daily Gathering Confirmation')
        .setDescription(`Today ${timeString}! Is the daily gathering confirmed for today?`)
        .addFields(
            { name: 'Location', value: '📯 Common hall (Voice room)', inline: true },
            { name: 'Time', value: timeString, inline: true }
        )
        .setFooter({ text: 'Anyone can confirm or cancel the gathering' })
        .setTimestamp();
}

function buildConfirmationEmbed(confirmedBy, gatheringTime = DEFAULT_GATHERING_HOUR) {
    let timeString = '';
    let hour = Math.floor(gatheringTime);
    let minute = 0;
    
    // Handle decimal times (e.g., 19.5 for 7:30 PM)
    if (gatheringTime === 19.5) {
        timeString = '7:30 PM';
        hour = 19;
        minute = 30;
    } else {
        const meridiem = gatheringTime >= 12 ? 'PM' : 'AM';
        timeString = `${hour}:00 ${meridiem}`;
    }
    
    // Calculate time until gathering starts
    const now = getCurrentTimeInTimeZone();
    const gatheringStart = new Date(now);
    gatheringStart.setHours(hour, minute, 0, 0);
    
    // If the gathering time has passed, set it for tomorrow
    if (gatheringStart <= now) {
        gatheringStart.setDate(gatheringStart.getDate() + 1);
    }
    
    const timeUntilMs = gatheringStart.getTime() - now.getTime();
    const hoursUntil = Math.floor(timeUntilMs / (1000 * 60 * 60));
    const minutesUntil = Math.floor((timeUntilMs % (1000 * 60 * 60)) / (1000 * 60));
    
    let timeUntilString = '';
    if (hoursUntil > 0) {
        timeUntilString = `${hoursUntil}h ${minutesUntil}m`;
    } else {
        timeUntilString = `${minutesUntil}m`;
    }
    
    const statusMessage = `Daily gathering will start in ${timeUntilString} at ${timeString}`;
    
    return new EmbedBuilder()
        .setColor('#12b76a')
        .setTitle('✅ Daily Gathering Confirmed!')
        .setDescription(`The daily gathering has been confirmed by ${confirmedBy}!`)
        .addFields(
            { name: 'Location', value: '📯 Common hall (Voice room)', inline: true },
            { name: 'Time', value: timeString, inline: true },
            { name: 'Status', value: statusMessage, inline: false }
        )
        .setTimestamp();
}

function buildCancellationEmbed(cancelledBy) {
    return new EmbedBuilder()
        .setColor('#dc3545')
        .setTitle('❌ Daily Gathering Cancelled')
        .setDescription(`Today's gathering has been cancelled by ${cancelledBy}.`)
        .addFields(
            { name: 'Status', value: '🚫 No gathering today', inline: true },
            { name: 'Reason', value: 'Cancelled by member', inline: true }
        )
        .setFooter({ text: 'Please check back tomorrow for the next gathering' })
        .setTimestamp();
}

function buildGatheringPromptButtons() {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('gather_confirm')
            .setLabel('✅ Confirm')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('gather_time_7pm')
            .setLabel('🕖 7:00 PM')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('gather_time_7_30pm')
            .setLabel('🕢 7:30 PM')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('gather_time_8pm')
            .setLabel('🕗 8:00 PM')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('gather_cancel')
            .setLabel('❌ Cancel')
            .setStyle(ButtonStyle.Danger)
    );
}

function formatDuration(ms) {
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

function buildMeetingReportEmbed(meetingTitle, attendanceData, totalDurationMs, plannedDurationMs = GATHERING_DURATION_MS) {
    const durationLabel = formatDuration(totalDurationMs);
    const plannedDurationLabel = formatDuration(plannedDurationMs);
    const overtimeMs = Math.max(0, totalDurationMs - plannedDurationMs);
    const overtimeLabel = overtimeMs > 0 ? formatDuration(overtimeMs) : '0m';

    // Build attendance lines
    const attendanceLines = [];
    
    // Sort by duration descending
    const sorted = [...attendanceData].sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0));
    
    for (const participant of sorted) {
        const durationMinutes = Math.floor((participant.durationMs || 0) / 60000);
        const percentage = plannedDurationMs > 0 ? Math.min(100, Math.round((durationMinutes / 60) * 100)) : 0;
        const emoji = percentage >= 95 ? '⭐' : '';
        
        attendanceLines.push(
            `• ${participant.displayName || participant.username} - ${durationMinutes}m (${percentage}%) ${emoji}`
        );
    }

    const fullAttendance = attendanceData.filter(p => (p.durationMs || 0) >= (plannedDurationMs * 0.95)).length;

    const embedDescription = `📝 ${meetingTitle}\n🎙️ Channel: Gathering\n⏱️ Total: ${durationLabel}\n⏱️ Overtime: ${overtimeLabel}\n\n👥 Complete Attendance:\n\n${attendanceLines.join('\n')}\n\n📈 Total: ${attendanceData.length} | Full (95%+): ${fullAttendance}`;

    const embed = new EmbedBuilder()
        .setColor('#12b76a')
        .setTitle('📊 Final Meeting Report')
        .setDescription(embedDescription)
        .setTimestamp();

    return embed;
}

async function startGatheringTracking(guild, gatheringTime) {
    const guildId = guild.id;
    const today = new Date();
    const dateStr = today.toISOString().split('T')[0];
    const meetingTitle = `Clan Gathering #${Math.floor(Math.random() * 1000)} - Discussion`;

    const voiceChannel = findGatheringVoiceChannel(guild);
    if (!voiceChannel) {
        console.warn(`⚠️ Voice channel not found for gathering in ${guild.name}`);
        return;
    }

    // Create a session object
    const session = {
        guildId,
        voiceChannelId: voiceChannel.id,
        meetingTitle,
        gatheringTime,
        startMs: Date.now(),
        participants: new Map(),
        meetingId: null,
    };

    // Create meeting in database
    try {
        // Convert gatheringTime to proper time format
        let meetingTimeStr = '';
        if (gatheringTime === 19.5) {
            meetingTimeStr = '19:30:00';
        } else if (typeof gatheringTime === 'string') {
            meetingTimeStr = gatheringTime; // Already in HH:MM:SS format
        } else {
            const hour = Math.floor(gatheringTime);
            meetingTimeStr = `${hour}:00:00`;
        }
        
        const meeting = await createMeeting({
            title: meetingTitle,
            meeting_date: dateStr,
            meeting_time: meetingTimeStr,
            scheduled_time: meetingTimeStr,
            total_members: voiceChannel.members.size,
        });

        if (meeting) {
            session.meetingId = meeting.meeting_id;
            console.log(`📝 Meeting created with ID: ${session.meetingId}`);
        }
    } catch (error) {
        console.error('Error creating meeting:', error);
    }

    // Track all current voice channel members
    for (const member of voiceChannel.members.values()) {
        if (!member.user.bot) {
            session.participants.set(member.user.id, {
                memberId: member.user.id,
                username: member.user.username,
                displayName: member.displayName || member.user.username,
                joinMs: Date.now(),
                durationMs: 0,
            });
        }
    }

    gatheringSessions.set(guildId, session);
    console.log(`🎙️ Gathering tracking started in ${guild.name} - ${session.participants.size} participants`);

    // Schedule meeting end after 1 hour
    setTimeout(async () => {
        await endGatheringTracking(guild);
    }, GATHERING_DURATION_MS);
}

async function endGatheringTracking(guild) {
    const guildId = guild.id;
    const session = gatheringSessions.get(guildId);

    if (!session) return;

    const endMs = Date.now();
    const totalDurationMs = endMs - session.startMs;

    // Calculate final durations
    const attendanceRecords = [];
    for (const participant of session.participants.values()) {
        const finalDurationMs = participant.durationMs + (endMs - participant.joinMs);
        participant.durationMs = finalDurationMs;

        attendanceRecords.push({
            meeting_id: session.meetingId,
            member_id: parseInt(participant.memberId, 10),
            username: participant.username,
            display_name: participant.displayName,
            joined_at: new Date(session.startMs + participant.joinMs).toISOString(),
            left_at: new Date(endMs).toISOString(),
            total_duration_minutes: Math.floor(finalDurationMs / 60000),
            attendance_percentage: Math.min(100, Math.round((finalDurationMs / GATHERING_DURATION_MS) * 100)),
            points_awarded: 10,
        });
    }

    // Record attendance in database
    if (session.meetingId && attendanceRecords.length > 0) {
        try {
            await recordAttendance(session.meetingId, attendanceRecords);
            await updateMeetingEnd(session.meetingId, {
                end_time: new Date(endMs).toISOString(),
                duration_minutes: Math.floor(totalDurationMs / 60000),
                attended_members: session.participants.size,
            });
            console.log(`✅ Meeting ${session.meetingId} ended with ${session.participants.size} attendees`);
        } catch (error) {
            console.error('Error recording attendance:', error);
        }
    }

    // Build and send report
    const commonHall = findCommonHallChannel(guild);
    if (commonHall) {
        try {
            const reportEmbed = buildMeetingReportEmbed(
                session.meetingTitle,
                Array.from(session.participants.values()),
                totalDurationMs
            );
            await commonHall.send({ embeds: [reportEmbed] });
            console.log(`📊 Meeting report sent to ${commonHall.name}`);
        } catch (error) {
            console.error('Error sending meeting report:', error);
        }
    }

    // Clean up session
    gatheringSessions.delete(guildId);
    console.log(`🏁 Gathering tracking ended for ${guild.name}`);
}

function scheduleDailyGatheringPrompt(client, guild) {
    const scheduleNext = () => {
        const delay = getDelayUntilNextScheduledTime(GATHERING_PROMPT_HOUR, GATHERING_PROMPT_MINUTE);
        
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

    // Get gathering time from database (or use default)
    const today = new Date();
    const status = await getGatheringStatus(today);
    let currentGatheringTime = DEFAULT_GATHERING_HOUR;
    
    if (status?.gathering_time) {
        currentGatheringTime = parseInt(status.gathering_time.split(':')[0]);
    }

    const embed = buildGatheringPromptEmbed(currentGatheringTime);
    const buttons = buildGatheringPromptButtons();

    try {
        await channel.send({
            embeds: [embed],
            components: [buttons],
        });
    } catch (error) {
        console.error('Error sending gathering prompt:', error);
    }
}

function handleGatheringConfirmation(client) {
    client.on('interactionCreate', async (interaction) => {
        if (!interaction.isButton()) return;
        
        // Only handle gather_* buttons
        if (!interaction.customId.startsWith('gather_')) return;

        const guild = interaction.guild;
        const today = new Date();
        const memberId = parseInt(interaction.user.id, 10);

        try {
            await interaction.deferReply({ flags: MessageFlags.Ephemeral });

            // Handle time change buttons
            if (interaction.customId === 'gather_time_7pm') {
                const newTime = 19; // 7:00 PM
                await updateGatheringTime(today, newTime);

                // Update the original message with new time
                const timeString = `${newTime}:00 PM`;
                const updatedEmbed = buildGatheringPromptEmbed(newTime);
                const buttons = buildGatheringPromptButtons();

                await interaction.message.edit({
                    embeds: [updatedEmbed],
                    components: [buttons]
                });

                await interaction.editReply({
                    content: `⏰ Gathering time updated to ${timeString}!`
                });
            } else if (interaction.customId === 'gather_time_8pm') {
                const newTime = 20; // 8:00 PM
                await updateGatheringTime(today, newTime);

                // Update the original message with new time
                const timeString = `${newTime}:00 PM`;
                const updatedEmbed = buildGatheringPromptEmbed(newTime);
                const buttons = buildGatheringPromptButtons();

                await interaction.message.edit({
                    embeds: [updatedEmbed],
                    components: [buttons]
                });

                await interaction.editReply({
                    content: `⏰ Gathering time updated to ${timeString}!`
                });
            } else if (interaction.customId === 'gather_time_7_30pm') {
                const newTime = '19:30:00'; // 7:30 PM
                await updateGatheringTime(today, newTime);

                // Update the original message with new time
                const timeString = '7:30 PM';
                const updatedEmbed = buildGatheringPromptEmbed(19.5);
                const buttons = buildGatheringPromptButtons();

                await interaction.message.edit({
                    embeds: [updatedEmbed],
                    components: [buttons]
                });

                await interaction.editReply({
                    content: `⏰ Gathering time updated to ${timeString}!`
                });
            } else if (interaction.customId === 'gather_confirm') {
                // Get the current gathering time from database (or use default)
                const status = await getGatheringStatus(today);
                const currentTime = status?.gathering_time ? parseInt(status.gathering_time.split(':')[0]) : DEFAULT_GATHERING_HOUR;
                const timeString = `${currentTime}:00 ${currentTime >= 12 ? 'PM' : 'AM'}`;

                // Store confirmation in database
                const confirmResult = await confirmGathering(memberId, interaction.user.username, today, currentTime);
                
                // Check if confirmation failed (likely due to foreign key constraint)
                if (!confirmResult) {
                    return interaction.editReply({
                        content: '❌ Error: User not found in database. Please contact an administrator to add you to the members database.'
                    });
                }

                // START GATHERING TRACKING
                await startGatheringTracking(guild, currentTime);

                await interaction.editReply({
                    content: `✅ Gathering confirmed for ${timeString}! Tracking started...`
                });

                // Disable buttons after confirmation
                const disabledButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('gather_confirm_disabled')
                        .setLabel('✅ Confirmed')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('gather_time_7pm_disabled')
                        .setLabel('🕖 7:00 PM')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('gather_time_7_30pm_disabled')
                        .setLabel('🕢 7:30 PM')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('gather_time_8pm_disabled')
                        .setLabel('🕗 8:00 PM')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('gather_cancel_disabled')
                        .setLabel('❌ Cancel')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(true)
                );

                await interaction.message.edit({
                    components: [disabledButtons]
                });
            } else if (interaction.customId === 'gather_cancel') {
                // Store cancellation in database
                await cancelGathering(today, memberId, interaction.user.username);

                // Send cancellation embed to common-hall
                const commonHallChannel = findCommonHallChannel(guild);
                if (commonHallChannel) {
                    try {
                        const cancellationEmbed = buildCancellationEmbed(interaction.user.username);
                        await commonHallChannel.send({ embeds: [cancellationEmbed] });
                    } catch (channelError) {
                        console.error('Error sending cancellation to common-hall:', channelError);
                    }
                }

                await interaction.editReply({
                    content: '✅ Gathering cancelled.'
                });

                // Disable buttons after cancellation
                const disabledButtons = new ActionRowBuilder().addComponents(
                    new ButtonBuilder()
                        .setCustomId('gather_confirm_disabled')
                        .setLabel('✅ Confirm')
                        .setStyle(ButtonStyle.Success)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('gather_time_7pm_disabled')
                        .setLabel('🕖 7:00 PM')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('gather_time_7_30pm_disabled')
                        .setLabel('🕢 7:30 PM')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('gather_time_8pm_disabled')
                        .setLabel('🕗 8:00 PM')
                        .setStyle(ButtonStyle.Primary)
                        .setDisabled(true),
                    new ButtonBuilder()
                        .setCustomId('gather_cancel_disabled')
                        .setLabel('❌ Cancelled')
                        .setStyle(ButtonStyle.Danger)
                        .setDisabled(true)
                );

                await interaction.message.edit({
                    components: [disabledButtons]
                });
            }
        } catch (error) {
            console.error('Error handling gathering button:', error);
            if (!interaction.replied) {
                await interaction.editReply({
                    content: '❌ Error processing your response.'
                });
            }
        }
    });
}

function handleVoiceStateUpdates(client) {
    client.on('voiceStateUpdate', async (oldState, newState) => {
        const guild = newState.guild || oldState.guild;
        if (!guild) return;

        const guildId = guild.id;
        const session = gatheringSessions.get(guildId);
        if (!session) return; // No active gathering session

        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return;

        const voiceRoom = GATHERING_VOICE_ROOM;
        const leftChannel = oldState.channelId === voiceRoom && newState.channelId !== voiceRoom;
        const joinedChannel = newState.channelId === voiceRoom && oldState.channelId !== voiceRoom;

        if (joinedChannel) {
            // Member joined the gathering voice channel
            if (!session.participants.has(member.user.id)) {
                session.participants.set(member.user.id, {
                    memberId: member.user.id,
                    username: member.user.username,
                    displayName: member.displayName || member.user.username,
                    joinMs: Date.now(),
                    durationMs: 0,
                });
                console.log(`✅ ${member.user.username} joined gathering`);
            }
        } else if (leftChannel) {
            // Member left the gathering voice channel
            const participant = session.participants.get(member.user.id);
            if (participant) {
                participant.durationMs += Date.now() - participant.joinMs;
                console.log(`❌ ${member.user.username} left gathering - duration: ${formatDuration(participant.durationMs)}`);
            }
        }
    });
}

function handleGatheringScheduler(client) {
    // Setup scheduler function
    const setupScheduler = () => {
        const guilds = client.guilds.cache;
        
        let successCount = 0;
        for (const guild of guilds.values()) {
            const tinkeringChannel = findTinkeringChannel(guild);
            if (tinkeringChannel) {
                scheduleDailyGatheringPrompt(client, guild);
                successCount++;
            } else {
                console.warn(`⚠️ Tinkering channel NOT found in ${guild.name}`);
            }
        }
        console.log(`✓ Daily gathering scheduler initialized (${successCount}/${guilds.size} guilds)`);
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

    // Handle voice state updates for tracking
    handleVoiceStateUpdates(client);
}

module.exports = {
    handleGatheringScheduler,
};
