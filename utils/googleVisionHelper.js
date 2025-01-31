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

    // 🔎 Extract difficulty level from the **top-right corner** (ignoring numbers in the middle)
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

    // Final check: If still no difficulty, log it
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
                x: box.boundingPoly.vertices[0].x + image.width * 0.03,  // Move right by 3% of width
                y: box.boundingPoly.vertices[0].y + image.height * 0.05  // Move down by 5% of height
            };
        }
    });

    // Detect colors based on scaled positions
    let missionColors = {};
    Object.keys(positions).forEach(key => {
        missionColors[key] = detectMissionColor(getPixelColor(ctx, positions[key]));
    });

    // Determine mission status
    const isGreen = Object.values(missionColors).every(color => color === "green");
    const isRed = Object.values(missionColors).some(color => color === "red");

    let statusMessage = "❓ Unable to determine mission completion.";
    if (isRed) {
        statusMessage = "❌ Operation Failed: A mission failed (red detected).";
    } else if (isGreen) {
        statusMessage = "✅ Operation Completed: All missions successful (all green detected).";
    } else {
        statusMessage = "⚠️ Operation Not Fully Completed: Some missions are pending.";
    }

    logger.info("\n🔎 **Debug Analysis Output**:");
    Object.entries(positions).forEach(([mission, pos]) => {
        const rgb = getPixelColor(ctx, pos);
        const color = detectMissionColor(rgb);
        missionColors[mission] = color;
  
        logger.info(`🎯 ${mission.toUpperCase()} Detected RGB: ${rgb.join(", ")} → Color: ${color}`);
    });

    return {
        status: isGreen ? "COMPLETED" : "FAILED",
        message: statusMessage,
        difficultyLevel,
        debug: {
            annotations: annotations, 
            positions: positions, 
            missionColors: missionColors
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
        if (process.env.DEV_MODE === 'true') {
          if (!fs.existsSync(imagePath)) {
              logger.error(`❌ DEV MODE ON but submitted image missing! Expected at: ${imagePath}`);
              return;
          }
          logger.debug(`✅ Submitted image found: ${imagePath}`);
        }

      const image = await loadImage(imagePath);
      const canvas = createCanvas(image.width, image.height);
      const ctx = canvas.getContext('2d');

      ctx.drawImage(image, 0, 0);

      if (!Array.isArray(annotations) || annotations.length === 0) {
          logger.warn(`⚠️ No annotations found for image.`);
          return;
      }

      // ✅ Draw bounding boxes around detected text
      annotations.forEach((box) => {
          if (!box.boundingPoly || !box.boundingPoly.vertices) {
              logger.warn(`⚠️ Skipping annotation without bounding box: ${JSON.stringify(box)}`);
              return;
          }

          const vertices = box.boundingPoly.vertices;
          if (vertices.length < 4) {
              logger.warn(`⚠️ Incomplete bounding box data for ${box.description}`);
              return;
          }

          // Draw bounding box
          ctx.strokeStyle = 'red';
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(vertices[0].x, vertices[0].y);
          ctx.lineTo(vertices[1].x, vertices[1].y);
          ctx.lineTo(vertices[2].x, vertices[2].y);
          ctx.lineTo(vertices[3].x, vertices[3].y);
          ctx.closePath();
          ctx.stroke();

          // Draw detected text label
          ctx.fillStyle = 'blue';
          ctx.font = '12px Arial';
          ctx.fillText(box.description, vertices[0].x, vertices[0].y - 5);
      });

      // 🎯 Draw detected mission status markers ("X")
      Object.keys(positions).forEach((mission) => {
          const { x, y } = positions[mission];
          const color = detectedColors[mission] || 'unknown';

          ctx.fillStyle = color === 'green' ? 'lime' : color === 'red' ? 'red' : 'white';
          ctx.font = `${Math.floor(image.width * 0.015)}px Arial`;
          ctx.fillText('X', x, y);

          ctx.fillStyle = 'yellow';
          ctx.fillText(`${mission.toUpperCase()}: ${color}`, x + 15, y);
      });

      // ✅ Save the debug image correctly
      fs.writeFileSync(debugImagePath, canvas.toBuffer('image/png'));
      logger.info(`✅ Debug image generated: ${debugImagePath}`);

  } catch (error) {
      logger.error(`❌ Failed to generate debug image: ${error.message}`);
  }
}

module.exports = { analyzeImage, generateDebugImage };
