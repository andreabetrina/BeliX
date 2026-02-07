const {
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    EmbedBuilder,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
} = require('discord.js');
const { addPoints, initializePoints, createMeeting, updateMeetingEnd, recordAttendance } = require('../database/db');
const { getCurrentTimeInTimeZone, getDelayUntilNextScheduledTime, formatTimeInTimeZone } = require('../utils/timezoneUtils');
const fs = require('fs');
const path = require('path');

const MEETING_VOICE_CHANNEL_ID = process.env['voiceroom-Common-hall'] || process.env.MEETING_VOICE_CHANNEL_ID || '1304848107095326830';
const MEETING_PROMPT_CHANNEL_ID = process.env.tinkering || process.env.MEETING_PROMPT_CHANNEL_ID || '1304848107095326831';
const MEETING_ANNOUNCE_CHANNEL_ID = process.env['common-hall'] || process.env.MEETING_ANNOUNCE_CHANNEL_ID || '1304848107095326831';
const MEETING_PROMPT_HOUR = Number.parseInt(process.env.MEETING_PROMPT_HOUR || '18', 10);
const MEETING_PROMPT_MINUTE = Number.parseInt(process.env.MEETING_PROMPT_MINUTE || '0', 10);
const MEETING_END_IDLE_MINUTES = Number.parseInt(process.env.MEETING_END_IDLE_MINUTES || '5', 10);
const ROOKIES_DATA = path.join(__dirname, '../json/rookiesData.json');
const ROOKIE_ATTENDANCE_DATA = path.join(__dirname, '../json/rookiesAttendance.json');
const ROOKIE_ROLE_NAME = (process.env.ROOKIE_ROLE_NAME || 'rookies').trim().toLowerCase();

const guildStates = new Map();

function normalizeName(value) {
    return (value || '').toLowerCase().trim();
}

function formatTimeLabel(date) {
    const options = {
        timeZone: 'Asia/Kolkata',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
    };
    return date.toLocaleString('en-US', options);
}

