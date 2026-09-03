/**
 * faceApiHelper.js
 * الجيل الجديد من محرك التعرف على الوجوه ونظام الحيوية
 * مبني على ONNX Runtime Web + InsightFace MobileFaceNet (512D ArcFace)
 * + MediaPipe Face Mesh & Blendshapes + CLAHE & Low-Light Enhancement
 */

import * as ort from 'onnxruntime-web';
import { FaceLandmarker, FilesetResolver } from '@mediapipe/tasks-vision';
import { extract5LandmarksFromMediaPipe, alignAndCropFace } from './faceAlignment';
import { evaluateLighting, enhanceLowLightCanvas, applyFastCLAHE } from './lowLightEnhancer';

let isFaceModelLoaded = false;
let faceLandmarker = null;
let onnxSession = null;
let alignCanvas = null;

let initPromise = null;

/**
 * فحص ما إذا كان المتصفح يدعم تعليمات WebAssembly SIMD
 */
export const isWasmSimdSupported = () => {
  try {
    return typeof WebAssembly === 'object' && typeof WebAssembly.validate === 'function' &&
      WebAssembly.validate(new Uint8Array([
        0, 97, 115, 109, 1, 0, 0, 0, 1, 5, 1, 96, 0, 1, 123, 3, 2, 1, 0, 10, 10, 1, 8, 0, 65, 0, 253, 15, 26, 11
      ]));
  } catch {
    return false;
  }
};

let lastFaceTimestamp = 0;

/**
 * فحص ما إذا كان محرك الوجه جاهزاً بالفعل
 */
export const isFaceEngineReady = () => {
  return isFaceModelLoaded && Boolean(faceLandmarker) && Boolean(onnxSession);
};

/**
 * تهيئة وتحميل محركات الذكاء الاصطناعي (MediaPipe + ONNX Runtime Web)
 * متوافقة 100% مع الهواتف الذكية (iOS Safari, Android Chrome) وكافة المتصفحات
 */
export const initFaceRecognition = async () => {
  if (isFaceEngineReady()) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      console.log('⚡ [FaceEngine] جاري تهيئة محرك التعرف على الوجه مع دعم الهواتف والمتصفحات...');

      // 1. إعداد مسارات تشغيل ONNX WebAssembly مع الكشف التلقائي عن دعم SIMD في الهاتف/المتصفح
      const supportsSimd = isWasmSimdSupported();
      try {
        ort.env.wasm.numThreads = 1;
        ort.env.wasm.simd = supportsSimd;
        ort.env.wasm.wasmPaths = 'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/';
      } catch (e) {
        console.warn('[FaceEngine] WASM path setup note:', e);
      }

      // 2. تحميل نموذج MediaPipe FaceLandmarker مع الدعم المزدوج للمتصفحات والهواتف
      const visionResolvers = [
        { type: 'local', path: '/mediapipe-wasm' },
        { type: 'cdn', path: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.3/wasm' }
      ];

      const modelPaths = [
        '/models/face_landmarker.task',
        'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
      ];
      // على الهواتف المتطورة يتم تجربة GPU أولاً، ثم CPU فوراً إذا تعذر WebGL
      const delegates = ['GPU', 'CPU'];

      let landmarkerCreated = false;
      let lastLandmarkerErr = null;

      for (const res of visionResolvers) {
        if (landmarkerCreated) break;
        let vision = null;
        try {
          vision = await FilesetResolver.forVisionTasks(res.path);
        } catch (visErr) {
          console.warn(`[FaceEngine] Vision resolver (${res.type}) error:`, visErr);
          continue;
        }

        for (const mPath of modelPaths) {
          if (landmarkerCreated) break;
          for (const dlg of delegates) {
            try {
              faceLandmarker = await FaceLandmarker.createFromOptions(vision, {
                baseOptions: {
                  modelAssetPath: mPath,
                  delegate: dlg
                },
                outputFaceBlendshapes: true,
                runningMode: 'VIDEO',
                numFaces: 1
              });
              landmarkerCreated = true;
              console.log(`✅ [FaceEngine] FaceLandmarker loaded (${res.type}, ${mPath}, ${dlg})`);
              break;
            } catch (landmarkerErr) {
              lastLandmarkerErr = landmarkerErr;
              console.warn(`FaceLandmarker attempt failed (${res.type}, ${mPath}, ${dlg}):`, landmarkerErr.message || landmarkerErr);
            }
          }
        }
      }

      if (!landmarkerCreated || !faceLandmarker) {
        throw new Error('تعذر تحميل نموذج معالم الوجه (FaceLandmarker): ' + (lastLandmarkerErr?.message || 'تأكد من الاتصال بالإنترنت'));
      }

      // 3. تحميل نموذج MobileFaceNet (ArcFace 512D) عبر ONNX Runtime مع تعافي SIMD تلقائي
      const modelUrl = '/models/w600k_mbf.onnx';
      try {
        onnxSession = await ort.InferenceSession.create(modelUrl, {
          executionProviders: ['wasm']
        });
      } catch (sessionErr) {
        console.warn('[FaceEngine] First session attempt failed, retrying with simd=false and basic config:', sessionErr);
        try {
          ort.env.wasm.simd = false;
          onnxSession = await ort.InferenceSession.create(modelUrl, {
            executionProviders: ['wasm']
          });
        } catch (retryErr) {
          console.warn('[FaceEngine] Second session attempt failed, final fallback:', retryErr);
          onnxSession = await ort.InferenceSession.create(modelUrl);
        }
      }

      // تهيئة Canvas مؤقت لإجراء عمليات التحويل
      alignCanvas = document.createElement('canvas');
      alignCanvas.width = 112;
      alignCanvas.height = 112;

      isFaceModelLoaded = true;
      console.log('✅ تم تحميل محرك التعرف على الوجه بنجاح (ONNX ArcFace 512D + MediaPipe Mobile-Ready).');
    } catch (error) {
      console.error('❌ خطأ في تحميل نماذج الذكاء الاصطناعي للوجه:', error);
      initPromise = null;
      isFaceModelLoaded = false;
      faceLandmarker = null;
      onnxSession = null;
      throw error;
    }
  })();

  return initPromise;
};

