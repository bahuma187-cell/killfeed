// webhookBot.js (Nitrado Application version)
const express = require("express");
const { Client, GatewayIntentBits } = require("discord.js");
const config = {
    discordBotToken: process.env.DISCORD_TOKEN,
    channelId: process.env.CHANNEL_ID,
    webhookSecret: process.env.WEBHOOK_SECRET
};

const app = express();
app.use(express.json());

// Discord bot setup
const discord = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });
discord.login(config.discordBotToken);

discord.once("clientReady", () => {
    console.log(`Discord bot logged in as ${discord.user.tag}`);
});

// Webhook endpoint for Nitrado Application
app.post("/killfeed", async (req, res) => {
    // Verify App Secret from Authorization header
    const authHeader = req.headers["authorization"];
    if (!authHeader || authHeader !== config.webhookSecret) {
        console.warn("Unauthorized request! Authorization header missing or invalid.");
        return res.sendStatus(401);
    }

    const event = req.body;
    console.log("Incoming Nitrado Application event:", event);

    try {
        const channel = await discord.channels.fetch(config.channelId);

        // Handle kill events
        if (event.type === "kill") {
            channel.send(`🔫 **${event.killer}** killed **${event.victim}** with ${event.weapon || "unknown"}`);
        }
        // Handle death events
        else if (event.type === "death") {
            channel.send(`💀 **${event.victim}** died`);
        }
        // Other events
        else {
            console.log("Unhandled event type:", event.type);
        }

        res.sendStatus(200);
    } catch (err) {
        console.error("Error handling Nitrado event:", err);
        res.sendStatus(500);
    }
});

// Start server
const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Webhook server running on port ${PORT}`);
});