function formatDuration(ms) {
    const minutes = Math.max(0, Math.round(ms / 60000));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function resolveTextChannel(guild) {
    const byId = guild.channels.cache.get(MEETING_PROMPT_CHANNEL_ID);
    if (byId?.isTextBased()) return byId;

    return guild.channels.cache.find(channel =>
        channel.isTextBased() &&
        ['tinkering', 'tinker', 'tinkering-room'].some(name =>
            channel.name?.toLowerCase().includes(name)
        )
    );
}

function resolveAnnouncementChannel(guild) {
    const byId = guild.channels.cache.get(MEETING_ANNOUNCE_CHANNEL_ID);
    if (byId?.isTextBased()) return byId;

    return guild.channels.cache.find(channel =>
        channel.isTextBased() &&
        ['common hall', 'common-hall', 'commonhall'].some(name =>
            channel.name?.toLowerCase().includes(name)
        )
    );
}

function resolveVoiceChannel(guild) {
    const byId = guild.channels.cache.get(MEETING_VOICE_CHANNEL_ID);
    if (byId?.isVoiceBased()) return byId;

    return guild.channels.cache.find(channel =>
        channel.isVoiceBased() &&
        ['common hall', 'common-hall', 'commonhall'].some(name =>
            channel.name?.toLowerCase().includes(name)
        )
    );
}

async function resolveTrackedMembers(guild) {
    const members = await guild.members.fetch();
    const trackedMap = new Map();

    for (const member of members.values()) {
        if (member.user.bot) continue;
        trackedMap.set(member.user.id, member);
    }

    return trackedMap;
}

function loadRookiesData() {
    if (!fs.existsSync(ROOKIES_DATA)) {
        return { rookiesmembersData: [], lastUpdated: null };
    }

    try {
        const fileContent = fs.readFileSync(ROOKIES_DATA, 'utf-8');
        if (!fileContent.trim()) {
            return { rookiesmembersData: [], lastUpdated: null };
        }
        return JSON.parse(fileContent);
    } catch (error) {
        console.error('Error reading rookies data:', error.message);
        return { rookiesmembersData: [], lastUpdated: null };
    }
}

function saveRookiesData(data) {
    try {
        fs.writeFileSync(ROOKIES_DATA, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing rookies data:', error.message);
    }
}

function loadRookieAttendance() {
    if (!fs.existsSync(ROOKIE_ATTENDANCE_DATA)) {
        return { records: [], lastUpdated: null };
    }

    try {
        const fileContent = fs.readFileSync(ROOKIE_ATTENDANCE_DATA, 'utf-8');
        if (!fileContent.trim()) {
            return { records: [], lastUpdated: null };
        }
        return JSON.parse(fileContent);
    } catch (error) {
        console.error('Error reading rookies attendance data:', error.message);
        return { records: [], lastUpdated: null };
    }
}

function saveRookieAttendance(data) {
    try {
        fs.writeFileSync(ROOKIE_ATTENDANCE_DATA, JSON.stringify(data, null, 2));
    } catch (error) {
        console.error('Error writing rookies attendance data:', error.message);
    }
}

function recordRookieAttendance({
    member,
    attendedMs,
    attendancePercentage,
    meetingId,
    meetingDate,
    scheduledLabel,
    voiceChannelId,
}) {
    const data = loadRookieAttendance();
    const nowIso = new Date().toISOString();

    data.records.push({
        meetingId,
        meetingDate,
        scheduledLabel,
        voiceChannelId,
        userId: member.user.id,
        username: member.user.username,
        displayName: member.displayName || member.user.username,
        totalDurationMinutes: Math.round(attendedMs / 60000),
        attendancePercentage: parseFloat(attendancePercentage.toFixed(2)),
        createdAt: nowIso,
    });

    data.lastUpdated = nowIso;
    saveRookieAttendance(data);
}

function upsertRookieEntry(data, { username, userId }) {
    const existingEntry = data.rookiesmembersData.find(m => m.userId === userId || m.username === username);
    const timestamp = new Date().toISOString();

    if (existingEntry) {
        existingEntry.username = existingEntry.username || username;
        existingEntry.userId = existingEntry.userId || userId;
        existingEntry.lastSeen = timestamp;
        return existingEntry;
    }

    const entry = {
        username,
        userId,
        firstSeen: timestamp,
        lastSeen: timestamp,
        points: 0,
        lastAwardedDate: null,
        lastAwardedAt: null,
    };

    data.rookiesmembersData.push(entry);
    return entry;
}

function isRookieMember(member) {
    const hasRole = member.roles.cache.some(role => normalizeName(role.name) === ROOKIE_ROLE_NAME);
    if (hasRole) return true;

    const data = loadRookiesData();
    return data.rookiesmembersData.some(m => m.userId === member.user.id || m.username === member.user.username);
}

function awardRookiePoints(member, pointsToAward, awardDateKey) {
    const data = loadRookiesData();
    const entry = upsertRookieEntry(data, {
        username: member.user.username,
        userId: member.user.id,
    });

    if (entry.lastAwardedDate === awardDateKey) {
        return { updated: false, points: entry.points || 0 };
    }

    entry.points = (entry.points || 0) + pointsToAward;
    entry.lastAwardedDate = awardDateKey;
    entry.lastAwardedAt = new Date().toISOString();
    data.lastUpdated = entry.lastAwardedAt;
    saveRookiesData(data);

    return { updated: true, points: entry.points };
}

function parseTimeInput(input, now = getCurrentTimeInTimeZone()) {
    const trimmed = normalizeName(input);
    const match = trimmed.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
    if (!match) return null;

    let hour = Number.parseInt(match[1], 10);
    const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
    const meridiem = match[3]?.toLowerCase();

    if (minute > 59) return null;

    if (meridiem) {
        if (hour < 1 || hour > 12) return null;
        if (meridiem === 'pm' && hour !== 12) hour += 12;
        if (meridiem === 'am' && hour === 12) hour = 0;
    } else if (hour > 23) {
        return null;
    }

    // Create a date in Asia/Kolkata timezone
    // Get current system time
    const systemNow = new Date();
    const kolkataDate = new Date(now);
    
    // Calculate the offset between system time and Kolkata time
    const offset = systemNow.getTime() - kolkataDate.getTime();
    
    // Create a new date with the target time in Kolkata timezone
    const scheduled = new Date(kolkataDate);
    scheduled.setHours(hour, minute, 0, 0);
    
    // Adjust to system time by applying the offset
    scheduled.setTime(scheduled.getTime() + offset);
    
    return scheduled;
}

async function respondEphemeral(interaction, content) {
    try {
        // Always use editReply if we've deferred, otherwise use reply
        if (interaction.deferred || interaction.replied) {
            return await interaction.editReply({ content, flags: 64 });
        }
        // Fallback to reply if not deferred/replied yet
        return await interaction.reply({ content, flags: 64 });
    } catch (error) {
        // If error occurs, try followUp as last resort
        try {
            if (!error.message.includes('already been acknowledged')) {
                return await interaction.followUp({ content, flags: 64 });
            }
        } catch (followUpError) {
            console.error('Error responding to interaction:', error.message);
        }
    }
}

function buildTimeButtons() {
    const times = [
        { label: '7:00 PM', value: '19:00' },
        { label: '7:30 PM', value: '19:30' },
        { label: '8:00 PM', value: '20:00' },
        { label: '8:30 PM', value: '20:30' },
    ];

    const row = new ActionRowBuilder();
    times.forEach(time => {
        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`meeting_time_${time.value}`)
                .setLabel(time.label)
                .setStyle(ButtonStyle.Primary)
        );
    });

    const manualRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('meeting_time_manual')
            .setLabel('Manual time')
            .setStyle(ButtonStyle.Secondary)
    );

    return [row, manualRow];
}

