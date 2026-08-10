import * as faceapi from 'face-api.js';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let isFaceApiLoaded = false;
let faceLandmarker = null;

// Initialize both libraries
export const initFaceRecognition = async () => {
  if (isFaceApiLoaded && faceLandmarker) return;

  try {
    // 1. Load face-api.js models (for embedding)
    const MODEL_URL = '/models';
    await Promise.all([
      faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
      faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
      faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
    ]);
    isFaceApiLoaded = true;
    console.log('face-api.js models loaded successfully.');

    // 2. Load MediaPipe FaceLandmarker (for liveness and anti-spoofing)
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
    );
    faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task`,
        delegate: 'GPU'
      },
      outputFaceBlendshapes: true,
      runningMode: 'VIDEO',
      numFaces: 1
    });
    console.log('MediaPipe FaceLandmarker loaded successfully.');
  } catch (error) {
    console.error('Error initializing face recognition models:', error);
    throw error;
  }
};

// Check if a face is clear, well-lit, and extract its embedding
export const getFaceEmbedding = async (videoElement) => {
  if (!isFaceApiLoaded) throw new Error('Models not loaded');

  // Detect face using face-api
  const detection = await faceapi.detectSingleFace(videoElement)
    .withFaceLandmarks()
    .withFaceDescriptor();

  if (!detection) {
    return { error: 'لم يتم التعرف على وجه. يرجى التأكد من الإضاءة وتوجيه وجهك للكاميرا.' };
  }

  // Basic lighting check (Brightness & Blur) can be done by drawing to a canvas,
  // but face-api detection score is a good proxy for clarity.
  if (detection.detection.score < 0.8) {
    return { error: 'الصورة غير واضحة أو الإضاءة ضعيفة. يرجى تحسين الإضاءة.' };
  }

  return { descriptor: Array.from(detection.descriptor) };
};

// Liveness Detection using MediaPipe
export const checkLiveness = (videoElement, lastVideoTime) => {
  if (!faceLandmarker) throw new Error('FaceLandmarker not initialized');
  
  const startTimeMs = performance.now();
  if (videoElement.currentTime !== lastVideoTime) {
    const results = faceLandmarker.detectForVideo(videoElement, startTimeMs);
    
    if (results.faceBlendshapes && results.faceBlendshapes.length > 0 && results.faceLandmarks && results.faceLandmarks.length > 0) {
      const blendshapes = results.faceBlendshapes[0].categories;
      const landmarks = results.faceLandmarks[0];
      
      // Look for specific expressions to prove liveness
      const eyeBlinkLeft = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score || 0;
      const eyeBlinkRight = blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score || 0;
      const smile = blendshapes.find(b => b.categoryName === 'mouthSmileLeft')?.score || 0;
      const smileRight = blendshapes.find(b => b.categoryName === 'mouthSmileRight')?.score || 0;
      
      // Calculate head turn using landmarks (nose relative to cheeks)
      const noseTip = landmarks[1];
      const leftCheek = landmarks[234];
      const rightCheek = landmarks[454];
      
      const leftDist = Math.abs(noseTip.x - leftCheek.x);
      const rightDist = Math.abs(rightCheek.x - noseTip.x);
      
      // Ratio of distances helps determine head rotation (Yaw)
      const isLookingRight = (leftDist / (rightDist || 0.001)) > 1.8; // User looking to their right (our left)
      const isLookingLeft = (rightDist / (leftDist || 0.001)) > 1.8;  // User looking to their left (our right)

      return {
        hasFace: true,
        isBlinking: (eyeBlinkLeft > 0.4 && eyeBlinkRight > 0.4),
        isSmiling: (smile > 0.5 || smileRight > 0.5),
        isLookingLeft,
        isLookingRight,
        results
      };
    }
    return { hasFace: false, results };
  }
  return null;
};

// Compare two descriptors. Returns a distance. Lower is better.
// Distance < 0.5 usually means match. The user requested 70% match threshold.
// A distance of 0.5 roughly corresponds to 70-75% confidence in face-api.
export const compareFaces = (descriptor1, descriptor2) => {
  if (!descriptor1 || !descriptor2) return { isMatch: false, matchPercentage: 0, distance: 1 };
  
  // Check if descriptor1 is an array of descriptors (multi-angle registration)
  const isMultiDescriptor = Array.isArray(descriptor1[0]);
  const descriptorsToMatch = isMultiDescriptor ? descriptor1 : [descriptor1];
  
  let minDist = Infinity;
  
  for (const desc of descriptorsToMatch) {
    if (!desc || desc.length === 0) continue;
    const dist = faceapi.euclideanDistance(
      new Float32Array(desc),
      new Float32Array(descriptor2)
    );
    if (dist < minDist) {
      minDist = dist;
    }
  }

  // If something went wrong and we couldn't calculate, return 0
  if (minDist === Infinity) return { isMatch: false, matchPercentage: 0, distance: 1 };
  
  // Convert distance to a percentage match (rough estimation)
  // Distance 0 = 100%, Distance 0.6 = ~60%
  const matchPercentage = Math.max(0, 100 - (minDist * 100));
  
  return {
    isMatch: matchPercentage >= 70, // 70% threshold as requested
    matchPercentage,
    distance: minDist
  };
};
