/**
 * lowLightEnhancer.js
 * وحدة معالجة وتحسين صور الوجه في ظروف الإضاءة المنخفضة والظلال المعقدة
 * تستخدم تقنيات CLAHE الملساء (Bilinear Interpolated CLAHE)
 * وتعديل Gamma الديناميكي وموازنة الظلال الجانبية بدقة متناهية دون تشويه المعالم.
 */

/**
 * حساب متوسط الإضاءة (Luminance) للإطار أو الوجه
 * @param {ImageData} imageData 
 * @returns {number} متوسط السطوع بين 0 (مظلم تماماً) إلى 255 (مضيء جداً)
 */
export function calculateLuminance(imageData) {
  const data = imageData.data;
  let totalLuminance = 0;
  const pixelCount = data.length / 4;
  if (pixelCount === 0) return 100;

  for (let i = 0; i < data.length; i += 4) {
    // Formula for relative luminance: 0.299 R + 0.587 G + 0.114 B
    totalLuminance += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
  }

  return totalLuminance / pixelCount;
}

/**
 * فحص مستوى جودة الإضاءة وتوزيع الظلال
 * @param {HTMLCanvasElement|ImageData} source 
 * @returns {{ isLowLight: boolean, isVeryDark: boolean, isUneven: boolean, luminance: number }}
 */
export function evaluateLighting(source) {
  let imageData;
  if (source instanceof ImageData) {
    imageData = source;
  } else {
    const ctx = source.getContext('2d', { willReadFrequently: true });
    imageData = ctx.getImageData(0, 0, source.width, source.height);
  }

  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;
  const luminance = calculateLuminance(imageData);

  // فحص تفاوت الإضاءة بين النصف الأيمن والأيسر للوجه (الظلال الجانبية المعتمة)
  let leftLum = 0, rightLum = 0;
  let leftCount = 0, rightCount = 0;
  const midX = Math.floor(width / 2);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const lum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
      if (x < midX) {
        leftLum += lum;
        leftCount++;
      } else {
        rightLum += lum;
        rightCount++;
      }
    }
  }

  const avgLeft = leftCount ? (leftLum / leftCount) : luminance;
  const avgRight = rightCount ? (rightLum / rightCount) : luminance;
  const isUneven = Math.abs(avgLeft - avgRight) > 35; // فرق إضاءة كبير بين شطري الوجه

  return {
    isLowLight: luminance < 85,
    isVeryDark: luminance < 45,
    isUneven,
    luminance: Math.round(luminance)
  };
}

/**
 * تطبيق Adaptive Gamma & Contrast Enhancement على صورة Canvas
 * يرفع تفاصيل الوجه في الإضاءة الخافتة دون الإفراط في إضاءة المناطق الفاتحة
 * @param {HTMLCanvasElement} canvas 
 * @param {number} targetGamma - معامل التفتيح الاختياري
 */
export function enhanceLowLightCanvas(canvas, targetGamma = null) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const currentLuminance = calculateLuminance(imageData);

  if (currentLuminance >= 135 && !targetGamma) {
    return canvas;
  }

  let gamma = targetGamma;
  if (!gamma) {
    if (currentLuminance < 40) {
      gamma = 0.42; // تفتيح قوي للظلام الحاد
    } else if (currentLuminance < 75) {
      gamma = 0.55; // تفتيح للأماكن الخافتة
    } else if (currentLuminance < 100) {
      gamma = 0.72; // تفتيح خفيف وموزون
    } else {
      gamma = 0.85;
    }
  }

  // إنشاء جدول بحث مسبق (LUT) فائق السرعة
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, Math.max(0, Math.round(255 * Math.pow(i / 255, gamma))));
  }

  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];
    data[i + 1] = lut[data[i + 1]];
    data[i + 2] = lut[data[i + 2]];
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * تطبيق CLAHE مع Bilinear Interpolation فائق النعومة لمنع أي خطوط تقطيع كتلية
 * يحافظ على دقة شبكات ArcFace 512D واستخراج السمات الدقيقة للوجه
 * @param {ImageData} imageData 
 * @returns {ImageData}
 */
export function applyFastCLAHE(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  const gridX = 4;
  const gridY = 4;
  const tileW = width / gridX;
  const tileH = height / gridY;

  // 1. حساب مصفوفة الـ CDF لكل كتلة (Tile) مع تقليم التباين المفرط
  const cdfs = new Array(gridY);
  for (let gy = 0; gy < gridY; gy++) {
    cdfs[gy] = new Array(gridX);
    for (let gx = 0; gx < gridX; gx++) {
      const startX = Math.floor(gx * tileW);
      const startY = Math.floor(gy * tileH);
      const endX = Math.floor((gx + 1) * tileW);
      const endY = Math.floor((gy + 1) * tileH);

      const hist = new Int32Array(256);
      let count = 0;

      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * width + x) * 4;
          const lum = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);
          hist[lum]++;
          count++;
        }
      }

      // Clip Limit (تقليم القمم الحادة لمنع تضخيم الضوضاء في الظلال)
      const clipLimit = Math.max(1, Math.floor(count * 0.04));
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipLimit) {
          excess += hist[i] - clipLimit;
          hist[i] = clipLimit;
        }
      }
      const bonus = Math.floor(excess / 256);
      for (let i = 0; i < 256; i++) {
        hist[i] += bonus;
      }

      // حساب الـ CDF التراكمي
      const cdf = new Float32Array(256);
      let cum = 0;
      for (let i = 0; i < 256; i++) {
        cum += hist[i];
        cdf[i] = count > 0 ? (cum / count) * 255 : i;
      }
      cdfs[gy][gx] = cdf;
    }
  }

  // 2. تطبيق الاستيفاء الثنائي الخطي (Bilinear Interpolation) لكل بكسل
  for (let y = 0; y < height; y++) {
    const gyNorm = (y / tileH) - 0.5;
    const gy0 = Math.max(0, Math.min(gridY - 1, Math.floor(gyNorm)));
    const gy1 = Math.max(0, Math.min(gridY - 1, gy0 + 1));
    const wy = Math.max(0, Math.min(1, gyNorm - gy0));

    for (let x = 0; x < width; x++) {
      const gxNorm = (x / tileW) - 0.5;
      const gx0 = Math.max(0, Math.min(gridX - 1, Math.floor(gxNorm)));
      const gx1 = Math.max(0, Math.min(gridX - 1, gx0 + 1));
      const wx = Math.max(0, Math.min(1, gxNorm - gx0));

      const idx = (y * width + x) * 4;
      const oldLum = Math.round(0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2]);

      const v00 = cdfs[gy0][gx0][oldLum];
      const v01 = cdfs[gy0][gx1][oldLum];
      const v10 = cdfs[gy1][gx0][oldLum];
      const v11 = cdfs[gy1][gx1][oldLum];

      // Bilinear interpolation
      const top = (1 - wx) * v00 + wx * v01;
      const bottom = (1 - wx) * v10 + wx * v11;
      const newLum = (1 - wy) * top + wy * bottom;

      const ratio = oldLum > 0 ? (newLum / oldLum) : 1;
      data[idx] = Math.min(255, Math.max(0, Math.round(data[idx] * ratio)));
      data[idx + 1] = Math.min(255, Math.max(0, Math.round(data[idx + 1] * ratio)));
      data[idx + 2] = Math.min(255, Math.max(0, Math.round(data[idx + 2] * ratio)));
    }
  }

  return imageData;
}
