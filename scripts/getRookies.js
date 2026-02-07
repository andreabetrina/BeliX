require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');

const TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const ROLE_NAME = (process.env.ROOKIE_ROLE_NAME || process.argv[2] || 'rookies').trim().toLowerCase();
const OUTPUT_PATH = path.join(__dirname, '..', 'json', 'rookiesData.json');

function normalizeRoleName(name) {
    return String(name || '').trim().toLowerCase();
}

async function fetchRookies() {
    if (!TOKEN || !GUILD_ID) {
        console.error('Missing DISCORD_TOKEN or GUILD_ID in environment variables.');
        process.exit(1);
    }

    const client = new Client({
        intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
    });

    client.once('ready', async () => {
        try {
            const guild = await client.guilds.fetch(GUILD_ID);
            const members = await guild.members.fetch();

            const rookies = members.filter((member) => {
                if (member.user.bot) return false;
                return member.roles.cache.some((role) => normalizeRoleName(role.name) === ROLE_NAME);
            });

            const payload = {
                rookiesmembersData: rookies.map((member) => ({
                    username: member.user.username,
                    userId: member.user.id,
                    displayName: member.displayName,
                    joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
                    roles: member.roles.cache.map((role) => role.name),
                })),
                roleName: ROLE_NAME,
                guildId: guild.id,
                totalRookies: rookies.size,
                lastUpdated: new Date().toISOString(),
            };

            fs.writeFileSync(OUTPUT_PATH, JSON.stringify(payload, null, 2));
            console.log(`Saved ${rookies.size} rookies to ${OUTPUT_PATH}`);
        } catch (error) {
            console.error('Failed to fetch rookies:', error);
        } finally {
            client.destroy();
        }
    });

    client.login(TOKEN);
}

fetchRookies();
