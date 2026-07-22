import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Trash2, Copy, ArrowUp, ArrowDown } from 'lucide-react';

const DEFAULT_SLIDE = () => ({
  id: uuidv4(),
  question: '',
  image: null,
  isFullScreenImage: false,
  answers: [
    { id: uuidv4(), text: '', isCorrect: false },
    { id: uuidv4(), text: '', isCorrect: false },
    { id: uuidv4(), text: '', isCorrect: false },
    { id: uuidv4(), text: '', isCorrect: false }
  ],
  timeLimit: 30,
  scoreMultiplier: 1
});

export default function CreatorView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [presentation, setPresentation] = useState(null);
  const [activeSlideId, setActiveSlideId] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('kamooy_presentations');
    if (saved) {
      const parsed = JSON.parse(saved);
      const found = parsed.find(p => p.id === id);
      if (found) {
        if (!found.slides || found.slides.length === 0) {
          const initSlide = DEFAULT_SLIDE();
          found.slides = [initSlide];
        }
        setPresentation(found);
        setActiveSlideId(found.slides[0].id);
      } else {
        alert("Presentation not found");
        navigate('/dashboard');
      }
    }
  }, [id, navigate]);

  if (!presentation) return <div>Loading...</div>;

  const activeSlideIndex = presentation.slides.findIndex(s => s.id === activeSlideId);
  const activeSlide = presentation.slides[activeSlideIndex];

  const updatePresentation = (updatedSlides, newTitle = presentation.title) => {
    const updated = { ...presentation, title: newTitle, slides: updatedSlides };
    setPresentation(updated);
  };

  const saveToStorage = () => {
    const saved = localStorage.getItem('kamooy_presentations');
    let parsed = saved ? JSON.parse(saved) : [];
    const index = parsed.findIndex(p => p.id === id);
    if (index >= 0) {
      parsed[index] = presentation;
    } else {
      parsed.push(presentation);
    }
    localStorage.setItem('kamooy_presentations', JSON.stringify(parsed));
    navigate('/dashboard');
  };

  const updateActiveSlide = (updates) => {
    const updatedSlides = [...presentation.slides];
    updatedSlides[activeSlideIndex] = { ...activeSlide, ...updates };
    updatePresentation(updatedSlides);
  };

  // --- Left Panel Actions ---
  const addSlide = () => {
    const newSlide = DEFAULT_SLIDE();
    const updatedSlides = [...presentation.slides, newSlide];
    updatePresentation(updatedSlides);
    setActiveSlideId(newSlide.id);
  };

  const duplicateSlide = (e, slide) => {
    e.stopPropagation();
    const newSlide = { 
      ...slide, 
      id: uuidv4(), 
      answers: slide.answers.map(a => ({...a, id: uuidv4()})) 
    };
    const index = presentation.slides.findIndex(s => s.id === slide.id);
    const updatedSlides = [...presentation.slides];
    updatedSlides.splice(index + 1, 0, newSlide);
    updatePresentation(updatedSlides);
    setActiveSlideId(newSlide.id);
  };

  const deleteSlide = (e, slideId) => {
    e.stopPropagation();
    if (presentation.slides.length === 1) return alert("Must have at least one slide");
    const updatedSlides = presentation.slides.filter(s => s.id !== slideId);
    updatePresentation(updatedSlides);
    if (activeSlideId === slideId) {
      setActiveSlideId(updatedSlides[0].id);
    }
  };

  const moveSlide = (e, index, direction) => {
    e.stopPropagation();
    if (direction === -1 && index === 0) return;
    if (direction === 1 && index === presentation.slides.length - 1) return;
    
    const updatedSlides = [...presentation.slides];
    const temp = updatedSlides[index];
    updatedSlides[index] = updatedSlides[index + direction];
    updatedSlides[index + direction] = temp;
    updatePresentation(updatedSlides);
  };

  // --- Right Panel Actions ---
  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        updateActiveSlide({ image: reader.result });
      };
      reader.readAsDataURL(file);
    }
  };

  const removeImage = () => {
    updateActiveSlide({ image: null, isFullScreenImage: false });
  };

  const addAnswer = () => {
    if (activeSlide.answers.length >= 6) return;
    updateActiveSlide({
      answers: [...activeSlide.answers, { id: uuidv4(), text: '', isCorrect: false }]
    });
  };

  const removeAnswer = (ansId) => {
    if (activeSlide.answers.length <= 2) return;
    updateActiveSlide({
      answers: activeSlide.answers.filter(a => a.id !== ansId)
    });
  };

  const updateAnswer = (ansId, text) => {
    updateActiveSlide({
      answers: activeSlide.answers.map(a => a.id === ansId ? { ...a, text } : a)
    });
  };

  const toggleCorrectAnswer = (ansId) => {
    updateActiveSlide({
      answers: activeSlide.answers.map(a => a.id === ansId ? { ...a, isCorrect: !a.isCorrect } : a)
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', backgroundColor: '#f4f4f4' }}>
      
      {/* HEADER */}
      <div style={{ height: '60px', backgroundColor: '#fff', borderBottom: '1px solid #ddd', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 20px' }}>
        <input 
          type="text" 
          value={presentation.title} 
          onChange={(e) => updatePresentation(presentation.slides, e.target.value)}
          style={{ fontSize: '1.2rem', fontWeight: 'bold', padding: '5px', border: '1px solid #ccc', borderRadius: '4px', width: '300px' }}
        />
        <div>
          <button onClick={() => navigate('/dashboard')} style={{ marginRight: '10px', padding: '8px 15px', cursor: 'pointer' }}>ยกเลิก</button>
          <button onClick={saveToStorage} style={{ padding: '8px 15px', backgroundColor: '#28a745', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>บันทึก</button>
        </div>
      </div>

      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        
        {/* LEFT PANEL - SLIDES LIST */}
        <div style={{ width: '250px', backgroundColor: '#fff', borderRight: '1px solid #ddd', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '10px', borderBottom: '1px solid #eee' }}>
            <button onClick={addSlide} style={{ width: '100%', padding: '10px', backgroundColor: '#007bff', color: '#fff', border: 'none', borderRadius: '4px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '5px' }}>
              <Plus size={16} /> เพิ่มสไลด์
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {presentation.slides.map((s, idx) => (
              <div 
                key={s.id} 
                onClick={() => setActiveSlideId(s.id)}
                style={{ 
                  border: `2px solid ${activeSlideId === s.id ? '#007bff' : '#ccc'}`,
                  borderRadius: '6px',
                  padding: '10px',
                  cursor: 'pointer',
                  backgroundColor: activeSlideId === s.id ? '#eef6ff' : '#fff',
                  position: 'relative'
                }}
              >
                <div style={{ fontSize: '0.8rem', fontWeight: 'bold', marginBottom: '5px' }}>{idx + 1}. Quiz</div>
                <div style={{ fontSize: '0.9rem', color: '#555', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {s.question || 'ไม่ได้ตั้งคำถาม'}
                </div>
                
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '10px' }}>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={(e) => moveSlide(e, idx, -1)} disabled={idx===0} style={{ padding: '2px', cursor: idx===0?'not-allowed':'pointer' }}><ArrowUp size={14}/></button>
                    <button onClick={(e) => moveSlide(e, idx, 1)} disabled={idx===presentation.slides.length-1} style={{ padding: '2px', cursor: idx===presentation.slides.length-1?'not-allowed':'pointer' }}><ArrowDown size={14}/></button>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={(e) => duplicateSlide(e, s)} style={{ padding: '2px', cursor: 'pointer' }}><Copy size={14}/></button>
                    <button onClick={(e) => deleteSlide(e, s.id)} style={{ padding: '2px', cursor: 'pointer', color: 'red' }}><Trash2 size={14}/></button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* MIDDLE PANEL - PREVIEW */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={{ 
            width: '100%', 
            maxWidth: '800px', 
            aspectRatio: '16/9', 
            backgroundColor: '#fff', 
            boxShadow: '0 4px 10px rgba(0,0,0,0.1)',
            borderRadius: '8px',
            position: 'relative',
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden'
          }}>
            
            {/* Background Image if Fullscreen */}
            {activeSlide.image && activeSlide.isFullScreenImage && (
              <img src={activeSlide.image} alt="Background" style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: 0, opacity: 0.8 }} />
            )}

            <div style={{ position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', height: '100%', padding: '20px' }}>
              
              {/* Question */}
              <div style={{ textAlign: 'center', backgroundColor: 'rgba(255,255,255,0.9)', padding: '15px', borderRadius: '8px', fontSize: '1.5rem', fontWeight: 'bold', minHeight: '60px', boxShadow: '0 2px 5px rgba(0,0,0,0.1)' }}>
                {activeSlide.question || 'พิมพ์คำถามของคุณ...'}
              </div>

              {/* Middle (Image) */}
              <div style={{ flex: 1, display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '20px 0', minHeight: 0 }}>
                {activeSlide.image && !activeSlide.isFullScreenImage && (
                  <div style={{ backgroundColor: '#eee', padding: '10px', borderRadius: '8px', height: '100%', width: '100%', display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
                    <img src={activeSlide.image} alt="Slide" style={{ maxHeight: '100%', maxWidth: '100%', objectFit: 'contain', borderRadius: '4px' }} />
                  </div>
                )}
              </div>

              {/* Answers */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                {activeSlide.answers.map((ans, idx) => {
                  const colors = ['#e21b3c', '#1368ce', '#d89e00', '#26890c', '#2eb8a6', '#8e44ad'];
                  return (
                    <div key={ans.id} style={{
                      backgroundColor: colors[idx % colors.length],
                      color: 'white',
                      padding: '15px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      fontWeight: 'bold',
                      minHeight: '50px',
                      opacity: ans.text ? 1 : 0.5
                    }}>
                      <div style={{ flex: 1, paddingLeft: '10px' }}>{ans.text || `คำตอบที่ ${idx+1}`}</div>
                      {ans.isCorrect && <div style={{ backgroundColor: 'white', color: colors[idx % colors.length], width: '24px', height: '24px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>✓</div>}
                    </div>
                  );
                })}
              </div>

            </div>
          </div>
        </div>

        {/* RIGHT PANEL - SETTINGS */}
        <div style={{ width: '300px', backgroundColor: '#fff', borderLeft: '1px solid #ddd', padding: '20px', overflowY: 'auto' }}>
          <h3 style={{ marginTop: 0 }}>ตั้งค่าสไลด์</h3>
          
          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>คำถาม</label>
            <textarea 
              value={activeSlide.question}
              onChange={(e) => updateActiveSlide({ question: e.target.value })}
              rows={3}
              style={{ width: '100%', padding: '8px', boxSizing: 'border-box', border: '1px solid #ccc', borderRadius: '4px' }}
              placeholder="ใส่คำถามของคุณ..."
            />
          </div>

          <div style={{ marginBottom: '20px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <label style={{ fontWeight: 'bold' }}>คำตอบ (เลือกข้อถูก)</label>
              <button onClick={addAnswer} disabled={activeSlide.answers.length >= 6} style={{ padding: '2px 8px', cursor: 'pointer' }}>+</button>
            </div>
            
            {activeSlide.answers.map((ans, idx) => (
              <div key={ans.id} style={{ display: 'flex', alignItems: 'center', marginBottom: '8px', gap: '8px' }}>
                <input 
                  type="checkbox" 
                  checked={ans.isCorrect} 
                  onChange={() => toggleCorrectAnswer(ans.id)} 
                  title="ข้อนี้ถูกต้อง"
                />
                <input 
                  type="text" 
                  value={ans.text}
                  onChange={(e) => updateAnswer(ans.id, e.target.value)}
                  placeholder={`คำตอบ ${idx+1}`}
                  style={{ flex: 1, padding: '5px', border: '1px solid #ccc', borderRadius: '4px' }}
                />
                <button onClick={() => removeAnswer(ans.id)} disabled={activeSlide.answers.length <= 2} style={{ padding: '2px 5px', color: 'red' }}>-</button>
              </div>
            ))}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>ภาพประกอบ</label>
            {!activeSlide.image ? (
              <input type="file" accept="image/*" onChange={handleImageUpload} style={{ width: '100%' }} />
            ) : (
              <div>
                <img src={activeSlide.image} alt="Preview" style={{ width: '100%', maxHeight: '100px', objectFit: 'contain', border: '1px solid #ddd', marginBottom: '5px' }} />
                <button onClick={removeImage} style={{ width: '100%', padding: '5px', color: 'red' }}>ลบภาพ</button>
                <div style={{ marginTop: '10px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                    <input 
                      type="checkbox" 
                      checked={activeSlide.isFullScreenImage}
                      onChange={(e) => updateActiveSlide({ isFullScreenImage: e.target.checked })}
                    />
                    แสดงภาพเต็มจอ (พื้นหลัง)
                  </label>
                </div>
              </div>
            )}
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>เวลาในการตอบ</label>
            <select 
              value={activeSlide.timeLimit}
              onChange={(e) => updateActiveSlide({ timeLimit: parseInt(e.target.value) })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            >
              {[5, 10, 15, 20, 30, 45, 60].map(t => (
                <option key={t} value={t}>{t} วินาที</option>
              ))}
            </select>
          </div>

          <div style={{ marginBottom: '20px' }}>
            <label style={{ display: 'block', fontWeight: 'bold', marginBottom: '5px' }}>การให้คะแนน</label>
            <select 
              value={activeSlide.scoreMultiplier}
              onChange={(e) => updateActiveSlide({ scoreMultiplier: parseFloat(e.target.value) })}
              style={{ width: '100%', padding: '8px', border: '1px solid #ccc', borderRadius: '4px' }}
            >
              <option value={0}>ไม่มีคะแนน (0x)</option>
              <option value={1}>คะแนนมาตรฐาน (1x)</option>
              <option value={2}>คะแนนสองเท่า (2x)</option>
              <option value={3}>คะแนนสามเท่า (3x)</option>
            </select>
          </div>

        </div>
      </div>
    </div>
  );
}
