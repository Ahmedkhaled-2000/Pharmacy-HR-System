import { HandLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';

let isHandApiLoaded = false;
let handLandmarker = null;

export const initHandRecognition = async () => {
  if (isHandApiLoaded && handLandmarker) return;

  try {
    const vision = await FilesetResolver.forVisionTasks(
      'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm'
    );
    
    handLandmarker = await HandLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task`,
        delegate: 'GPU'
      },
      runningMode: 'VIDEO',
      numHands: 1
    });
    
    isHandApiLoaded = true;
    console.log('MediaPipe HandLandmarker loaded successfully.');
  } catch (error) {
    console.error('Error initializing hand recognition model:', error);
    throw error;
  }
};

/**
 * Extracts 21 3D landmarks of the hand to form a hand geometry descriptor.
 */
export const getHandEmbedding = (videoElement, lastVideoTime) => {
  if (!isHandApiLoaded || !handLandmarker) {
    throw new Error('HandLandmarker not loaded');
  }

  const startTimeMs = performance.now();
  if (videoElement.currentTime !== lastVideoTime) {
    const results = handLandmarker.detectForVideo(videoElement, startTimeMs);
    
    if (results.landmarks && results.landmarks.length > 0) {
      const landmarks = results.landmarks[0]; // 21 points
      
      // We will calculate a simple hand descriptor based on distances between points
      // to make it scale and translation invariant.
      // E.g. distance from wrist (0) to all other 20 points, normalized.
      const wrist = landmarks[0];
      const descriptor = [];
      let maxDist = 0;

      // Calculate raw distances from wrist
      for (let i = 1; i < 21; i++) {
        const point = landmarks[i];
        const dist = Math.sqrt(
          Math.pow(point.x - wrist.x, 2) + 
          Math.pow(point.y - wrist.y, 2) + 
          Math.pow(point.z - wrist.z, 2)
        );
        descriptor.push(dist);
        if (dist > maxDist) maxDist = dist;
      }

      // Normalize distances so hand distance to camera doesn't affect it
      const normalizedDescriptor = descriptor.map(d => d / maxDist);
      
      // Also calculate distances between fingertips (4, 8, 12, 16, 20)
      const fingerTips = [4, 8, 12, 16, 20];
      for (let i = 0; i < fingerTips.length - 1; i++) {
        const p1 = landmarks[fingerTips[i]];
        const p2 = landmarks[fingerTips[i+1]];
        const dist = Math.sqrt(
          Math.pow(p1.x - p2.x, 2) + Math.pow(p1.y - p2.y, 2) + Math.pow(p1.z - p2.z, 2)
        );
        normalizedDescriptor.push(dist / maxDist);
      }

      return {
        hasHand: true,
        descriptor: normalizedDescriptor,
        results
      };
    }
    return { hasHand: false, results };
  }
  return null;
};

/**
 * Compares a live hand descriptor (descriptor1) against saved descriptors (descriptor2).
 * descriptor2 can be a single array (legacy) or an array of arrays (multi-angle).
 * Returns { isMatch: boolean, matchPercentage: number }
 */
export const compareHands = (descriptor1, descriptor2) => {
  if (!descriptor1 || !descriptor2) {
    return { isMatch: false, matchPercentage: 0 };
  }

  // Normalize descriptor2 to always be an array of arrays (multi-angle)
  const savedDescriptors = (descriptor2.length > 0 && Array.isArray(descriptor2[0])) 
    ? descriptor2 
    : [descriptor2];

  let bestMatchPercentage = 0;
  let bestDistance = Infinity;

  // Find the best match among all saved angles
  for (const savedDesc of savedDescriptors) {
    if (descriptor1.length !== savedDesc.length) continue;

    let totalDiff = 0;
    for (let i = 0; i < descriptor1.length; i++) {
      totalDiff += Math.abs(descriptor1[i] - savedDesc[i]);
    }
    
    // Average difference per feature
    const avgDiff = totalDiff / descriptor1.length;
    
    // Convert difference to a confidence percentage
    let matchPercentage = 100 - (avgDiff * 1000); 
    if (matchPercentage < 0) matchPercentage = 0;
    if (matchPercentage > 100) matchPercentage = 100;

    if (matchPercentage > bestMatchPercentage) {
      bestMatchPercentage = matchPercentage;
      bestDistance = avgDiff;
    }
  }

  // We require 70% match as requested
  const isMatch = bestMatchPercentage >= 70;

  return {
    isMatch,
    matchPercentage: bestMatchPercentage,
    distance: bestDistance
  };
};
