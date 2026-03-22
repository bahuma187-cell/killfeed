// webhookBot.js - FTP .ADM Killfeed Bot (Discord.js v14) with 3-min delayed player count
require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const ftp = require("basic-ftp");
const path = require("path");

const app = express();
app.use(express.json());

// Config
const config = {
    discordBotToken: process.env.DISCORD_TOKEN,
    channelId: process.env.CHANNEL_ID,
    FTPHOST: process.env.FTP_HOST,
    FTPUSER: process.env.FTP_USER,
    FTPPW: process.env.FTP_PASS,
    FTPPORT: process.env.FTP_PORT || 21
};

// Local images
const images = {
    pvp: "attachment://pvp.png",
    suicide: "attachment://suicide.png",
    zombie: "attachment://zombie.png",
    fall: "attachment://fall.png",
    outhos: "attachment://outhos.png"
};

// Discord bot setup
const discord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
discord.login(config.discordBotToken);

discord.once("ready", async () => {
    console.log(`Discord bot logged in as ${discord.user.tag}`);

    // Wait 3 minutes before sending first player count
    setTimeout(async () => {
        await sendPlayerCount();
    }, 3 * 60 * 1000); // 180000 ms
});

// ---- ADM Parsing ---- //
const sentLines = new Set();
const sentDeaths = new Set();
const sentOuthos = new Set();

// ---- Fetch & parse ADM files ---- //
async function fetchAndParseADM() {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    try {
        await client.access({
            host: config.FTPHOST,
            user: config.FTPUSER,
            password: config.FTPPW,
            port: config.FTPPORT
        });

        await client.cd("dayzps/config");
        const files = await client.list();
        const admFiles = files.filter(f => f.name.endsWith(".ADM"));
        if (!admFiles.length) return;

        admFiles.sort((a, b) => new Date(a.modifiedAt) - new Date(b.modifiedAt));

        const channel = await discord.channels.fetch(config.channelId);

        for (const f of admFiles) {
            const localPath = path.join(__dirname, f.name);
            await client.downloadTo(localPath, f.name);

            const data = fs.readFileSync(localPath, "utf8");
            const lines = data.split("\n").filter(Boolean);

            let fileLines = [];
            for (const line of lines) {
                const matchTime = line.match(/^(\d{2}:\d{2}:\d{2}) \| (.*)$/);
                if (matchTime) {
                    const [, timeStr, content] = matchTime;
                    const timestamp = new Date();
                    const [h, m, s] = timeStr.split(":").map(Number);
                    timestamp.setHours(h, m, s, 0);
                    fileLines.push({ timestamp, line: content });
                }
            }

            fileLines.sort((a, b) => a.timestamp - b.timestamp);

            for (const { line } of fileLines) {
                if (sentLines.has(line)) continue;
                sentLines.add(line);

                // ---- PvP kills ----
                const killMatch = line.match(/Player "(.*?)".*killed by Player "(.*?)".*with (.*?) from ([\d\.]+) meters/);
                if (killMatch) {
                    const [ , victim, killer, weapon, distanceRaw ] = killMatch;
                    const distance = parseFloat(distanceRaw).toFixed(1);

                    const embed = new EmbedBuilder()
                        .setColor("#1A0000") // extra dark red
                        .setTitle("The Hills Kill Feed Notification")
                        .setDescription(`🟢 !! METRO MAP V3.5 Official - 0001\n⊕ **${killer}** killed **${victim}** with **${weapon}** from **${distance}m**`)
                        .setThumbnail(images.pvp)
                        .setFooter({ text: "DayZ Console Feed By Bahuma187" })
                        .setTimestamp();

                    await channel.send({ embeds: [embed], files: ["./images/pvp.png"] });
                    continue;
                }

                // ---- Zombie kills ----
                const zombieMatch = line.match(/Player "(.*?)".*killed by ZmbM_(\w+)/);
                if (zombieMatch) {
                    const [ , victim, zombieType ] = zombieMatch;
                    if (!sentDeaths.has(line)) {
                        sentDeaths.add(line);

                        const embed = new EmbedBuilder()
                            .setColor("#FF0000")
                            .setTitle("The Hills Kill Feed Notification")
                            .setDescription(`🟢 !! METRO MAP V3.5 Official - 0001\n**${victim}** killed by infected (**${zombieType}**)`)
                            .setThumbnail(images.zombie)
                            .setFooter({ text: "DayZ Console Feed By Bahuma187" })
                            .setTimestamp();

                        await channel.send({ embeds: [embed], files: ["./images/zombie.png"] });
                    }
                    continue;
                }

                // ---- Suicide ----
                const suicideMatch = line.match(/Player "(.*?)" \(DEAD\).*committed suicide/);
                if (suicideMatch) {
                    const victim = suicideMatch[1];
                    if (!sentDeaths.has(line)) {
                        sentDeaths.add(line);

                        const embed = new EmbedBuilder()
                            .setColor("#FF0000")
                            .setTitle("The Hills Kill Feed Notification")
                            .setDescription(`🟢 !! METRO MAP V3.5 Official - 0001\n💀 **${victim}** committed suicide`)
                            .setThumbnail(images.suicide)
                            .setFooter({ text: "DayZ Console Feed By Bahuma187" })
                            .setTimestamp();

                        await channel.send({ embeds: [embed], files: ["./images/suicide.png"] });
                    }
                    continue;
                }

                // ---- Fall Damage ----
                const fallMatch = line.match(/Player "(.*?)" \(DEAD\).*hit by FallDamageHealth/);
                if (fallMatch) {
                    const victim = fallMatch[1];
                    if (!sentDeaths.has(line)) {
                        sentDeaths.add(line);

                        const embed = new EmbedBuilder()
                            .setColor("#FF0000")
                            .setTitle("The Hills Kill Feed Notification")
                            .setDescription(`🟢 !! METRO MAP V3.5 Official - 0001\n♿︎ **${victim}** tried to fly and fell to their death!`)
                            .setThumbnail(images.fall)
                            .setFooter({ text: "DayZ Console Feed By Bahuma187" })
                            .setTimestamp();

                        await channel.send({ embeds: [embed], files: ["./images/fall.png"] });
                    }
                    continue;
                }

                // ---- Outhos Portal Teleport ----
                const outhosMatch = line.match(/Player "(.*?)".*was teleported from: <([\d\.]+)/);
                if (outhosMatch) {
                    const xCoord = parseFloat(outhosMatch[2]);
                    if (xCoord >= 3690 && xCoord <= 3698 && !sentOuthos.has(line)) {
                        sentOuthos.add(line);

                        const embed = new EmbedBuilder()
                            .setColor("#00BFFF") // Bright blue
                            .setTitle("The Hills Kill Feed Notification")
                            .setDescription(`🟢 !! METRO MAP V3.5 Official - 0001\n🌌 A soul has left our world!`)
                            .setThumbnail(images.outhos)
                            .setFooter({ text: "DayZ Console Feed By Bahuma187" })
                            .setTimestamp();

                        await channel.send({ embeds: [embed], files: ["./images/outhos.png"] });
                    }
                    continue;
                }
            }

            console.log(`✅ Processed ADM file: ${f.name}`);
        }

    } catch (err) {
        console.error("❌ FTP/ADM error:", err);
    } finally {
        client.close();
    }
}

