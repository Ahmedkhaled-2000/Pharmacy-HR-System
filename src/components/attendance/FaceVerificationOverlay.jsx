import React, { useRef, useEffect, useState } from 'react';
import { initFaceRecognition, getFaceEmbedding, compareFaces, checkLiveness } from '../../utils/faceApiHelper';
import { initHandRecognition, getHandEmbedding, compareHands } from '../../utils/handApiHelper';
import { loadFaceDescriptor, loadHandDescriptor } from '../../utils/faceStorage';

export default function FaceVerificationOverlay({ employee, actionType, onVerifySuccess, onVerifyFailed, onCancel, biometricType = 'face' }) {
  const videoRef = useRef(null);
  const nativeInputRef = useRef(null);

  const [status, setStatus] = useState('جارِ تشغيل الكاميرا...');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isAiFallbackMode, setIsAiFallbackMode] = useState(false);
  const [hasCameraStream, setHasCameraStream] = useState(false);

  const [livenessStage, setLivenessStage] = useState(0); 
  const [failedAttempts, setFailedAttempts] = useState(0);
  const [isScreenFlashOn, setIsScreenFlashOn] = useState(false);
  const [lightingStatus, setLightingStatus] = useState(null); // 'good' | 'low' | 'dark'

  const [isWaitingRetry, setIsWaitingRetry] = useState(false);
  const [isCapturing, setIsCapturing] = useState(false);
  const [processTrigger, setProcessTrigger] = useState(0);

  const isHand = biometricType === 'hand';
  const [facingMode, setFacingMode] = useState('user'); // 'user' (أمامية) or 'environment' (خلفية)

  useEffect(() => {
    let stream = null;
    let isCancelled = false;

    const startProcess = async () => {
      setIsInitializing(true);
      setErrorMsg(null);
      setIsAiFallbackMode(false);
      setHasCameraStream(false);
      setStatus('جارِ تشغيل الكاميرا...');

      // 1. بدء تشغيل الكاميرا أولاً وبشكل مستقل عن محرك الذكاء الاصطناعي
      const startCamera = async () => {
        if (!navigator.mediaDevices?.getUserMedia) {
          const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
          if (!isSecure) {
            throw new Error('المتصفح على الهواتف يشترط اتصالاً آمناً (HTTPS) لتشغيل الكاميرا. يرجى الدخول برابط https://.');
          } else {
            throw new Error('المتصفح أو التطبيق الحالي لا يدعم الوصول المباشر لكاميرا الويب.');
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

      try {
        const camStream = await startCamera();
        if (isCancelled) {
          camStream?.getTracks()?.forEach(t => t.stop());
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
            console.warn('Play video note:', pErr);
          }
          setHasCameraStream(true);
        }
      } catch (camErr) {
        console.warn('Camera startup note:', camErr);
        setHasCameraStream(false);
        if (camErr.name === 'NotAllowedError' || camErr.name === 'PermissionDeniedError') {
          setErrorMsg('تم حظر إذن الكاميرا. يمكنك السماح بالإذن أو التقاط صورة عبر زر كاميرا الهاتف أدناه.');
        } else if (camErr.name === 'NotFoundError' || camErr.name === 'DevicesNotFoundError') {
          setErrorMsg('لم يتم العثور على أي كاميرا متصلة. يمكنك التقاط صورة عبر زر كاميرا الهاتف أدناه.');
        } else {
          setErrorMsg('تعذر تشغيل بث الكاميرا: ' + (camErr.message || ''));
        }
      }

      // 2. تحميل محرك الذكاء الاصطناعي بشكل مستقل دون إيقاف الكاميرا
      try {
        setStatus(isHand ? 'جارِ تجهيز محرك بصمة اليد...' : 'جارِ تجهيز محرك الذكاء الاصطناعي للوجه...');
        await (isHand ? initHandRecognition() : initFaceRecognition());
        if (isCancelled) return;

        setIsInitializing(false);
        setIsAiFallbackMode(false);
        setStatus(isHand ? 'يرجى وضع يدك وفتح أصابعك أمام الكاميرا...' : 'يرجى النظر مباشرة للكاميرا والابتسام أو الرمش بعينيك 😉');
        setLivenessStage(1);
      } catch (modelErr) {
        console.warn('[FaceVerification] AI model init note, switching to photo fallback mode:', modelErr);
        if (isCancelled) return;

        setIsInitializing(false);
        setIsAiFallbackMode(true);
        setErrorMsg('تعذر تشغيل محرك الذكاء الاصطناعي التلقائي: ' + (modelErr.message || ''));
        setStatus('⚠️ تعذر تشغيل الذكاء الاصطناعي التلقائي. تم تفعيل الإجراء الاحتياطي: يمكنك التقاط صورتك الآن وإرسالها للإدارة للاعتماد.');
      }
    };

    startProcess();

    return () => {
      isCancelled = true;
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, [isHand, facingMode, processTrigger]);

  const toggleCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const toggleFlash = () => {
    setIsScreenFlashOn(prev => !prev);
  };

  const handleRestartProcess = () => {
    setIsWaitingRetry(false);
    setProcessTrigger(prev => prev + 1);
  };

  // حلقة فحص الحيوية التلقائية ومطابقة البصمة
  useEffect(() => {
    if (isInitializing || isAiFallbackMode || !videoRef.current) return;
    
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
  }, [isInitializing, isAiFallbackMode, livenessStage, isHand]);

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
        setStatus('جاري مطابقة الوجه وفحص الإضاءة الدقيقة...');
        const savedDescriptor = employee.face_descriptor || await loadFaceDescriptor(employee.id);
        if (!savedDescriptor) {
          handleFailure('بصمة الوجه غير مسجلة لهذا الموظف.');
          return;
        }

        // 🌟 فحص متعدد الإطارات المتتابعة (Multi-Frame Burst Matching):
        let bestMatchResult = null;
        let lastError = null;

        for (let burstIdx = 0; burstIdx < 3; burstIdx++) {
          try {
            const result = await getFaceEmbedding(videoRef.current);
            if (!result || result.error) {
              lastError = result?.error;
              continue;
            }

            if (result.isVeryDark) {
              setLightingStatus('dark');
              setIsScreenFlashOn(true);
            } else if (result.isLowLight) {
              setLightingStatus('low');
              setIsScreenFlashOn(true);
            } else {
              setLightingStatus('good');
            }

            const liveDescs = result.descriptors || [result.descriptor];
            const matchResult = compareFaces(savedDescriptor, liveDescs, 70);

            if (matchResult.isLegacy) {
              handleFailure(matchResult.error || 'البصمة مسجلة بالنظام القديم، يرجى إعادة تسجيل البصمة من لوحة التحكم.');
              return;
            }

            if (!bestMatchResult || matchResult.matchPercentage > bestMatchResult.matchPercentage) {
              bestMatchResult = matchResult;
            }

            if (bestMatchResult && bestMatchResult.isMatch) {
              break;
            }

            await new Promise((resolve) => setTimeout(resolve, 90));
          } catch (bErr) {
            console.warn('[FaceMatch] Burst frame attempt note:', bErr);
          }
        }

        if (!bestMatchResult) {
          handleFailure(lastError || 'تعذر استخراج معالم الوجه بوضوح.');
          return;
        }

        if (bestMatchResult.isMatch) {
          setStatus(`✅ تمت مطابقة الوجه بنجاح! (${Math.round(bestMatchResult.matchPercentage)}%)`);
          setTimeout(() => {
            onVerifySuccess(actionType);
          }, 250);
        } else {
          setIsScreenFlashOn(true);
          handleFailure(`البصمة غير متطابقة (${Math.round(bestMatchResult.matchPercentage)}%)`);
        }
      }
    } catch (err) {
      console.error('Matching runtime exception:', err);
      setIsAiFallbackMode(true);
      handleFailure(`حدث خطأ أثناء معالجة الذكاء الاصطناعي. يمكنك التقاط صورة واعتمادها كإجراء احتياطي.`);
    }
  };

  const handleFailure = (msg) => {
    const newFails = failedAttempts + 1;
    setFailedAttempts(newFails);
    setErrorMsg(`❌ ${msg}`);
    setLivenessStage(0);
    setIsWaitingRetry(true);

    if (newFails >= 3) {
      setStatus('تعذر التحقق بعد 3 محاولات متتالية. يرجى الضغط على الزر أدناه لالتقاط صورة حية واعتماد الحضور من الإدارة.');
    } else {
      setStatus('تعذر مطابقة البصمة. يرجى الوقوف بثبات والتأكد من إضاءة الوجه ثم الضغط على "محاولة مرة أخرى".');
    }
  };

  const handleRetry = () => {
    setIsWaitingRetry(false);
    setErrorMsg(null);
    setStatus(isHand ? 'يرجى وضع يدك وفتح أصابعك أمام الكاميرا...' : 'يرجى النظر مباشرة للكاميرا والابتسام أو الرمش بعينيك 😉');
    setLivenessStage(1);
  };

  // التقاط الصورة من البث المباشر وإرسالها لمدير الفرع والإدارة للاعتماد
  const captureAndSend = () => {
    if (isCapturing) return;

    if (!videoRef.current || !videoRef.current.videoWidth) {
      // إذا لم يكن بث الفيديو يعمل، نفتح كاميرا الهاتف الأصلية
      if (nativeInputRef.current) {
        nativeInputRef.current.click();
      } else {
        setStatus('الكاميرا غير متاحة حالياً لالتقاط الصورة.');
      }
      return;
    }

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

      // إرسال وتأكيد الإجراء فورياً للإدارة ومدير الفرع
      onVerifyFailed(actionType, photoDataUrl);
    } catch (err) {
      console.error('Error capturing frame:', err);
      setIsCapturing(false);
      setStatus('فشل التقاط الصورة من البث المباشر. يمكنك استخدام زر فتح كاميرا الهاتف أدناه.');
    }
  };

  // معالجة اختيار صورة من كاميرا الهاتف الأصلية (Native Mobile Camera Fallback)
  const handleNativePhotoPicked = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsCapturing(true);
    setStatus('جاري معالجة الصورة وتجهيز طلب الاعتماد للإدارة...');

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      if (dataUrl) {
        onVerifyFailed(actionType, dataUrl);
      } else {
        setIsCapturing(false);
        setStatus('فشل في قراءة الصورة، يرجى المحاولة مرة أخرى.');
      }
    };
    reader.onerror = () => {
      setIsCapturing(false);
      setStatus('حدث خطأ أثناء قراءة ملف الصورة.');
    };
    reader.readAsDataURL(file);
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
          <button className="close-btn" onClick={onCancel} disabled={isCapturing}>×</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* مؤشر جودة الإضاءة أو وضع الاحتياط */}
            <div>
              {isAiFallbackMode ? (
                <span style={{ fontSize: '0.82rem', padding: '4px 10px', borderRadius: '6px', background: '#fffbeb', color: '#b45309', fontWeight: 'bold', border: '1px solid #fde68a' }}>
                  🛡️ وضع الاعتماد بالصورة الاحتياطي
                </span>
              ) : (
                <>
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
                </>
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

          <div style={{
            position: 'relative',
            width: '100%',
            maxWidth: '420px',
            borderRadius: '16px',
            overflow: 'hidden',
            backgroundColor: '#000',
            border: isScreenFlashOn ? '4px solid #ffffff' : (isAiFallbackMode ? '3px solid #f59e0b' : '3px solid var(--border)'),
            boxShadow: isScreenFlashOn ? '0 0 50px 15px rgba(255, 255, 255, 0.95), 0 0 100px 30px rgba(59, 130, 246, 0.4)' : '0 8px 24px rgba(0,0,0,0.15)',
            transition: 'all 0.3s ease'
          }}>
            <video 
              ref={videoRef}
              autoPlay
              playsInline
              webkit-playsinline="true"
              muted
              style={{
                width: '100%',
                height: 'auto',
                minHeight: '220px',
                display: 'block',
                transform: facingMode === 'user' ? 'scaleX(-1)' : 'none',
                objectFit: 'cover'
              }}
            />
            {isInitializing && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff', backgroundColor: 'rgba(0,0,0,0.7)', gap: '8px', padding: '16px' }}>
                <span className="spinner-border spinner-border-sm" style={{ width: '28px', height: '28px' }}></span>
                <span>جارِ تجهيز الكاميرا ومحرك الذكاء الاصطناعي...</span>
              </div>
            )}
            {isAiFallbackMode && (
              <div style={{
                position: 'absolute',
                top: 10,
                right: 10,
                background: 'rgba(245, 158, 11, 0.92)',
                color: '#fff',
                padding: '4px 10px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 'bold',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                backdropFilter: 'blur(4px)'
              }}>
                🛡️ وضع التقاط الصورة الاحتياطي
              </div>
            )}
          </div>

          <div style={{ padding: '14px', background: isAiFallbackMode ? '#fffbeb' : 'var(--surface)', borderRadius: '10px', width: '100%', border: isAiFallbackMode ? '1px solid #fde68a' : '1px solid var(--border)' }}>
            <p style={{ fontWeight: 'bold', color: isAiFallbackMode ? '#b45309' : 'var(--primary)', margin: '0 0 6px 0', fontSize: '1.05rem' }}>
              {status}
            </p>
            {errorMsg && (
              <p style={{ color: 'var(--danger)', fontSize: '0.88rem', margin: 0, fontWeight: 'bold' }}>
                {errorMsg} {failedAttempts > 0 && `(المحاولة ${failedAttempts}/3)`}
              </p>
            )}
          </div>

        </div>

        <div className="modal-footer" style={{ flexDirection: 'column', gap: '10px' }}>
          {/* إدخال كاميرا الهاتف الأصلي المخفي كاحتياطي شامل لكافة الأجهزة */}
          <input
            ref={nativeInputRef}
            type="file"
            accept="image/*"
            capture="user"
            style={{ display: 'none' }}
            onChange={handleNativePhotoPicked}
          />

          {errorMsg && typeof window !== 'undefined' && window.location.protocol === 'http:' && !window.location.hostname.includes('localhost') && (
            <button
              type="button"
              className="btn btn-warning"
              style={{
                width: '100%',
                padding: '10px',
                fontWeight: 'bold',
                fontSize: '0.88rem',
                background: '#e0e7ff',
                color: '#3730a3',
                border: '1px solid #c7d2fe',
                borderRadius: '8px',
                cursor: 'pointer'
              }}
              onClick={() => {
                if (window.location.hostname === '63.183.147.199' || window.location.hostname.includes('sslip.io')) {
                  window.location.href = 'https://63-183-147-199.sslip.io' + window.location.pathname + window.location.search;
                } else {
                  window.location.href = window.location.href.replace(/^http:/, 'https:');
                }
              }}
            >
              🔒 التبديل إلى رابط HTTPS المشفر (لتشغيل البث الحي للكاميرا)
            </button>
          )}

          {/* في حال تفعيل وضع الاحتياط عند حدوث أي مشكلة في الذكاء الاصطناعي */}
          {isAiFallbackMode ? (
            <>
              {hasCameraStream ? (
                <button 
                  type="button"
                  className="btn btn-primary" 
                  style={{ 
                    width: '100%', 
                    padding: '14px', 
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
                  {isCapturing ? '⏳ جاري التقاط الصورة وتجهيز الطلب...' : '📸 التقاط الصورة وإرسال طلب اعتماد للإدارة (إجراء احتياطي)'}
                </button>
              ) : (
                <button 
                  type="button"
                  className="btn btn-primary" 
                  style={{ 
                    width: '100%', 
                    padding: '14px', 
                    fontSize: '15px', 
                    fontWeight: 800,
                    background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                    color: '#ffffff',
                    border: 'none',
                    borderRadius: '10px',
                    boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                    cursor: isCapturing ? 'wait' : 'pointer'
                  }} 
                  onClick={() => nativeInputRef.current?.click()}
                  disabled={isCapturing}
                >
                  {isCapturing ? '⏳ جاري معالجة الصورة وإرسال الطلب...' : '📷 فتح كاميرا الهاتف والتقاط صورة للاعتماد (إجراء احتياطي)'}
                </button>
              )}

              <button
                type="button"
                className="btn btn-ghost"
                style={{ width: '100%', padding: '9px', fontSize: '13px', color: 'var(--primary)' }}
                onClick={handleRestartProcess}
                disabled={isCapturing}
              >
                🔄 إعادة محاولة تشغيل الذكاء الاصطناعي
              </button>
            </>
          ) : failedAttempts >= 3 ? (
            /* بعد 3 محاولات فاشلة للمطابقة */
            <button 
              type="button"
              className="btn btn-primary" 
              style={{ 
                width: '100%', 
                padding: '14px', 
                fontSize: '15px', 
                fontWeight: 800,
                background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                color: '#ffffff',
                border: 'none',
                borderRadius: '10px',
                boxShadow: '0 4px 14px rgba(2, 132, 199, 0.4)',
                cursor: isCapturing ? 'wait' : 'pointer'
              }} 
              onClick={hasCameraStream ? captureAndSend : () => nativeInputRef.current?.click()}
              disabled={isCapturing}
            >
              {isCapturing ? '⏳ جاري التقاط الصورة وتجهيز الطلب...' : '📸 التقاط الصورة وإرسال طلب اعتماد للإدارة'}
            </button>
          ) : isWaitingRetry ? (
            /* في المحاولات 1 و 2: زر محاولة مرة أخرى فقط */
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
              disabled={isCapturing}
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
