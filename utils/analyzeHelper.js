const vision = require('@google-cloud/vision');
const client = new vision.ImageAnnotatorClient();
const { logger } = require('../utils/logger');


//Testing
async function analyzeImage(imageUrl, devMode) {
  try {
      const [result] = await client.textDetection(imageUrl);
      const annotations = result.textAnnotations;

      if (!annotations || annotations.length === 0) {
          logger.warn('No text detected in the image.');
          return false;
      }

      const detectedText = annotations.map(a => a.description).join('\n').toLowerCase();
      const allComplete = detectedText.includes('1st') && detectedText.includes('2nd') && detectedText.includes('3rd') && !detectedText.includes('red');

      if (devMode) {
          logger.debug('Debug Mode:', { detectedText });
      }

      return allComplete;
  } catch (error) {
      logger.error(`Error analyzing image: ${error.message}`);
      return false;
  }
}

module.exports = { analyzeImage };
