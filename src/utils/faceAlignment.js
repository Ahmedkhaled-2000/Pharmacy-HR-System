/**
 * faceAlignment.js
 * محاذاة الوجه هندسياً باستخدام التحويل التآلفي (5-Point Affine Transformation)
 * لتحويل وتدوير الوجه إلى القالب المعياري العالمي (112x112) المستخدم في ArcFace و InsightFace.
 */

// القالب المعياري لأبعاد معالم الوجه الخمسة على مصفوفة 112x112 (InsightFace standard template)
export const ARCFACE_TEMPLATE = [
  [38.2946, 51.6963], // العين اليسرى (Left Eye)
  [73.5318, 51.5014], // العين اليمنى (Right Eye)
  [56.0252, 71.7366], // طرف الأنف (Nose Tip)
  [41.5493, 92.3655], // زاوية الفم اليسرى (Left Mouth Corner)
  [70.7299, 92.2041]  // زاوية الفم اليمنى (Right Mouth Corner)
];

/**
 * حساب مصفوفة التحويل التآلفي (Similarity Transform / Umeyama)
 * بين النقاط المصدرية (Source Landmarks) ونقاط القالب المعياري (Target Template)
 * @param {Array<[number, number]>} srcPoints - النقاط الخمس من الصورة الأصلية
 * @param {Array<[number, number]>} dstPoints - نقاط القالب المعياري (112x112)
 * @returns {{ a: number, b: number, c: number, d: number, e: number, f: number }} مصفوفة 2D Affine
 */
export function estimateSimilarityTransform(srcPoints, dstPoints = ARCFACE_TEMPLATE) {
  const numPoints = srcPoints.length;
  
  // حساب المتوسط الحسابي (Mean Centers)
  let srcMeanX = 0, srcMeanY = 0;
  let dstMeanX = 0, dstMeanY = 0;

  for (let i = 0; i < numPoints; i++) {
    srcMeanX += srcPoints[i][0];
    srcMeanY += srcPoints[i][1];
    dstMeanX += dstPoints[i][0];
    dstMeanY += dstPoints[i][1];
  }

  srcMeanX /= numPoints;
  srcMeanY /= numPoints;
  dstMeanX /= numPoints;
  dstMeanY /= numPoints;

  // إزاحة النقاط حول المركز
  let srcVar = 0;
  let covXX = 0, covXY = 0, covYX = 0, covYY = 0;

  for (let i = 0; i < numPoints; i++) {
    const srcX = srcPoints[i][0] - srcMeanX;
    const srcY = srcPoints[i][1] - srcMeanY;
    const dstX = dstPoints[i][0] - dstMeanX;
    const dstY = dstPoints[i][1] - dstMeanY;

    srcVar += srcX * srcX + srcY * srcY;
    covXX += srcX * dstX;
    covXY += srcX * dstY;
    covYX += srcY * dstX;
    covYY += srcY * dstY;
  }

  if (srcVar === 0) srcVar = 1e-6;

  // حساب الدوران والمقياس (Scale & Rotation)
  const a1 = (covXX + covYY) / srcVar;
  const b1 = (covXY - covYX) / srcVar;

  // التحويل العكسي للتطبيق على الـ Canvas
  // X_dst = a1 * (X_src - srcMeanX) - b1 * (Y_src - srcMeanY) + dstMeanX
  // Y_dst = b1 * (X_src - srcMeanX) + a1 * (Y_src - srcMeanY) + dstMeanY
  
  // لحساب التحويل المباشر في الـ Canvas Context (من Dst إلى Src أو العكس):
  const denom = a1 * a1 + b1 * b1 || 1e-6;
  const invA = a1 / denom;
  const invB = -b1 / denom;

  const tX = srcMeanX - (invA * (dstMeanX) - invB * (dstMeanY));
  const tY = srcMeanY - (invB * (dstMeanX) + invA * (dstMeanY));

  return {
    invA,
    invB,
    tX,
    tY,
    scale: Math.sqrt(a1 * a1 + b1 * b1),
    rotationRad: Math.atan2(b1, a1)
  };
}

/**
 * استخراج الوجه ومحاذاته هندسياً إلى Canvas بمقاس 112x112
 * @param {HTMLVideoElement|HTMLCanvasElement|HTMLImageElement} sourceMedia 
 * @param {Array<[number, number]>} fiveLandmarks - [leftEye, rightEye, nose, leftMouth, rightMouth]
 * @param {HTMLCanvasElement} [targetCanvas] 
 * @returns {HTMLCanvasElement} Canvas يحتوي على الوجه المقصوص والمعدل هندسياً بدقة 112x112
 */
