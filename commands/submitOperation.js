const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder } = require("discord.js");
const { processMissionImage, getNextMissionNumber } = require("../handlers/analyzeHandler");
const { createMissionReportEmbed } = require("../embedhandlers/missionReportEmbed");
const { logger, IMAGE_SUBMITTED_DIR, IMAGE_DEBUG_DIR, getFormattedTimestamp } = require("../utils/logger");

// Load settings
const settings = JSON.parse(fs.readFileSync("./data/settings.json", "utf8"));
const COMMAND_CHANNEL_ID = settings.operationCommandChannelId;
const EMBED_POST_CHANNEL_ID = settings.operationResultsChannelId;

module.exports = {
  data: new SlashCommandBuilder()
    .setName("submit_operation")
    .setDescription("Logs Operations for Major Initiative")
    .addAttachmentOption(option => 
      option.setName("image")
        .setDescription("Submit a complete operation page from HD2")
        .setRequired(true)
    )
    .addUserOption(option => 
      option.setName("user_2")
        .setDescription("Add 2nd Helldiver to your report")
        .setRequired(false)
    )
    .addUserOption(option => 
      option.setName("user_3")
        .setDescription("Add 3rd Helldiver to your report")
        .setRequired(false)
    )
    .addUserOption(option => 
      option.setName("user_4")
        .setDescription("Add 4th Helldiver to your report")
        .setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    // ✅ Restrict command usage to a specific channel
    if (interaction.channelId !== COMMAND_CHANNEL_ID) {
      return await interaction.editReply(`❌ This command can only be used in <#${COMMAND_CHANNEL_ID}>.`);
    }

    try {
      logger.info(`[INFO] Interaction started by ${interaction.user.tag}`);

      const userMention = `<@${interaction.user.id}>`;
      const image = interaction.options.getAttachment("image");

      if (!["png", "jpg", "jpeg"].includes(image.name.split(".").pop().toLowerCase())) {
        logger.warn(`[WARN] Invalid file type detected by ${interaction.user.tag}`);
        return await interaction.editReply("Invalid file type. Only PNG and JPG are allowed.");
      }

      const missionNumber = getNextMissionNumber();
      logger.info(`[INFO] Assigned Mission Number: ${missionNumber} for ${interaction.user.tag}`);

      // ✅ Collect participants (Command user + optional mentions)
      const participants = [
        userMention,
        ...[2, 3, 4].map(num => interaction.options.getUser(`user_${num}`))
          .filter(Boolean)
          .map(user => `<@${user.id}>`)
      ];

      // ✅ Ensure directories exist
      if (!fs.existsSync(IMAGE_SUBMITTED_DIR)) fs.mkdirSync(IMAGE_SUBMITTED_DIR, { recursive: true });
      if (!fs.existsSync(IMAGE_DEBUG_DIR)) fs.mkdirSync(IMAGE_DEBUG_DIR, { recursive: true });

      const formattedTimestamp = getFormattedTimestamp();
      const unixTimestamp = Math.floor(Date.now() / 1000);
      const discordTimestamp = `<t:${unixTimestamp}:F>`;

      const rawImagePath = path.join(IMAGE_SUBMITTED_DIR, `${formattedTimestamp} - ${interaction.user.tag} - Raw.png`);
      const debugImagePath = path.join(IMAGE_DEBUG_DIR, `${formattedTimestamp} - ${interaction.user.tag} - Debug.png`);

      logger.debug(`[DEBUG] Raw Image Path: ${rawImagePath}`);
      logger.debug(`[DEBUG] Debug Image Path: ${debugImagePath}`);

      const response = await fetch(image.url);
      if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`);

      const buffer = await response.arrayBuffer();
      fs.writeFileSync(rawImagePath, Buffer.from(buffer));
      logger.info(`[INFO] 📝 Raw image saved: ${rawImagePath}`);

      const result = await processMissionImage(rawImagePath, debugImagePath, userMention);

      logger.info(`[INFO] OCR Result for ${interaction.user.tag}:`, result);

      let devModeWarning = "";
      if (process.env.DEV_MODE === "true") {
        let reasons = [];
        if (result.missingDifficulty) reasons.push("difficulty level is missing");
        if (result.hasRed) reasons.push("one or more missions failed (red detected)");
        if (result.hasNotCompleted) reasons.push("some missions were incomplete");
        if (result.difficulty.includes("Difficulty:") && parseInt(result.difficulty.split(": ")[1]) < settings.taskConfig.minDifficultyLevel) {
          reasons.push(`difficulty level ${result.difficulty.split(": ")[1]} is below the required ${settings.taskConfig.minDifficultyLevel}`);
        }
        if (reasons.length > 0) {
          devModeWarning = `\n\n⚠️ **DEV_MODE is active!** This operation would normally fail for the following reasons:\n- ${reasons.join("\n- ")}`;
        }
      }

      const embed = createMissionReportEmbed({
        title: `Major Initiative Report - Report #${missionNumber}`,
        user: userMention,
        date: discordTimestamp,
        operation: settings.taskConfig.defaultOperation,
        planet: settings.taskConfig.defaultPlanet,
        difficulty: result.difficulty,
        missionCount: result.missionCount,
        participants,
        status: result.status + devModeWarning,
        image: image.url,
        hasRed: result.hasRed,
        hasNotCompleted: result.hasNotCompleted
      });

      logger.info(`[INFO] Embed successfully created for ${interaction.user.tag}`);

      // ✅ Send embed to designated result channel
      const resultChannel = interaction.client.channels.cache.get(EMBED_POST_CHANNEL_ID);
      if (!resultChannel) {
        logger.error(`[ERROR] Result channel with ID ${EMBED_POST_CHANNEL_ID} not found.`);
        return await interaction.editReply("An error occurred while posting the report.");
      }

      await resultChannel.send({ embeds: [embed] });
      await interaction.editReply("✅ Operation report successfully submitted!");

    } catch (error) {
      logger.error(`[ERROR] analyze command failed for ${interaction.user.tag}:`, error);
      if (interaction.deferred || interaction.replied) {
        return await interaction.editReply("An error occurred while processing your request.");
      }
      await interaction.reply("There was an error while executing this command.");
    }
  },
};