/**
 * التحميل الاستباقي في الخلفية (Pre-Warming) لتشغيل المحرك بدون أي تأخير عند النقر
 */
export const preWarmFaceModels = () => {
  if (isFaceEngineReady()) return Promise.resolve();
  return initFaceRecognition().catch(err => {
    console.warn('[FacePreWarm] Pre-warming models encounter:', err);
  });
};

/**
 * استخراج بصمة الوجه (512D Vector) مع دعم الهواتف والإضاءة المنخفضة والزوايا الحادة
 * @param {HTMLVideoElement|HTMLCanvasElement} videoElement
 * @param {Object} options
 * @returns {Promise<{ descriptor?: number[], error?: string, luminance?: number, isLowLight?: boolean }>}
 */
export const getFaceEmbedding = async (videoElement, options = {}) => {
  if (!isFaceModelLoaded || !faceLandmarker || !onnxSession) {
    throw new Error('النماذج لم تكتمل في التحميل بعد.');
  }

  const width = videoElement.videoWidth || videoElement.width || 0;
  const height = videoElement.videoHeight || videoElement.height || 0;

  // التحقق من جاهزية الفيديو واستلام أول إطار من الكاميرا
  if (width === 0 || height === 0 || (videoElement.readyState !== undefined && videoElement.readyState < 2)) {
    return { error: 'جاري تشغيل الكاميرا وتجهيز الإطار...' };
  }

  // ضمان زيادة زمنية مستمرة صارمة لتفادي انهيار MediaPipe على الهواتف
  const now = performance.now();
  const startTimeMs = Math.max(now, lastFaceTimestamp + 10);
  lastFaceTimestamp = startTimeMs;

  // 1. كشف الوجه والمعالم باستخدام MediaPipe
  let results;
  try {
    results = faceLandmarker.detectForVideo(videoElement, startTimeMs);
  } catch (e) {
    console.warn('[FaceEngine] detectForVideo frame error:', e);
    return { error: 'تعذر تحليل إطار الكاميرا. يرجى الانتظار ثانية والمحاولة مجدداً.' };
  }

  if (!results.faceLandmarks || results.faceLandmarks.length === 0) {
    return { error: 'لم يتم العثور على وجه. يرجى توجيه وجهك للكاميرا مباشرة.' };
  }

  const landmarks478 = results.faceLandmarks[0];

  // 2. فحص مستوى الإضاءة
  let lightingInfo = { isLowLight: false, isVeryDark: false, luminance: 100 };
  try {
    const checkCanvas = document.createElement('canvas');
    checkCanvas.width = 64;
    checkCanvas.height = 64;
    const checkCtx = checkCanvas.getContext('2d', { willReadFrequently: true });
    checkCtx.drawImage(videoElement, 0, 0, 64, 64);
    lightingInfo = evaluateLighting(checkCanvas);
  } catch (e) {
    // Non-blocking
  }

  // 3. استخراج النقاط الخمس الأساسية ومحاذاة الوجه هندسياً إلى 112x112
  const fivePoints = extract5LandmarksFromMediaPipe(landmarks478, width, height);
  if (!fivePoints) {
    return { error: 'يرجى الاقتراب من الكاميرا والنظر للأمام بوضوح.' };
  }

  alignAndCropFace(videoElement, fivePoints, alignCanvas);

  // 4. تحسين الإضاءة والظلال في حال كانت البيئة معتمة
  if (lightingInfo.isLowLight) {
    enhanceLowLightCanvas(alignCanvas);
    const ctx = alignCanvas.getContext('2d', { willReadFrequently: true });
    const imgData = ctx.getImageData(0, 0, 112, 112);
    applyFastCLAHE(imgData);
    ctx.putImageData(imgData, 0, 0);
  }

  // 5. تجهيز التنسور (Input Tensor) بنمط NCHW [1, 3, 112, 112] وتطبيع القيم [-1, 1]
  const ctx = alignCanvas.getContext('2d', { willReadFrequently: true });
  const imgData = ctx.getImageData(0, 0, 112, 112);
  const data = imgData.data;

  const floatArray = new Float32Array(1 * 3 * 112 * 112);
  const planeSize = 112 * 112;

  // InsightFace معيار (BGR or RGB normalization): (v - 127.5) / 127.5
  for (let i = 0; i < planeSize; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];

    // Standard BGR normalization
    floatArray[i] = (b - 127.5) / 127.5;                  // Channel 0 (B)
    floatArray[planeSize + i] = (g - 127.5) / 127.5;      // Channel 1 (G)
    floatArray[2 * planeSize + i] = (r - 127.5) / 127.5;  // Channel 2 (R)
  }

  const inputTensor = new ort.Tensor('float32', floatArray, [1, 3, 112, 112]);
  const feeds = {};
  feeds[onnxSession.inputNames[0]] = inputTensor;

  // 6. استخراج البصمة عبر الشبكة العصبية
  const runResults = await onnxSession.run(feeds);
  const outputData = runResults[onnxSession.outputNames[0]].data;

  // 7. تطبيع المتجه L2-Norm لضمان دقة مسافة جيب التمام
  let sumSq = 0;
  for (let i = 0; i < outputData.length; i++) {
    sumSq += outputData[i] * outputData[i];
  }
  const norm = Math.sqrt(sumSq) || 1e-6;

  const normalizedDescriptor = new Array(outputData.length);
  for (let i = 0; i < outputData.length; i++) {
    normalizedDescriptor[i] = Number((outputData[i] / norm).toFixed(6));
  }

  return {
    descriptor: normalizedDescriptor,
    luminance: lightingInfo.luminance,
    isLowLight: lightingInfo.isLowLight,
    isVeryDark: lightingInfo.isVeryDark
  };
};