function buildMeetingPromptEmbed(guild) {
    return new EmbedBuilder()
        .setColor('#7f56d9')
        .setTitle('📅 Clan Gathering Meeting Time')
        .setDescription(
            'Please choose the meeting time for today.\n' +
            'Options: 7:00 PM, 7:30 PM, 8:00 PM, 8:30 PM, or enter a manual time.'
        )
        .setFooter({ text: `Server: ${guild.name}` })
        .setTimestamp();
}

function buildMeetingReportEmbed({ meetingDate, scheduledLabel, durationLabel, attendanceLines }) {
    return new EmbedBuilder()
        .setColor('#12b76a')
        .setTitle('✅ Clan Gathering Meeting Report')
        .addFields(
            { name: 'Date', value: meetingDate, inline: true },
            { name: 'Meeting Time', value: scheduledLabel, inline: true },
            { name: 'Meeting Duration', value: durationLabel, inline: true },
            { name: 'Attendance', value: attendanceLines || 'No attendance recorded.' }
        )
        .setTimestamp();
}

function getOrCreateState(guildId) {
    if (!guildStates.has(guildId)) {
        guildStates.set(guildId, {
            meetingId: null,
            scheduledAt: null,
            scheduledLabel: null,
            startTimeout: null,
            endTimeout: null,
            started: false,
            startAt: null,
            endAt: null,
            participants: new Map(),
            trackedMembers: new Map(),
            voiceChannelId: null,
            promptMessageId: null,
            isScheduled: false,
        });
    }
    return guildStates.get(guildId);
}

function buildScheduledMessageComponents() {
    const editRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('meeting_edit_time')
            .setLabel('Edit Time')
            .setStyle(ButtonStyle.Secondary)
    );
    return [editRow];
}

function buildScheduledMessageEmbed(scheduledLabel, guild) {
    return new EmbedBuilder()
        .setColor('#12b76a')
        .setTitle('✅ Meeting Scheduled')
        .setDescription(`Daily Gathering scheduled for **${scheduledLabel}**.`)
        .setFooter({ text: `Server: ${guild.name}` })
        .setTimestamp();
}

function scheduleDailyPrompt(client, guild) {
    const scheduleNext = () => {
        const delay = getDelayUntilNextScheduledTime(MEETING_PROMPT_HOUR, MEETING_PROMPT_MINUTE);
        const hours = Math.floor(delay / (1000 * 60 * 60));
        const minutes = Math.floor((delay % (1000 * 60 * 60)) / (1000 * 60));
        
        console.log(`📅 Meeting prompt scheduled in ${hours}h ${minutes}m (${MEETING_PROMPT_HOUR}:${MEETING_PROMPT_MINUTE.toString().padStart(2, '0')} Asia/Kolkata) for ${guild.name}`);

        setTimeout(async () => {
            await sendMeetingPrompt(client, guild);
            scheduleNext();
        }, delay);
    };

    scheduleNext();
}

async function sendMeetingPrompt(client, guild) {
    const channel = resolveTextChannel(guild);
    if (!channel) {
        console.warn(`⚠️ Meeting prompt channel not found in ${guild.name}`);
        return;
    }

    const embed = buildMeetingPromptEmbed(guild);
    const components = buildTimeButtons();

    const msg = await channel.send({ embeds: [embed], components });
    const state = getOrCreateState(guild.id);
    state.promptMessageId = msg.id;
    state.isScheduled = false;
}

