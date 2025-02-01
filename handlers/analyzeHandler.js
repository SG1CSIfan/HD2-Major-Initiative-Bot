const { analyzeImage, generateDebugImage } = require("../utils/googleVisionHelper");
const { logger } = require("../utils/logger");
const fs = require("fs");
const path = require("path");

const settingsPath = path.join(__dirname, "../data/settings.json");
const IMAGE_DEBUG_DIR = path.join(__dirname, "../logs/imageDebugOutput");

if (!fs.existsSync(IMAGE_DEBUG_DIR)) fs.mkdirSync(IMAGE_DEBUG_DIR, { recursive: true });

function getNextMissionNumber() {
  const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
  settings.missionCounter = (settings.missionCounter || 0) + 1;
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  return settings.missionCounter;
}

async function processMissionImage(imagePath, debugImagePath, user) {
  try {
    const settings = JSON.parse(fs.readFileSync(settingsPath, "utf8"));
    const result = await analyzeImage(imagePath);

    if (!result || !result.missionColors || Object.keys(result.missionColors).length === 0) {
      logger.warn(`❌ OCR failed: No valid mission colors detected for ${user}.`);
      return null;
    }

    logger.info(`🎯 Valid OCR mission colors detected for ${user}:`, result.missionColors);

    const missionColors = result.missionColors;
    const missionCount = Object.values(missionColors).filter(color => color === "green").length;
    const hasRed = Object.values(missionColors).includes("red");
    const hasNotCompleted = Object.values(missionColors).includes("not completed");
    
    // ✅ Ensure missing difficulty is treated as a failure
    const difficultyLevel = result.difficultyLevel !== null ? result.difficultyLevel : null;
    const difficulty = difficultyLevel !== null ? `Difficulty: ${difficultyLevel}` : "Difficulty: Not Detected";

    let operationStatus = "✅ Operation Completed: All missions successful.";
    let failReasons = [];

    if (difficultyLevel === null) {
      failReasons.push("difficulty level is missing");
    }
    if (difficultyLevel !== null && difficultyLevel < settings.taskConfig.minDifficultyLevel) {
      failReasons.push(`difficulty level ${difficultyLevel} is below ${settings.taskConfig.minDifficultyLevel}`);
    }
    if (hasRed) {
      failReasons.push("one or more missions failed (red detected)");
    }
    if (hasNotCompleted) {
      operationStatus = "⚠️ Operation Not Fully Completed: Some missions are pending.";
    }
    if (failReasons.length > 0) {
      operationStatus = `❌ Operation Failed: ${failReasons.join(", ")}`;
    }

    // ✅ Save Debug Image in DEV_MODE
    if (process.env.DEV_MODE === "true") {
      logger.info(`📝 DEV_MODE enabled - Generating debug image: ${debugImagePath}`);
      await generateDebugImage(imagePath, debugImagePath, result.debug.annotations, result.debug.positions, missionColors);
    }

    return {
      difficulty,
      missionCount,
      status: operationStatus,
      hasRed,
      hasNotCompleted,
      missingDifficulty: difficultyLevel === null, // ✅ New flag to track missing difficulty
    };

  } catch (error) {
    logger.error(`[ERROR] processMissionImage failed for ${user}:`, error);
    return null;
  }
}

module.exports = { processMissionImage, getNextMissionNumber };
