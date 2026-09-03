import React, { useRef, useEffect, useState } from 'react';
import { initFaceRecognition, getFaceEmbedding, compareFaces, checkLiveness } from '../../utils/faceApiHelper';
import { initHandRecognition, getHandEmbedding, compareHands } from '../../utils/handApiHelper';
import { loadFaceDescriptor, loadHandDescriptor } from '../../utils/faceStorage';

export default function FaceVerificationOverlay({ employee, actionType, onVerifySuccess, onVerifyFailed, onCancel, biometricType = 'face' }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('جارِ تهيئة الكاميرا والذكاء الاصطناعي...');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [livenessStage, setLivenessStage] = useState(0); 
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isScreenFlashOn, setIsScreenFlashOn] = useState(false);
  const [lightingStatus, setLightingStatus] = useState(null); // 'good' | 'low' | 'dark'

  const isHand = biometricType === 'hand';
  const [facingMode, setFacingMode] = useState('user'); // 'user' (أمامية) or 'environment' (خلفية)

  useEffect(() => {
    let stream = null;
    let checkInterval = null;
    let isCancelled = false;

    const startProcess = async () => {
      try {
        // 1. بدء تشغيل الكاميرا بالطبقات المتعددة فوراً مع التوافق التام للهواتف
        const startCamera = async () => {
          if (!navigator.mediaDevices?.getUserMedia) {
            const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            if (!isSecure) {
              throw new Error('المتصفح على الهواتف يشترط اتصالاً آمناً (HTTPS) لتشغيل الكاميرا. يرجى الدخول برابط https://.');
            } else {
              throw new Error('المتصفح أو التطبيق الحالي لا يدعم الوصول للكاميرا.');
            }
          }

          if (videoRef.current?.srcObject) {
            videoRef.current.srcObject.getTracks().forEach(track => track.stop());
            videoRef.current.srcObject = null;
          }

          const constraintTiers = [
            { video: { facingMode: { ideal: facingMode }, width: { ideal: 1280 }, height: { ideal: 720 } } },
            { video: { facingMode: { ideal: facingMode } } },
            { video: { facingMode: facingMode } },
            { video: true }
          ];

          let camStream = null;
          let lastCamErr = null;
          for (const tier of constraintTiers) {
            try {
              camStream = await navigator.mediaDevices.getUserMedia(tier);
              if (camStream) break;
            } catch (cErr) {
              lastCamErr = cErr;
              if (cErr.name === 'NotAllowedError' || cErr.name === 'PermissionDeniedError') break;
            }
          }

          if (!camStream) throw lastCamErr || new Error('تعذر فتح الكاميرا.');
          return camStream;
        };

        // 2. تشغيل الكاميرا والمحرك بالتوازي التام
        const camPromise = startCamera();
        const modelPromise = isHand ? initHandRecognition() : initFaceRecognition();

        const [camStream] = await Promise.all([camPromise, modelPromise]);
        if (isCancelled) {
          camStream.getTracks().forEach(t => t.stop());
          return;
        }

        stream = camStream;
        if (videoRef.current) {
          videoRef.current.srcObject = camStream;
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
          } catch (pErr) {
            console.warn('Play video interrupted on mobile/browser:', pErr);
          }
        }

        setIsInitializing(false);
        setStatus(isHand ? 'يرجى وضع يدك وفتح أصابعك أمام الكاميرا...' : 'يرجى النظر مباشرة للكاميرا...');
        setLivenessStage(1);
      } catch (err) {
        console.error('Camera/Model error:', err);
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
          setErrorMsg('تم حظر إذن الكاميرا. يرجى الضغط على أيقونة القفل 🔒 بجانب رابط المتصفح وتفعيل الكاميرا.');
        } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
          setErrorMsg('لم يتم العثور على أي كاميرا متصلة بالجهاز.');
        } else {
          setErrorMsg('فشل في تشغيل الكاميرا أو تحميل محرك الذكاء الاصطناعي: ' + (err.message || 'تأكد من الصلاحيات والاتصال'));
        }
        setIsInitializing(false);
      }
    };

    startProcess();

    return () => {
      isCancelled = true;
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
      if (checkInterval) clearInterval(checkInterval);
    };
  }, [isHand, facingMode]);

  const toggleCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const toggleFlash = () => {
    setIsScreenFlashOn(prev => !prev);
  };

  useEffect(() => {
    if (isInitializing || !videoRef.current) return;
    
    // For hand tracking
    if (isHand) {
      const checkInterval = setInterval(() => {
        if (livenessStage === 1) {
          performMatch();
          setLivenessStage(2);
        }
      }, 1000);
      return () => clearInterval(checkInterval);
    }

    // For Face tracking, use liveness check (blink or smile)
    const checkInterval = setInterval(async () => {
      try {
        const liveness = checkLiveness(videoRef.current, 0); 
        
        if (!liveness || !liveness.hasFace) return;

        if (livenessStage === 1) {
          setStatus('يرجى الابتسام أو الرمش بعينيك لإثبات الحيوية 😉');
          if (liveness.isBlinking || liveness.isSmiling) {
            setLivenessStage(2); // Liveness passed
            setStatus('تم التحقق من الحيوية بنجاح! جاري مطابقة الوجه...');
            clearInterval(checkInterval);
            performMatch();
          }
        }
      } catch (err) {
        // fail silently for liveness loop
      }
    }, 400);

    return () => clearInterval(checkInterval);
  }, [isInitializing, livenessStage, isHand]);

  const performMatch = async () => {
    try {
      if (isHand) {
        const result = getHandEmbedding(videoRef.current, 0);
        if (!result || !result.hasHand) {
          handleFailure('لم يتم التعرف على يد بشكل واضح.');
          return;
        }

        setStatus('جاري جلب بصمة اليد من قاعدة البيانات...');
        const savedDescriptor = employee.hand_descriptor || await loadHandDescriptor(employee.id);
        if (!savedDescriptor) {
          handleFailure('بصمة اليد غير مسجلة لهذا الموظف.');
          return;
        }

        const matchResult = compareHands(savedDescriptor, result.descriptor);
        if (matchResult.isMatch) {
          setStatus(`✅ تمت المطابقة بنجاح! (${Math.round(matchResult.matchPercentage)}%)`);
          setTimeout(() => {
            onVerifySuccess(actionType);
          }, 1200);
        } else {
          handleFailure(`بصمة اليد غير متطابقة (${Math.round(matchResult.matchPercentage)}%)`);
        }

      } else {
        const result = await getFaceEmbedding(videoRef.current);
        
        if (result.error) {
          handleFailure(result.error);
          return;
        }

        if (result.isVeryDark) {
          setLightingStatus('dark');
          setIsScreenFlashOn(true); // تفعيل الإضاءة المساعدة للشاشة تلقائياً في الظلام
        } else if (result.isLowLight) {
          setLightingStatus('low');
        } else {
          setLightingStatus('good');
        }

        setStatus('جاري مطابقة بصمة الوجه الذكية...');
        const savedDescriptor = employee.face_descriptor || await loadFaceDescriptor(employee.id);
        if (!savedDescriptor) {
          handleFailure('بصمة الوجه غير مسجلة لهذا الموظف.');
          return;
        }

        const matchResult = compareFaces(savedDescriptor, result.descriptor);
        
        if (matchResult.isLegacy) {
          handleFailure(matchResult.error || 'البصمة مسجلة بالنظام القديم، يرجى إعادة تسجيل البصمة من لوحة التحكم.');
          return;
        }

        if (matchResult.isMatch) {
          setStatus(`✅ تمت مطابقة الوجه بنجاح! (${Math.round(matchResult.matchPercentage)}%)`);
          setTimeout(() => {
            onVerifySuccess(actionType);
          }, 1200);
        } else {
          handleFailure(`البصمة غير متطابقة (${Math.round(matchResult.matchPercentage)}%)`);
        }
      }
    } catch (err) {
      console.error(err);
      handleFailure(`حدث خطأ أثناء المعالجة.`);
    }
  };

  const [isWaitingRetry, setIsWaitingRetry] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);

  const handleFailure = (msg) => {
    const newFails = failedAttempts + 1;
    setFailedAttempts(newFails);
    setErrorMsg(`❌ ${msg}`);
    setLivenessStage(0); // إيقاف فحص الذكاء الاصطناعي التلقائي فوراً
    setIsWaitingRetry(true);

    if (newFails >= 3) {
      setStatus('تعذر التحقق بعد 3 محاولات متتالية. يرجى الضغط على الزر أدناه لالتقاط صورة حية واعتماد الحضور من الإدارة.');
    } else {
      setStatus('تعذر التحقق من البصمة. يرجى الوقوف بثبات ثم الضغط على "محاولة مرة أخرى".');
    }
  };

  const handleRetry = () => {
    setIsWaitingRetry(false);
    setErrorMsg(null);
    setStatus(isHand ? 'يرجى وضع يدك وفتح أصابعك أمام الكاميرا...' : 'يرجى النظر مباشرة للكاميرا والابتسام أو الرمش بعينيك 😉');
    setLivenessStage(1);
  };

  const captureAndSend = () => {
    if (!videoRef.current || isCapturing) return;
    setIsCapturing(true);
    setStatus('جاري التقاط الصورة الحية وتجهيز طلب الاعتماد...');

    try {
      const canvas = document.createElement('canvas');
      canvas.width = videoRef.current.videoWidth || 1280;
      canvas.height = videoRef.current.videoHeight || 720;
      const ctx = canvas.getContext('2d');
      
      if (facingMode === 'user') {
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }
      
      ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
      const photoDataUrl = canvas.toDataURL('image/jpeg', 0.85);

      setStatus('جاري إرسال الطلب للإدارة العليا ومدير الفرع ورفع الصورة...');
      setTimeout(() => {
        onVerifyFailed(actionType, photoDataUrl);
      }, 600);
    } catch (err) {
      console.error('Error capturing frame:', err);
      setIsCapturing(false);
      setStatus('فشل التقاط الصورة من الكاميرا. يرجى إعادة المحاولة.');
    }
  };

  const actionName = {
    'shift_start': 'تسجيل بداية الدوام',
    'shift_end': 'تسجيل نهاية الدوام',
    'break_start': 'تسجيل بداية الاستراحة',
    'break_end': 'تسجيل نهاية الاستراحة'
  }[actionType] || actionType;

  return (
    <div className={`modal-overlay ${isScreenFlashOn ? 'screen-flash-active' : ''}`} style={{ zIndex: 9999 }}>
      {/* تأثير الإضاءة المساعدة للشاشة في الأماكن المظلمة */}
      {isScreenFlashOn && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          zIndex: 9998,
          pointerEvents: 'none',
          boxShadow: 'inset 0 0 100px #ffffff'
        }} />
      )}

      <div className="modal-content" style={{ maxWidth: '520px', textAlign: 'center', position: 'relative', zIndex: 9999, border: '2px solid var(--primary)' }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>توثيق الإجراء: {actionName}</h3>
            <small style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>الموظف: {employee.name}</small>
          </div>
          <button className="close-btn" onClick={onCancel}>×</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* مؤشر جودة الإضاءة */}
            <div>
              {lightingStatus === 'dark' && (
                <span style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: '6px', background: '#ffebee', color: '#c62828', fontWeight: 'bold' }}>
                  🌙 إضاءة معتمة (معالجة نشطة)
                </span>
              )}
              {lightingStatus === 'low' && (
                <span style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: '6px', background: '#fff8e1', color: '#f57f17', fontWeight: 'bold' }}>
                  ⛅ إضاءة خافتة
                </span>
              )}
              {lightingStatus === 'good' && (
                <span style={{ fontSize: '0.8rem', padding: '4px 8px', borderRadius: '6px', background: '#e8f5e9', color: '#2e7d32', fontWeight: 'bold' }}>
                  💡 إضاءة ممتازة
                </span>
              )}
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={toggleFlash}
                title="إضاءة الشاشة المساعدة"
                style={{ fontSize: '0.85rem', padding: '6px 10px', borderRadius: '8px' }}
              >
                {isScreenFlashOn ? '💡 إطفاء الإضاءة' : '💡 إضاءة الشاشة'}
              </button>

              <button
                type="button"
                className="btn btn-ghost"
                onClick={toggleCamera}
                style={{ fontSize: '0.85rem', padding: '6px 12px', borderRadius: '8px' }}
              >
                🔄 {facingMode === 'user' ? 'الأمامية 🤳' : 'الخلفية 📷'}
              </button>
            </div>
          </div>

          <div style={{ position: 'relative', width: '100%', maxWidth: '420px', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#000', border: '3px solid var(--border)', boxShadow: '0 8px 24px rgba(0,0,0,0.15)' }}>
            <video 
              ref={videoRef}
              autoPlay
              playsInline
              webkit-playsinline="true"
              muted
              style={{ width: '100%', height: 'auto', display: 'block', transform: facingMode === 'user' ? 'scaleX(-1)' : 'none', objectFit: 'cover' }}
            />
            {isInitializing && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', backgroundColor: 'rgba(0,0,0,0.7)' }}>
                جارِ تجهيز الكاميرا ومحرك الذكاء الاصطناعي...
              </div>
            )}
          </div>

          <div style={{ padding: '14px', background: 'var(--surface)', borderRadius: '10px', width: '100%', border: '1px solid var(--border)' }}>
            <p style={{ fontWeight: 'bold', color: 'var(--primary)', margin: '0 0 6px 0', fontSize: '1.1rem' }}>{status}</p>
            {errorMsg && (
              <p style={{ color: 'var(--danger)', fontSize: '0.9rem', margin: 0, fontWeight: 'bold' }}>{errorMsg} (المحاولة {failedAttempts}/3)</p>
            )}
          </div>

        </div>
        <div className="modal-footer" style={{ flexDirection: 'column', gap: '10px' }}>
          {/* بعد 3 محاولات فاشلة: زر التقاط الصورة وإرسال طلب الاعتماد البديل */}
          {failedAttempts >= 3 ? (
            <button 
              type="button"
              className="btn btn-primary" 
              style={{ 
                width: '100%', 
                padding: '13px', 
                fontSize: '15px', 
                fontWeight: 800,
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                cursor: isCapturing ? 'wait' : 'pointer'
              }} 
              onClick={captureAndSend}
              disabled={isCapturing}
            >
              {isCapturing ? '⏳ جاري التقاط الصورة وتجهيز الطلب...' : '📸 التقاط الصورة وإرسال طلب اعتماد بديل'}
            </button>
          ) : isWaitingRetry ? (
            /* في المحاولات 1 و 2: زر محاولة مرة أخرى */
            <button 
              type="button"
              className="btn btn-start" 
              style={{ 
                width: '100%', 
                padding: '13px', 
                fontSize: '15px', 
                fontWeight: 800,
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                boxShadow: '0 4px 14px rgba(16, 185, 129, 0.4)',
                cursor: 'pointer'
              }} 
              onClick={handleRetry}
            >
              🔄 محاولة مرة أخرى (المحاولة {failedAttempts + 1} من 3)
            </button>
          ) : null}

          <button 
            type="button" 
            className="btn btn-secondary" 
            style={{ width: '100%', padding: '10px' }} 
            onClick={onCancel} 
            disabled={isCapturing}
          >
            إلغاء
          </button>
        </div>
      </div>
    </div>
  );
}
