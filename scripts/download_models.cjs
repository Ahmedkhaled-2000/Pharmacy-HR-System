const fs = require('fs');
const https = require('https');
const path = require('path');

const models = [
  'face_recognition_model-shard1',
  'face_recognition_model-shard2',
  'face_recognition_model-weights_manifest.json',
  'face_landmark_68_model-shard1',
  'face_landmark_68_model-weights_manifest.json',
  'ssd_mobilenetv1_model-shard1',
  'ssd_mobilenetv1_model-shard2',
  'ssd_mobilenetv1_model-weights_manifest.json'
];

const baseUrl = 'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights/';
const destDir = path.join(__dirname, '../public/models');

if (!fs.existsSync(destDir)) {
  fs.mkdirSync(destDir, { recursive: true });
}

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on('finish', () => {
        file.close(resolve);
      });
    }).on('error', (err) => {
      fs.unlink(dest, () => reject(err));
    });
  });
}

async function run() {
  for (const model of models) {
    const url = baseUrl + model;
    const dest = path.join(destDir, model);
    console.log(`Downloading ${model}...`);
    try {
      await download(url, dest);
      console.log(`Downloaded ${model}`);
    } catch (e) {
      console.error(`Error downloading ${model}:`, e);
    }
  }
}

run();