async function scheduleMeetingStart(guild, scheduledAt) {
    const state = getOrCreateState(guild.id);

    if (state.startTimeout) {
        clearTimeout(state.startTimeout);
    }

    state.scheduledAt = scheduledAt;
    state.scheduledLabel = formatTimeLabel(scheduledAt);
    state.isScheduled = true;

    if (!state.meetingId) {
        const dateStr = scheduledAt.toISOString().split('T')[0];
        const timeStr = scheduledAt.toTimeString().slice(0, 5);
        const trackedMembers = await resolveTrackedMembers(guild);
        const meetingRecord = await createMeeting({
            title: `Daily Gathering - ${dateStr}`,
            meeting_date: dateStr,
            meeting_time: timeStr,
            scheduled_time: timeStr,
            total_members: trackedMembers.size,
        });

        state.meetingId = meetingRecord?.meeting_id || null;
    }

    if (state.promptMessageId) {
        const channel = resolveTextChannel(guild);
        if (channel) {
            try {
                const msg = await channel.messages.fetch(state.promptMessageId);
                const embed = buildScheduledMessageEmbed(state.scheduledLabel, guild);
                const components = buildScheduledMessageComponents();
                await msg.edit({ embeds: [embed], components });
            } catch (error) {
                console.error('Error updating prompt message:', error.message);
            }
        }
    }

    const announceChannel = resolveAnnouncementChannel(guild);
    if (announceChannel) {
        await announceChannel.send(`📣 Daily Gathering scheduled at **${state.scheduledLabel}**.`);
    }

    const delay = getDelayUntilNextScheduledTime(scheduledAt.getHours(), scheduledAt.getMinutes());
    state.startTimeout = setTimeout(() => startMeeting(guild), delay);
}

async function startMeeting(guild) {
    const state = getOrCreateState(guild.id);
    if (state.started) return;

    const voiceChannel = resolveVoiceChannel(guild);
    if (!voiceChannel) {
        console.warn(`⚠️ Meeting voice channel not found in ${guild.name}`);
        return;
    }

    state.voiceChannelId = voiceChannel.id;
    state.started = true;
    state.startAt = Date.now();
    state.endAt = null;
    state.participants = new Map();
    state.trackedMembers = await resolveTrackedMembers(guild);

    if (!state.meetingId) {
        const meetingDate = new Date(state.startAt);
        const dateStr = meetingDate.toISOString().split('T')[0];
        const timeStr = meetingDate.toTimeString().slice(0, 5);

        const meetingRecord = await createMeeting({
            title: `Daily Gathering - ${dateStr}`,
            meeting_date: dateStr,
            meeting_time: timeStr,
            scheduled_time: state.scheduledLabel || timeStr,
            total_members: state.trackedMembers.size,
        });

        state.meetingId = meetingRecord?.meeting_id || null;
    }

    const now = Date.now();
    for (const member of voiceChannel.members.values()) {
        if (state.trackedMembers.has(member.user.id)) {
            state.participants.set(member.user.id, { totalMs: 0, joinAt: now });
        }
    }

    const channel = resolveAnnouncementChannel(guild);
    if (channel) {
        await channel.send(`🔔 Meeting started in **${voiceChannel.name}**. Attendance is now being tracked.`);
    }
}

