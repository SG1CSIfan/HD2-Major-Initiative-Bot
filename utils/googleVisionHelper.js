const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const vision = require('@google-cloud/vision');
const { logger } = require('../utils/logger');
const settings = require('../data/settings.json');

// Set the path to the Vision API key
const keyPath = path.join(__dirname, 'vision-key.json');
if (!fs.existsSync(keyPath)) {
  logger.error(`❌ The Google Vision key file was not found at: ${keyPath}`);
  process.exit(1);
}

// Set the environment variable for authentication
process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;

const client = new vision.ImageAnnotatorClient();
const debugImagesPath = path.join(__dirname, '../data/debug-images');

async function analyzeImage(imageUrl) {
    try {
      const [result] = await client.textDetection(imageUrl);
      logger.debug(`📌 Raw Google Vision Response: ${JSON.stringify(result, null, 2)}`);
  
      const annotations = result.textAnnotations;
      if (!annotations || annotations.length === 0) {
        logger.warn("⚠️ Google Vision did not return text annotations.");
        return { status: "NO_TEXT", message: "No text found in the image." };
      }
  
      const detectedText = annotations.map(a => a.description.toLowerCase()).join(' ');
      logger.info(`🔍 Extracted Text: ${detectedText}`);
  
      // 🔎 Extract difficulty level from the **top-right corner**
      let difficultyLevel = null;
      const difficultyCandidates = detectedText.match(/\b(\d+)\b/g); // Find all numbers
  
      if (difficultyCandidates) {
        difficultyCandidates.forEach(number => {
          const num = parseInt(number);
          if (detectedText.includes(`${num} |`) || detectedText.includes(`| ${num}`)) {
            difficultyLevel = num;
          }
        });
      }
  
      // If no clear difficulty is found, fall back to the last number near HH:MM:SS format
      if (!difficultyLevel) {
        const timePattern = /\b(\d+:\d{2}:\d{2})\b/g; // Matches time formats (HH:MM:SS)
        const timeMatches = detectedText.match(timePattern);
        if (timeMatches) {
          const timeIndex = detectedText.indexOf(timeMatches[0]);
          difficultyCandidates.forEach(number => {
            if (detectedText.indexOf(number) < timeIndex) {
              difficultyLevel = parseInt(number);
            }
          });
        }
      }
  
      // If still no difficulty detected
      if (difficultyLevel === null) {
        logger.warn("⚠️ No difficulty level detected in the image.");
        if (process.env.DEV_MODE === 'true') {
          logger.debug(`🔍 DEV MODE: Allowing submission despite missing difficulty level.`);
        } else {
          return { status: "FAILED", message: "⚠️ No difficulty level detected in the image." };
        }
      } else {
        logger.info(`🎯 Extracted Difficulty Level (Top-Right): ${difficultyLevel}`);
      }
  
      // ✅ Validate difficulty level
      const minDifficulty = settings.taskConfig.minDifficultyLevel || 7;
      if (difficultyLevel !== null && difficultyLevel < minDifficulty) {
        const message = `⚠️ Submission Rejected: Difficulty level ${difficultyLevel} is below the required ${minDifficulty}.`;
  
        if (process.env.DEV_MODE === 'true') {
          logger.warn(`🔍 DEV MODE: Allowing submission despite difficulty issue. ${message}`);
        } else {
          return { status: "FAILED", message };
        }
      }
  
      // Load the image to analyze colors
      const image = await loadImage(imageUrl);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
  
      // Find detected text positions
      let positions = {};
      annotations.forEach(box => {
        if (["1st", "2nd", "3rd"].includes(box.description.toLowerCase())) {
          positions[box.description.toLowerCase()] = {
            x: box.boundingPoly.vertices[0].x + image.width * 0.03,
            y: box.boundingPoly.vertices[0].y + image.height * 0.05
          };
        }
      });
  
      // Detect colors based on scaled positions
      let missionColors = {};
      Object.keys(positions).forEach(mission => {
        const rgb = getPixelColor(ctx, positions[mission]);
        missionColors[mission] = detectMissionColor(rgb);
      });
  
      // 🔴 FIX: Ensure missionColors exist before returning
      if (!missionColors || Object.keys(missionColors).length === 0) {
        logger.warn("⚠️ No valid mission colors detected.");
        return { status: "FAILED", message: "❌ No valid missions detected." };
      }
  
      // ✅ Allow partial failures to still return valid data
      const hasRed = Object.values(missionColors).includes("red");
      const isGreen = Object.values(missionColors).every(color => color === "green");
  
      let operationStatus;
      if (hasRed) {
        operationStatus = "❌ Operation Failed: A mission failed (red detected).";
      } else if (isGreen) {
        operationStatus = "✅ Operation Completed: All missions successful.";
      } else {
        operationStatus = "⚠️ Operation Not Fully Completed: Some missions are pending.";
      }
  
      logger.info("\n🔎 **Debug Analysis Output**:");
      Object.entries(missionColors).forEach(([mission, color]) => {
        logger.info(`🎯 ${mission.toUpperCase()} → Color: ${color}`);
      });
  
      return {
        status: hasRed ? "FAILED" : "SUCCESS",
        message: operationStatus,
        difficultyLevel,
        missionColors,
        debug: {
          annotations,
          positions
        }
      };
    } catch (error) {
      logger.error('❌ Error analyzing image:', error);
      return { status: "ERROR", message: "Error analyzing image." };
    }
  }

