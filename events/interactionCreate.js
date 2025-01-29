module.exports = {
    name: 'interactionCreate',
    execute: async (interaction, client) => {
      console.log(`Received interaction: ${interaction.commandName}`);
  
      // Ensure it is a command interaction
      if (!interaction.isCommand()) {
        console.log('Not a slash command.');
        return;
      }
  
      // Check if commands are loaded
      if (!client.commands) {
        console.error('No commands have been loaded into client.commands.');
        await interaction.reply({ content: 'No commands are available.', ephemeral: true });
        return;
      }
  
      // Get the command
      const command = client.commands.get(interaction.commandName);
  
      if (!command) {
        console.error(`No command matching ${interaction.commandName} was found.`);
        await interaction.reply({ content: 'Command not found.', ephemeral: true });
        return;
      }
  
      // Execute the command
      try {
        console.log(`Executing command: ${interaction.commandName}`);
        await command.execute(interaction);
      } catch (error) {
        console.error(`Error executing ${interaction.commandName}:`, error);
        await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
      }
    },
  };
  