async function endMeeting(guild) {
    const state = getOrCreateState(guild.id);
    if (!state.started) return;

    if (state.endTimeout) {
        clearTimeout(state.endTimeout);
        state.endTimeout = null;
    }

    state.endAt = Date.now();

    for (const [userId, record] of state.participants.entries()) {
        if (record.joinAt) {
            record.totalMs += state.endAt - record.joinAt;
            record.joinAt = null;
        }
    }

    const durationMs = Math.max(0, state.endAt - state.startAt);
    const durationMinutes = Math.round(durationMs / 60000);

    const attendanceLines = [];
    const attendanceRecords = [];
    let attendedCount = 0;

    for (const [userId, member] of state.trackedMembers.entries()) {
        const record = state.participants.get(userId);
        const attendedMs = record?.totalMs || 0;
        const percentage = durationMs > 0 ? (attendedMs / durationMs) * 100 : 0;
        const percentageLabel = `${percentage.toFixed(0)}%`;
        const nameLabel = member.displayName || member.user.username;
        const rookie = isRookieMember(member);

        attendanceLines.push(`• **${nameLabel}** — ${percentageLabel} (${formatDuration(attendedMs)})`);

        let pointsAwarded = 0;
        if (percentage > 50) {
            if (!rookie) {
                await initializePoints(userId);
                await addPoints(userId, 5);
                pointsAwarded = 5;
                attendedCount++;
            }
        }

        if (!rookie) {
            // Record attendance in database
            attendanceRecords.push({
                meeting_id: state.meetingId,
                member_id: userId,
                username: member.user.username,
                display_name: nameLabel,
                total_duration_minutes: Math.round(attendedMs / 60000),
                attendance_percentage: parseFloat(percentage.toFixed(2)),
                points_awarded: pointsAwarded,
                created_at: new Date().toISOString(),
            });
        } else {
            recordRookieAttendance({
                member,
                attendedMs,
                attendancePercentage: percentage,
                meetingId: state.meetingId,
                meetingDate: new Date(state.startAt).toISOString().split('T')[0],
                scheduledLabel: state.scheduledLabel || 'N/A',
                voiceChannelId: state.voiceChannelId,
            });
        }
    }

    // Save meeting to database
    if (state.meetingId) {
        await updateMeetingEnd(state.meetingId, {
            end_time: new Date(state.endAt).toISOString(),
            duration_minutes: durationMinutes,
            attended_members: attendedCount,
        });

        // Record all attendance
        await recordAttendance(state.meetingId, attendanceRecords);
    }

    const meetingDate = new Date(state.startAt).toLocaleDateString('en-US', { timeZone: 'Asia/Kolkata' });
    const durationLabel = formatDuration(durationMs);
    const reportEmbed = buildMeetingReportEmbed({
        meetingDate,
        scheduledLabel: state.scheduledLabel || 'N/A',
        durationLabel,
        attendanceLines: attendanceLines.join('\n'),
    });

    const channel = resolveAnnouncementChannel(guild);
    if (channel) {
        await channel.send({ embeds: [reportEmbed] });
    }

    state.started = false;
    state.startAt = null;
    state.endAt = null;
    state.participants = new Map();
    state.trackedMembers = new Map();
    state.meetingId = null;
}

function handleVoiceStateUpdate(oldState, newState) {
    const guild = newState.guild || oldState.guild;
    if (!guild) return;

    const state = getOrCreateState(guild.id);
    if (!state.started || !state.voiceChannelId) return;

    const voiceChannelId = state.voiceChannelId;
    const leftChannel = oldState.channelId === voiceChannelId;
    const joinedChannel = newState.channelId === voiceChannelId;

    if (!leftChannel && !joinedChannel) return;

    const member = newState.member || oldState.member;
    if (!member || !state.trackedMembers.has(member.user.id)) return;

    const now = Date.now();
    const record = state.participants.get(member.user.id) || { totalMs: 0, joinAt: null };

    if (joinedChannel && !record.joinAt) {
        record.joinAt = now;
    }

    if (leftChannel && record.joinAt) {
        record.totalMs += now - record.joinAt;
        record.joinAt = null;
    }

    state.participants.set(member.user.id, record);

    const voiceChannel = guild.channels.cache.get(voiceChannelId);
    if (!voiceChannel?.isVoiceBased()) return;

    const trackedCount = Array.from(voiceChannel.members.values()).filter(m =>
        state.trackedMembers.has(m.user.id)
    ).length;

    if (trackedCount === 0) {
        if (!state.endTimeout) {
            state.endTimeout = setTimeout(() => endMeeting(guild), MEETING_END_IDLE_MINUTES * 60000);
        }
    } else if (state.endTimeout) {
        clearTimeout(state.endTimeout);
        state.endTimeout = null;
    }
}

