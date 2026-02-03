const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

let supabase = null;
let dbAvailable = false;

if (supabaseUrl && supabaseAnonKey && !supabaseUrl.includes('your-supabase')) {
    try {
        supabase = createClient(supabaseUrl, supabaseAnonKey);
        dbAvailable = true;
        console.log('✓ Database connection initialized');
    } catch (error) {
        console.warn('⚠ Database initialization failed:', error.message);
        dbAvailable = false;
    }
} else {
    console.warn('⚠ Supabase credentials not configured. Database features disabled.');
}

// ============ Members Operations ============

async function syncMember(member, guild) {
    if (!dbAvailable) return;
    try {
        const memberId = parseInt(member.id, 10);
        const { data: existing } = await supabase
            .from('members')
            .select('*')
            .eq('member_id', memberId)
            .single();

        const memberData = {
            member_id: memberId,
            username: member.user.username,
            display_name: member.displayName || member.user.username,
            role: member.roles.highest?.name || 'Member',
            joined_at: member.joinedAt?.toISOString() || null,
            updated_at: new Date().toISOString(),
        };

        // If discord_username doesn't exist, set it to current username
        if (!existing?.discord_username) {
            memberData.discord_username = member.user.username;
        }

        if (existing) {
            const { error } = await supabase
                .from('members')
                .update(memberData)
                .eq('member_id', memberId);

            if (error) console.error('Error updating member:', error);
        } else {
            const { error } = await supabase
                .from('members')
                .insert({
                    ...memberData,
                    created_at: new Date().toISOString(),
                });

            if (error) console.error('Error inserting member:', error);
        }
    } catch (error) {
        console.error('Error syncing member:', error);
    }
}

async function getMember(memberId) {
    if (!dbAvailable) return null;
    try {
        const id = parseInt(memberId, 10);
        const { data, error } = await supabase
            .from('members')
            .select('*')
            .eq('member_id', id)
            .single();

        if (error) console.error('Error fetching member:', error);
        return data;
    } catch (error) {
        console.error('Error getting member:', error);
        return null;
    }
}

async function updateMemberBirthday(memberId, birthday) {
    if (!dbAvailable) return false;
    try {
        const id = parseInt(memberId, 10);
        const { error } = await supabase
            .from('members')
            .update({
                birthday: birthday ? birthday.toISOString().split('T')[0] : null,
                updated_at: new Date().toISOString(),
            })
            .eq('member_id', id);

        if (error) console.error('Error updating birthday:', error);
        return !error;
    } catch (error) {
        console.error('Error updating member birthday:', error);
        return false;
    }
}

async function updateMemberRole(memberId, role) {
    if (!dbAvailable) return false;
    try {
        const id = parseInt(memberId, 10);
        const { error } = await supabase
            .from('members')
            .update({
                role,
                updated_at: new Date().toISOString(),
            })
            .eq('member_id', id);

        if (error) console.error('Error updating role:', error);
        return !error;
    } catch (error) {
        console.error('Error updating member role:', error);
        return false;
    }
}

async function getAllMembers() {
    if (!dbAvailable) return [];
    try {
        const { data, error } = await supabase
            .from('members')
            .select('*')
            .order('username', { ascending: true });

        if (error) console.error('Error fetching members:', error);
        return data || [];
    } catch (error) {
        console.error('Error getting all members:', error);
        return [];
    }
}

// ============ Points Operations ============

async function initializePoints(memberId) {
    if (!dbAvailable) return;
    try {
        const id = parseInt(memberId, 10);
        const { data: existing } = await supabase
            .from('points')
            .select('*')
            .eq('member_id', id)
            .single();

        if (!existing) {
            const { error } = await supabase
                .from('points')
                .insert({
                    member_id: id,
                    points: 0,
                    last_update: new Date().toISOString()
                });

            if (error) console.error('Error initializing points:', error);
        }
    } catch (error) {
        console.error('Error initializing points:', error);
    }
}

