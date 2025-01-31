const { REST } = require('@discordjs/rest');
const { Routes } = require('discord.js');
const { logger } = require('../utils/logger');
const fs = require('fs');
require('dotenv').config();

async function cleanUpCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);
  try {
      logger.info('Removing all guild commands...');
      await rest.put(
          Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
          { body: [] }
      );
      logger.info('✅ All commands removed.');
  } catch (error) {
      logger.error('❌ Error cleaning up commands:', error);
  }
}

async function loadCommands() {
  if (!process.env.DISCORD_BOT_TOKEN || !process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_GUILD_ID) {
      logger.error('ERROR: Missing required environment variables. Check your .env file.');
      return;
  }

  const commands = [];
  const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
      const command = require(`../commands/${file}`);
      commands.push(command.data.toJSON());
      logger.info(`✅ Preparing to register command: ${command.data.name}`);
  }

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_BOT_TOKEN);

  try {
      logger.info('✅ Registering guild commands...');
      const response = await rest.put(
          Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.DISCORD_GUILD_ID),
          { body: commands }
      );
      logger.info('✅ Guild commands registered successfully.');
  } catch (error) {
      logger.error('❌ Error registering commands:', error);
  }
}

module.exports = { cleanUpCommands, loadCommands };