export function alignAndCropFace(sourceMedia, fiveLandmarks, targetCanvas = null) {
  const canvas = targetCanvas || document.createElement('canvas');
  canvas.width = 112;
  canvas.height = 112;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  ctx.clearRect(0, 0, 112, 112);

  if (!fiveLandmarks || fiveLandmarks.length < 5) {
    // Fallback: قص بسيط في حال تعذر الحصول على الـ 5 نقاط بدقة
    ctx.drawImage(sourceMedia, 0, 0, sourceMedia.videoWidth || sourceMedia.width, sourceMedia.videoHeight || sourceMedia.height, 0, 0, 112, 112);
    return canvas;
  }

  // حساب معامل التحويل التآلفي
  const transform = estimateSimilarityTransform(fiveLandmarks, ARCFACE_TEMPLATE);

  ctx.save();
  // تطبيق التحويل العكسي على فضاء الـ Canvas لرسم الصورة المصدرية بمحاذاة تامة
  // ctx.transform(a, b, c, d, e, f)
  ctx.transform(
    1 / (transform.invA * transform.invA + transform.invB * transform.invB) * transform.invA,
    1 / (transform.invA * transform.invA + transform.invB * transform.invB) * (-transform.invB),
    1 / (transform.invA * transform.invA + transform.invB * transform.invB) * (transform.invB),
    1 / (transform.invA * transform.invA + transform.invB * transform.invB) * transform.invA,
    0, 0
  );

  // أو عبر التدوير والإزاحة المباشرة:
  ctx.restore();
  ctx.save();

  // الطريقة المباشرة والأكثر استقراراً في جميع المتصفحات:
  // 1. مركز القالب
  const eyeCenterSrc = [
    (fiveLandmarks[0][0] + fiveLandmarks[1][0]) / 2,
    (fiveLandmarks[0][1] + fiveLandmarks[1][1]) / 2
  ];
  const eyeCenterDst = [
    (ARCFACE_TEMPLATE[0][0] + ARCFACE_TEMPLATE[1][0]) / 2,
    (ARCFACE_TEMPLATE[0][1] + ARCFACE_TEMPLATE[1][1]) / 2
  ];

  const dx = fiveLandmarks[1][0] - fiveLandmarks[0][0];
  const dy = fiveLandmarks[1][1] - fiveLandmarks[0][1];
  const angle = Math.atan2(dy, dx);
  const srcDist = Math.sqrt(dx * dx + dy * dy);
  const dstDist = ARCFACE_TEMPLATE[1][0] - ARCFACE_TEMPLATE[0][0]; // ~35.23px
  const scale = dstDist / (srcDist || 1);

  ctx.translate(eyeCenterDst[0], eyeCenterDst[1]);
  ctx.rotate(-angle);
  ctx.scale(scale, scale);
  ctx.translate(-eyeCenterSrc[0], -eyeCenterSrc[1]);

  ctx.drawImage(sourceMedia, 0, 0);
  ctx.restore();

  return canvas;
}

/**
 * تحويل معالم MediaPipe FaceLandmarker (478 نقطة) إلى 5 نقاط أساسية متوافقة مع القالب
 * @param {Array<{x: number, y: number, z?: number}>} landmarks478 
 * @param {number} imgWidth 
 * @param {number} imgHeight 
 * @returns {Array<[number, number]>}
 */
export function extract5LandmarksFromMediaPipe(landmarks478, imgWidth, imgHeight) {
  if (!landmarks478 || landmarks478.length < 468) return null;

  // Indices in MediaPipe Face Mesh:
  // Left eye pupil / center: 468 or 33 / 133 avg
  // Right eye pupil / center: 473 or 362 / 263 avg
  // Nose tip: 1 or 4
  // Left mouth corner: 61
  // Right mouth corner: 291

  const getPt = (idx) => [landmarks478[idx].x * imgWidth, landmarks478[idx].y * imgHeight];

  // إذا كانت نقاط البؤبؤ المكررة (Iris 468/473) متوفرة:
  const leftEye = landmarks478.length > 468 ? getPt(468) : [
    (landmarks478[33].x + landmarks478[133].x) * 0.5 * imgWidth,
    (landmarks478[33].y + landmarks478[133].y) * 0.5 * imgHeight
  ];

  const rightEye = landmarks478.length > 473 ? getPt(473) : [
    (landmarks478[362].x + landmarks478[263].x) * 0.5 * imgWidth,
    (landmarks478[362].y + landmarks478[263].y) * 0.5 * imgHeight
  ];

  const nose = getPt(1);
  const leftMouth = getPt(61);
  const rightMouth = getPt(291);

  return [leftEye, rightEye, nose, leftMouth, rightMouth];
}
