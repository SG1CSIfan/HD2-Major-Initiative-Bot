const { logger } = require('../utils/logger');

module.exports = {
    name: 'interactionCreate',
    execute: async (interaction, client) => {
      logger.info(`Received interaction: ${interaction.commandName}`);
  
      // Ensure it is a command interaction
      if (!interaction.isCommand()) {
        logger.debug('Not a slash command.');
        return;
      }
  
      // Check if commands are loaded
      if (!client.commands) {
        logger.error('No commands have been loaded into client.commands.');
        await interaction.reply({ content: 'No commands are available.', ephemeral: true });
        return;
      }
  
      // Get the command
      const command = client.commands.get(interaction.commandName);
  
      if (!command) {
        logger.error(`No command matching ${interaction.commandName} was found.`);
        await interaction.reply({ content: 'Command not found.', ephemeral: true });
        return;
      }
  
      // Execute the command
      try {
        logger.info(`Executing command: ${interaction.commandName}`);
        await command.execute(interaction);
      } catch (error) {
        logger.error(`Error executing ${interaction.commandName}: ${error.message}`);
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
      }
    },
  };
  