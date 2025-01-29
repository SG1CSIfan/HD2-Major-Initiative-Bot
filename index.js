const { Client, GatewayIntentBits } = require('discord.js');
const { loadEvents, loadCommands: loadLocalCommands } = require('./handlers/commandHandler'); // For bot command handling
const { loadCommands: registerCommands } = require('./handlers/commandRegister'); // For Discord API registration
const { cleanUpCommands } = require('./handlers/commandRegister');
require('dotenv').config();

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once('ready', async () => {
  console.log(`Bot logged in as ${client.user.tag}`);

  // Step 1: Register Commands with Discord API
  await cleanUpCommands(); // Clear old commands first
  await registerCommands(); // Register new commands with Discord

  // Step 2: Load commands into the bot for execution
  await loadLocalCommands(client); // Load commands for execution

  // Debug: List loaded commands
  console.log(`Loaded bot commands: ${Array.from(client.commands.keys()).join(', ')}`);
});

client.on('shutDown', async () => {
  console.log('Cleaning up before shutting down...');
  await cleanUpCommands();
  client.destroy();
});

loadEvents(client); // Load event listeners

client.login(process.env.DISCORD_BOT_TOKEN);
