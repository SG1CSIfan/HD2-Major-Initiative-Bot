const fs = require("fs");
const path = require("path");
const { SlashCommandBuilder } = require("discord.js");
const { processMissionImage, getNextMissionNumber } = require("../handlers/analyzeHandler");
const { createMissionReportEmbed } = require("../embedhandlers/missionReportEmbed");
const { logger, IMAGE_SUBMITTED_DIR, IMAGE_DEBUG_DIR, getFormattedTimestamp } = require("../utils/logger");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("analyze")
    .setDescription("Analyze an uploaded mission image.")
    .addAttachmentOption(option => 
      option.setName("image")
        .setDescription("Upload the mission image")
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply();
    try {
      const settings = JSON.parse(fs.readFileSync("./data/settings.json", "utf8"));

      logger.info(`[INFO] Interaction started by ${interaction.user.tag}`);

      const user = interaction.member ? interaction.member.displayName : interaction.user.username;
      const image = interaction.options.getAttachment("image");

      if (!["png", "jpg", "jpeg"].includes(image.name.split(".").pop().toLowerCase())) {
        logger.warn(`[WARN] Invalid file type detected by ${user}`);
        return await interaction.editReply("Invalid file type. Only PNG and JPG are allowed.");
      }

      const missionNumber = getNextMissionNumber();
      logger.info(`[INFO] Assigned Mission Number: ${missionNumber} for ${user}`);

      // Ensure directories exist
      if (!fs.existsSync(IMAGE_SUBMITTED_DIR)) fs.mkdirSync(IMAGE_SUBMITTED_DIR, { recursive: true });
      if (!fs.existsSync(IMAGE_DEBUG_DIR)) fs.mkdirSync(IMAGE_DEBUG_DIR, { recursive: true });

      const now = new Date();

      const sanitizedUser = user.replace(/[/\\?%*:|"<>]/g, "").trim();

      const formattedTimestamp = getFormattedTimestamp(); // ✅ EST timestamp for filenames
      const unixTimestamp = Math.floor(Date.now() / 1000); // ✅ UNIX timestamp for Discord

      const rawImagePath = path.join(IMAGE_SUBMITTED_DIR, `${formattedTimestamp} - [ ${sanitizedUser} ] - Raw.png`);
      const debugImagePath = path.join(IMAGE_DEBUG_DIR, `${formattedTimestamp} - [ ${sanitizedUser} ] - Debug.png`);

      const discordTimestamp = unixTimestamp;

      logger.debug(`[DEBUG] Raw Image Path: ${rawImagePath}`);
      logger.debug(`[DEBUG] Debug Image Path: ${debugImagePath}`);

      const response = await fetch(image.url);
      if (!response.ok) throw new Error(`Failed to download image: ${response.statusText}`);

      const buffer = await response.arrayBuffer();
      fs.writeFileSync(rawImagePath, Buffer.from(buffer));
      logger.info(`[INFO] 📝 Raw image saved: ${rawImagePath}`);

      const result = await processMissionImage(rawImagePath, debugImagePath, sanitizedUser);

      logger.info(`[INFO] OCR Result for ${sanitizedUser}:`, result);

      // ✅ Ensure missing difficulty is a failure unless in DEV_MODE
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
        title: `Major Initiative Report - Report #${missionNumber}`, // ✅ Ensure title is passed
        user: sanitizedUser,
        date: discordTimestamp,
        operation: settings.taskConfig.defaultOperation,
        planet: settings.taskConfig.defaultPlanet,
        difficulty: result.difficulty,
        missionCount: result.missionCount,
        participants: [sanitizedUser],
        status: result.status + devModeWarning,
        image: image.url,
        hasRed: result.hasRed,
        hasNotCompleted: result.hasNotCompleted
    });

      logger.info(`[INFO] Embed successfully created for ${sanitizedUser}`);
      await interaction.editReply({ embeds: [embed] });

    } catch (error) {
      logger.error(`[ERROR] analyze command failed for ${interaction.user.tag}:`, error);
      if (interaction.deferred || interaction.replied) {
        return await interaction.editReply("An error occurred while processing your request.");
      }
      await interaction.reply("There was an error while executing this command.");
    }
  },
};
