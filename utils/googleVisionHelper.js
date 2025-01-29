const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const vision = require('@google-cloud/vision');

// Set the path to the Vision API key
const keyPath = path.join(__dirname, 'vision-key.json');
if (!fs.existsSync(keyPath)) {
  console.error(`❌ The Google Vision key file was not found at: ${keyPath}`);
  process.exit(1);
}

// Set the environment variable for authentication
process.env.GOOGLE_APPLICATION_CREDENTIALS = keyPath;

const client = new vision.ImageAnnotatorClient();
const debugImagesPath = path.join(__dirname, '../data/debug-images');

async function analyzeImage(imageUrl) {
  try {
    const [result] = await client.textDetection(imageUrl);
    const annotations = result.textAnnotations;

    if (!annotations || annotations.length === 0) {
      console.log("❌ No text detected in the image.");
      return { status: "NO_TEXT", message: "No text found in the image." };
    }

    const detectedText = annotations.map(a => a.description.toLowerCase()).join(' ');
    console.log(`🔍 Extracted Text: ${detectedText}`);

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

    console.log("\n🔎 **Debug Analysis Output**:");
    Object.entries(positions).forEach(([mission, pos]) => {
      const rgb = getPixelColor(ctx, pos);
      const color = detectMissionColor(rgb);
      missionColors[mission] = color;
  
      console.log(`🎯 ${mission.toUpperCase()} Detected RGB: ${rgb.join(", ")} → Color: ${color}`);
    });

    // Generate debug image with X markers
    if (process.env.DEV_MODE === 'true') {
      await generateDebugImage(imageUrl, annotations, positions, missionColors);
    }

    return {
      status: isGreen ? "COMPLETED" : "FAILED",
      message: statusMessage,
      debug: missionColors
    };
  } catch (error) {
    console.error('❌ Error analyzing image:', error);
    return { status: "ERROR", message: "Error analyzing image." };
  }
}

function getPixelColor(ctx, position) {
  const { x, y } = position;
  let r = 0, g = 0, b = 0;
  let count = 0;

  // Sample a 3x3 grid around the target position to average color
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

  console.log(`🔍 Checking RGB: (${r}, ${g}, ${b})`);

  if (g > r * 1.2 && g > b * 1.2 && g > 50) {
      return "green"; // Green mission complete
  }
  if (r > g * 1.2 && r > b * 1.2 && r > 50) {
      return "red"; // Mission failed
  }
  return "not completed"; // Default case
}

async function generateDebugImage(imageUrl, annotations, positions, detectedColors) {
  if (!fs.existsSync(debugImagesPath)) {
      fs.mkdirSync(debugImagesPath, { recursive: true });
  }

  const image = await loadImage(imageUrl);
  const canvas = createCanvas(image.width, image.height);
  const ctx = canvas.getContext('2d');

  // Draw the original image
  ctx.drawImage(image, 0, 0);

  // Draw bounding boxes for detected text
  annotations.forEach(box => {
    const vertices = box.boundingPoly.vertices;
    const [p1, p2, p3, p4] = vertices;

    ctx.strokeStyle = 'red';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.lineTo(p4.x, p4.y);
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = 'blue';
    ctx.font = '12px Arial';
    ctx.fillText(box.description, p1.x, p1.y - 5);
  });

  // Draw "X" markers at detected positions
  Object.keys(positions).forEach(mission => {
    const { x, y } = positions[mission];
    const color = detectedColors[mission] || "unknown";

    // "X" marker in detected color
    ctx.fillStyle = color === "green" ? "lime" : color === "red" ? "red" : "white";
    ctx.font = `${Math.floor(image.width * 0.015)}px Arial`; // Scale text size dynamically
    ctx.fillText("X", x, y); // Mark the exact location where the color is sampled

    // Label the detected color next to the "X"
    ctx.fillStyle = "yellow";
    ctx.fillText(`${mission.toUpperCase()}: ${color}`, x + 15, y);
  });

  // Save the debug image
  const outputPath = path.join(debugImagesPath, 'debug-output.png');
  fs.writeFileSync(outputPath, canvas.toBuffer('image/png'));
  console.log(`✅ Debug image saved with color detection marks: ${outputPath}`);
}

module.exports = { analyzeImage };
