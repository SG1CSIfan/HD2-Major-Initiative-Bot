const { EmbedBuilder, time } = require("discord.js");

function getEmbedColor(hasRed, hasNotCompleted, difficultyLevel, missionCount, minDifficulty) {
  if (difficultyLevel !== null && difficultyLevel < minDifficulty) return "#ff0000";
  if (hasRed) return "#ff0000";
  if (hasNotCompleted) return "#ffa500";
  return "#04ff00";
}

function createMissionReportEmbed({ title, user, date, operation, planet, difficulty, missionCount, participants, status, image, hasRed, hasNotCompleted }) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(
      `**Submitted By:** ${user}\n**Date Submitted:** <t:${date}:F>\n\n` + // ✅ Discord Timestamp
      `**Operation Name:** ${operation}\n` +
      `**Planet:** ${planet}\n` +
      `**${difficulty}**\n` +
      `**Missions:** ${missionCount}`
    )
    .addFields(
      { name: "Participants", value: participants.join("\n"), inline: false },
      { name: "Operation Status", value: status, inline: false }
    )
    .setImage(image)
    .setColor(getEmbedColor(hasRed, hasNotCompleted, missionCount));
}

module.exports = { createMissionReportEmbed };
