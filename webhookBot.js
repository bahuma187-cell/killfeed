// webhookBot.js - FTP ADM Killfeed version
const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const fs = require("fs");
const ftp = require("basic-ftp");
const path = require("path");
const config = require("./config.json");

const app = express();
app.use(express.json());

// Discord bot setup
const discord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
discord.login(config.discordBotToken);

discord.once("clientReady", () => {
    console.log(`Discord bot logged in as ${discord.user.tag}`);
});

// Webhook server (optional, for testing)
app.post("/killfeed", async (req, res) => {
    console.log("Received test Nitrado event:", req.body);
    res.sendStatus(200);
});

// ---- FTP ADM Parsing ---- //

let lastFileSize = 0; // track last read position

async function fetchAndParseADM() {
    const client = new ftp.Client();
    client.ftp.verbose = false;

    try {
        await client.access({
            host: config.FTPHOST,
            user: config.FTPUSER,
            password: config.FTPPW,
            port: config.FTPPORT || 21
        });

        // go to config directory
        await client.cd("dayzps/config");

        // find newest .ADM file
        const files = await client.list();
        const admFiles = files.filter(f => f.name.endsWith(".ADM"));
        if (admFiles.length === 0) return;

        // newest by modified date
        admFiles.sort((a, b) => new Date(b.modifiedAt) - new Date(a.modifiedAt));
        const latestFile = admFiles[0];

        // download latest ADM to temp file
        const localFile = path.join(__dirname, "latest.ADM");
        await client.downloadTo(localFile, latestFile.name);

        // read new lines only
        const stats = fs.statSync(localFile);
        let data = fs.readFileSync(localFile, "utf8");

        if (lastFileSize > 0) {
            data = data.slice(lastFileSize);
        }
        lastFileSize = stats.size;

        const lines = data.split("\n").filter(Boolean);

        for (const line of lines) {
            // PvP kill
            const killMatch = line.match(/Player "(.*?)".*killed by Player "(.*?)".*with (.*?) from/);
            if (killMatch) {
                const victim = killMatch[1];
                const killer = killMatch[2];
                const weapon = killMatch[3];

                const channel = await discord.channels.fetch(config.channelId);
                channel.send(`🔫 **${killer}** killed **${victim}** with ${weapon}`);
                continue;
            }

            // Suicide / environment death
            const deathMatch = line.match(/Player "(.*?)" \(DEAD\)/);
            if (deathMatch && !line.includes("killed by Player")) {
                const victim = deathMatch[1];
                const channel = await discord.channels.fetch(config.channelId);
                channel.send(`💀 **${victim}** died`);
            }
        }

    } catch (err) {
        console.error("FTP/ADM error:", err);
    } finally {
        client.close();
    }
}

// run every 10 seconds
setInterval(fetchAndParseADM, 10000);

// ---- Start server ---- //
const PORT = process.env.PORT || config.port || 3000;
app.listen(PORT, () => {
    console.log(`Webhook server running on port ${PORT}`);
});
