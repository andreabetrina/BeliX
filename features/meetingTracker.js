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

const MEETING_VOICE_CHANNEL_ID = process.env.MEETING_VOICE_CHANNEL_ID || '1304848107095326830';
const MEETING_TEXT_CHANNEL_ID = process.env.MEETING_TEXT_CHANNEL_ID || '1304848107095326831';
const MEETING_PROMPT_HOUR = Number.parseInt(process.env.MEETING_PROMPT_HOUR || '18', 10);
const MEETING_PROMPT_MINUTE = Number.parseInt(process.env.MEETING_PROMPT_MINUTE || '30', 10);
const MEETING_END_IDLE_MINUTES = Number.parseInt(process.env.MEETING_END_IDLE_MINUTES || '5', 10);

const TRACKED_USERNAMES = [
    'aadzmsa',
    'amruthaab',
    'andreabetrina',
    'geonithin',
    'sriiiharshiii',
    'jesh04',
    'maxwellrubert',
    'michalnithesh',
    'primsajun',
    'samuel93601',
    'sowmi2207',
    'ancy03115',
];

const MEETING_MANAGERS = new Set(['geonithin', 'sriiiharshiii']);

const guildStates = new Map();

function normalizeName(value) {
    return (value || '').toLowerCase().trim();
}

function formatTimeLabel(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatDuration(ms) {
    const minutes = Math.max(0, Math.round(ms / 60000));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
}

function resolveTextChannel(guild) {
    const byId = guild.channels.cache.get(MEETING_TEXT_CHANNEL_ID);
    if (byId?.isTextBased()) return byId;

    return guild.channels.cache.find(channel =>
        channel.isTextBased() &&
        ['clan-meeting-hall', 'common hall', 'common-hall'].some(name =>
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
        const username = normalizeName(member.user.username);
        const displayName = normalizeName(member.displayName);

        if (TRACKED_USERNAMES.includes(username) || TRACKED_USERNAMES.includes(displayName)) {
            trackedMap.set(member.user.id, member);
        }
    }

    return trackedMap;
}

function isMeetingManager(member) {
    const username = normalizeName(member.user.username);
    const displayName = normalizeName(member.displayName);
    return MEETING_MANAGERS.has(username) || MEETING_MANAGERS.has(displayName);
}

function parseTimeInput(input, now = new Date()) {
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

    const scheduled = new Date(now);
    scheduled.setHours(hour, minute, 0, 0);
    return scheduled;
}

function buildTimeButtons() {
    const times = [
        { label: '7:00 PM', value: '19:00' },
        { label: '7:15 PM', value: '19:15' },
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

function buildMeetingPromptEmbed(guild, managerMentions) {
    return new EmbedBuilder()
        .setColor('#7f56d9')
        .setTitle('📅 Clan Gathering Meeting Time')
        .setDescription(
            `Hi ${managerMentions}! Please choose the meeting time for today.\n` +
            'Options: 7:00 PM, 7:15 PM, 7:30 PM, 8:00 PM, 8:30 PM, or enter a manual time.'
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
        });
    }
    return guildStates.get(guildId);
}

function scheduleDailyPrompt(client, guild) {
    const scheduleNext = () => {
        const now = new Date();
        const next = new Date(now);
        next.setHours(MEETING_PROMPT_HOUR, MEETING_PROMPT_MINUTE, 0, 0);

        if (next <= now) {
            next.setDate(next.getDate() + 1);
        }

        const delay = next - now;
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

    const trackedMembers = await resolveTrackedMembers(guild);
    const managerMentions = Array.from(trackedMembers.values())
        .filter(member => isMeetingManager(member))
        .map(member => `<@${member.user.id}>`)
        .join(' ');

    const embed = buildMeetingPromptEmbed(guild, managerMentions || 'Geo / Harshini');
    const components = buildTimeButtons();

    await channel.send({ embeds: [embed], components });
}

function scheduleMeetingStart(guild, scheduledAt) {
    const state = getOrCreateState(guild.id);

    if (state.startTimeout) {
        clearTimeout(state.startTimeout);
    }

    state.scheduledAt = scheduledAt;
    state.scheduledLabel = formatTimeLabel(scheduledAt);

    const delay = scheduledAt.getTime() - Date.now();
    state.startTimeout = setTimeout(() => startMeeting(guild), Math.max(0, delay));
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

    // Create meeting record in database
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

    const now = Date.now();
    for (const member of voiceChannel.members.values()) {
        if (state.trackedMembers.has(member.user.id)) {
            state.participants.set(member.user.id, { totalMs: 0, joinAt: now });
        }
    }

    const channel = resolveTextChannel(guild);
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

        attendanceLines.push(`• **${nameLabel}** — ${percentageLabel} (${formatDuration(attendedMs)})`);

        let pointsAwarded = 0;
        if (percentage > 50) {
            await initializePoints(userId);
            await addPoints(userId, 5);
            pointsAwarded = 5;
            attendedCount++;
        }

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

    const meetingDate = new Date(state.startAt).toLocaleDateString();
    const durationLabel = formatDuration(durationMs);
    const reportEmbed = buildMeetingReportEmbed({
        meetingDate,
        scheduledLabel: state.scheduledLabel || 'N/A',
        durationLabel,
        attendanceLines: attendanceLines.join('\n'),
    });

    const channel = resolveTextChannel(guild);
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

        const guild = interaction.guild;
        if (!guild) return;

        const state = getOrCreateState(guild.id);

        if (interaction.isButton()) {
            if (!interaction.customId.startsWith('meeting_time_')) return;

            const member = interaction.member;
            if (!member || !isMeetingManager(member)) {
                return interaction.reply({ content: 'Only Geo or Harshini can set the meeting time.', ephemeral: true });
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
                return interaction.showModal(modal);
            }

            const timeValue = interaction.customId.replace('meeting_time_', '');
            const scheduledAt = parseTimeInput(timeValue, new Date());

            if (!scheduledAt) {
                return interaction.reply({ content: 'Could not parse that meeting time.', ephemeral: true });
            }

            if (scheduledAt <= new Date()) {
                return interaction.reply({ content: 'Please choose a future time for today’s meeting.', ephemeral: true });
            }

            scheduleMeetingStart(guild, scheduledAt);
            return interaction.reply({ content: `Meeting scheduled for ${formatTimeLabel(scheduledAt)}.`, ephemeral: true });
        }

        if (interaction.isModalSubmit() && interaction.customId === 'meeting_time_modal') {
            const member = interaction.member;
            if (!member || !isMeetingManager(member)) {
                return interaction.reply({ content: 'Only Geo or Harshini can set the meeting time.', ephemeral: true });
            }

            const input = interaction.fields.getTextInputValue('meeting_time_input');
            const scheduledAt = parseTimeInput(input, new Date());

            if (!scheduledAt) {
                return interaction.reply({ content: 'Please enter a valid time like 7:30 PM or 19:30.', ephemeral: true });
            }

            if (scheduledAt <= new Date()) {
                return interaction.reply({ content: 'Please enter a future time for today’s meeting.', ephemeral: true });
            }

            scheduleMeetingStart(guild, scheduledAt);
            return interaction.reply({ content: `Meeting scheduled for ${formatTimeLabel(scheduledAt)}.`, ephemeral: true });
        }
    });
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