/**
 * فحص الحيوية ومكافحة التزييف (Liveness & Anti-Spoofing)
 */
export const checkLiveness = (videoElement, lastVideoTime) => {
  if (!faceLandmarker) throw new Error('FaceLandmarker not initialized');

  const startTimeMs = performance.now();
  if (videoElement.currentTime !== lastVideoTime) {
    const results = faceLandmarker.detectForVideo(videoElement, startTimeMs);

    if (results.faceBlendshapes && results.faceBlendshapes.length > 0 && results.faceLandmarks && results.faceLandmarks.length > 0) {
      const blendshapes = results.faceBlendshapes[0].categories;
      const landmarks = results.faceLandmarks[0];

      const eyeBlinkLeft = blendshapes.find(b => b.categoryName === 'eyeBlinkLeft')?.score || 0;
      const eyeBlinkRight = blendshapes.find(b => b.categoryName === 'eyeBlinkRight')?.score || 0;
      const smile = blendshapes.find(b => b.categoryName === 'mouthSmileLeft')?.score || 0;
      const smileRight = blendshapes.find(b => b.categoryName === 'mouthSmileRight')?.score || 0;

      // حساب زوايا حركة الرأس (Yaw & Pitch)
      const noseTip = landmarks[1];
      const leftCheek = landmarks[234];
      const rightCheek = landmarks[454];

      const leftDist = Math.abs(noseTip.x - leftCheek.x);
      const rightDist = Math.abs(rightCheek.x - noseTip.x);

      const isLookingRight = (leftDist / (rightDist || 0.001)) > 1.7;
      const isLookingLeft = (rightDist / (leftDist || 0.001)) > 1.7;

      return {
        hasFace: true,
        isBlinking: (eyeBlinkLeft > 0.35 && eyeBlinkRight > 0.35),
        isSmiling: (smile > 0.45 || smileRight > 0.45),
        isLookingLeft,
        isLookingRight,
        results
      };
    }
    return { hasFace: false, results };
  }
  return null;
};

