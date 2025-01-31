const { logger, IMAGE_DEBUG_DIR, IMAGE_SUBMITTED_DIR } = require('../utils/logger');
const { analyzeImage, generateDebugImage } = require('../utils/googleVisionHelper');
const { SlashCommandBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const userImageCount = {};

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
    const user = interaction.member ? interaction.member.displayName : interaction.user.username;
    const serverName = interaction.guild ? interaction.guild.name.replace(/\s+/g, '_') : 'DM';

    // Increment user image count
    if (!userImageCount[user]) userImageCount[user] = 1;
    else userImageCount[user]++;

    try {
      const attachment = interaction.options.getAttachment('image');
      const extension = attachment.name.split('.').pop().toLowerCase();

      if (!['png', 'jpg', 'jpeg'].includes(extension)) {
        logger.info(`Invalid file type submitted by ${user}`);
        return interaction.editReply('Invalid file type. Only PNG and JPG are allowed.');
      }

      // Generate a unique ID for the image
      const imageID = `${serverName}-${user}-${userImageCount[user]}`;
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const uniqueFilename = `${imageID}-${timestamp}.${extension}`;
      const submittedFilePath = path.join(IMAGE_SUBMITTED_DIR, uniqueFilename);

      if (process.env.DEV_MODE === 'true') {
        logger.debug(`✅ DEV MODE ON: Storing submitted image.`);
    
        try {
            const response = await fetch(attachment.url);
            const arrayBuffer = await response.arrayBuffer();
            const buffer = Buffer.from(arrayBuffer);
            fs.writeFileSync(submittedFilePath, buffer);
            logger.debug(`✅ Stored raw submitted image: ${submittedFilePath}`);
        } catch (error) {
            logger.error(`❌ Failed to save submitted image: ${error.message}`);
            return interaction.editReply("Error: Failed to save submitted image.");
        }
      }

      const result = await analyzeImage(submittedFilePath);
      const rawImagePath = path.join(IMAGE_DEBUG_DIR, `${imageID}.${extension}`);

      if (!result || !result.status) {
        logger.error(`Analysis result is undefined or malformed for ${user}`);
        return interaction.editReply("Error: Analysis result is undefined or malformed.");
      }

      // Check if difficulty level is missing or below threshold
      if (result.difficultyLevel === null) {
        const msg = "⚠️ No difficulty level detected in the image.";
        logger.warn(msg);
        if (process.env.DEV_MODE === 'true') {
          logger.debug(`🔍 DEV MODE: Allowing submission despite missing difficulty level.`);
        } else {
          return interaction.editReply(msg);
        }
      } else {
        logger.info(`🎯 Extracted Difficulty Level: ${result.difficultyLevel}`);
      }

      if (process.env.DEV_MODE === 'true' && result.debug) {
        const debugFilename = `${imageID}-debug.png`;
        const debugFilePath = path.join(IMAGE_DEBUG_DIR, debugFilename);
    
        if (!result.debug.annotations || result.debug.annotations.length === 0) {
          logger.warn(`⚠️ No annotations found, skipping debug image for ${imageID}`);
        } else {
          if (fs.existsSync(submittedFilePath)) {
            await generateDebugImage(submittedFilePath, debugFilePath, result.debug.annotations, result.debug.positions, result.debug.missionColors);
            logger.info(`✅ Debug image stored: ${debugFilePath}`);
          } else {
            logger.error(`❌ Submitted image not found: ${submittedFilePath}`);
          }
        }
      }

      await interaction.editReply(`**${result.message}**\n🎯 **Difficulty Level:** ${result.difficultyLevel !== null ? result.difficultyLevel : "Not Detected"}`);
      logger.info(`Analysis completed for ${user}: ${result.message}`);
    } catch (error) {
      logger.error(`Error analyzing image for ${user}: ${error.message}`);
      await interaction.editReply('An error occurred while processing your request.');
    }
  },
};
