const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');
const fs = require('fs');
require('dotenv').config();

async function cleanUpCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
    console.log('Removing all guild commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: [] }
    );
    console.log('✅ All commands removed.');
  } catch (error) {
    console.error('❌ Error cleaning up commands:', error);
  }
}

async function loadCommands() {
  if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_GUILD_ID) {
    console.error('ERROR: Missing required environment variables. Check your .env file.');
    return;
  }

  const commands = [];
  const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(`../commands/${file}`);
    commands.push(command.data.toJSON());
    console.log(`✅ Preparing to register command: ${command.data.name}`);
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

  try {
    console.log('🚀 Registering guild commands...');
    console.log('🔍 Commands to register:', JSON.stringify(commands, null, 2));

    const response = await rest.put(
      Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
      { body: commands }
    );

    console.log('✅ Discord Response:', JSON.stringify(response, null, 2));
    console.log('✅ Guild commands registered successfully.');
  } catch (error) {
    console.error('❌ Error registering commands:', error);
  }
}

module.exports = { cleanUpCommands, loadCommands };