// Poll every 5 seconds for ADM updates
setInterval(fetchAndParseADM, 5000);

// ---- Player Count Notification (every 15 minutes) ----
async function sendPlayerCount() {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    try {
        await client.access({
            host: config.FTPHOST,
            user: config.FTPUSER,
            password: config.FTPPW,
            port: config.FTPPORT
        });

        await client.cd("dayzps/config");
        const files = await client.list();
        const admFiles = files.filter(f => f.name.endsWith(".ADM"));
        if (!admFiles.length) return;

        admFiles.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
        const latestADM = admFiles[0];
        const localPath = path.join(__dirname, latestADM.name);
        await client.downloadTo(localPath, latestADM.name);

        const data = fs.readFileSync(localPath, "utf8");
        const lines = data.split("\n").filter(Boolean);

        let lastPlayerListLine = null;
        for (let i = lines.length - 1; i >= 0; i--) {
            if (lines[i].includes("##### PlayerList log:")) {
                lastPlayerListLine = lines[i];
                break;
            }
        }
        if (!lastPlayerListLine) return;

        const match = lastPlayerListLine.match(/##### PlayerList log: (\d+) players/);
        if (!match) return;

        const playerCount = match[1];
        const channel = await discord.channels.fetch(config.channelId);

        const embed = new EmbedBuilder()
            .setColor("#FFD700") // gold
            .setTitle("Server Announcement")
            .setDescription(`🟢 !! METRO MAP V3.5 Official - 0001\n👥 Current online players: **${playerCount}**`)
            .setFooter({ text: "DayZ Console Feed By Bahuma187" })
            .setTimestamp();

        await channel.send({ embeds: [embed] });

    } catch (err) {
        console.error("❌ Player count fetch error:", err);
    } finally {
        client.close();
    }
}

// Poll every 15 minutes for player count
setInterval(sendPlayerCount, 15 * 60 * 1000);

// ---- Start server ----
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook server running on port ${PORT}`));
