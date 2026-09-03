import React, { useRef, useEffect, useState, useCallback } from 'react';
import { initFaceRecognition, getFaceEmbedding, isFaceEngineReady } from '../../utils/faceApiHelper';
import { initHandRecognition, getHandEmbedding, isHandEngineReady } from '../../utils/handApiHelper';

export default function FaceRegistrationModal({ employee, onClose, onSuccess, biometricType = 'face' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [currentType, setCurrentType] = useState(biometricType);
  const isHand = currentType === 'hand';

  const [cameraReady, setCameraReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [status, setStatus] = useState('جاري بدء الكاميرا والمحرك الذكي...');
  const [cameraError, setCameraError] = useState(null);
  const [modelError, setModelError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const [isFlashActive, setIsFlashActive] = useState(false);
  const [captureStage, setCaptureStage] = useState(0);
  const [descriptors, setDescriptors] = useState([]);
  const [facingMode, setFacingMode] = useState('user');
  const [isCapturing, setIsCapturing] = useState(false);

  // 1. دالة تشغيل الكاميرا بنظام الطبقات المتعددة (Multi-Tier Camera Fallback)
  const startCameraStream = useCallback(async () => {
    setCameraError(null);
    setPermissionDenied(false);

    // التحقق من دعم البيئة الآمنة (HTTPS / localhost)
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isSecure) {
        setCameraError('المتصفح على الهواتف يشترط اتصالاً آمناً (HTTPS) لتشغيل الكاميرا. يرجى فتح النظام برابط https:// أو الدخول من جهاز السيرفر.');
      } else {
        setCameraError('المتصفح أو التطبيق الحالي لا يدعم الوصول للكاميرا.');
      }
      return false;
    }

    // إيقاف أي ستريم سابق
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    // تدرج قيود الكاميرا الرباعي المصمم للهواتف والمتصفحات المتنوعة
    const constraintTiers = [
      // المستوى 1: الوضع المطلوب بدقة مثالية
      { video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } } },
      // المستوى 2: الوضع المطلوب بدون قيود دقة (الأنسب لمعظم الهواتف)
      { video: { facingMode: { ideal: facingMode } } },
      // المستوى 3: اسم الوضع المباشر
      { video: { facingMode: facingMode } },
      // المستوى 4: أي كاميرا متاحة بالجهاز
      { video: true }
    ];

    let activeStream = null;
    let lastError = null;

    for (let i = 0; i < constraintTiers.length; i++) {
      try {
        activeStream = await navigator.mediaDevices.getUserMedia(constraintTiers[i]);
        if (activeStream) break;
      } catch (err) {
        lastError = err;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          break;
        }
      }
    }

    if (activeStream) {
      streamRef.current = activeStream;
      if (videoRef.current) {
        videoRef.current.srcObject = activeStream;
        videoRef.current.muted = true;
        videoRef.current.defaultMuted = true;
        videoRef.current.playsInline = true;
        videoRef.current.setAttribute('playsinline', 'true');
        videoRef.current.setAttribute('webkit-playsinline', 'true');
        try {
          const playPromise = videoRef.current.play();
          if (playPromise !== undefined) {
            await playPromise;
          }
        } catch (playErr) {
          console.warn('Auto play video was interrupted on mobile/browser:', playErr);
        }
      }
      setCameraReady(true);
      return true;
    } else {
      console.error('Camera stream error:', lastError);
      if (lastError?.name === 'NotAllowedError' || lastError?.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
        setCameraError('تم حظر إذن الكاميرا. يرجى الضغط على علامة القفل 🔒 بجانب رابط المتصفح والسماح بالكاميرا.');
      } else if (lastError?.name === 'NotFoundError' || lastError?.name === 'DevicesNotFoundError') {
        setCameraError('لم يتم العثور على أي كاميرا متصلة بالجهاز.');
      } else if (lastError?.name === 'NotReadableError' || lastError?.name === 'TrackStartError') {
        setCameraError('الكاميرا قيد الاستخدام بواسطة تطبيق آخر في الهاتف/الجهاز.');
      } else {
        setCameraError('تعذر فتح الكاميرا: ' + (lastError?.message || 'تأكد من صلاحيات الكاميرا'));
      }
      setCameraReady(false);
      return false;
    }
  }, [facingMode]);

  // 2. دالة تحميل وتجهيز محركات الذكاء الاصطناعي بالتوازي
  const startModelInit = useCallback(async () => {
    setModelError(null);
    try {
      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('استغرق تحميل محرك الذكاء الاصطناعي وقتاً أطول من المتوقع.')), 15000)
      );

      const initTask = async () => {
        if (isHand) {
          if (!isHandEngineReady()) await initHandRecognition();
        } else {
          if (!isFaceEngineReady()) await initFaceRecognition();
        }
        return true;
      };

      await Promise.race([initTask(), timeoutPromise]);
      setModelReady(true);
      return true;
    } catch (err) {
      console.error('Model initialization error:', err);
      setModelError(err.message || 'تعذر تحميل محرك الذكاء الاصطناعي.');
      setModelReady(false);
      return false;
    }
  }, [isHand]);

  // تشغيل الكاميرا والمحرك بالتوازي التام عند الفتح أو تغيير الكاميرا
  useEffect(() => {
    let isMounted = true;

    const initAll = async () => {
      // بدء الكاميرا فوراً دون انتظار المحرك ليرى الموظف صورته خلال 300 مللي ثانية
      const camPromise = startCameraStream();
      // تشغيل المحرك بالتوازي
      const modelPromise = startModelInit();

      const [camOk, modelOk] = await Promise.all([camPromise, modelPromise]);
      if (isMounted) {
        if (camOk && modelOk) {
          setStatus(isHand ? 'يرجى وضع يدك أمام الكاميرا بشكل واضح' : 'الخطوة 1 من 3: انظر مباشرة للكاميرا في إضاءة جيدة');
        } else if (camOk && !modelOk) {
          setStatus('تعذر تجهيز المحرك الذكي. يرجى الضغط على زر "إعادة محاولة التشغيل" بالأسفل.');
        }
      }
    };

    initAll();

    return () => {
      isMounted = false;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
    };
  }, [startCameraStream, startModelInit, isHand]);

  // تحديث نص الحالة بحسب الجاهزية
  useEffect(() => {
    if (cameraReady && modelReady && !cameraError && !modelError) {
      if (captureStage === 0) {
        setStatus(isHand ? 'يرجى وضع باطن يدك أمام الكاميرا بوضوح' : 'الخطوة 1 من 3: انظر مباشرة للكاميرا في إضاءة جيدة');
      } else if (captureStage === 1) {
        setStatus(isHand ? 'الخطوة 2: اقلب يدك لتصوير ظهر اليد' : 'الخطوة 2 من 3: التفت قليلاً لليمين (~15°)');
      } else if (captureStage === 2) {
        setStatus(isHand ? 'الخطوة 3: أمل يدك قليلاً للجانب' : 'الخطوة 3 من 3: التفت قليلاً لليسار (~15°)');
      }
    }
  }, [cameraReady, modelReady, cameraError, modelError, captureStage, isHand]);

  const toggleCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const toggleFlash = () => {
    setIsFlashActive(prev => !prev);
  };

  const handleRetryAll = () => {
    setCameraError(null);
    setModelError(null);
    setStatus('جاري إعادة المحاولة وتشغيل الكاميرا والمحرك...');
    startCameraStream();
    startModelInit();
  };

  const captureBiometric = async () => {
    if (!videoRef.current || !cameraReady || !modelReady || isCapturing) return;

    setIsCapturing(true);
    setStatus(`جاري تحليل ${isHand ? 'اليد' : 'الوجه واستخراج البصمة الذكية (ArcFace 512D)'}...`);

    try {
      if (isHand) {
        const result = getHandEmbedding(videoRef.current, 0);
        if (!result || !result.hasHand) {
          alert('لم يتم التعرف على يد بوضوح. يرجى توجيه يدك للكاميرا وفتح الأصابع.');
          setStatus('يرجى المحاولة مرة أخرى');
        } else {
          const newDescriptors = [...descriptors, result.descriptor];
          if (captureStage === 0) {
            setDescriptors(newDescriptors);
            setCaptureStage(1);
          } else if (captureStage === 1) {
            setDescriptors(newDescriptors);
            setCaptureStage(2);
          } else {
            let photoDataUrl = null;
            try {
              const canvas = document.createElement('canvas');
              canvas.width = videoRef.current.videoWidth || 640;
              canvas.height = videoRef.current.videoHeight || 480;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
              photoDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            } catch (e) {
              console.warn(e);
            }
            setStatus('تم التقاط جميع زوايا اليد بنجاح! ✅ جاري الإرسال...');
            const pureDescriptors = newDescriptors.map(d => {
              if (d instanceof Float32Array || Array.isArray(d)) return Array.from(d);
              if (d && typeof d === 'object') return Object.values(d).map(Number);
              return [];
            });
            setTimeout(() => {
              onSuccess(pureDescriptors, 'hand', photoDataUrl);
            }, 600);
            return;
          }
        }
      } else {
        const result = await getFaceEmbedding(videoRef.current);
        if (result.error) {
          alert(result.error);
          setStatus('يرجى المحاولة مرة أخرى والتأكد من إضاءة الوجه');
        } else {
          const newDescriptors = [...descriptors, result.descriptor];
          if (captureStage === 0) {
            setDescriptors(newDescriptors);
            setCaptureStage(1);
          } else if (captureStage === 1) {
            setDescriptors(newDescriptors);
            setCaptureStage(2);
          } else {
            let photoDataUrl = null;
            try {
              const canvas = document.createElement('canvas');
              canvas.width = videoRef.current.videoWidth || 640;
              canvas.height = videoRef.current.videoHeight || 480;
              const ctx = canvas.getContext('2d');
              ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
              photoDataUrl = canvas.toDataURL('image/jpeg', 0.85);
            } catch (e) {
              console.warn(e);
            }
            setStatus('تم تسجيل بروفايل الوجه متعدد الزوايا بنجاح! 🎉 جاري الإرسال...');
            const pureDescriptors = newDescriptors.map(d => {
              if (d instanceof Float32Array || Array.isArray(d)) return Array.from(d);
              if (d && typeof d === 'object') return Object.values(d).map(Number);
              return [];
            });
            setTimeout(() => {
              onSuccess(pureDescriptors, 'face', photoDataUrl);
            }, 600);
            return;
          }
        }
      }
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء تحليل البصمة، يرجى المحاولة مرة أخرى.');
    } finally {
      setIsCapturing(false);
    }
  };

  const isReadyToCapture = cameraReady && modelReady && !cameraError && !modelError && !isCapturing;

  return (
    <div className={`modal-overlay ${isFlashActive ? 'screen-flash-active' : ''}`} style={{ zIndex: 10000 }}>
      {isFlashActive && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          zIndex: 9998,
          pointerEvents: 'none'
        }} />
      )}

      <div className="modal-content" style={{ maxWidth: '520px', textAlign: 'center', position: 'relative', zIndex: 9999, borderRadius: '16px' }}>
        <div className="modal-header" style={{ paddingBottom: '12px' }}>
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>تسجيل بصمة {isHand ? 'اليد' : 'الوجه الذكية (HD)'}</h3>
            <small style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>الموظف: {employee?.name}</small>
          </div>
          <button className="close-btn" onClick={onClose} style={{ fontSize: '20px' }}>×</button>
        </div>
        
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px', paddingTop: '8px' }}>
          
          {/* شريط مؤشرات الحالة العلوية */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span style={{ padding: '3px 8px', borderRadius: '50%', background: captureStage >= 1 ? '#10b981' : 'var(--primary)', color: '#fff', fontSize: '0.8rem', fontWeight: 700 }}>1</span>
              <span style={{ fontSize: '0.8rem', fontWeight: captureStage === 0 ? 800 : 500 }}>الأمام</span>
              <span>←</span>
              <span style={{ padding: '3px 8px', borderRadius: '50%', background: captureStage >= 2 ? '#10b981' : captureStage === 1 ? 'var(--primary)' : '#e2e8f0', color: captureStage >= 1 ? '#fff' : '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>2</span>
              <span style={{ fontSize: '0.8rem', fontWeight: captureStage === 1 ? 800 : 500 }}>اليمين</span>
              <span>←</span>
              <span style={{ padding: '3px 8px', borderRadius: '50%', background: captureStage >= 2 ? 'var(--primary)' : '#e2e8f0', color: captureStage >= 2 ? '#fff' : '#64748b', fontSize: '0.8rem', fontWeight: 700 }}>3</span>
              <span style={{ fontSize: '0.8rem', fontWeight: captureStage === 2 ? 800 : 500 }}>اليسار</span>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={toggleFlash}
                style={{ fontSize: '0.8rem', padding: '4px 8px', border: '1px solid var(--border)' }}
                title="إضاءة الشاشة"
              >
                {isFlashActive ? '💡 إطفاء' : '💡 إضاءة'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={toggleCamera}
                style={{ fontSize: '0.8rem', padding: '4px 8px', border: '1px solid var(--border)' }}
                title="تبديل الكاميرا"
              >
                🔄 {facingMode === 'user' ? 'أمامي' : 'خلفي'}
              </button>
            </div>
          </div>

          {/* شاشة الكاميرا والفيديو الحية */}
          <div style={{ position: 'relative', width: '100%', maxWidth: '420px', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#0f172a', border: '3px solid var(--border)', minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              webkit-playsinline="true"
              muted 
              style={{ width: '100%', height: 'auto', display: cameraReady ? 'block' : 'none', transform: facingMode === 'user' ? 'scaleX(-1)' : 'none', objectFit: 'cover' }} 
            />
            
            {/* في حال عدم جاهزية الكاميرا أو وجود خطأ */}
            {!cameraReady && !cameraError && (
              <div style={{ padding: '24px', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #38bdf8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: '13.5px', color: '#f8fafc' }}>جاري تشغيل الكاميرا فورياً...</span>
              </div>
            )}

            {/* مؤشر تحميل المحرك الذكي في الزاوية إذا كانت الكاميرا تعمل والمحرك ما زال يجهز */}
            {cameraReady && !modelReady && !modelError && (
              <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(15, 23, 42, 0.85)', color: '#38bdf8', padding: '4px 10px', borderRadius: '20px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(4px)', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#38bdf8', animation: 'pulse 1s infinite' }}></span>
                <span>جاري تجهيز محرك الذكاء الاصطناعي...</span>
              </div>
            )}

            {/* شارة الجاهزية الكاملة */}
            {cameraReady && modelReady && (
              <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(22, 101, 52, 0.85)', color: '#86efac', padding: '4px 10px', borderRadius: '20px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(4px)', border: '1px solid rgba(134, 239, 172, 0.3)' }}>
                <span>✓</span>
                <span>المحرك جاهز</span>
              </div>
            )}

            {/* طبقة الخطأ فوق الفيديو إن وجد */}
            {(cameraError || modelError) && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.92)', color: '#fff', padding: '20px' }}>
                <span style={{ fontSize: '36px', marginBottom: '8px' }}>⚠️</span>
                <p style={{ margin: '0 0 10px', color: '#fca5a5', fontSize: '13.5px', fontWeight: 'bold', maxWidth: '320px', lineHeight: 1.5 }}>
                  {cameraError || modelError}
                </p>
                {permissionDenied && (
                  <div style={{ background: '#334155', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', color: '#cbd5e1', marginBottom: '12px', textAlign: 'right', width: '100%', maxWidth: '320px' }}>
                    📌 <strong>كيفية السماح:</strong> اضغط على أيقونة القفل بجانب رابط الموقع في شريط العناوين ➔ فعّل الكاميرا ➔ ثم انقر على زر إعادة المحاولة بالأسفل.
                  </div>
                )}
                <button
                  type="button"
                  onClick={handleRetryAll}
                  style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '8px', fontSize: '13px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <span>🔄</span>
                  <span>إعادة محاولة التشغيل</span>
                </button>
              </div>
            )}
          </div>

          {/* صندوق التعليمات والتوجيه */}
          <div style={{ padding: '12px 14px', background: 'var(--surface)', borderRadius: '12px', width: '100%', border: '1px solid var(--border)', textAlign: 'right' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <span style={{ fontSize: '16px' }}>💬</span>
              <p style={{ fontWeight: 800, color: 'var(--text)', margin: 0, fontSize: '13.5px' }}>{status}</p>
            </div>
            
            <p style={{ fontSize: '11.5px', color: 'var(--muted)', margin: 0, lineHeight: 1.6 }}>
              💡 نظام ArcFace فائق الدقة يستخرج 512 نقطة مميزة بدعم التسريع المحلي للعمل بفاعلية في كافة ظروف الإضاءة.
            </p>
          </div>

          {/* زر التقاط البصمة */}
          <button 
            type="button"
            className="btn btn-primary" 
            onClick={captureBiometric}
            disabled={!isReadyToCapture}
            style={{
              width: '100%',
              padding: '13px',
              fontSize: '1rem',
              fontWeight: 800,
              borderRadius: '10px',
              opacity: isReadyToCapture ? 1 : 0.6,
              cursor: isReadyToCapture ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {isCapturing ? (
              <>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                <span>جاري استخراج البصمة...</span>
              </>
            ) : (
              <>
                <span>📸</span>
                <span>التقاط الزاوية ({captureStage + 1}/3)</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