async function addPoints(memberId, pointsToAdd) {
    if (!dbAvailable) return null;
    try {
        const id = parseInt(memberId, 10);
        const { data: existing } = await supabase
            .from('points')
            .select('points')
            .eq('member_id', id)
            .single();

        if (!existing) {
            await initializePoints(memberId);
        }

        const currentPoints = existing?.points || 0;
        const newPoints = currentPoints + pointsToAdd;

        const { error } = await supabase
            .from('points')
            .update({
                points: newPoints,
                last_update: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('member_id', id);

        if (error) {
            console.error('Error adding points:', error);
            return null;
        }

        return newPoints;
    } catch (error) {
        console.error('Error adding points:', error);
        return null;
    }
}

async function getPoints(memberId) {
    if (!dbAvailable) return 0;
    try {
        const id = parseInt(memberId, 10);
        const { data, error } = await supabase
            .from('points')
            .select('*')
            .eq('member_id', id)
            .single();

        if (error) console.error('Error fetching points:', error);
        return data?.points || 0;
    } catch (error) {
        console.error('Error getting points:', error);
        return 0;
    }
}

async function getAllPoints() {
    if (!dbAvailable) return [];
    try {
        const { data, error } = await supabase
            .from('points')
            .select('*, members(username, display_name)')
            .order('points', { ascending: false });

        if (error) console.error('Error fetching points:', error);
        return data || [];
    } catch (error) {
        console.error('Error getting all points:', error);
        return [];
    }
}

async function setPoints(memberId, points) {
    if (!dbAvailable) return false;
    try {
        const id = parseInt(memberId, 10);
        const { data: existing } = await supabase
            .from('points')
            .select('*')
            .eq('member_id', id)
            .single();

        if (!existing) {
            await initializePoints(memberId);
        }

        const { error } = await supabase
            .from('points')
            .update({
                points,
                last_update: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            })
            .eq('member_id', id);

        if (error) console.error('Error setting points:', error);
        return !error;
    } catch (error) {
        console.error('Error setting points:', error);
        return false;
    }
}

// ============ Leaderboard ============

async function getLeaderboard(limit = 100) {
    if (!dbAvailable) return [];
    try {
        const { data, error } = await supabase
            .from('points')
            .select('*, members(username, display_name, role)')
            .order('points', { ascending: false })
            .limit(limit);

        if (error) console.error('Error fetching leaderboard:', error);
        return data || [];
    } catch (error) {
        console.error('Error getting leaderboard:', error);
        return [];
    }
}

// ============ Birthday Management ============

async function getMembersWithBirthdayToday() {
    if (!dbAvailable) return [];
    try {
        const today = new Date();
        const monthDay = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        const { data, error } = await supabase
            .rpc('get_birthdays_by_month_day', { month_day: monthDay });

        if (error) console.error('Error fetching birthdays:', error);
        return data || [];
    } catch (error) {
        console.error('Error getting today\'s birthdays:', error);
        return [];
    }
}

// For a simpler approach without a stored procedure, fetch all and filter client-side
async function getMembersWithUpcomingBirthdays(daysAhead = 7) {
    if (!dbAvailable) return [];
    try {
        const { data, error } = await supabase
            .from('members')
            .select('*')
            .not('birthday', 'is', null);

        if (error) {
            console.error('Error fetching members with birthdays:', error);
            return [];
        }

        const today = new Date();
        const upcoming = [];

        for (const member of data) {
            if (!member.birthday) continue;

            const birthDate = new Date(member.birthday);
            const thisYearBirthday = new Date(today.getFullYear(), birthDate.getMonth(), birthDate.getDate());

            if (thisYearBirthday < today) {
                thisYearBirthday.setFullYear(today.getFullYear() + 1);
            }

            const daysUntilBirthday = Math.ceil((thisYearBirthday - today) / (1000 * 60 * 60 * 24));

            if (daysUntilBirthday <= daysAhead && daysUntilBirthday >= 0) {
                upcoming.push({ ...member, daysUntilBirthday });
            }
        }

        return upcoming.sort((a, b) => a.daysUntilBirthday - b.daysUntilBirthday);
    } catch (error) {
        console.error('Error getting upcoming birthdays:', error);
        return [];
    }
}

// ============ Discord Activity Tracking ============

async function trackDiscordActivity(activityData) {
    if (!dbAvailable) return false;
    try {
        const {
            memberId,
            discordUsername,
            displayName = null,
            activityType,
            channelId = null,
            channelName = null,
            messageCount = 0,
            voiceDurationMinutes = 0,
            reactionCount = 0,
            metadata = null
        } = activityData;

        // Validate required fields
        if (!discordUsername || !activityType) {
            console.error('Error: discordUsername and activityType are required for activity tracking');
            return false;
        }

        const memberId_int = memberId ? parseInt(memberId, 10) : null;
        const activityDate = new Date().toISOString().split('T')[0];

        const activityRecord = {
            member_id: memberId_int,
            discord_username: discordUsername,
            activity_type: activityType,
            channel_id: channelId,
            channel_name: channelName,
            message_count: messageCount || 0,
            voice_duration_minutes: voiceDurationMinutes || 0,
            reaction_count: reactionCount || 0,
            activity_date: activityDate,
            activity_timestamp: new Date().toISOString(),
            metadata: metadata || null
        };

        // Only add display_name if it's provided (handle missing column gracefully)
        if (displayName) {
            activityRecord.display_name = displayName;
        }

        const { data, error } = await supabase
            .from('discord_activity')
            .insert([activityRecord]);

        if (error) {
            console.error('Error tracking discord activity:', error.message);
            return false;
        }

        return true;
    } catch (error) {
        console.error('Error tracking discord activity:', error);
        return false;
    }
}

async function getDiscordActivity(memberId, startDate = null, endDate = null) {
    if (!dbAvailable) return [];
    try {
        const id = parseInt(memberId, 10);
        let query = supabase
            .from('discord_activity')
            .select('*')
            .eq('member_id', id);

        if (startDate) {
            query = query.gte('activity_date', startDate);
        }

        if (endDate) {
            query = query.lte('activity_date', endDate);
        }

        const { data, error } = await query.order('activity_timestamp', { ascending: false });

        if (error) {
            console.error('Error fetching discord activity:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error getting discord activity:', error);
        return [];
    }
}

async function getDiscordActivityByUsername(discordUsername, startDate = null, endDate = null) {
    if (!dbAvailable) return [];
    try {
        let query = supabase
            .from('discord_activity')
            .select('*')
            .eq('discord_username', discordUsername);

        if (startDate) {
            query = query.gte('activity_date', startDate);
        }

        if (endDate) {
            query = query.lte('activity_date', endDate);
        }

        const { data, error } = await query.order('activity_timestamp', { ascending: false });

        if (error) {
            console.error('Error fetching discord activity by username:', error);
            return [];
        }

        return data || [];
    } catch (error) {
        console.error('Error getting discord activity by username:', error);
        return [];
    }
}

async function getDiscordActivitySummary(memberId, days = 30) {
    if (!dbAvailable) return null;
    try {
        const id = parseInt(memberId, 10);
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        const startDateStr = startDate.toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('discord_activity')
            .select('*')
            .eq('member_id', id)
            .gte('activity_date', startDateStr);

        if (error) {
            console.error('Error fetching activity summary:', error);
            return null;
        }

        const summary = {
            totalMessages: 0,
            totalVoiceMinutes: 0,
            totalReactions: 0,
            activitiesByType: {},
            activeDays: new Set(),
        };

        data.forEach(activity => {
            summary.totalMessages += activity.message_count || 0;
            summary.totalVoiceMinutes += activity.voice_duration_minutes || 0;
            summary.totalReactions += activity.reaction_count || 0;
            summary.activitiesByType[activity.activity_type] = (summary.activitiesByType[activity.activity_type] || 0) + 1;
            summary.activeDays.add(activity.activity_date);
        });

        summary.activeDays = summary.activeDays.size;

        return summary;
    } catch (error) {
        console.error('Error getting discord activity summary:', error);
        return null;
    }
}

async function getMemberByDiscordUsername(discordUsername) {
    if (!dbAvailable) return null;
    try {
        const { data, error } = await supabase
            .from('members')
            .select('*')
            .eq('discord_username', discordUsername)
            .single();

        if (error && error.code !== 'PGRST116') {
            console.error('Error fetching member by discord username:', error);
        }

        return data;
    } catch (error) {
        console.error('Error getting member by discord username:', error);
        return null;
    }
}

async function addBelmontsPointsByDiscordUsername(discordUsername, pointsToAdd) {
    if (!dbAvailable) return null;
    try {
        const member = await getMemberByDiscordUsername(discordUsername);
        if (!member) return null;

        const currentPoints = Number(member.belmonts_points || 0);
        const newPoints = currentPoints + pointsToAdd;

        const { error } = await supabase
            .from('members')
            .update({
                belmonts_points: newPoints,
                updated_at: new Date().toISOString(),
            })
            .eq('member_id', member.member_id);

        if (error) {
            console.error('Error updating belmonts_points:', error);
            return null;
        }

        return newPoints;
    } catch (error) {
        console.error('Error updating belmonts_points:', error);
        return null;
    }
}

module.exports = {
    syncMember,
    getMember,
    updateMemberBirthday,
    updateMemberRole,
    getAllMembers,
    initializePoints,
    addPoints,
    getPoints,
    getAllPoints,
    setPoints,
    getLeaderboard,
    getMembersWithBirthdayToday,
    getMembersWithUpcomingBirthdays,
    // Discord Activity functions
    trackDiscordActivity,
    getDiscordActivity,
    getDiscordActivityByUsername,
    getDiscordActivitySummary,
    getMemberByDiscordUsername,
    addBelmontsPointsByDiscordUsername,
};
