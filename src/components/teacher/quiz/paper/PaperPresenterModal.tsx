import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Maximize2,
  Minimize2,
  QrCode,
  Camera,
  CameraOff,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  CheckCircle2,
  Award,
  Users,
  X,
  Sparkles,
  BarChart2,
  RefreshCw,
  Volume2,
  VolumeX,
  SwitchCamera,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import jsAruco2 from 'js-aruco2';
import { QRCodeSVG } from 'qrcode.react';
import { Quiz, User } from '../../../../types';
import { PaperModeSession, PaperModeAnswer, PaperOption } from '../../../../types/paperMode';
import { useApp } from '../../../../context/AppContext';
import { LatexRenderer } from '../../../../utils/latex';
import { RichQuestionPrompt } from '../../../common/RichQuestionPrompt';
import { controlPaperSession, submitPaperAnswersBatch } from '../../../../lib/firestoreSync';
import { fireCelebrationConfetti } from '../../../../utils/gamification';
import { getMarkerOrientation } from '../../../../utils/aruco';

interface PaperPresenterModalProps {
  isOpen: boolean;
  onClose: () => void;
  quiz: Quiz;
  classId: string;
  onOpenScannerOnThisDevice?: () => void;
  onFinishAndShowAnalytics: (session: PaperModeSession) => void;
}

