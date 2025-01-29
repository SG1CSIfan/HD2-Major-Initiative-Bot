const { SlashCommandBuilder } = require('discord.js');

// Test Command
module.exports = {
  data: new SlashCommandBuilder()
    .setName('test')
    .setDescription('A test command.'),

  async execute(interaction) {
    await interaction.reply('Test command executed!');
  },
};
