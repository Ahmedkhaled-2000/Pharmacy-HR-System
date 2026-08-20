import React, { useRef, useEffect, useState } from 'react';
import { initFaceRecognition, getFaceEmbedding, compareFaces } from '../../utils/faceApiHelper';
import { initHandRecognition, getHandEmbedding, compareHands } from '../../utils/handApiHelper';
import { loadFaceDescriptor, loadHandDescriptor } from '../../utils/faceStorage';

export default function FaceTestModal({ employee, onClose, biometricType = 'face' }) {
  const videoRef = useRef(null);
  const [status, setStatus] = useState('جارِ التحميل...');
  const [errorMsg, setErrorMsg] = useState(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [matchDetails, setMatchDetails] = useState(null);
  const [isFlashActive, setIsFlashActive] = useState(false);
  const isHand = biometricType === 'hand';

  useEffect(() => {
    let stream = null;

    const startCamera = async () => {
      try {
        if (isHand) {
          await initHandRecognition();
        } else {
          await initFaceRecognition();
        }
        
        stream = await navigator.mediaDevices.getUserMedia({
          video: { 
            facingMode: 'user',
            width: { ideal: 1280 },
            height: { ideal: 720 }
          }
        });
        
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play();
        }
        
        setIsInitializing(false);
        setStatus(isHand ? 'انظر للكاميرا وارفع يدك لاختبار البصمة' : 'انظر للكاميرا واضغط "بدء الاختبار الذكي"');
      } catch (err) {
        console.error('Camera/Model error:', err);
        setErrorMsg('فشل في تشغيل الكاميرا أو تحميل محرك الذكاء الاصطناعي.');
        setIsInitializing(false);
      }
    };

    startCamera();

    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [isHand]);

  const toggleFlash = () => {
    setIsFlashActive(prev => !prev);
  };

  const runTest = async () => {
    if (!videoRef.current || isInitializing) return;

    setStatus('جاري التحليل واستخراج المتجه الشعاعي...');
    setErrorMsg(null);
    setMatchDetails(null);

    try {
      if (isHand) {
        const result = getHandEmbedding(videoRef.current, 0);
        
        if (!result || !result.hasHand) {
          setErrorMsg('لم يتم التعرف على يد. يرجى المحاولة مرة أخرى.');
          setStatus('يرجى توجيه يدك للكاميرا وفتح أصابعك.');
          return;
        }

        setStatus('جاري جلب بصمة اليد من قاعدة البيانات...');
        const savedDescriptor = employee.hand_descriptor || await loadHandDescriptor(employee.id);
        
        if (!savedDescriptor) {
          setErrorMsg('بصمة اليد غير مسجلة لهذا الموظف في قاعدة البيانات.');
          setStatus('');
          return;
        }

        const matchResult = compareHands(savedDescriptor, result.descriptor);
        setMatchDetails(matchResult);

        if (matchResult.isMatch) {
          setStatus(`✅ تم التعرف بنجاح! نسبة التطابق: ${Math.round(matchResult.matchPercentage)}%`);
        } else {
          setErrorMsg(`❌ فشل التعرف. البصمة غير مطابقة (نسبة التطابق: ${Math.round(matchResult.matchPercentage)}%)`);
          setStatus('يرجى المحاولة مرة أخرى أو إعادة تسجيل البصمة.');
        }

      } else {
        const result = await getFaceEmbedding(videoRef.current);
        
        if (result.error) {
          setErrorMsg(result.error);
          setStatus('يرجى المحاولة مرة أخرى');
          return;
        }

        setStatus('جاري مطابقة بصمة ArcFace 512D مع قاعدة البيانات...');
        const savedDescriptor = employee.face_descriptor || await loadFaceDescriptor(employee.id);
        
        if (!savedDescriptor) {
          setErrorMsg('بصمة الوجه غير مسجلة لهذا الموظف في قاعدة البيانات.');
          setStatus('');
          return;
        }

        const matchResult = compareFaces(savedDescriptor, result.descriptor);
        setMatchDetails({
          ...matchResult,
          luminance: result.luminance,
          isLowLight: result.isLowLight
        });

        if (matchResult.isLegacy) {
          setErrorMsg(matchResult.error || 'البصمة مسجلة بالنظام القديم (128D) وتحتاج لإعادة تسجيل بالنظام الحديث (512D).');
          setStatus('');
          return;
        }
        
        if (matchResult.isMatch) {
          setStatus(`✅ تم التعرف بنجاح! نسبة التطابق: ${Math.round(matchResult.matchPercentage)}%`);
        } else {
          setErrorMsg(`❌ فشل التعرف. نسبة التطابق: ${Math.round(matchResult.matchPercentage)}% (المطلوب >= 70%)`);
          setStatus('يرجى المحاولة مرة أخرى أو إعادة تسجيل بصمة الموظف بالنموذج الحديث.');
        }
      }
    } catch (err) {
      console.error(err);
      setErrorMsg('حدث خطأ غير متوقع أثناء الفحص.');
      setStatus('');
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
            <h3 style={{ margin: 0 }}>اختبار دقة بصمة {isHand ? 'اليد' : 'الوجه'}: {employee.name}</h3>
            <small style={{ color: 'var(--muted)', fontSize: '0.85rem' }}>ArcFace 512D Cosine Metric Engine</small>
          </div>
          <button className="close-btn" onClick={onClose}>×</button>
        </div>

        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '14px' }}>
          
          <div style={{ width: '100%', display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={toggleFlash}
              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
            >
              {isFlashActive ? '💡 إطفاء الإضاءة المساعدة' : '💡 تشغيل الإضاءة المساعدة'}
            </button>
          </div>

          <div style={{ position: 'relative', width: '100%', maxWidth: '420px', borderRadius: '16px', overflow: 'hidden', backgroundColor: '#000', border: '3px solid var(--border)' }}>
            <video 
              ref={videoRef}
              style={{ width: '100%', height: 'auto', display: 'block', transform: 'scaleX(-1)' }}
              muted
              playsInline
            />
            {isInitializing && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', backgroundColor: 'rgba(0,0,0,0.7)' }}>
                جارِ تجهيز الكاميرا والذكاء الاصطناعي...
              </div>
            )}
          </div>

          <div style={{ padding: '12px', background: 'var(--surface)', borderRadius: '10px', width: '100%', border: '1px solid var(--border)' }}>
            <p style={{ fontWeight: 'bold', color: 'var(--text)', margin: '0 0 6px 0' }}>{status}</p>
            {errorMsg && (
              <p style={{ color: 'var(--danger)', fontSize: '0.9rem', margin: 0, fontWeight: 'bold' }}>{errorMsg}</p>
            )}

            {matchDetails && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '10px', textAlign: 'right', fontSize: '0.85rem' }}>
                <div style={{ padding: '6px', background: 'rgba(0,0,0,0.03)', borderRadius: '6px' }}>
                  <strong>نسبة التطابق:</strong> {matchDetails.matchPercentage}%
                </div>
                <div style={{ padding: '6px', background: 'rgba(0,0,0,0.03)', borderRadius: '6px' }}>
                  <strong>تشابه جيب التمام:</strong> {matchDetails.similarity || 'N/A'}
                </div>
                {matchDetails.luminance !== undefined && (
                  <div style={{ padding: '6px', background: 'rgba(0,0,0,0.03)', borderRadius: '6px' }}>
                    <strong>مستوى الإضاءة:</strong> {matchDetails.luminance}/255 ({matchDetails.isLowLight ? 'خافتة' : 'جيدة'})
                  </div>
                )}
                <div style={{ padding: '6px', background: 'rgba(0,0,0,0.03)', borderRadius: '6px' }}>
                  <strong>النتيجة:</strong> {matchDetails.isMatch ? '✅ متطابق' : '❌ غير متطابق'}
                </div>
              </div>
            )}
          </div>

          <button 
            className="btn btn-primary" 
            onClick={runTest}
            disabled={isInitializing}
            style={{ width: '100%', padding: '12px', fontSize: '1rem', marginTop: '6px' }}
          >
            🔍 بدء الاختبار الذكي
          </button>
        </div>
      </div>
    </div>
  );
}