export const PaperPresenterModal: React.FC<PaperPresenterModalProps> = ({
  isOpen,
  onClose,
  quiz,
  classId,
  onOpenScannerOnThisDevice,
  onFinishAndShowAnalytics,
}) => {
  const { users = [], classes = [] } = useApp();
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);

  // Active class info
  const activeClass = useMemo(() => classes.find((c) => c.id === classId), [classes, classId]);

  // Students in class (with fallback to all students if classId is empty or 'all')
  const classStudents = useMemo(() => {
    let list = users.filter((u) => u.role === 'student');
    if (classId && classId !== 'all') {
      const classFiltered = list.filter(
        (u) => u.classIds?.includes(classId) || (u as any).classId === classId
      );
      if (classFiltered.length > 0) {
        list = classFiltered;
      }
    }
    return list.sort((a, b) => {
      const numA = a.absentNumber ?? 999;
      const numB = b.absentNumber ?? 999;
      if (numA !== numB) return numA - numB;
      return a.displayName.localeCompare(b.displayName);
    });
  }, [users, classId]);

  // Marker ID mapping
  const studentByMarkerId = useMemo(() => {
    const map = new Map<number, User>();
    classStudents.forEach((st, idx) => {
      const markerId = st.absentNumber && st.absentNumber > 0 ? st.absentNumber : idx + 1;
      map.set(markerId, st);
    });
    return map;
  }, [classStudents]);

  // Session State
  const sessionId = useMemo(() => `paper_${quiz.id}_${classId}`, [quiz.id, classId]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [isLocked, setIsLocked] = useState(false);
  const [showLiveStats, setShowLiveStats] = useState(false);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [recentlyChangedStudentId, setRecentlyChangedStudentId] = useState<string | null>(null);
  const [answersByQuestion, setAnswersByQuestion] = useState<
    Record<number, Record<string, PaperModeAnswer>>
  >({});

  // PID Camera & Scanner States
  const [isCameraActive, setIsCameraActive] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [videoDevices, setVideoDevices] = useState<MediaDeviceInfo[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [visibleMarkersCount, setVisibleMarkersCount] = useState(0);
  const [isCameraMaximized, setIsCameraMaximized] = useState(false);
  const [showMaximizedRoster, setShowMaximizedRoster] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const latestSessionRef = useRef<PaperModeSession | null>(null);

  const activeQuestion = quiz.questions[currentQuestionIndex] || quiz.questions[0];

  // Current question answers
  const currentAnswers = useMemo(() => {
    return answersByQuestion[currentQuestionIndex] || {};
  }, [answersByQuestion, currentQuestionIndex]);

  // Number of students who answered
  const answeredCount = useMemo(() => {
    return classStudents.filter((st, index) => {
      const markerId = st.absentNumber && st.absentNumber > 0 ? st.absentNumber : index + 1;
      return Boolean(
        currentAnswers[st.uid] ||
        ((st as any).id && currentAnswers[(st as any).id]) ||
        currentAnswers[`marker_${markerId}`] ||
        currentAnswers[markerId] ||
        Object.values(currentAnswers).some(
          (a) => a && (a.markerId === markerId || a.studentId === st.uid || ((st as any).id && a.studentId === (st as any).id))
        )
      );
    }).length;
  }, [classStudents, currentAnswers]);

  // Audio Beep Feedback on detection
  const playDetectSound = () => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {}
  };

  // Enumerate Camera Devices for PID / Webcams
  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then((devices) => {
      const inputs = devices.filter((d) => d.kind === 'videoinput');
      setVideoDevices(inputs);
      if (inputs.length > 0 && !selectedDeviceId) {
        setSelectedDeviceId(inputs[0].deviceId);
      }
    }).catch(() => {});
  }, []);

  // Poll / fetch session status periodically or sync via SSE
  useEffect(() => {
    if (!isOpen) return;

    const loadSession = async () => {
      try {
        const res = await fetch(`/api/collections/paperSessions/${encodeURIComponent(sessionId)}`);
        if (res.ok) {
          const session: PaperModeSession = await res.json();
          if (session && session.id) {
            latestSessionRef.current = session;
            setCurrentQuestionIndex(session.currentQuestionIndex ?? 0);
            setIsLocked(session.status === 'question_closed');
            setShowLiveStats(Boolean(session.showLiveStats));
            setShowCorrectAnswer(Boolean(session.showCorrectAnswer));
            if (session.answersByQuestion) {
              setAnswersByQuestion(session.answersByQuestion);
            }
          }
        }
      } catch (err) {
        console.warn('Error loading paper session:', err);
      }
    };

    loadSession();
    const interval = setInterval(loadSession, 1500);

    // Instant Real-time SSE Events for Paper Mode
    const handlePaperAnswer = (e: any) => {
      const payload = e.detail;
      if (payload && payload.sessionId === sessionId) {
        setAnswersByQuestion((prev) => {
          const qAnswers = { ...(prev[payload.questionIndex] || {}) };
          if (payload.answer) {
            if (payload.answer.studentId) {
              qAnswers[payload.answer.studentId] = payload.answer;
            }
            if (payload.answer.markerId) {
              qAnswers[`marker_${payload.answer.markerId}`] = payload.answer;
            }
          }
          return {
            ...prev,
            [payload.questionIndex]: qAnswers,
          };
        });

        // Highlight updated student in roster
        if (payload.answer?.studentId) {
          setRecentlyChangedStudentId(payload.answer.studentId);
          setTimeout(() => {
            setRecentlyChangedStudentId((curr) =>
              curr === payload.answer.studentId ? null : curr
            );
          }, 3000);
        }
      }
    };

    const handlePaperControl = (e: any) => {
      const payload = e.detail;
      if (payload && payload.sessionId === sessionId && payload.session) {
        const s = payload.session;
        if (s.currentQuestionIndex !== undefined) setCurrentQuestionIndex(s.currentQuestionIndex);
        if (s.status !== undefined) setIsLocked(s.status === 'question_closed');
        if (s.showLiveStats !== undefined) setShowLiveStats(Boolean(s.showLiveStats));
        if (s.showCorrectAnswer !== undefined) setShowCorrectAnswer(Boolean(s.showCorrectAnswer));
        if (s.answersByQuestion) setAnswersByQuestion(s.answersByQuestion);
      }
    };

    window.addEventListener('paper_answer', handlePaperAnswer);
    window.addEventListener('paper_control', handlePaperControl);

    return () => {
      clearInterval(interval);
      window.removeEventListener('paper_answer', handlePaperAnswer);
      window.removeEventListener('paper_control', handlePaperControl);
    };
  }, [isOpen, sessionId]);

  // Start Camera Stream for PID
  const startCamera = async () => {
    if (!isCameraActive) return;
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const constraints: MediaStreamConstraints = {
        video: selectedDeviceId
          ? { deviceId: { exact: selectedDeviceId }, width: { ideal: 1280 }, height: { ideal: 720 } }
          : { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play().catch(() => {});
      }
      setCameraError(null);
    } catch (err: any) {
      console.warn('Camera start error on PID:', err);
      try {
        const fallbackStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        streamRef.current = fallbackStream;
        if (videoRef.current) {
          videoRef.current.srcObject = fallbackStream;
          videoRef.current.play().catch(() => {});
        }
        setCameraError(null);
      } catch (e: any) {
        setCameraError('Kamera PID belum diizinkan atau tidak terdeteksi.');
      }
    }
  };

  // Real-time PID Camera ArUco Detection Loop
  useEffect(() => {
    if (!isOpen || !isCameraActive) return;

    startCamera();

    const AR = (jsAruco2 as any).AR || (jsAruco2 as any);
    const detector = new AR.Detector({ dictionaryName: 'ARUCO' });

    let animationFrameId: number;
    let lastProcessTime = 0;

    const processFrame = () => {
      const now = performance.now();
      // Throttle to ~18-20 fps for smooth detection on PID without lag
      if (now - lastProcessTime > 55) {
        lastProcessTime = now;
        const video = videoRef.current;
        const canvas = canvasRef.current;

        if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
          const width = video.videoWidth || 640;
          const height = video.videoHeight || 480;

          if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
          }

          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (ctx) {
            ctx.drawImage(video, 0, 0, width, height);
            const imageData = ctx.getImageData(0, 0, width, height);
            const markers = detector.detect(imageData);

            if (markers && markers.length > 0) {
              const batchAnswers: PaperModeAnswer[] = [];
              let hasNewAnswer = false;
              let validCount = 0;

              markers.forEach((marker: any) => {
                if (!marker || !marker.corners || marker.corners.length < 4) return;
                const markerId = marker.id;
                if (typeof markerId !== 'number' || markerId <= 0 || markerId > 150) return;

                const student = studentByMarkerId.get(markerId);
                if (!student && markerId > Math.max(classStudents.length + 5, 45)) return;

                const [c0, c1, c2, c3] = marker.corners;
                const edge1 = Math.hypot(c1.x - c0.x, c1.y - c0.y);
                const edge2 = Math.hypot(c2.x - c1.x, c2.y - c1.y);
                if (Math.min(edge1, edge2) < 14) return;

                validCount++;
                const { option, isAmbiguous } = getMarkerOrientation(marker.corners);
                const studentName = student ? student.displayName : `Siswa #${markerId}`;
                const studentId = student ? student.uid : `marker_${markerId}`;

                // Draw bounding box
                ctx.beginPath();
                ctx.moveTo(c0.x, c0.y);
                ctx.lineTo(c1.x, c1.y);
                ctx.lineTo(c2.x, c2.y);
                ctx.lineTo(c3.x, c3.y);
                ctx.closePath();
                ctx.lineWidth = 4;
                ctx.strokeStyle = isAmbiguous ? '#f59e0b' : '#10b981';
                ctx.stroke();

                // Draw AR label pill
                const centerX = (c0.x + c1.x + c2.x + c3.x) / 4;
                const centerY = (c0.y + c1.y + c2.y + c3.y) / 4;
                const labelText = isAmbiguous
                  ? `${studentName} • Tegakkan Kartu`
                  : `✓ ${studentName} • Terekam`;

                ctx.font = 'bold 14px ui-sans-serif, system-ui';
                const textWidth = ctx.measureText(labelText).width;
                ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
                ctx.beginPath();
                if (ctx.roundRect) {
                  ctx.roundRect(centerX - textWidth / 2 - 10, centerY - 28, textWidth + 20, 26, 6);
                } else {
                  ctx.rect(centerX - textWidth / 2 - 10, centerY - 28, textWidth + 20, 26);
                }
                ctx.fill();
                ctx.lineWidth = 1.5;
                ctx.strokeStyle = isAmbiguous ? '#f59e0b' : '#10b981';
                ctx.stroke();

                ctx.fillStyle = isAmbiguous ? '#fcd34d' : '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, centerX, centerY - 15);

                // If not locked and not ambiguously tilted, record answer!
                if (!isLocked && !isAmbiguous) {
                  const existingAns = currentAnswers[studentId] || currentAnswers[`marker_${markerId}`];
                  if (!existingAns || existingAns.selectedOption !== option) {
                    const ansPayload: PaperModeAnswer = {
                      studentId,
                      markerId,
                      studentName,
                      selectedOption: option,
                      timestamp: Date.now(),
                    };
                    batchAnswers.push(ansPayload);
                    hasNewAnswer = true;
                  }
                }
              });

              setVisibleMarkersCount(validCount);

              if (batchAnswers.length > 0) {
                setAnswersByQuestion((prev) => {
                  const qMap = { ...(prev[currentQuestionIndex] || {}) };
                  batchAnswers.forEach((ans) => {
                    qMap[ans.studentId] = ans;
                    qMap[`marker_${ans.markerId}`] = ans;
                  });
                  return { ...prev, [currentQuestionIndex]: qMap };
                });

                submitPaperAnswersBatch(sessionId, currentQuestionIndex, batchAnswers);

                if (hasNewAnswer) {
                  playDetectSound();
                }

                batchAnswers.forEach((ans) => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('paper_answer', {
                        detail: { sessionId, questionIndex: currentQuestionIndex, answer: ans },
                      })
                    );
                  }
                });
              }
            } else {
              setVisibleMarkersCount(0);
            }
          }
        }
      }
      animationFrameId = requestAnimationFrame(processFrame);
    };

    animationFrameId = requestAnimationFrame(processFrame);

    return () => {
      cancelAnimationFrame(animationFrameId);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [
    isOpen,
    isCameraActive,
    selectedDeviceId,
    currentQuestionIndex,
    isLocked,
    studentByMarkerId,
    currentAnswers,
    sessionId,
  ]);

  // Fullscreen toggle handler
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().catch(() => {});
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch(() => {});
      setIsFullscreen(false);
    }
  };

  // Distribution of options A, B, C, D
  const optionStats = useMemo(() => {
    const counts = { A: 0, B: 0, C: 0, D: 0 };
    Object.values(currentAnswers).forEach((ans) => {
      if (ans.selectedOption && counts[ans.selectedOption] !== undefined) {
        counts[ans.selectedOption]++;
      }
    });
    return counts;
  }, [currentAnswers]);

  // Navigate questions
  const handleGoToQuestion = async (idx: number) => {
    if (idx < 0 || idx >= quiz.questions.length) return;
    setCurrentQuestionIndex(idx);
    setShowLiveStats(false);
    setShowCorrectAnswer(false);
    setIsLocked(false);

    await controlPaperSession(sessionId, {
      currentQuestionIndex: idx,
      status: 'active',
      showLiveStats: false,
      showCorrectAnswer: false,
    });
  };

  const handleToggleLock = async () => {
    const nextLocked = !isLocked;
    setIsLocked(nextLocked);
    await controlPaperSession(sessionId, {
      status: nextLocked ? 'question_closed' : 'active',
    });
  };

  const handleToggleReveal = async () => {
    const nextReveal = !showCorrectAnswer;
    setShowCorrectAnswer(nextReveal);
    setShowLiveStats(nextReveal);

    if (nextReveal) {
      fireCelebrationConfetti('submission');
      setIsLocked(true);
    }

    await controlPaperSession(sessionId, {
      showCorrectAnswer: nextReveal,
      showLiveStats: nextReveal,
      ...(nextReveal ? { status: 'question_closed' } : {}),
    });
  };

  const handleFinish = () => {
    const sessionObj: PaperModeSession = {
      id: sessionId,
      quizId: quiz.id,
      classId,
      teacherId: quiz.createdBy,
      currentQuestionIndex,
      status: 'completed',
      answersByQuestion,
      showLiveStats,
      showCorrectAnswer,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onFinishAndShowAnalytics(sessionObj);
  };

  // Optional URL for mobile phone scanner
  const scannerUrl = `${window.location.protocol}//${window.location.hostname}:${window.location.port}/?mode=paper-scanner&sessionId=${encodeURIComponent(sessionId)}&quizId=${encodeURIComponent(quiz.id)}&classId=${encodeURIComponent(classId)}`;

  if (!isOpen || !activeQuestion) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950 text-white flex flex-col overflow-hidden select-none font-sans">
      {/* Top PID Bar */}
      <header className="px-6 py-3.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between shrink-0 shadow-lg">
        {/* Quiz Info */}
        <div className="flex items-center gap-4 min-w-0">
          <div className="px-3.5 py-1.5 rounded-2xl bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 font-black text-xs sm:text-sm flex items-center gap-2 shrink-0">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span>MODE KERTAS PID</span>
          </div>
          <div className="min-w-0 truncate">
            <h1 className="text-lg sm:text-xl font-black tracking-tight text-white leading-tight truncate">
              {quiz.title}
            </h1>
            <p className="text-xs font-semibold text-slate-400">
              {activeClass?.name || 'Kelas'} • Soal{' '}
              <strong className="text-indigo-400 font-bold">
                {currentQuestionIndex + 1}
              </strong>{' '}
              dari {quiz.questions.length}
            </p>
          </div>
        </div>

        {/* Live Answer Status & Controls */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Answered Counter */}
          <div className="px-3.5 py-1.5 rounded-2xl bg-slate-800/90 border border-slate-700 flex items-center gap-3">
            <Users className="w-4 h-4 text-emerald-400" />
            <div className="text-right">
              <div className="text-xs sm:text-sm font-black text-white leading-none flex items-center gap-1.5 justify-end">
                <span>{answeredCount} / {classStudents.length}</span>
                {isLocked ? (
                  <span className="px-1.5 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 text-[9px] font-bold">
                    Terkunci
                  </span>
                ) : (
                  <span className="px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[9px] font-bold">
                    Merekam
                  </span>
                )}
              </div>
              <div className="text-[10px] font-bold text-slate-400">Siswa Menjawab</div>
            </div>
            {/* Progress bar */}
            <div className="w-14 sm:w-16 h-2 bg-slate-700 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all duration-300 rounded-full"
                style={{
                  width: `${
                    classStudents.length > 0 ? (answeredCount / classStudents.length) * 100 : 0
                  }%`,
                }}
              />
            </div>
          </div>

          {/* QR Code Connect Mobile Button (Opsional) */}
          <button
            type="button"
            onClick={() => setShowQrModal(true)}
            title="Hubungkan HP sebagai Remote Tambahan (Opsional)"
            className="hidden md:flex px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-indigo-300 border border-indigo-500/30 font-bold text-xs items-center gap-1.5 transition-all cursor-pointer"
          >
            <QrCode className="w-4 h-4 text-indigo-400" />
            <span>HP Remote (Opsional)</span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors cursor-pointer"
            title="Layar Penuh PID"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/60 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Tutup Sesi Kuis"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Unified PID Screen: Left Question Display, Right Camera & Student Live Responses */}
      <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        {/* Left Area: Large Question & Options for Class (60-65% width) - Fixed presentation without container scrolling */}
        <div className="flex-1 flex flex-col p-4 sm:p-6 lg:p-7 overflow-hidden space-y-3 sm:space-y-4 min-h-0 justify-between">
          {/* Question Prompt */}
          <div className="bg-slate-900/90 border border-slate-800 p-4 sm:p-5 lg:p-6 rounded-3xl shadow-xl space-y-2.5 shrink-0">
            <div className="flex items-center justify-between">
              <span className="px-3 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 font-black text-xs sm:text-sm border border-indigo-500/30">
                Pertanyaan #{currentQuestionIndex + 1}
              </span>
              {isLocked && (
                <span className="px-3 py-1 rounded-xl bg-rose-500/20 text-rose-300 font-bold text-xs flex items-center gap-1.5 border border-rose-500/30">
                  <Lock className="w-3.5 h-3.5" />
                  Jawaban Dikunci
                </span>
              )}
            </div>

            <div className="text-xl sm:text-2xl lg:text-3xl font-extrabold text-white leading-snug tracking-wide max-h-[28vh] overflow-y-auto pr-1 [&_img]:max-h-28 sm:[&_img]:max-h-36 [&_img]:object-contain">
              <RichQuestionPrompt text={activeQuestion.prompt} fallbackImageUrl={activeQuestion.imageUrl} theme="dark" />
            </div>
          </div>

          {/* Options Grid (A, B, C, D) - 2x2 grid that fills available height evenly */}
          <div className="grid grid-cols-1 sm:grid-cols-2 grid-rows-2 gap-3 sm:gap-4 flex-1 min-h-0">
            {(['A', 'B', 'C', 'D'] as const).map((letter, optIdx) => {
              const optionText = activeQuestion.options?.[optIdx] || '';
              const isCorrectAnswerKey =
                activeQuestion.correctOptionIndex !== undefined &&
                activeQuestion.correctOptionIndex === optIdx;

              const themeStyles = {
                A: {
                  badge: 'bg-rose-500 text-white',
                  border: 'border-rose-500/30 hover:border-rose-500/60',
                  bg: 'bg-rose-950/20',
                },
                B: {
                  badge: 'bg-blue-500 text-white',
                  border: 'border-blue-500/30 hover:border-blue-500/60',
                  bg: 'bg-blue-950/20',
                },
                C: {
                  badge: 'bg-amber-500 text-slate-950',
                  border: 'border-amber-500/30 hover:border-amber-500/60',
                  bg: 'bg-amber-950/20',
                },
                D: {
                  badge: 'bg-emerald-500 text-white',
                  border: 'border-emerald-500/30 hover:border-emerald-500/60',
                  bg: 'bg-emerald-950/20',
                },
              }[letter];

              const count = optionStats[letter] || 0;
              const percent = answeredCount > 0 ? Math.round((count / answeredCount) * 100) : 0;
              const isHighlightedCorrect = showCorrectAnswer && isCorrectAnswerKey;
              const isDimmed = showCorrectAnswer && !isCorrectAnswerKey;

              return (
                <div
                  key={letter}
                  className={`p-3.5 sm:p-4 lg:p-5 rounded-2xl sm:rounded-3xl border-2 transition-all relative flex flex-col justify-between h-full overflow-hidden ${
                    isHighlightedCorrect
                      ? 'bg-emerald-950/70 border-emerald-400 ring-4 ring-emerald-400/30 shadow-2xl scale-[1.01]'
                      : isDimmed
                      ? 'bg-slate-900/40 border-slate-800/60 opacity-40'
                      : `${themeStyles.bg} ${themeStyles.border}`
                  }`}
                >
                  <div className="flex items-start gap-3 sm:gap-4 overflow-hidden">
                    <span
                      className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl font-black text-lg sm:text-xl flex items-center justify-center shrink-0 shadow-lg ${
                        isHighlightedCorrect ? 'bg-emerald-400 text-slate-950' : themeStyles.badge
                      }`}
                    >
                      {letter}
                    </span>
                    <div className="flex-1 text-base sm:text-lg lg:text-xl font-bold text-white pt-1 leading-snug break-words overflow-hidden">
                      <LatexRenderer content={optionText} />
                    </div>
                  </div>

                  {/* Live Stats bar when answer revealed */}
                  {showLiveStats && (
                    <div className="mt-2 pt-2 border-t border-white/10 flex items-center justify-between text-xs shrink-0">
                      <div className="flex-1 mr-3">
                        <div className="w-full h-2.5 bg-white/10 rounded-full overflow-hidden">
                          <div
                            className={`h-full transition-all duration-500 rounded-full ${
                              isHighlightedCorrect ? 'bg-emerald-400' : 'bg-white/40'
                            }`}
                            style={{ width: `${percent}%` }}
                          />
                        </div>
                      </div>
                      <span className="font-mono font-black text-xs sm:text-sm text-white">
                        {count} Siswa ({percent}%)
                      </span>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Explanation (Pembahasan) when answer revealed - Compact banner that never overflows */}
          {showCorrectAnswer && activeQuestion.explanation && (
            <div className="p-3 sm:p-4 bg-indigo-950/80 border border-indigo-500/40 rounded-2xl space-y-1 shrink-0 max-h-[16vh] overflow-y-auto shadow-lg">
              <div className="flex items-center gap-2 text-indigo-300 font-extrabold text-xs sm:text-sm">
                <Sparkles className="w-4 h-4 text-amber-300 shrink-0" />
                <span>Pembahasan Kunci Jawaban:</span>
              </div>
              <div className="text-xs sm:text-sm text-indigo-100 leading-relaxed font-medium">
                <LatexRenderer content={activeQuestion.explanation} />
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar: Live PID Camera Feed + Student Roster Grid (35-40% width) */}
        <div className="w-full lg:w-[420px] xl:w-[460px] border-t lg:border-t-0 lg:border-l border-slate-800 bg-slate-900/80 flex flex-col shrink-0 overflow-hidden">
          {/* PID CAMERA SECTION */}
          <div className="p-4 border-b border-slate-800 bg-slate-900 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className={`w-2.5 h-2.5 rounded-full ${isCameraActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}`} />
                <span className="text-xs font-black uppercase tracking-wider text-slate-200">
                  Kamera Pemindai PID
                </span>
              </div>

              {/* Camera Controls */}
              <div className="flex items-center gap-2">
                {/* Device Selector */}
                {videoDevices.length > 1 && (
                  <select
                    value={selectedDeviceId}
                    onChange={(e) => setSelectedDeviceId(e.target.value)}
                    className="px-2 py-1 bg-slate-800 border border-slate-700 text-[11px] font-bold rounded-lg text-slate-300 focus:outline-none"
                    title="Pilih Kamera"
                  >
                    {videoDevices.map((d, i) => (
                      <option key={d.deviceId || i} value={d.deviceId}>
                        {d.label || `Kamera ${i + 1}`}
                      </option>
                    ))}
                  </select>
                )}

                {/* Sound Toggle */}
                <button
                  type="button"
                  onClick={() => setSoundEnabled(!soundEnabled)}
                  className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                    soundEnabled ? 'bg-slate-800 text-indigo-300 border-indigo-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'
                  }`}
                  title={soundEnabled ? 'Suara Deteksi Aktif' : 'Suara Deteksi Dibisukan'}
                >
                  {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </button>

                {/* Camera Toggle */}
                <button
                  type="button"
                  onClick={() => setIsCameraActive(!isCameraActive)}
                  className={`p-1.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                    isCameraActive ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' : 'bg-rose-500/20 text-rose-300 border-rose-500/40'
                  }`}
                  title={isCameraActive ? 'Jeda Kamera PID' : 'Aktifkan Kamera PID'}
                >
                  {isCameraActive ? <Camera className="w-4 h-4" /> : <CameraOff className="w-4 h-4" />}
                </button>

                {/* Maximize Camera Viewport Button */}
                <button
                  type="button"
                  onClick={() => setIsCameraMaximized(true)}
                  className="px-2 py-1.5 rounded-lg border text-xs cursor-pointer transition-all bg-emerald-600 hover:bg-emerald-500 text-white font-bold flex items-center gap-1 shadow-xs"
                  title="Perbesar Tampilan Kamera (Layar Penuh ke Seluruh Murid)"
                >
                  <Maximize2 className="w-3.5 h-3.5" />
                  <span className="text-[11px]">Perbesar</span>
                </button>
              </div>
            </div>

            {/* Live Camera Viewport - Seamlessly expands to full screen overlay when maximized */}
            <div
              className={
                isCameraMaximized
                  ? 'fixed inset-0 z-[60] bg-black flex flex-col justify-between overflow-hidden select-none'
                  : 'relative aspect-video rounded-2xl overflow-hidden bg-black border border-slate-700 shadow-inner flex items-center justify-center'
              }
            >
              {/* Maximized Mode: Top Overlay Bar */}
              {isCameraMaximized && (
                <div className="absolute top-0 left-0 right-0 z-30 px-5 py-3.5 bg-slate-900/90 backdrop-blur-md border-b border-slate-800 flex items-center justify-between shadow-2xl">
                  <div className="flex items-center gap-3">
                    <span className="w-3 h-3 rounded-full bg-emerald-400 animate-pulse" />
                    <div>
                      <h3 className="text-sm font-black text-white leading-tight">
                        Kamera Pemindai PID (Layar Penuh)
                      </h3>
                      <p className="text-[11px] text-slate-400">
                        Memindai seluruh kelas secara langsung
                      </p>
                    </div>
                    <span className="ml-2 px-3 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 font-bold text-xs border border-indigo-500/30">
                      Soal #{currentQuestionIndex + 1} / {quiz.questions.length}
                    </span>
                    <span className="px-3 py-1 rounded-xl bg-emerald-500/20 text-emerald-300 font-bold text-xs border border-emerald-500/30">
                      <strong>{answeredCount}</strong> / {classStudents.length} Siswa Menjawab
                    </span>
                  </div>

                  <div className="flex items-center gap-2.5">
                    {videoDevices.length > 1 && (
                      <select
                        value={selectedDeviceId}
                        onChange={(e) => setSelectedDeviceId(e.target.value)}
                        className="px-2.5 py-1.5 bg-slate-800 border border-slate-700 text-xs font-bold rounded-xl text-slate-200 focus:outline-none"
                      >
                        {videoDevices.map((d, i) => (
                          <option key={d.deviceId || i} value={d.deviceId}>
                            {d.label || `Kamera ${i + 1}`}
                          </option>
                        ))}
                      </select>
                    )}

                    <button
                      type="button"
                      onClick={() => setSoundEnabled(!soundEnabled)}
                      className={`p-2 rounded-xl border text-xs cursor-pointer transition-colors ${
                        soundEnabled ? 'bg-slate-800 text-indigo-300 border-indigo-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'
                      }`}
                      title={soundEnabled ? 'Suara Deteksi Aktif' : 'Suara Deteksi Dibisukan'}
                    >
                      {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                    </button>

                    {/* Toggle Daftar Siswa in Maximized Mode */}
                    <button
                      type="button"
                      onClick={() => setShowMaximizedRoster((prev) => !prev)}
                      className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors ${
                        showMaximizedRoster
                          ? 'bg-indigo-600 border-indigo-400 text-white shadow-xs'
                          : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
                      }`}
                      title="Tampilkan / Sembunyikan Daftar Siswa di Sebelah Kanan"
                    >
                      <Users className="w-3.5 h-3.5 text-indigo-300" />
                      <span>Daftar Siswa ({answeredCount}/{classStudents.length})</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setIsCameraMaximized(false)}
                      className="px-4 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg transition-transform active:scale-95 cursor-pointer"
                      title="Kembalikan Tampilan Normal"
                    >
                      <Minimize2 className="w-4 h-4" />
                      <span>Perkecil Tampilan</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Maximized Mode: Floating Center Detection Banner */}
              {isCameraMaximized && (
                <div className="absolute top-18 left-1/2 -translate-x-1/2 pointer-events-none z-20">
                  <div className="px-4 py-1.5 rounded-full bg-slate-950/85 border border-emerald-500/50 backdrop-blur-md flex items-center gap-2 shadow-xl">
                    {visibleMarkersCount > 0 ? (
                      <>
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping" />
                        <span className="text-xs font-black text-emerald-300">
                          ✓ {visibleMarkersCount} Kartu Jawaban Terdeteksi Sekaligus
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="w-2 h-2 rounded-full bg-slate-400" />
                        <span className="text-xs font-bold text-slate-300">
                          Arahkan kamera ke arah murid di kelas...
                        </span>
                      </>
                    )}
                  </div>
                </div>
              )}

              {/* Normal Mode: Quick Maximize Button inside preview */}
              {!isCameraMaximized && isCameraActive && (
                <button
                  type="button"
                  onClick={() => setIsCameraMaximized(true)}
                  className="absolute top-2 right-2 px-2 py-1 rounded-lg bg-black/75 hover:bg-black/95 text-white border border-white/20 text-xs font-bold backdrop-blur-md cursor-pointer transition-all flex items-center gap-1.5 shadow-lg z-20 group"
                  title="Perbesar Kamera ke Layar Penuh"
                >
                  <Maximize2 className="w-3.5 h-3.5 text-emerald-400 group-hover:scale-110 transition-transform" />
                  <span className="text-[10px]">Perbesar</span>
                </button>
              )}

              {isCameraActive ? (
                <>
                  <video
                    ref={videoRef}
                    playsInline
                    muted
                    autoPlay
                    className="w-full h-full object-cover"
                  />
                  <canvas
                    ref={canvasRef}
                    className="absolute inset-0 w-full h-full pointer-events-none"
                  />

                  {/* Normal Mode Floating detection overlay badge */}
                  {!isCameraMaximized && (
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
                      <span className="px-2 py-1 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-black text-emerald-400 border border-emerald-500/30">
                        {visibleMarkersCount > 0
                          ? `✓ ${visibleMarkersCount} Kartu Terdeteksi`
                          : 'Mengarahkan ke kelas...'}
                      </span>
                      <span className="px-2 py-1 rounded-md bg-black/70 backdrop-blur-md text-[10px] font-bold text-slate-300 border border-slate-700">
                        Auto-Scan
                      </span>
                    </div>
                  )}
                </>
              ) : (
                <div className="p-4 text-center space-y-2">
                  <CameraOff className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-xs font-bold text-slate-400">Kamera PID sedang dijeda</p>
                  <button
                    type="button"
                    onClick={() => setIsCameraActive(true)}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs cursor-pointer shadow-md"
                  >
                    Nyalakan Kamera
                  </button>
                </div>
              )}

              {/* Camera Error Banner */}
              {cameraError && isCameraActive && (
                <div className="absolute inset-0 p-4 bg-slate-950/90 flex flex-col items-center justify-center text-center space-y-2 z-10">
                  <AlertCircle className="w-8 h-8 text-amber-400" />
                  <p className="text-xs text-amber-200 font-medium">{cameraError}</p>
                  <button
                    type="button"
                    onClick={startCamera}
                    className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs cursor-pointer shadow-md"
                  >
                    Coba Hubungkan Lagi
                  </button>
                </div>
              )}

              {/* Maximized Mode: Bottom Floating Control Toolbar */}
              {isCameraMaximized && (
                <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2.5 px-5 py-3 rounded-2xl bg-slate-900/90 border border-slate-700/80 backdrop-blur-xl shadow-2xl">
                  {/* Prev Question */}
                  <button
                    type="button"
                    disabled={currentQuestionIndex === 0}
                    onClick={() => handleGoToQuestion(currentQuestionIndex - 1)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span className="hidden sm:inline">Sebelumnya</span>
                  </button>

                  <span className="px-2 text-xs font-mono font-bold text-slate-300">
                    Soal {currentQuestionIndex + 1} / {quiz.questions.length}
                  </span>

                  {/* Next Question */}
                  <button
                    type="button"
                    disabled={currentQuestionIndex >= quiz.questions.length - 1}
                    onClick={() => handleGoToQuestion(currentQuestionIndex + 1)}
                    className="px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <span className="hidden sm:inline">Berikutnya</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>

                  <div className="w-px h-6 bg-slate-700 mx-1" />

                  {/* Lock Toggle */}
                  <button
                    type="button"
                    onClick={handleToggleLock}
                    className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors ${
                      isLocked
                        ? 'bg-rose-600 hover:bg-rose-700 text-white'
                        : 'bg-slate-800 hover:bg-slate-700 text-emerald-400'
                    }`}
                  >
                    {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
                    <span>{isLocked ? 'Terkunci' : 'Kunci Jawaban'}</span>
                  </button>

                  {/* Reveal Answer */}
                  <button
                    type="button"
                    onClick={handleToggleReveal}
                    className={`px-3.5 py-2 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors ${
                      showCorrectAnswer
                        ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    {showCorrectAnswer ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    <span>{showCorrectAnswer ? 'Tutup Kunci' : 'Tampilkan Jawaban'}</span>
                  </button>

                  <div className="w-px h-6 bg-slate-700 mx-1" />

                  {/* Minimize Button */}
                  <button
                    type="button"
                    onClick={() => setIsCameraMaximized(false)}
                    className="px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 font-black text-xs flex items-center gap-1.5 cursor-pointer shadow-md transition-transform active:scale-95"
                  >
                    <Minimize2 className="w-4 h-4" />
                    <span>Perkecil</span>
                  </button>
                </div>
              )}

              {/* Arrow Toggle Button on the Right Edge (to show student list when hidden) */}
              {isCameraMaximized && !showMaximizedRoster && (
                <button
                  type="button"
                  onClick={() => setShowMaximizedRoster(true)}
                  className="absolute top-1/2 -translate-y-1/2 right-0 z-40 flex items-center gap-2 pl-3.5 pr-2.5 py-3.5 rounded-l-2xl bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs shadow-2xl backdrop-blur-md border-y border-l border-indigo-400/50 cursor-pointer transition-all hover:pl-4.5 group"
                  title="Klik panah untuk Menampilkan Daftar Siswa"
                >
                  <ChevronLeft className="w-5 h-5 text-indigo-200 group-hover:-translate-x-1 transition-transform animate-pulse" />
                  <div className="flex flex-col items-start leading-tight">
                    <span className="text-[11px] font-black tracking-wide">Daftar Siswa</span>
                    <span className="text-[10px] text-indigo-200 font-mono font-bold">
                      {answeredCount}/{classStudents.length}
                    </span>
                  </div>
                </button>
              )}

              {/* Slide-out Student List Drawer in Maximized Mode */}
              {isCameraMaximized && (
                <div
                  className={`absolute top-0 bottom-0 right-0 z-40 w-80 sm:w-96 bg-slate-900/95 backdrop-blur-xl border-l border-slate-700/80 shadow-2xl flex flex-col transition-transform duration-300 ease-in-out ${
                    showMaximizedRoster ? 'translate-x-0' : 'translate-x-full pointer-events-none'
                  }`}
                >
                  {/* Arrow button attached to the left edge of the drawer to slide it back out */}
                  <button
                    type="button"
                    onClick={() => setShowMaximizedRoster(false)}
                    className="absolute top-1/2 -translate-y-1/2 -left-10 px-2.5 py-4 rounded-l-2xl bg-slate-800/95 hover:bg-slate-700 text-slate-300 hover:text-white border-y border-l border-slate-700 shadow-xl cursor-pointer transition-colors flex items-center justify-center group pointer-events-auto"
                    title="Sembunyikan Daftar Siswa (Slide Tutup)"
                  >
                    <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                  </button>

                  {/* Drawer Header */}
                  <div className="p-4 border-b border-slate-800 bg-slate-900/90 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center border border-indigo-500/30">
                        <Users className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-xs font-black uppercase tracking-wider text-white">
                          Daftar Respon Siswa
                        </h4>
                        <p className="text-[10px] text-slate-400">
                          <strong className="text-emerald-400 font-bold">{answeredCount}</strong> dari {classStudents.length} sudah menjawab
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => setShowMaximizedRoster(false)}
                      className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer transition-colors flex items-center gap-1 text-xs"
                      title="Tutup Panel Siswa"
                    >
                      <span className="text-[10px] font-bold">Tutup</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Drawer Student Grid */}
                  <div className="flex-1 p-3 overflow-y-auto grid grid-cols-2 gap-2 content-start">
                    {classStudents.map((st, index) => {
                      const markerId = st.absentNumber && st.absentNumber > 0 ? st.absentNumber : index + 1;
                      const hasAnswered = Boolean(
                        currentAnswers[st.uid] ||
                        ((st as any).id && currentAnswers[(st as any).id]) ||
                        currentAnswers[`marker_${markerId}`] ||
                        currentAnswers[markerId] ||
                        Object.values(currentAnswers).some(
                          (a) => a && (a.markerId === markerId || a.studentId === st.uid || ((st as any).id && a.studentId === (st as any).id))
                        )
                      );
                      const isJustUpdated =
                        recentlyChangedStudentId === st.uid ||
                        recentlyChangedStudentId === `marker_${markerId}` ||
                        recentlyChangedStudentId === String(markerId);

                      return (
                        <div
                          key={st.uid}
                          className={`p-2.5 rounded-2xl border transition-all duration-300 flex items-center gap-2 ${
                            isJustUpdated
                              ? 'bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-xl ring-2 ring-cyan-400/40 animate-pulse'
                              : hasAnswered
                              ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200 shadow-md ring-2 ring-emerald-400/20'
                              : 'bg-slate-900/80 border-slate-800 text-slate-400'
                          }`}
                        >
                          <div
                            className={`w-7 h-7 rounded-xl font-mono font-black text-xs flex items-center justify-center shrink-0 transition-colors ${
                              isJustUpdated
                                ? 'bg-cyan-400 text-slate-950'
                                : hasAnswered
                                ? 'bg-emerald-400 text-slate-950'
                                : 'bg-slate-800 text-slate-400'
                            }`}
                          >
                            {isJustUpdated ? (
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                            ) : hasAnswered ? (
                              <CheckCircle2 className="w-4 h-4" />
                            ) : (
                              st.absentNumber ?? index + 1
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold truncate text-white leading-tight">
                              {st.displayName}
                            </p>
                            <p className="text-[10px] text-slate-400 truncate">
                              {hasAnswered ? (
                                <span className="text-emerald-400 font-extrabold flex items-center gap-0.5">
                                  ✓ Terekam
                                </span>
                              ) : (
                                `#Marker ${markerId}`
                              )}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* STUDENT ROSTER SECTION */}
          <div className="p-3 border-b border-slate-800 flex flex-col gap-1 bg-slate-900">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                Daftar Respon Siswa ({answeredCount}/{classStudents.length})
              </span>
              {isLocked ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Jawaban Terkunci
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Merekam Kartu Murid
                </span>
              )}
            </div>
          </div>

          {/* Student Grid (Scrollable) */}
          <div className="flex-1 p-3 overflow-y-auto grid grid-cols-2 gap-2 content-start">
            {classStudents.map((st, index) => {
              const markerId = st.absentNumber && st.absentNumber > 0 ? st.absentNumber : index + 1;
              const hasAnswered = Boolean(
                currentAnswers[st.uid] ||
                ((st as any).id && currentAnswers[(st as any).id]) ||
                currentAnswers[`marker_${markerId}`] ||
                currentAnswers[markerId] ||
                Object.values(currentAnswers).some(
                  (a) => a && (a.markerId === markerId || a.studentId === st.uid || ((st as any).id && a.studentId === (st as any).id))
                )
              );
              const isJustUpdated =
                recentlyChangedStudentId === st.uid ||
                recentlyChangedStudentId === `marker_${markerId}` ||
                recentlyChangedStudentId === String(markerId);

              return (
                <div
                  key={st.uid}
                  className={`p-2.5 rounded-2xl border transition-all duration-300 flex items-center gap-2 ${
                    isJustUpdated
                      ? 'bg-cyan-950/90 border-cyan-400 text-cyan-200 shadow-xl ring-2 ring-cyan-400/40 animate-pulse'
                      : hasAnswered
                      ? 'bg-emerald-950/80 border-emerald-400 text-emerald-200 shadow-md ring-2 ring-emerald-400/20'
                      : 'bg-slate-900/80 border-slate-800 text-slate-400'
                  }`}
                >
                  <div
                    className={`w-7 h-7 rounded-xl font-mono font-black text-xs flex items-center justify-center shrink-0 transition-colors ${
                      isJustUpdated
                        ? 'bg-cyan-400 text-slate-950'
                        : hasAnswered
                        ? 'bg-emerald-400 text-slate-950'
                        : 'bg-slate-800 text-slate-400'
                    }`}
                  >
                    {isJustUpdated ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : hasAnswered ? (
                      <CheckCircle2 className="w-4 h-4" />
                    ) : (
                      st.absentNumber ?? index + 1
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-bold truncate text-white leading-tight">
                      {st.displayName}
                    </p>
                    <p className="text-[10px] text-slate-400 truncate">
                      {hasAnswered ? (
                        <span className="text-emerald-400 font-extrabold flex items-center gap-0.5">
                          ✓ Terekam
                        </span>
                      ) : (
                        `#Marker ${markerId}`
                      )}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Bottom Touch Control Toolbar for PID */}
      <footer className="px-6 py-4 bg-slate-900 border-t border-slate-800 flex items-center justify-between shrink-0 shadow-2xl gap-3">
        {/* Question Nav */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            disabled={currentQuestionIndex === 0}
            onClick={() => handleGoToQuestion(currentQuestionIndex - 1)}
            className="h-12 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white font-black text-sm flex items-center gap-2 transition-all cursor-pointer shadow-md active:scale-95"
          >
            <ChevronLeft className="w-5 h-5" />
            <span className="hidden sm:inline">Soal Sebelumnya</span>
          </button>

          <span className="px-3 text-sm font-black text-slate-300">
            {currentQuestionIndex + 1} / {quiz.questions.length}
          </span>

          <button
            type="button"
            disabled={currentQuestionIndex >= quiz.questions.length - 1}
            onClick={() => handleGoToQuestion(currentQuestionIndex + 1)}
            className="h-12 px-5 rounded-2xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white font-black text-sm flex items-center gap-2 transition-all cursor-pointer shadow-md active:scale-95"
          >
            <span className="hidden sm:inline">Soal Berikutnya</span>
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Central Controls: Lock & Reveal Answer */}
        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={handleToggleLock}
            className={`h-12 px-5 rounded-2xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer active:scale-95 shadow-md ${
              isLocked
                ? 'bg-rose-600 hover:bg-rose-700 text-white ring-2 ring-rose-400/40'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700'
            }`}
          >
            {isLocked ? <Lock className="w-5 h-5" /> : <Unlock className="w-5 h-5" />}
            <span>{isLocked ? 'Buka Kunci' : 'Kunci Jawaban'}</span>
          </button>

          <button
            type="button"
            onClick={handleToggleReveal}
            className={`h-12 px-5 rounded-2xl font-black text-sm flex items-center gap-2 transition-all cursor-pointer active:scale-95 shadow-lg ${
              showCorrectAnswer
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white ring-2 ring-emerald-400/40'
                : 'bg-indigo-600 hover:bg-indigo-700 text-white'
            }`}
          >
            {showCorrectAnswer ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            <span>{showCorrectAnswer ? 'Sembunyikan Kunci' : 'Tampilkan Jawaban & Grafik'}</span>
          </button>
        </div>

        {/* End Quiz & Show Analytics */}
        <div>
          <button
            type="button"
            onClick={handleFinish}
            className="h-12 px-5 sm:px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-amber-500 to-orange-500 hover:opacity-95 text-slate-950 font-black text-sm flex items-center gap-2 shadow-xl shadow-amber-500/20 transition-all cursor-pointer active:scale-95"
          >
            <BarChart2 className="w-5 h-5" />
            <span className="hidden sm:inline">Selesaikan Kuis & Nilai</span>
            <span className="sm:hidden">Selesai</span>
          </button>
        </div>
      </footer>

      {/* QR Code Modal for Mobile Phone Scanner (Opsional) */}
      {showQrModal && (
        <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 p-6 rounded-3xl max-w-sm w-full text-center space-y-4 shadow-2xl">
            <div className="flex justify-between items-center">
              <h3 className="text-base font-black text-white flex items-center gap-2">
                <QrCode className="w-5 h-5 text-indigo-400" />
                Pindai dengan Ponsel Guru
              </h3>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Jika Anda ingin berjalan ke baris belakang kelas sambil memindai dengan HP,
              pindai kode QR di bawah:
            </p>

            <div className="p-4 bg-white rounded-2xl inline-block shadow-inner mx-auto">
              <QRCodeSVG value={scannerUrl} size={180} level="M" />
            </div>

            <button
              type="button"
              onClick={() => setShowQrModal(false)}
              className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
