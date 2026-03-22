// webhookBot.js - FTP .ADM Killfeed Bot (Discord.js v14) with cleaned ADM debug
require("dotenv").config();
const express = require("express");
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js");
const fs = require("fs");
const ftp = require("basic-ftp");
const path = require("path");

const app = express();
app.use(express.json());

const config = {
    discordBotToken: process.env.DISCORD_TOKEN,
    channelId: process.env.CHANNEL_ID,
    FTPHOST: process.env.FTP_HOST,
    FTPUSER: process.env.FTP_USER,
    FTPPW: process.env.FTP_PASS,
    FTPPORT: process.env.FTP_PORT || 21
};

const images = {
    pvp: "attachment://pvp.png",
    suicide: "attachment://suicide.png",
    zombie: "attachment://zombie.png",
    fall: "attachment://fall.png",
    outhos: "attachment://outhos.png",
    landmine: "attachment://landmine.png"
};

const discord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
discord.login(config.discordBotToken);

discord.once("ready", async () => {
    console.log(`Discord bot logged in as ${discord.user.tag}`);
    setTimeout(async () => { await sendPlayerCount(); }, 3 * 60 * 1000);
});

// ---- Deduplication per category ----
const sentDeaths = new Set();
const sentOuthos = new Set();
const sentPvP = new Set();

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

        // --- Log only the ADM files the bot will process ---
        const files = await client.list();
        const admFiles = files.filter(f => f.name.includes("DayZServer_PS4_x64") && f.name.endsWith(".ADM"));
        console.log("📝 ADM files found for processing:");
        admFiles.forEach(f => console.log(`* ${f.name}`));

        if (!admFiles.length) return;

        // Sort ADM files by filename (chronological)
        admFiles.sort((a, b) => a.name.localeCompare(b.name));

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
                // ---- PvP kills ----
                const killMatch = line.match(/Player "(.*?)".*killed by Player "(.*?)".*with (.*?) from ([\d\.]+) meters/);
                if (killMatch && !sentPvP.has(line)) {
                    sentPvP.add(line);
                    const [, victim, killer, weapon, distanceRaw] = killMatch;
                    const distance = parseFloat(distanceRaw).toFixed(1);

                    const embed = new EmbedBuilder()
                        .setColor("#1A0000")
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
                if (zombieMatch && !sentDeaths.has(line)) {
                    sentDeaths.add(line);
                    const [, victim, zombieType] = zombieMatch;

                    const embed = new EmbedBuilder()
                        .setColor("#FF0000")
                        .setTitle("The Hills Kill Feed Notification")
                        .setDescription(`🟢 !! METRO MAP V3.5 Official - 0001\n**${victim}** killed by infected (**${zombieType}**)`)
                        .setThumbnail(images.zombie)
                        .setFooter({ text: "DayZ Console Feed By Bahuma187" })
                        .setTimestamp();

                    await channel.send({ embeds: [embed], files: ["./images/zombie.png"] });
                    continue;
                }

                // ---- Suicide ----
                const suicideMatch = line.match(/Player "(.*?)" \(DEAD\).*committed suicide/);
                if (suicideMatch && !sentDeaths.has(line)) {
                    sentDeaths.add(line);
                    const victim = suicideMatch[1];

                    const embed = new EmbedBuilder()
                        .setColor("#FF0000")
                        .setTitle("The Hills Kill Feed Notification")
                        .setDescription(`🟢 !! METRO MAP V3.5 Official - 0001\n💀 **${victim}** committed suicide`)
                        .setThumbnail(images.suicide)
                        .setFooter({ text: "DayZ Console Feed By Bahuma187" })
                        .setTimestamp();

                    await channel.send({ embeds: [embed], files: ["./images/suicide.png"] });
                    continue;
                }

                // ---- Fall Damage ----
                const fallMatch = line.match(/Player "(.*?)" \(DEAD\).*hit by FallDamageHealth/);
                if (fallMatch && !sentDeaths.has(line)) {
                    sentDeaths.add(line);
                    const victim = fallMatch[1];

                    const embed = new EmbedBuilder()
                        .setColor("#FF0000")
                        .setTitle("The Hills Kill Feed Notification")
                        .setDescription(`🟢 !! METRO MAP V3.5 Official - 0001\n♿︎ **${victim}** tried to fly and fell to their death!`)
                        .setThumbnail(images.fall)
                        .setFooter({ text: "DayZ Console Feed By Bahuma187" })
                        .setTimestamp();

                    await channel.send({ embeds: [embed], files: ["./images/fall.png"] });
                    continue;
                }

                // ---- Outhos Portal ----
                const outhosMatch = line.match(/Player "(.*?)".*was teleported from: <([\d\.]+)/);
                if (outhosMatch && !sentOuthos.has(line)) {
                    const xCoord = parseFloat(outhosMatch[2]);
                    if (xCoord >= 1985 && xCoord <= 1989) {
                        sentOuthos.add(line);

                        const embed = new EmbedBuilder()
                            .setColor("#00BFFF")
                            .setTitle("The Hills Kill Feed Notification")
                            .setDescription(`🟢 !! METRO MAP V3.5 Official - 0001\n🌌 A soul has left our world!`)
                            .setThumbnail(images.outhos)
                            .setFooter({ text: "DayZ Console Feed By Bahuma187" })
                            .setTimestamp();

                        await channel.send({ embeds: [embed], files: ["./images/outhos.png"] });
                    }
                    continue;
                }

                // ---- Landmine / Explosion ----
                const landmineMatch = line.match(/Player "(.*?)".*hit by explosion \(LandMineExplosion\)/);
                if (landmineMatch && !sentDeaths.has(line)) {
                    sentDeaths.add(line);
                    const victim = landmineMatch[1];

                    const embed = new EmbedBuilder()
                        .setColor("#FFA500")
                        .setTitle("The Hills Kill Feed Notification")
                        .setDescription(`💥 **${victim}** was hit by an **Explosion!**`)
                        .setThumbnail(images.landmine)
                        .setFooter({ text: "DayZ Console Feed By Bahuma187" })
                        .setTimestamp();

                    await channel.send({ embeds: [embed], files: ["./images/landmine.png"] });
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

setInterval(fetchAndParseADM, 5000);

// ---- Player Count Notification ----
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
        const admFiles = files.filter(f => f.name.includes("DayZServer_PS4_x64") && f.name.endsWith(".ADM"));
        if (!admFiles.length) return;

        admFiles.sort((a, b) => a.name.localeCompare(b.name));
        const latestADM = admFiles[admFiles.length - 1];
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
            .setColor("#FFD700")
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

setInterval(sendPlayerCount, 30 * 60 * 1000);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Webhook server running on port ${PORT}`));