function getPixelColor(ctx, position) {
  const { x, y } = position;
  let r = 0, g = 0, b = 0;
  let count = 0;

  for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
          const pixel = ctx.getImageData(x + dx, y + dy, 1, 1).data;
          r += pixel[0];
          g += pixel[1];
          b += pixel[2];
          count++;
      }
  }

  return [Math.round(r / count), Math.round(g / count), Math.round(b / count)];
}

function detectMissionColor(rgb) {
  const [r, g, b] = rgb;

  logger.info(`🔍 Checking RGB: (${r}, ${g}, ${b})`);

  if (g > r * 1.2 && g > b * 1.2 && g > 50) {
      return "green"; // Green mission complete
  }
  if (r > g * 1.2 && r > b * 1.2 && r > 50) {
      return "red"; // Mission failed
  }
  return "not completed"; // Default case
}

async function generateDebugImage(imagePath, debugImagePath, annotations, positions, detectedColors) {
    try {
      if (!fs.existsSync(imagePath)) {
        logger.error(`❌ Debug image generation failed: Source image not found at ${imagePath}`);
        return;
      }
  
      const image = await loadImage(imagePath);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');
      ctx.drawImage(image, 0, 0);
  
      // ✅ Draw bounding boxes around detected text
      if (Array.isArray(annotations)) {
        annotations.forEach(box => {
          if (!box.boundingPoly || !box.boundingPoly.vertices) return;
  
          const vertices = box.boundingPoly.vertices;
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(vertices[0].x, vertices[0].y);
          ctx.lineTo(vertices[1].x, vertices[1].y);
          ctx.lineTo(vertices[2].x, vertices[2].y);
          ctx.lineTo(vertices[3].x, vertices[3].y);
          ctx.closePath();
          ctx.stroke();
  
          ctx.fillStyle = 'blue';
          ctx.font = '12px Arial';
          ctx.fillText(box.description, vertices[0].x, vertices[0].y - 5);
        });
      }
  
      // ✅ Draw detected mission status markers ("X")
      Object.keys(positions).forEach(mission => {
        const { x, y } = positions[mission];
        const color = detectedColors[mission] || 'unknown';
        ctx.fillStyle = color === 'green' ? 'lime' : color === 'red' ? 'red' : 'white';
        ctx.font = `${Math.floor(image.width * 0.015)}px Arial`;
        ctx.fillText('X', x, y);
        ctx.fillStyle = 'yellow';
        ctx.fillText(`${mission.toUpperCase()}: ${color}`, x + 15, y);
      });
  
      // ✅ Save the debug image correctly using debugImagePath
      fs.writeFileSync(debugImagePath, canvas.toBuffer('image/png'));
      logger.info(`✅ Debug image successfully saved at: ${debugImagePath}`);
  
    } catch (error) {
      logger.error(`❌ Failed to generate debug image: ${error.message}`);
    }
  }

module.exports = { analyzeImage, generateDebugImage };
