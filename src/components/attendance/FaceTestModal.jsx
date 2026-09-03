import React, { useRef, useEffect, useState, useCallback } from 'react';
import { initFaceRecognition, getFaceEmbedding, compareFaces, isFaceEngineReady } from '../../utils/faceApiHelper';
import { initHandRecognition, getHandEmbedding, compareHands, isHandEngineReady } from '../../utils/handApiHelper';
import { loadFaceDescriptor, loadHandDescriptor } from '../../utils/faceStorage';

export default function FaceTestModal({ employee, onClose, biometricType = 'face' }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);

  const [status, setStatus] = useState('جاري بدء الكاميرا والمحرك الذكي...');
  const [cameraError, setCameraError] = useState(null);
  const [modelError, setModelError] = useState(null);
  const [permissionDenied, setPermissionDenied] = useState(false);

  const [cameraReady, setCameraReady] = useState(false);
  const [modelReady, setModelReady] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [matchDetails, setMatchDetails] = useState(null);
  const [isFlashActive, setIsFlashActive] = useState(false);
  const isHand = biometricType === 'hand';

  // 1. تشغيل الكاميرا بالطبقات المتعددة
  const startCameraStream = useCallback(async () => {
    setCameraError(null);
    setPermissionDenied(false);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      const isHttps = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
      if (!isHttps) {
        setCameraError('المتصفح يشترط اتصالاً آمناً (HTTPS) أو localhost لتشغيل الكاميرا.');
      } else {
        setCameraError('المتصفح لا يدعم الوصول للكاميرا عبر mediaDevices.');
      }
      return false;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    const tiers = [
      { video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } } },
      { video: { facingMode: 'user' } },
      { video: true }
    ];

    let activeStream = null;
    let lastErr = null;

    for (const tier of tiers) {
      try {
        activeStream = await navigator.mediaDevices.getUserMedia(tier);
        if (activeStream) break;
      } catch (err) {
        lastErr = err;
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') break;
      }
    }

    if (activeStream) {
      streamRef.current = activeStream;
      if (videoRef.current) {
        videoRef.current.srcObject = activeStream;
        try {
          await videoRef.current.play();
        } catch (e) {
          console.warn('Video play interrupted:', e);
        }
      }
      setCameraReady(true);
      return true;
    } else {
      console.error('Camera stream error:', lastErr);
      if (lastErr?.name === 'NotAllowedError' || lastErr?.name === 'PermissionDeniedError') {
        setPermissionDenied(true);
        setCameraError('تم حظر إذن الكاميرا. يرجى الضغط على علامة القفل 🔒 بجانب رابط المتصفح والسماح بالكاميرا.');
      } else if (lastErr?.name === 'NotFoundError' || lastErr?.name === 'DevicesNotFoundError') {
        setCameraError('لم يتم العثور على أي كاميرا متصلة بالجهاز.');
      } else if (lastErr?.name === 'NotReadableError' || lastErr?.name === 'TrackStartError') {
        setCameraError('الكاميرا قيد الاستخدام من تطبيق آخر (مثل Zoom أو تطبيق كاميرا مفتوح).');
      } else {
        setCameraError('تعذر فتح الكاميرا: ' + (lastErr?.message || 'تأكد من الصلاحيات'));
      }
      setCameraReady(false);
      return false;
    }
  }, []);

  // 2. تحميل المحرك بالتوازي
  const startModelInit = useCallback(async () => {
    setModelError(null);
    try {
      if (isHand) {
        if (!isHandEngineReady()) await initHandRecognition();
      } else {
        if (!isFaceEngineReady()) await initFaceRecognition();
      }
      setModelReady(true);
      return true;
    } catch (err) {
      console.error('Model error:', err);
      setModelError('تعذر تحميل محرك الذكاء الاصطناعي.');
      setModelReady(false);
      return false;
    }
  }, [isHand]);

  useEffect(() => {
    let isMounted = true;

    const initAll = async () => {
      const camP = startCameraStream();
      const modP = startModelInit();
      const [cOk, mOk] = await Promise.all([camP, modP]);

      if (isMounted) {
        if (cOk && mOk) {
          setStatus(isHand ? 'انظر للكاميرا وارفع يدك لاختبار البصمة' : 'انظر للكاميرا واضغط "بدء الاختبار الذكي"');
        } else if (cOk && !mOk) {
          setStatus('الكاميرا جاهزة ✅ | جاري استكمال تهيئة المحرك الذكي...');
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

  const runTest = async () => {
    if (!videoRef.current || !cameraReady || !modelReady || isTesting) return;

    setIsTesting(true);
    setStatus('جاري التحليل واستخراج المتجه الشعاعي...');
    setMatchDetails(null);

    try {
      if (isHand) {
        const result = getHandEmbedding(videoRef.current, 0);
        if (!result || !result.hasHand) {
          alert('لم يتم التعرف على يد. يرجى توجيه يدك للكاميرا وفتح أصابعك.');
          setStatus('يرجى توجيه يدك للكاميرا وفتح أصابعك.');
          return;
        }

        setStatus('جاري جلب بصمة اليد من قاعدة البيانات...');
        const savedDescriptor = employee.hand_descriptor || await loadHandDescriptor(employee.id);
        if (!savedDescriptor) {
          alert('بصمة اليد غير مسجلة لهذا الموظف في قاعدة البيانات.');
          setStatus('لم يتم العثور على بصمة مسجلة');
          return;
        }

        const matchResult = compareHands(savedDescriptor, result.descriptor);
        setMatchDetails(matchResult);

        if (matchResult.isMatch) {
          setStatus(`✅ تم التعرف بنجاح! نسبة التطابق: ${Math.round(matchResult.matchPercentage)}%`);
        } else {
          setStatus(`❌ فشل التعرف. نسبة التطابق: ${Math.round(matchResult.matchPercentage)}%`);
        }
      } else {
        const result = await getFaceEmbedding(videoRef.current);
        if (result.error) {
          alert(result.error);
          setStatus('يرجى المحاولة مرة أخرى والتأكد من إضاءة الوجه');
          return;
        }

        setStatus('جاري مطابقة بصمة ArcFace 512D مع قاعدة البيانات...');
        const savedDescriptor = employee.face_descriptor || await loadFaceDescriptor(employee.id);
        if (!savedDescriptor) {
          alert('بصمة الوجه غير مسجلة لهذا الموظف في قاعدة البيانات.');
          setStatus('لم يتم العثور على بصمة مسجلة');
          return;
        }

        const matchResult = compareFaces(savedDescriptor, result.descriptor);
        setMatchDetails({
          ...matchResult,
          luminance: result.luminance,
          isLowLight: result.isLowLight
        });

        if (matchResult.isLegacy) {
          alert(matchResult.error || 'البصمة مسجلة بالنظام القديم (128D) وتحتاج لإعادة تسجيل بالنظام الحديث (512D).');
          setStatus('البصمة مسجلة بنظام قديم');
          return;
        }
        
        if (matchResult.isMatch) {
          setStatus(`✅ تم التعرف بنجاح! نسبة التطابق: ${Math.round(matchResult.matchPercentage)}%`);
        } else {
          setStatus(`❌ فشل التعرف. نسبة التطابق: ${Math.round(matchResult.matchPercentage)}% (المطلوب >= 70%)`);
        }
      }
    } catch (err) {
      console.error(err);
      alert('حدث خطأ غير متوقع أثناء الفحص.');
      setStatus('حدث خطأ في الفحص');
    } finally {
      setIsTesting(false);
    }
  };

  const isReady = cameraReady && modelReady && !cameraError && !modelError && !isTesting;

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
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: 800 }}>اختبار دقة بصمة {isHand ? 'اليد' : 'الوجه'}: {employee?.name}</h3>
            <small style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>ArcFace 512D Cosine Metric Engine</small>
          </div>
          <button className="close-btn" onClick={onClose} style={{ fontSize: '20px' }}>×</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          
          <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={toggleFlash}
              style={{ fontSize: '0.8rem', padding: '4px 10px', border: '1px solid var(--border)' }}
            >
              {isFlashActive ? '💡 إطفاء الإضاءة المساعدة' : '💡 تشغيل الإضاءة المساعدة'}
            </button>
          </div>

          <div style={{ position: 'relative', width: '100%', maxWidth: '420px', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#0f172a', border: '3px solid var(--border)', minHeight: '260px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <video 
              ref={videoRef}
              style={{ width: '100%', height: 'auto', display: cameraReady ? 'block' : 'none', transform: 'scaleX(-1)' }}
              muted
              playsInline
            />
            
            {!cameraReady && !cameraError && (
              <div style={{ padding: '24px', color: '#94a3b8', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: '32px', height: '32px', border: '3px solid #38bdf8', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontSize: '13.5px', color: '#f8fafc' }}>جاري تشغيل الكاميرا فورياً...</span>
              </div>
            )}

            {cameraReady && !modelReady && !modelError && (
              <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(15, 23, 42, 0.85)', color: '#38bdf8', padding: '4px 10px', borderRadius: '20px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(4px)', border: '1px solid rgba(56, 189, 248, 0.3)' }}>
                <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#38bdf8', animation: 'pulse 1s infinite' }}></span>
                <span>جاري تجهيز محرك الذكاء الاصطناعي...</span>
              </div>
            )}

            {cameraReady && modelReady && (
              <div style={{ position: 'absolute', top: '10px', right: '10px', background: 'rgba(22, 101, 52, 0.85)', color: '#86efac', padding: '4px 10px', borderRadius: '20px', fontSize: '11.5px', display: 'flex', alignItems: 'center', gap: '6px', backdropFilter: 'blur(4px)', border: '1px solid rgba(134, 239, 172, 0.3)' }}>
                <span>✓</span>
                <span>المحرك جاهز</span>
              </div>
            )}

            {(cameraError || modelError) && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(15, 23, 42, 0.92)', color: '#fff', padding: '20px' }}>
                <span style={{ fontSize: '36px', marginBottom: '8px' }}>⚠️</span>
                <p style={{ margin: '0 0 10px', color: '#fca5a5', fontSize: '13.5px', fontWeight: 'bold', maxWidth: '320px', lineHeight: 1.5 }}>
                  {cameraError || modelError}
                </p>
                {permissionDenied && (
                  <div style={{ background: '#334155', padding: '8px 12px', borderRadius: '8px', fontSize: '12px', color: '#cbd5e1', marginBottom: '12px', textAlign: 'right', width: '100%', maxWidth: '320px' }}>
                    📌 <strong>كيفية السماح:</strong> اضغط على أيقونة القفل بجانب رابط الموقع في شريط العناوين ➔ فعّل الكاميرا ➔ ثم انقر على زر إعادة المحاولة.
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

          <div style={{ padding: '12px', background: 'var(--surface)', borderRadius: '10px', width: '100%', border: '1px solid var(--border)' }}>
            <p style={{ fontWeight: 'bold', color: 'var(--text)', margin: '0 0 6px 0' }}>{status}</p>

            {matchDetails && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px', textAlign: 'right', fontSize: '0.85rem' }}>
                <div style={{ padding: '8px', background: matchDetails.isMatch ? '#ecfdf5' : '#fef2f2', border: `1px solid ${matchDetails.isMatch ? '#a7f3d0' : '#fecaca'}`, borderRadius: '8px' }}>
                  <strong>نسبة التطابق:</strong> <span style={{ color: matchDetails.isMatch ? '#15803d' : '#dc2626', fontWeight: 800 }}>{matchDetails.matchPercentage}%</span>
                </div>
                <div style={{ padding: '8px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' }}>
                  <strong>معامل التشابه:</strong> {matchDetails.similarity || 'N/A'}
                </div>
                {matchDetails.luminance !== undefined && (
                  <div style={{ padding: '8px', background: 'rgba(0,0,0,0.03)', borderRadius: '8px' }}>
                    <strong>مستوى الإضاءة:</strong> {matchDetails.luminance}/255 ({matchDetails.isLowLight ? 'خافتة' : 'جيدة'})
                  </div>
                )}
                <div style={{ padding: '8px', background: matchDetails.isMatch ? '#ecfdf5' : '#fef2f2', border: `1px solid ${matchDetails.isMatch ? '#a7f3d0' : '#fecaca'}`, borderRadius: '8px' }}>
                  <strong>القرار:</strong> <span style={{ color: matchDetails.isMatch ? '#15803d' : '#dc2626', fontWeight: 800 }}>{matchDetails.isMatch ? '✅ متطابق رسمياً' : '❌ غير متطابق'}</span>
                </div>
              </div>
            )}
          </div>

          <button 
            type="button"
            className="btn btn-primary" 
            onClick={runTest}
            disabled={!isReady}
            style={{
              width: '100%',
              padding: '12px',
              fontSize: '1rem',
              fontWeight: 800,
              borderRadius: '10px',
              opacity: isReady ? 1 : 0.6,
              cursor: isReady ? 'pointer' : 'not-allowed',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px'
            }}
          >
            {isTesting ? (
              <>
                <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
                <span>جاري الاختبار والتحليل...</span>
              </>
            ) : (
              <>
                <span>🔍</span>
                <span>بدء الاختبار الذكي</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

