const vision = require('@google-cloud/vision');
const client = new vision.ImageAnnotatorClient();


//Testing
async function analyzeImage(imageUrl, devMode) {
  const [result] = await client.textDetection(imageUrl);
  const annotations = result.textAnnotations;

  if (!annotations || annotations.length === 0) return false;

  const detectedText = annotations.map(a => a.description).join('\n').toLowerCase();
  const allComplete = detectedText.includes('1st') && detectedText.includes('2nd') && detectedText.includes('3rd') && !detectedText.includes('red');

  if (devMode) {
    console.log('Debug Mode:', { detectedText });
  }

  return allComplete;
}

module.exports = { analyzeImage };
