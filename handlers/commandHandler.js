const fs = require('fs');

async function loadCommands(client) {
  // Initialize commands as a Map
  client.commands = new Map();

  // Load command files
  const commandFiles = fs.readdirSync('./commands').filter(file => file.endsWith('.js'));

  for (const file of commandFiles) {
    const command = require(`../commands/${file}`);
    client.commands.set(command.data.name, command);
    console.log(`Command loaded: ${command.data.name}`); // Debug log
  }
}

async function loadEvents(client) {
  const eventsFolder = './events';

  if (!fs.existsSync(eventsFolder)) {
    console.log('No events folder found. Skipping event loading.');
    return;
  }

  const eventFiles = fs.readdirSync(eventsFolder).filter(file => file.endsWith('.js'));

  for (const file of eventFiles) {
    const event = require(`../events/${file}`);
    if (event.name) {
      client.on(event.name, (...args) => event.execute(...args, client));
      console.log(`Event loaded: ${event.name}`);
    }
  }
}

module.exports = { loadCommands, loadEvents };