/**
 * حساب تشابه جيب التمام (Cosine Similarity) بين متجهين
 * @param {number[]} v1 
 * @param {number[]} v2 
 * @returns {number} قيمة بين -1 و 1 (الأقرب لـ 1 يعني تطابقاً تاماً)
 */
export function calculateCosineSimilarity(v1, v2) {
  if (!v1 || !v2 || v1.length === 0 || v2.length === 0) return 0;
  
  if (v1.length !== v2.length) {
    // في حال وجود بصمة قديمة (128D) مسجلة بالنظام القديم مقارنة ببصمة جديدة (512D)
    console.warn(`[FaceMatch] Vector dimension mismatch: ${v1.length} vs ${v2.length}`);
    return 0;
  }

  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < v1.length; i++) {
    dotProduct += v1[i] * v2[i];
    norm1 += v1[i] * v1[i];
    norm2 += v2[i] * v2[i];
  }

  const denom = Math.sqrt(norm1) * Math.sqrt(norm2);
  if (denom === 0) return 0;

  return dotProduct / denom;
}

/**
 * مطابقة بصمة الوجه الحية مع البصمات المسجلة بقاعدة البيانات
 * تدعم البصمات الفردية والبصمات المتعددة (Multi-Angle/Multi-Condition)
 * @param {Array|Float32Array} savedDescriptor - البصمة المسجلة (أو مصفوفة بصمات)
 * @param {Array|Float32Array} liveDescriptor - البصمة الحية الملتقطة
 * @param {number} threshold - نسبة التطابق المطلوبة (افتراضي 70%)
 * @returns {{ isMatch: boolean, matchPercentage: number, similarity: number, distance: number, isLegacy?: boolean }}
 */
export const compareFaces = (savedDescriptor, liveDescriptor, threshold = 70) => {
  if (!savedDescriptor || !liveDescriptor) {
    return { isMatch: false, matchPercentage: 0, similarity: 0, distance: 1 };
  }

  // التحقق إن كانت البصمة المخزنة مصفوفة من البصمات (Multi-descriptor)
  const isMulti = Array.isArray(savedDescriptor) && Array.isArray(savedDescriptor[0]);
  const descriptorsList = isMulti ? savedDescriptor : [savedDescriptor];

  let bestSimilarity = -1;
  let hasDimensionMismatch = false;

  for (const desc of descriptorsList) {
    if (!desc || desc.length === 0) continue;

    if (desc.length !== liveDescriptor.length) {
      hasDimensionMismatch = true;
      continue;
    }

    const sim = calculateCosineSimilarity(desc, liveDescriptor);
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
    }
  }

  if (bestSimilarity === -1) {
    if (hasDimensionMismatch) {
      // إشارة إلى أن الموظف يحتاج تحديث بصمته للنموذج عالي الدقة الجديد
      return {
        isMatch: false,
        matchPercentage: 0,
        similarity: 0,
        distance: 1,
        isLegacy: true,
        error: 'البصمة المسجلة قديمة وتحتاج لإعادة تسجيل بالنموذج الحديث عالي الدقة.'
      };
    }
    return { isMatch: false, matchPercentage: 0, similarity: 0, distance: 1 };
  }

  // تحويل تشابه جيب التمام لموديل ArcFace إلى نسبة مئوية دقيقة وموزونة:
  // في ArcFace 512D:
  // التشابه < 0.20 = شخص مختلف تماماً (0%)
  // التشابه = 0.40 = شبه ضعيف (~35%)
  // التشابه = 0.55 = تطابق مؤكد (~70%)
  // التشابه >= 0.75 = تطابق تام (100%)
  let matchPercentage = 0;
  if (bestSimilarity <= 0.20) {
    matchPercentage = Math.max(0, Math.round(bestSimilarity * 50));
  } else if (bestSimilarity < 0.50) {
    // 0.20 to 0.50 maps to 10% - 60%
    matchPercentage = Math.round(10 + ((bestSimilarity - 0.20) / 0.30) * 50);
  } else {
    // 0.50 to 0.80 maps to 60% - 100%
    matchPercentage = Math.min(100, Math.round(60 + ((bestSimilarity - 0.50) / 0.30) * 40));
  }

  // اعتماد عتبة الـ 70% المطلوبة (المطابقة لـ Cosine Similarity ~ 0.57+)
  const isMatch = matchPercentage >= threshold;

  return {
    isMatch,
    matchPercentage,
    similarity: Number(bestSimilarity.toFixed(4)),
    distance: Number((1 - bestSimilarity).toFixed(4))
  };
};
