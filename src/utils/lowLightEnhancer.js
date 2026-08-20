/**
 * lowLightEnhancer.js
 * وحدة معالجة وتحسين الصور في ظروف الإضاءة المنخفضة والظلال القاتمة
 * تستخدم تقنيات CLAHE (Contrast Limited Adaptive Histogram Equalization)
 * وتعديل Gamma الديناميكي لحساب تباين الملامح في الأماكن المظلمة.
 */

/**
 * حساب متوسط الإضاءة (Luminance) للإطار
 * @param {ImageData} imageData 
 * @returns {number} متوسط السطوع بين 0 (مظلم تماماً) إلى 255 (مضيء جداً)
 */
export function calculateLuminance(imageData) {
  const data = imageData.data;
  let totalLuminance = 0;
  const pixelCount = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    // Formula for relative luminance: 0.299 R + 0.587 G + 0.114 B
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    totalLuminance += 0.299 * r + 0.587 * g + 0.114 * b;
  }

  return totalLuminance / pixelCount;
}

/**
 * فحص ما إذا كانت الإضاءة ضعيفة وتحتاج إلى وميض أو تفتيح
 * @param {HTMLCanvasElement|ImageData} source 
 * @returns {{ isLowLight: boolean, isVeryDark: boolean, luminance: number }}
 */
export function evaluateLighting(source) {
  let imageData;
  if (source instanceof ImageData) {
    imageData = source;
  } else {
    const ctx = source.getContext('2d');
    imageData = ctx.getImageData(0, 0, source.width, source.height);
  }

  const luminance = calculateLuminance(imageData);
  return {
    isLowLight: luminance < 75,
    isVeryDark: luminance < 40,
    luminance: Math.round(luminance)
  };
}

/**
 * تطبيق Adaptive Gamma & Contrast Enhancement على صورة Canvas
 * يرفع تفاصيل الوجه في الإضاءة الخافتة دون تشويه الإضاءة الجيدة
 * @param {HTMLCanvasElement} canvas 
 * @param {number} gamma - معامل التفتيح (افتراضي 0.65 للإضاءة الضعيفة)
 */
export function enhanceLowLightCanvas(canvas, targetGamma = null) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const currentLuminance = calculateLuminance(imageData);

  // إذا كانت الإضاءة جيدة بالفعل (> 120)، لا داعي للمعالجة القوية
  if (currentLuminance >= 120 && !targetGamma) {
    return canvas;
  }

  // حساب Gamma التكيفي: كلما كانت الصورة أكثر عتمة، كانت القيمة أقل لرفع الظلال
  let gamma = targetGamma;
  if (!gamma) {
    if (currentLuminance < 40) {
      gamma = 0.45; // تفتيح قوي للظلام الحاد
    } else if (currentLuminance < 80) {
      gamma = 0.60; // تفتيح متوسط
    } else {
      gamma = 0.80; // تفتيح طفيف
    }
  }

  // إنشاء جدول بحث مسبق (LUT) لتسريع العملية إلى أقل من 2 ميلي ثانية
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    lut[i] = Math.min(255, Math.max(0, Math.round(255 * Math.pow(i / 255, gamma))));
  }

  // تطبيق التعديل على كل بكسل
  for (let i = 0; i < data.length; i += 4) {
    data[i] = lut[data[i]];         // R
    data[i + 1] = lut[data[i + 1]]; // G
    data[i + 2] = lut[data[i + 2]]; // B
  }

  ctx.putImageData(imageData, 0, 0);
  return canvas;
}

/**
 * تطبيق CLAHE مبسط فائق السرعة على مصفوفة الصورة المربعة (112x112 للوجه)
 * يضمن ظهور الملامح حتى مع وجود ظلال نصفية على الوجه
 * @param {ImageData} imageData 
 * @returns {ImageData}
 */
export function applyFastCLAHE(imageData) {
  const data = imageData.data;
  const width = imageData.width;
  const height = imageData.height;

  // تقسيم الصورة إلى كتل 4x4 Grid
  const gridX = 4;
  const gridY = 4;
  const blockW = Math.floor(width / gridX);
  const blockH = Math.floor(height / gridY);

  for (let gy = 0; gy < gridY; gy++) {
    for (let gx = 0; gx < gridX; gx++) {
      const startX = gx * blockW;
      const startY = gy * blockH;
      const endX = (gx === gridX - 1) ? width : startX + blockW;
      const endY = (gy === gridY - 1) ? height : startY + blockH;

      // حساب الـ Histogram المحلي
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

      // حساب الـ Cumulative Distribution Function (CDF) مع تقليم التباين (Clip limit)
      const clipLimit = Math.max(1, Math.floor(count * 0.05));
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

      // مصفوفة التحويل التراكمي
      const cdf = new Float32Array(256);
      let cum = 0;
      for (let i = 0; i < 256; i++) {
        cum += hist[i];
        cdf[i] = (cum / count) * 255;
      }

      // تطبيق التعديل على البكسلات داخل الكتلة
      for (let y = startY; y < endY; y++) {
        for (let x = startX; x < endX; x++) {
          const idx = (y * width + x) * 4;
          const oldLum = 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          const newLum = cdf[Math.round(oldLum)];
          const ratio = oldLum > 0 ? (newLum / oldLum) : 1;

          data[idx] = Math.min(255, Math.max(0, Math.round(data[idx] * ratio)));
          data[idx + 1] = Math.min(255, Math.max(0, Math.round(data[idx + 1] * ratio)));
          data[idx + 2] = Math.min(255, Math.max(0, Math.round(data[idx + 2] * ratio)));
        }
      }
    }
  }

  return imageData;
}