function handleMeetingInteractions(client) {
    client.on('interactionCreate', async interaction => {
        if (!interaction.isButton() && !interaction.isModalSubmit()) return;
        
        if (!interaction.customId?.startsWith('meeting_')) return;

        const guild = interaction.guild;
        if (!guild) return;

        const state = getOrCreateState(guild.id);

        let wasDeferred = false;
        try {
            if (interaction.isButton() && (interaction.customId === 'meeting_edit_time' || interaction.customId === 'meeting_time_manual')) {
                // Don't defer for modal interactions - showModal() acknowledges the interaction
            } else if ((interaction.isButton() || interaction.isModalSubmit()) && interaction.customId?.startsWith('meeting_')) {
                // Defer for meeting interactions (except modal triggers)
                if (!interaction.deferred && !interaction.replied) {
                    await interaction.deferReply({ flags: 64 });
                    wasDeferred = true;
                }
            }
        } catch (error) {
            if (!error.message.includes('already been acknowledged')) {
                console.error('Error deferring interaction:', error.message);
            }
        }

        if (interaction.isButton()) {
            if (!interaction.customId.startsWith('meeting_time_') && interaction.customId !== 'meeting_edit_time') return;

            if (interaction.customId === 'meeting_edit_time') {
                const modal = new ModalBuilder()
                    .setCustomId('meeting_edit_time_modal')
                    .setTitle('Edit Meeting Time');

                const input = new TextInputBuilder()
                    .setCustomId('meeting_edit_time_input')
                    .setLabel('New time (e.g. 7:45 PM or 19:45)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                try {
                    return interaction.showModal(modal);
                } catch (error) {
                    console.error('Error showing edit modal:', error.message);
                }
            }

            if (interaction.customId === 'meeting_time_manual') {
                const modal = new ModalBuilder()
                    .setCustomId('meeting_time_modal')
                    .setTitle('Enter Meeting Time');

                const input = new TextInputBuilder()
                    .setCustomId('meeting_time_input')
                    .setLabel('Time (e.g. 7:45 PM or 19:45)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true);

                modal.addComponents(new ActionRowBuilder().addComponents(input));
                try {
                    return interaction.showModal(modal);
                } catch (error) {
                    console.error('Error showing time modal:', error.message);
                }
            }

            try {
                const timeValue = interaction.customId.replace('meeting_time_', '');
                const now = getCurrentTimeInTimeZone();
                const scheduledAt = parseTimeInput(timeValue, now);

                if (!scheduledAt) {
                    return respondEphemeral(interaction, 'Could not parse that meeting time.');
                }

                if (scheduledAt <= now) {
                    return respondEphemeral(interaction, 'Please choose a future time for today\'s meeting.');
                }

                await scheduleMeetingStart(guild, scheduledAt);
                return respondEphemeral(interaction, `Meeting scheduled for ${formatTimeLabel(scheduledAt)}.`);
            } catch (error) {
                console.error('Error handling time button:', error);
                try {
                    return respondEphemeral(interaction, 'An error occurred while scheduling the meeting.');
                } catch (e) {
                    console.error('Failed to send error message:', e.message);
                }
            }
        }

        if (interaction.isModalSubmit() && interaction.customId === 'meeting_time_modal') {
            const input = interaction.fields.getTextInputValue('meeting_time_input');
            const now = getCurrentTimeInTimeZone();
            const scheduledAt = parseTimeInput(input, now);

            if (!scheduledAt) {
                return respondEphemeral(interaction, 'Please enter a valid time like 7:30 PM or 19:30.');
            }

            if (scheduledAt <= now) {
                return respondEphemeral(interaction, 'Please enter a future time for today’s meeting.');
            }

            await scheduleMeetingStart(guild, scheduledAt);
            return respondEphemeral(interaction, `Meeting scheduled for ${formatTimeLabel(scheduledAt)}.`);
        }
        if (interaction.isModalSubmit() && interaction.customId === 'meeting_edit_time_modal') {
            const input = interaction.fields.getTextInputValue('meeting_edit_time_input');
            const now = getCurrentTimeInTimeZone();
            const scheduledAt = parseTimeInput(input, now);

            if (!scheduledAt) {
                return respondEphemeral(interaction, 'Please enter a valid time like 7:30 PM or 19:30.');
            }

            if (scheduledAt <= now) {
                return respondEphemeral(interaction, 'Please enter a future time for today\'s meeting.');
            }

            const state = getOrCreateState(guild.id);
            if (state.startTimeout) {
                clearTimeout(state.startTimeout);
                state.startTimeout = null;
            }

            await scheduleMeetingStart(guild, scheduledAt);

            const announceChannel = resolveAnnouncementChannel(guild);
            if (announceChannel) {
                await announceChannel.send(`📢 Daily Gathering time updated to **${formatTimeLabel(scheduledAt)}**.`);
            }

            return respondEphemeral(interaction, `Meeting time updated to ${formatTimeLabel(scheduledAt)}.`);
        }    });
}

function handleMeetingTracker(client) {
    client.once('ready', () => {
        for (const guild of client.guilds.cache.values()) {
            scheduleDailyPrompt(client, guild);
        }
    });

    client.on('guildCreate', guild => scheduleDailyPrompt(client, guild));
    client.on('voiceStateUpdate', handleVoiceStateUpdate);
    handleMeetingInteractions(client);
}

module.exports = { handleMeetingTracker };
