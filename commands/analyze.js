const { SlashCommandBuilder } = require('discord.js');
const { analyzeImage } = require('../utils/googleVisionHelper');

//Analyze Submission photos
module.exports = {
  data: new SlashCommandBuilder()
    .setName('analyze')
    .setDescription('Analyze an uploaded mission image.')
    .addAttachmentOption(option =>
      option.setName('image')
        .setDescription('The image to analyze')
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const attachment = interaction.options.getAttachment('image');
      const extension = attachment.name.split('.').pop().toLowerCase();

      if (!['png', 'jpg', 'jpeg'].includes(extension)) {
        return interaction.editReply('Invalid file type. Only PNG and JPG are allowed.');
      }

      const result = await analyzeImage(attachment.url, process.env.DEV_MODE === 'true');

      if (!result || !result.status) {
        return interaction.editReply("⚠️ Error: Analysis result is undefined or malformed.");
      }

      const emoji = result.status === "COMPLETED" ? "✅" : "❌";
      await interaction.editReply(`${emoji} **${result.message}**`);

    } catch (error) {
      console.error('Error analyzing image:', error);
      await interaction.editReply('An error occurred while processing your request.');
    }
  },
};
