import React, { useRef, useEffect, useState } from 'react';
import { initFaceRecognition, getFaceEmbedding } from '../../utils/faceApiHelper';
import { initHandRecognition, getHandEmbedding } from '../../utils/handApiHelper';

export default function FaceRegistrationModal({ employee, onClose, onSuccess, biometricType = 'face' }) {
  const videoRef = useRef(null);
  const [currentType, setCurrentType] = useState(biometricType);
  const [status, setStatus] = useState('جارِ التحميل...');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isFlashActive, setIsFlashActive] = useState(false);
  const [captureStage, setCaptureStage] = useState(0);
  const [descriptors, setDescriptors] = useState([]);
  
  const isHand = currentType === 'hand';
  const [facingMode, setFacingMode] = useState('user');

  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      setIsInitializing(true);
      setErrorMsg(null);
      setStatus('جارِ التحميل...');
      
      try {
        if (isHand) {
          await initHandRecognition();
        } else {
          await initFaceRecognition();
        }
        
        if (videoRef.current?.srcObject) {
          videoRef.current.srcObject.getTracks().forEach(track => track.stop());
          videoRef.current.srcObject = null;
        }

        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: facingMode,
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        
        setIsInitializing(false);
        setStatus(isHand ? 'يرجى وضع يدك أمام الكاميرا بشكل واضح' : 'الخطوة 1 من 3: انظر مباشرة للكاميرا في إضاءة جيدة');
      } catch (err) {
        console.error('Camera/Model error:', err);
        setErrorMsg('فشل في تشغيل الكاميرا أو تحميل النماذج. تأكد من الصلاحيات.');
        setIsInitializing(false);
      }
    };

    startCamera();

    return () => {
      if (videoRef.current && videoRef.current.srcObject) {
        videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      }
    };
  }, [isHand, facingMode]);

  const toggleCamera = () => {
    setFacingMode(prev => (prev === 'user' ? 'environment' : 'user'));
  };

  const toggleFlash = () => {
    setIsFlashActive(prev => !prev);
  };

  useEffect(() => {
    setCaptureStage(0);
    setDescriptors([]);
  }, [currentType]);

  const captureBiometric = async () => {
    if (!videoRef.current || isInitializing) return;

    setStatus(`جاري تحليل ${isHand ? 'اليد' : 'الوجه واستخراج البصمة الذكية'}...`);
    setErrorMsg(null);

    try {
      if (isHand) {
        const result = getHandEmbedding(videoRef.current, 0);
        
        if (!result || !result.hasHand) {
          setErrorMsg('لم يتم التعرف على يد. يرجى توجيه يدك للكاميرا وفتح أصابعك.');
          setStatus('يرجى المحاولة مرة أخرى');
        } else {
          const newDescriptors = [...descriptors, result.descriptor];
          
          if (captureStage === 0) {
            setDescriptors(newDescriptors);
            setCaptureStage(1);
            setStatus('تم التقاط (باطن اليد) ✅. يرجى قلب اليد لتصوير (ظهر اليد) والنقر على التقاط.');
          } else if (captureStage === 1) {
            setDescriptors(newDescriptors);
            setCaptureStage(2);
            setStatus('تم التقاط (ظهر اليد) ✅. يرجى إمالة اليد قليلاً للجانب والنقر على التقاط.');
          } else {
            let photoDataUrl = null;
            try {
              if (videoRef.current) {
                const canvas = document.createElement('canvas');
                canvas.width = videoRef.current.videoWidth || 640;
                canvas.height = videoRef.current.videoHeight || 480;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                photoDataUrl = canvas.toDataURL('image/jpeg', 0.85);
              }
            } catch (snapErr) {
              console.warn('Could not extract snapshot frame:', snapErr);
            }

            setStatus('تم التقاط جميع زوايا اليد بنجاح! ✅ جاري الحفظ...');
            setTimeout(() => {
              onSuccess(newDescriptors, 'hand', photoDataUrl);
            }, 1200);
          }
        }
      } else {
        const result = await getFaceEmbedding(videoRef.current);
        
        if (result.error) {
          setErrorMsg(result.error);
          setStatus('يرجى المحاولة مرة أخرى');
        } else {
          const newDescriptors = [...descriptors, result.descriptor];
          
          if (captureStage === 0) {
            setDescriptors(newDescriptors);
            setCaptureStage(1);
            setStatus('تم التقاط الوجه (الأمام) ✅. الخطوة 2: يرجى الالتفات قليلاً لليمين (~15 درجة) ثم النقر على التقاط.');
          } else if (captureStage === 1) {
            setDescriptors(newDescriptors);
            setCaptureStage(2);
            setStatus('تم التقاط الوجه (اليمين) ✅. الخطوة 3: يرجى الالتفات قليلاً لليسار (~15 درجة) ثم النقر على التقاط.');
          } else {
            let photoDataUrl = null;
            try {
              if (videoRef.current) {
                const canvas = document.createElement('canvas');
                canvas.width = videoRef.current.videoWidth || 640;
                canvas.height = videoRef.current.videoHeight || 480;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);
                photoDataUrl = canvas.toDataURL('image/jpeg', 0.85);
              }
            } catch (snapErr) {
              console.warn('Could not extract snapshot frame:', snapErr);
            }

            setStatus('تم تسجيل بروفايل الوجه متعدد الزوايا بنجاح! 🎉 جاري الحفظ في قاعدة البيانات...');
            setTimeout(() => {
              onSuccess(newDescriptors, 'face', photoDataUrl);
            }, 1200);
          }
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('حدث خطأ أثناء معالجة البصمة.');
      setStatus('حاول مرة أخرى');
    }
  };

  return (
    <div className={`modal-overlay ${isFlashActive ? 'screen-flash-active' : ''}`}>
      {isFlashActive && (
        <div style={{
          position: 'fixed',
          inset: 0,
          backgroundColor: 'rgba(255, 255, 255, 0.92)',
          zIndex: 9998,
          pointerEvents: 'none'
        }} />
      )}

      <div className="modal-content" style={{ maxWidth: '520px', textAlign: 'center', position: 'relative', zIndex: 9999 }}>
        <div className="modal-header">
          <div>
            <h3 style={{ margin: 0 }}>تسجيل بصمة {isHand ? 'اليد' : 'الوجه الذكية (HD)'}</h3>
            <small style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>الموظف: {employee.name}</small>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>
        
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          
          {/* شريط مراحل الالتقاط */}
          <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              <span className={`badge ${captureStage >= 0 ? 'badge-primary' : ''}`} style={{ padding: '4px 8px', borderRadius: '50%', background: captureStage >= 1 ? '#4caf50' : 'var(--primary)', color: '#fff', fontSize: '0.8rem' }}>1</span>
              <span style={{ fontSize: '0.8rem', fontWeight: captureStage === 0 ? 'bold' : 'normal' }}>الأمام</span>
              <span>←</span>
              <span className={`badge ${captureStage >= 1 ? 'badge-primary' : ''}`} style={{ padding: '4px 8px', borderRadius: '50%', background: captureStage >= 2 ? '#4caf50' : captureStage === 1 ? 'var(--primary)' : '#ccc', color: '#fff', fontSize: '0.8rem' }}>2</span>
              <span style={{ fontSize: '0.8rem', fontWeight: captureStage === 1 ? 'bold' : 'normal' }}>اليمين</span>
              <span>←</span>
              <span className={`badge ${captureStage >= 2 ? 'badge-primary' : ''}`} style={{ padding: '4px 8px', borderRadius: '50%', background: captureStage === 2 ? 'var(--primary)' : '#ccc', color: '#fff', fontSize: '0.8rem' }}>3</span>
              <span style={{ fontSize: '0.8rem', fontWeight: captureStage === 2 ? 'bold' : 'normal' }}>اليسار</span>
            </div>

            <div style={{ display: 'flex', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={toggleFlash}
                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
              >
                {isFlashActive ? '💡 إطفاء' : '💡 إضاءة'}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={toggleCamera}
                style={{ fontSize: '0.8rem', padding: '4px 8px' }}
              >
                🔄 {facingMode === 'user' ? 'أمامي' : 'خلفي'}
              </button>
            </div>
          </div>

          <div style={{ position: 'relative', width: '100%', maxWidth: '420px', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#000', border: '3px solid var(--border)' }}>
            <video 
              ref={videoRef} 
              autoPlay 
              playsInline 
              muted 
              style={{ width: '100%', display: 'block', transform: facingMode === 'user' ? 'scaleX(-1)' : 'none' }} 
            />
            {isInitializing && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.7)', color: '#fff' }}>
                <div className="spinner">جارِ تجهيز المحرك...</div>
              </div>
            )}
          </div>

          <div style={{ padding: '12px', background: 'var(--surface)', borderRadius: '10px', width: '100%', border: '1px solid var(--border)' }}>
            <p style={{ fontWeight: 'bold', color: 'var(--text)', margin: '0 0 6px 0' }}>{status}</p>
            {errorMsg && (
              <p style={{ color: 'var(--danger)', fontSize: '0.9rem', margin: 0, fontWeight: 'bold' }}>⚠️ {errorMsg}</p>
            )}
            
            <p style={{ textAlign: 'right', fontSize: '0.8rem', color: 'var(--muted)', margin: '8px 0 0 0' }}>
              💡 نظام ArcFace الذكي يستخرج 512 نقطة هندسية لكل زاوية لتحقيق دقة 99.8% في أصعب ظروف الإضاءة.
            </p>
          </div>

          <button 
            className="btn btn-primary" 
            onClick={captureBiometric}
            disabled={isInitializing}
            style={{ width: '100%', padding: '12px', fontSize: '1rem', marginTop: '6px' }}
          >
            📸 التقاط الزاوية ({captureStage + 1}/3)
          </button>
        </div>
      </div>
    </div>
  );
}
