import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Camera,
  RotateCcw,
  Volume2,
  VolumeX,
  X,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Lock,
  Unlock,
  Eye,
  EyeOff,
  SwitchCamera,
  AlertCircle,
  Users,
  Image as ImageIcon,
  HelpCircle,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  ChevronDown,
  ChevronUp,
  Sparkles,
  BarChart2,
  Maximize2,
  Minimize2,
} from 'lucide-react';
import { PaperAnalyticsModal } from './PaperAnalyticsModal';
import jsAruco2 from 'js-aruco2';
import { Quiz, User } from '../../../../types';
import { PaperModeAnswer, PaperModeSession, PaperOption } from '../../../../types/paperMode';
import { useApp } from '../../../../context/AppContext';
import { getMarkerOrientation } from '../../../../utils/aruco';
import { submitPaperAnswer, submitPaperAnswersBatch, controlPaperSession } from '../../../../lib/firestoreSync';
import { LatexRenderer } from '../../../../utils/latex';
import { RichQuestionPrompt } from '../../../common/RichQuestionPrompt';

interface PaperScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  quiz: Quiz;
  classId: string;
  initialQuestionIndex?: number;
  onFinish?: (session: PaperModeSession) => void;
}

export const PaperScannerModal: React.FC<PaperScannerModalProps> = ({
  isOpen,
  onClose,
  quiz,
  classId,
  initialQuestionIndex = 0,
  onFinish,
}) => {
  const { users = [], classes = [] } = useApp();

  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(initialQuestionIndex);
  const [isLocked, setIsLocked] = useState(false);
  const [showCorrectAnswer, setShowCorrectAnswer] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [errorType, setErrorType] = useState<'permission_denied' | 'insecure_context' | 'not_found' | 'generic'>('generic');
  const [showHelpSteps, setShowHelpSteps] = useState(false);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [photoToast, setPhotoToast] = useState<string | null>(null);
  const [showStudentList, setShowStudentList] = useState(true);
  const [showQuestionOverlay, setShowQuestionOverlay] = useState(false);
  const [visibleMarkersCount, setVisibleMarkersCount] = useState(0);
  const [isCameraMaximized, setIsCameraMaximized] = useState(false);

  const [recentDetections, setRecentDetections] = useState<
    {
      studentName: string;
      option: PaperOption;
      prevOption?: PaperOption;
      isChange?: boolean;
      timestamp: number;
    }[]
  >([]);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const sessionId = useMemo(() => `paper_${quiz.id}_${classId}`, [quiz.id, classId]);

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

  // Map absentNumber/markerId to student
  const studentByMarkerId = useMemo(() => {
    const map = new Map<number, User>();
    // First map all students by absentNumber as base fallback
    users.filter((u) => u.role === 'student').forEach((st) => {
      const num = Number(st.absentNumber);
      if (!isNaN(num) && num > 0) {
        map.set(num, st);
      }
    });
    // Then prioritize active class students
    classStudents.forEach((st, idx) => {
      const num = Number(st.absentNumber);
      const markerId = !isNaN(num) && num > 0 ? num : idx + 1;
      map.set(markerId, st);
    });
    return map;
  }, [classStudents, users]);

  // Cache answered students for current question
  const answeredStudentsRef = useRef<Record<string, PaperOption>>({});
  // Candidate rotation debouncer to avoid capturing intermediate rotations
  const candidateChangesRef = useRef<Record<string, { option: PaperOption; count: number }>>({});
  const [answeredCount, setAnsweredCount] = useState(0);
  const [showAnalytics, setShowAnalytics] = useState(false);
  const [finalSession, setFinalSession] = useState<PaperModeSession | null>(null);
  const latestSessionRef = useRef<PaperModeSession | null>(null);

  // Play subtle beep sound on new detection
  const playBeep = () => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // High pitch A5
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } catch {}
  };

  // Play distinctive rising chime when student changes their answer
  const playChangeSound = () => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(650, now);
      osc.frequency.exponentialRampToValueAtTime(1050, now + 0.18);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.2);
    } catch {}
  };

  // Sync session state from server
  useEffect(() => {
    if (!isOpen) return;

    const loadSession = async () => {
      try {
        const res = await fetch(`/api/collections/paperSessions/${encodeURIComponent(sessionId)}`);
        if (res.ok) {
          const s: PaperModeSession = await res.json();
          if (s && s.id) {
            latestSessionRef.current = s;
            setCurrentQuestionIndex(s.currentQuestionIndex ?? 0);
            setIsLocked(s.status === 'question_closed');
            setShowCorrectAnswer(Boolean(s.showCorrectAnswer));

            const answers = s.answersByQuestion?.[s.currentQuestionIndex ?? 0] || {};
            const map: Record<string, PaperOption> = {};
            Object.values(answers).forEach((a) => {
              map[a.studentId] = a.selectedOption;
            });
            answeredStudentsRef.current = map;
            setAnsweredCount(Object.keys(map).length);
          }
        }
      } catch {}
    };

    loadSession();
    const interval = setInterval(loadSession, 2000);

    // Instant SSE Events
    const handlePaperControl = (e: any) => {
      const payload = e.detail;
      if (payload && payload.sessionId === sessionId && payload.session) {
        const s = payload.session;
        latestSessionRef.current = s;
        if (s.currentQuestionIndex !== undefined) setCurrentQuestionIndex(s.currentQuestionIndex);
        if (s.status !== undefined) setIsLocked(s.status === 'question_closed');
        if (s.showCorrectAnswer !== undefined) setShowCorrectAnswer(Boolean(s.showCorrectAnswer));
        if (s.answersByQuestion) {
          const qAnswers = s.answersByQuestion[s.currentQuestionIndex ?? currentQuestionIndex] || {};
          const map: Record<string, PaperOption> = {};
          Object.values(qAnswers).forEach((a: any) => {
            map[a.studentId] = a.selectedOption;
          });
          answeredStudentsRef.current = map;
          setAnsweredCount(Object.keys(map).length);
        }
      }
    };

    const handlePaperAnswer = (e: any) => {
      const payload = e.detail;
      if (payload && payload.sessionId === sessionId && payload.questionIndex === currentQuestionIndex) {
        if (payload.answer?.studentId && payload.answer?.selectedOption) {
          answeredStudentsRef.current[payload.answer.studentId] = payload.answer.selectedOption;
          setAnsweredCount(Object.keys(answeredStudentsRef.current).length);
        }
      }
    };

    window.addEventListener('paper_control', handlePaperControl);
    window.addEventListener('paper_answer', handlePaperAnswer);

    return () => {
      clearInterval(interval);
      window.removeEventListener('paper_control', handlePaperControl);
      window.removeEventListener('paper_answer', handlePaperAnswer);
    };
  }, [isOpen, sessionId, currentQuestionIndex]);

  // Start Camera Stream
  const startCamera = async () => {
    setCameraError(null);

    // 1. Check Secure Context (HTTPS or localhost)
    const isLocalhost =
      typeof window !== 'undefined' &&
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
    const isSecure = typeof window !== 'undefined' && (window.isSecureContext || isLocalhost);

    if (!isSecure && !isLocalhost) {
      setErrorType('insecure_context');
      setCameraError(
        `Peramban memblokir streaming kamera langsung karena diakses melalui HTTP biasa (non-HTTPS: http://${window.location.hostname}:4000).`
      );
      return;
    }

    if (!navigator?.mediaDevices?.getUserMedia) {
      setErrorType('insecure_context');
      setCameraError('Fitur streaming kamera navigator.mediaDevices tidak tersedia di peramban ini.');
      return;
    }

    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
      }

      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode,
            width: { ideal: 1920, min: 1280 },
            height: { ideal: 1080, min: 720 },
          },
          audio: false,
        });
      } catch (err: any) {
        // Fallback for laptop webcams that don't support facingMode constraint
        stream = await navigator.mediaDevices.getUserMedia({
          video: {
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
      }

      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }
      setCameraError(null);
    } catch (err: any) {
      console.warn('getUserMedia error:', err);
      if (
        err.name === 'NotAllowedError' ||
        err.name === 'PermissionDeniedError' ||
        err.message?.toLowerCase().includes('permission') ||
        err.message?.toLowerCase().includes('denied')
      ) {
        setErrorType('permission_denied');
        setCameraError(
          'Izin akses kamera telah ditolak oleh peramban. Silakan aktifkan izin kamera di pengaturan peramban.'
        );
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorType('not_found');
        setCameraError('Kamera tidak ditemukan pada perangkat ini.');
      } else {
        setErrorType('generic');
        setCameraError(err.message || 'Gagal menyalakan kamera.');
      }
    }
  };

  useEffect(() => {
    if (!isOpen) return;
    startCamera();

    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [isOpen, facingMode]);

  // Real-time Detection Loop
  useEffect(() => {
    if (!isOpen) return;

    const AR = (jsAruco2 as any).AR || (jsAruco2 as any);
    const detector = new AR.Detector({ dictionaryName: 'ARUCO' });

    let animationFrameId: number;
    let lastProcessTime = 0;

    const processFrame = () => {
      const now = performance.now();
      // Throttle to ~18 fps for smooth real-time detection without heating mobile device
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
            // Draw video to canvas
            ctx.drawImage(video, 0, 0, width, height);

            // Get imageData and detect
            const imageData = ctx.getImageData(0, 0, width, height);
            const markers = detector.detect(imageData);

            // Draw detection AR overlays
            if (markers && markers.length > 0) {
                            const newDetectionsInBatch: { studentName: string; option: PaperOption; prevOption?: PaperOption; isChange: boolean }[] = [];
              const batchAnswers: PaperModeAnswer[] = [];
              let hasChangeInBatch = false;
              let hasNewInBatch = false;
              let validCount = 0;

              markers.forEach((marker: any) => {
                if (!marker || !marker.corners || marker.corners.length < 4) return;
                const markerId = marker.id;
                // 1. Filter out noise or invalid marker IDs
                if (typeof markerId !== 'number' || markerId <= 0 || markerId > 150) return;

                const student = studentByMarkerId.get(markerId);
                // Discard random background false-positives not matching class students
                if (!student && markerId > Math.max(classStudents.length + 5, 45)) return;

                // 2. Filter out tiny speckles/artifacts smaller than 14px
                const [c0, c1, c2, c3] = marker.corners;
                const edge1 = Math.hypot(c1.x - c0.x, c1.y - c0.y);
                const edge2 = Math.hypot(c2.x - c1.x, c2.y - c1.y);
                if (Math.min(edge1, edge2) < 14) return;

                validCount++;

                // 3. Calculate orientation & check for diagonal tilt ambiguity
                const { option, isAmbiguous } = getMarkerOrientation(marker.corners);

                const studentName = student ? student.displayName : `Siswa #${markerId}`;
                const studentId = student ? student.uid : `marker_${markerId}`;

                // Check if this student recently changed their answer
                const isRecentlyChanged = recentDetections.some(
                  (d) => d.studentName === studentName && d.isChange && Date.now() - d.timestamp < 3500
                );

                // Draw bounding box
                ctx.beginPath();
                ctx.moveTo(c0.x, c0.y);
                ctx.lineTo(c1.x, c1.y);
                ctx.lineTo(c2.x, c2.y);
                ctx.lineTo(c3.x, c3.y);
                ctx.closePath();
                ctx.lineWidth = isRecentlyChanged ? 5 : 4;
                ctx.strokeStyle = isAmbiguous
                  ? '#f59e0b' // Amber if tilted ambiguously
                  : isRecentlyChanged
                  ? '#22d3ee' // Cyan if changed
                  : '#10b981'; // Emerald if normal
                ctx.stroke();

                // Draw AR label pill
                const centerX = (c0.x + c1.x + c2.x + c3.x) / 4;
                const centerY = (c0.y + c1.y + c2.y + c3.y) / 4;

                const labelText = isAmbiguous
                  ? `${studentName} • Tegakkan Kartu`
                  : isRecentlyChanged
                  ? `🔄 ${studentName} • Diperbarui`
                  : `✓ ${studentName} • Terekam`;

                ctx.font = 'bold 15px ui-sans-serif, system-ui';
                const textWidth = ctx.measureText(labelText).width;

                ctx.fillStyle = isAmbiguous
                  ? 'rgba(69, 26, 3, 0.92)'
                  : isRecentlyChanged
                  ? 'rgba(8, 51, 68, 0.92)'
                  : 'rgba(15, 23, 42, 0.85)';
                ctx.beginPath();
                if (ctx.roundRect) {
                  ctx.roundRect(
                    centerX - textWidth / 2 - 12,
                    centerY - 32,
                    textWidth + 24,
                    30,
                    8
                  );
                } else {
                  ctx.rect(
                    centerX - textWidth / 2 - 12,
                    centerY - 32,
                    textWidth + 24,
                    30
                  );
                }
                ctx.fill();
                ctx.lineWidth = isRecentlyChanged ? 2.5 : 1.5;
                ctx.strokeStyle = isAmbiguous
                  ? '#f59e0b'
                  : isRecentlyChanged
                  ? '#22d3ee'
                  : '#10b981';
                ctx.stroke();

                ctx.fillStyle = isAmbiguous ? '#fcd34d' : isRecentlyChanged ? '#67e8f9' : '#ffffff';
                ctx.textAlign = 'center';
                ctx.textBaseline = 'middle';
                ctx.fillText(labelText, centerX, centerY - 17);

                // If not locked and not ambiguously tilted, record answer
                if (!isLocked && !isAmbiguous) {
                  const prevOption = answeredStudentsRef.current[studentId];
                  if (prevOption !== option) {
                    const isChange = prevOption !== undefined;
                    let shouldCommit = false;

                    // If student is changing an already recorded answer, require 2 consecutive frames (~110ms)
                    if (isChange) {
                      const cand = candidateChangesRef.current[studentId];
                      if (cand && cand.option === option) {
                        cand.count += 1;
                        if (cand.count >= 2) {
                          shouldCommit = true;
                          delete candidateChangesRef.current[studentId];
                        }
                      } else {
                        candidateChangesRef.current[studentId] = { option, count: 1 };
                      }
                    } else {
                      // First time recording this student: commit immediately so sweeping across the classroom catches all cards!
                      shouldCommit = true;
                    }

                    if (shouldCommit) {
                      answeredStudentsRef.current[studentId] = option;
                      answeredStudentsRef.current[`marker_${markerId}`] = option;

                                            // Add to batch
                      const answerPayload: PaperModeAnswer = {
                        studentId,
                        markerId,
                        studentName,
                        selectedOption: option,
                        timestamp: Date.now(),
                      };
                      batchAnswers.push(answerPayload);

                      newDetectionsInBatch.push({
                        studentName,
                        option,
                        prevOption,
                        isChange,
                      });

                      if (isChange) hasChangeInBatch = true;
                      else hasNewInBatch = true;
                    }
                  } else {
                    if (candidateChangesRef.current[studentId]) {
                      delete candidateChangesRef.current[studentId];
                    }
                  }
                }
              });              // Process collected batch answers
              if (batchAnswers.length > 0) {
                submitPaperAnswersBatch(sessionId, currentQuestionIndex, batchAnswers);
                batchAnswers.forEach(ans => {
                  if (typeof window !== 'undefined') {
                    window.dispatchEvent(
                      new CustomEvent('paper_answer', {
                        detail: { sessionId, questionIndex: currentQuestionIndex, answer: ans },
                      })
                    );
                  }
                });
              }

              setVisibleMarkersCount(validCount);

              // Single batched update for UI, sound, and toast when multiple cards detected
              if (newDetectionsInBatch.length > 0) {
                setAnsweredCount(Object.keys(answeredStudentsRef.current).length);

                if (hasChangeInBatch) {
                  playChangeSound();
                  if ('vibrate' in navigator) {
                    try { navigator.vibrate([45, 50, 45]); } catch {}
                  }
                } else if (hasNewInBatch) {
                  playBeep();
                  if ('vibrate' in navigator) {
                    try { navigator.vibrate(40); } catch {}
                  }
                }

                setRecentDetections((prev) => [
                  ...newDetectionsInBatch.map((d) => ({
                    studentName: d.studentName,
                    option: d.option,
                    prevOption: d.prevOption,
                    isChange: d.isChange,
                    timestamp: Date.now(),
                  })),
                  ...prev.slice(0, 4),
                ]);
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
    };
  }, [isOpen, isLocked, sessionId, currentQuestionIndex, studentByMarkerId, soundEnabled]);

  // Fallback: Photo Capture & Processing (works without WebRTC live stream permissions!)
  const handlePhotoCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingPhoto(true);
    setPhotoToast(null);

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        try {
          const offCanvas = document.createElement('canvas');
          offCanvas.width = img.width;
          offCanvas.height = img.height;
          const ctx = offCanvas.getContext('2d');
          if (!ctx) {
            setIsProcessingPhoto(false);
            return;
          }

          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, img.width, img.height);

          const AR = (jsAruco2 as any).AR || (jsAruco2 as any);
          const detector = new AR.Detector({ dictionaryName: 'ARUCO' });
          const markers = detector.detect(imageData);

          if (!markers || markers.length === 0) {
            setPhotoToast('Tidak ada kartu ArUco yang terdeteksi pada foto. Pastikan kartu terlihat jelas dan tidak buram.');
            setIsProcessingPhoto(false);
            return;
          }

                    let detectedCount = 0;
          let changedCount = 0;
          const batchAnswers: PaperModeAnswer[] = [];

          markers.forEach((marker: any) => {
            if (!marker || !marker.corners || marker.corners.length < 4) return;
            const markerId = marker.id;
            if (typeof markerId !== 'number' || markerId <= 0 || markerId > 150) return;

            const student = studentByMarkerId.get(markerId);
            if (!student && markerId > Math.max(classStudents.length + 5, 45)) return;

            const { option } = getMarkerOrientation(marker.corners);
            const studentName = student ? student.displayName : `Siswa #${markerId}`;
            const studentId = student ? student.uid : `marker_${markerId}`;

            const prevOption = answeredStudentsRef.current[studentId];
            if (prevOption && prevOption !== option) {
              changedCount++;
            }

            answeredStudentsRef.current[studentId] = option;
            answeredStudentsRef.current[`marker_${markerId}`] = option;
            const answerPayload: PaperModeAnswer = {
              studentId,
              markerId,
              studentName,
              selectedOption: option,
              timestamp: Date.now(),
            };
            batchAnswers.push(answerPayload);
            detectedCount++;
          });

          if (batchAnswers.length > 0) {
            submitPaperAnswersBatch(sessionId, currentQuestionIndex, batchAnswers);
            batchAnswers.forEach(ans => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(
                  new CustomEvent('paper_answer', {
                    detail: { sessionId, questionIndex: currentQuestionIndex, answer: ans },
                  })
                );
              }
            });
          }

          setAnsweredCount(Object.keys(answeredStudentsRef.current).length);
          if (changedCount > 0) {
            playChangeSound();
          } else {
            playBeep();
          }
          setPhotoToast(
            changedCount > 0
              ? `🎉 Berhasil memindai ${detectedCount} kartu (${changedCount} jawaban siswa diperbarui)!`
              : `🎉 Berhasil memindai ${detectedCount} jawaban siswa dari foto!`
          );
          setTimeout(() => setPhotoToast(null), 5000);
        } catch (err: any) {
          setPhotoToast(`Gagal memproses foto: ${err.message}`);
        } finally {
          setIsProcessingPhoto(false);
          if (fileInputRef.current) fileInputRef.current.value = '';
        }
      };
      img.src = reader.result as string;
    };
    reader.readAsDataURL(file);
  };

  const activeQuestion = quiz.questions[currentQuestionIndex] || quiz.questions[0];

  const availableLetters: PaperOption[] = useMemo(() => {
    if (!activeQuestion) return ['A', 'B', 'C', 'D'];
    const opts = (activeQuestion.options || []).filter(
      (o) => o !== undefined && o !== null && o.trim() !== ''
    );
    if (opts.length <= 2) return ['A', 'B'];
    if (opts.length === 3) return ['A', 'B', 'C'];
    return ['A', 'B', 'C', 'D'];
  }, [activeQuestion]);

  const isTrueFalse = availableLetters.length === 2;

  const optionStats = useMemo(() => {
    const counts: Record<PaperOption, number> = { A: 0, B: 0, C: 0, D: 0 };
    classStudents.forEach((st, idx) => {
      const markerId = st.absentNumber && st.absentNumber > 0 ? st.absentNumber : idx + 1;
      const opt =
        answeredStudentsRef.current[st.uid] ||
        ((st as any).id && answeredStudentsRef.current[(st as any).id]) ||
        answeredStudentsRef.current[`marker_${markerId}`] ||
        answeredStudentsRef.current[markerId];
      if (opt && counts[opt] !== undefined) {
        counts[opt]++;
      }
    });
    return counts;
  }, [classStudents, answeredCount]);

  const handleFinishQuiz = async () => {
    // 1. Stop active video tracks to release camera hardware
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    // 2. Retrieve session or assemble from memory
    let currentSession = latestSessionRef.current;
    if (!currentSession) {
      try {
        const res = await fetch(`/api/collections/paperSessions/${encodeURIComponent(sessionId)}`);
        if (res.ok) {
          currentSession = await res.json();
        }
      } catch {}
    }

    const sessionObj: PaperModeSession = {
      id: sessionId,
      quizId: quiz.id,
      classId,
      teacherId: quiz.createdBy,
      currentQuestionIndex,
      status: 'completed',
      answersByQuestion: currentSession?.answersByQuestion || {},
      showLiveStats: true,
      showCorrectAnswer: true,
      createdAt: currentSession?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // 3. Mark session completed in backend
    await controlPaperSession(sessionId, {
      status: 'completed',
      showLiveStats: true,
      showCorrectAnswer: true,
    });

    // 4. Pass to parent onFinish or open analytics modal directly
    if (onFinish) {
      onFinish(sessionObj);
    } else {
      setFinalSession(sessionObj);
      setShowAnalytics(true);
    }
  };

  const handleNextQuestion = async () => {
    if (currentQuestionIndex < quiz.questions.length - 1) {
      const nextIdx = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIdx);
      setIsLocked(false);
      setShowCorrectAnswer(false);
      answeredStudentsRef.current = {};
      setAnsweredCount(0);
      setRecentDetections([]);

      await controlPaperSession(sessionId, {
        currentQuestionIndex: nextIdx,
        status: 'active',
        showLiveStats: false,
        showCorrectAnswer: false,
      });
    }
  };

  const handlePrevQuestion = async () => {
    if (currentQuestionIndex > 0) {
      const prevIdx = currentQuestionIndex - 1;
      setCurrentQuestionIndex(prevIdx);
      setIsLocked(false);
      setShowCorrectAnswer(false);
      answeredStudentsRef.current = {};
      setAnsweredCount(0);
      setRecentDetections([]);

      await controlPaperSession(sessionId, {
        currentQuestionIndex: prevIdx,
        status: 'active',
        showLiveStats: false,
        showCorrectAnswer: false,
      });
    }
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
    await controlPaperSession(sessionId, {
      showCorrectAnswer: nextReveal,
      showLiveStats: nextReveal,
    });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col overflow-hidden font-sans select-none">
      {/* Hidden File Input for Native Camera Photo Capture */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoCapture}
        className="hidden"
      />

      {/* Top Camera Status Bar */}
      {!isCameraMaximized && (
      <header className="px-4 py-3 bg-slate-900/90 backdrop-blur-md flex items-center justify-between z-20 shrink-0 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/40">
            <Camera className="w-4 h-4 animate-pulse" />
          </div>
          <div>
            <h3 className="text-xs font-black text-white leading-tight">
              Kamera Pemindai Guru
            </h3>
            <p className="text-[10px] text-slate-400">
              Soal {currentQuestionIndex + 1}/{quiz.questions.length} •{' '}
              <strong className="text-emerald-400 font-bold">{answeredCount}</strong> /{' '}
              {classStudents.length} Siswa
            </p>
          </div>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-2">
          {/* Toggle Student List on Right */}
          <button
            type="button"
            onClick={() => setShowStudentList((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              showStudentList
                ? 'bg-indigo-600 border-indigo-400 text-white shadow-xs'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white'
            }`}
            title="Tampilkan / Sembunyikan Daftar Siswa di Sebelah Kanan"
          >
            <Users className="w-3.5 h-3.5 text-indigo-300" />
            <span className="hidden sm:inline">Daftar Siswa</span>
          </button>

          {/* Snap Photo Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="px-2.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            title="Ambil foto kartu siswa dengan kamera bawaan HP"
          >
            <ImageIcon className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Foto</span>
          </button>

                    {/* Lihat Soal Button */}
          <button
            type="button"
            onClick={() => setShowQuestionOverlay(true)}
            className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 border border-indigo-500/50 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg transition-all cursor-pointer"
            title="Lihat Soal Penuh"
          >
            <Eye className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Lihat Soal</span>
          </button>

          {/* Maximize Camera View */}
          <button
            type="button"
            onClick={() => setIsCameraMaximized((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
              isCameraMaximized
                ? 'bg-amber-600 border-amber-400 text-white shadow-lg ring-2 ring-amber-400/40'
                : 'bg-slate-800 text-slate-300 border-slate-700 hover:text-white hover:bg-slate-700'
            }`}
            title={isCameraMaximized ? 'Kembalikan Tampilan Normal' : 'Perbesar Tampilan Kamera (Layar Penuh)'}
          >
            {isCameraMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
            <span className="hidden sm:inline">{isCameraMaximized ? 'Perkecil' : 'Perbesar'}</span>
          </button>

          {/* Switch Camera */}
          <button
            type="button"
            onClick={() =>
              setFacingMode((prev) => (prev === 'environment' ? 'user' : 'environment'))
            }
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
            title="Ganti Kamera Depan/Belakang"
          >
            <SwitchCamera className="w-4 h-4" />
          </button>

          {/* Sound Toggle */}
          <button
            type="button"
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-2 rounded-xl bg-slate-800 text-slate-300 hover:text-white"
            title="Bip Suara Deteksi"
          >
            {soundEnabled ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4" />}
          </button>

          {/* Close */}
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/80 text-slate-300 hover:text-white transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>
      )}

      {/* Main Content Area: Left (Camera + Question) & Right (Student List) */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Column: Camera on top, Question displayed below */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Camera Preview with AR Overlay */}
          <div className="flex-1 relative bg-black flex items-center justify-center overflow-hidden min-h-[220px]">
        {/* Hidden video element supplying frames */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 w-full h-full object-cover"
        />

        {/* Canvas for AR detection overlay */}
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-cover z-10 pointer-events-none"
        />

        {/* Floating Scanner Mode Status Pill */}
        <div className="z-20 absolute top-3 left-1/2 -translate-x-1/2 pointer-events-none flex flex-col items-center gap-1.5">
          {isLocked ? (
            <div className="px-3.5 py-1.5 rounded-full bg-rose-950/90 border border-rose-500/50 backdrop-blur-md flex items-center gap-2 shadow-xl">
              <Lock className="w-3.5 h-3.5 text-rose-400" />
              <span className="text-[11px] font-black text-rose-200">
                Soal Terkunci — Jawaban Tidak Dapat Diubah
              </span>
            </div>
          ) : (
            <div className="px-3.5 py-1.5 rounded-full bg-slate-950/85 border border-emerald-500/50 backdrop-blur-md flex items-center gap-2 shadow-xl">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
              <span className="text-[11px] font-black text-emerald-300">
                Pemindaian Aktif — Siswa Bebas Merubah Jawaban
              </span>
            </div>
          )}

          {visibleMarkersCount > 0 && (
            <div className="px-3 py-1 rounded-full bg-emerald-950/90 border border-emerald-400/60 backdrop-blur-md flex items-center gap-1.5 shadow-lg text-[10px] font-black text-emerald-200 animate-pulse">
              <CheckCircle2 className="w-3 h-3 text-emerald-400" />
              <span>{visibleMarkersCount} Kartu Terdeteksi Sekaligus</span>
            </div>
          )}
        </div>

        {/* Processing Photo Indicator */}
        {isProcessingPhoto && (
          <div className="z-40 absolute inset-0 bg-black/70 backdrop-blur-xs flex flex-col items-center justify-center space-y-3">
            <RefreshCw className="w-10 h-10 text-emerald-400 animate-spin" />
            <p className="text-sm font-bold text-white">Sedang Memproses Foto Jawaban Siswa...</p>
          </div>
        )}

        {/* Photo Result Toast */}
        {photoToast && (
          <div className="z-40 absolute top-4 left-1/2 -translate-x-1/2 max-w-md w-11/12 p-3.5 bg-slate-900/95 border border-emerald-400 rounded-2xl text-xs font-bold text-white shadow-2xl flex items-center justify-between gap-2">
            <span>{photoToast}</span>
            <button
              type="button"
              onClick={() => setPhotoToast(null)}
              className="p-1 text-slate-400 hover:text-white"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Interactive Error / Permission Denied Diagnostic Card */}
        {cameraError && (
          <div className="z-30 p-5 max-w-md w-11/12 mx-auto bg-slate-900/95 border border-rose-500/50 rounded-3xl text-left space-y-4 shadow-2xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-2xl bg-rose-500/20 text-rose-400 flex items-center justify-center shrink-0 border border-rose-500/30">
                <ShieldAlert className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-black text-white">
                  {errorType === 'permission_denied'
                    ? 'Izin Akses Kamera Ditolak'
                    : errorType === 'insecure_context'
                    ? 'Peramban Membutuhkan Koneksi Aman'
                    : 'Kamera Tidak Tersedia'}
                </h4>
                <p className="text-xs text-rose-200 mt-1 leading-relaxed">{cameraError}</p>
              </div>
            </div>

            {/* Action Solution 1: Use Native Photo Capture (Guaranteed to work without permission errors!) */}
            <div className="p-3.5 bg-emerald-950/60 border border-emerald-500/40 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-emerald-300 font-extrabold text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Solusi Cepat (Paling Praktis):</span>
              </div>
              <p className="text-[11px] text-slate-300 leading-normal">
                Gunakan kamera bawaan ponsel untuk mengambil foto jawaban siswa di kelas.
                Sistem akan membaca seluruh kartu yang ada di foto secara instan.
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Camera className="w-4 h-4" />
                <span>Ambil Foto Jawaban Kelas Sekarang</span>
              </button>
            </div>

            {/* Action Solution 2: Retry Permission */}
            <button
              type="button"
              onClick={startCamera}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs rounded-xl border border-slate-700 flex items-center justify-center gap-2 cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Coba Minta Izin Kamera Lagi</span>
            </button>

            {/* Collapsible Step-by-Step Unblock Guide */}
            <div className="border-t border-slate-800 pt-3">
              <button
                type="button"
                onClick={() => setShowHelpSteps(!showHelpSteps)}
                className="w-full flex items-center justify-between text-xs font-bold text-slate-400 hover:text-white"
              >
                <span className="flex items-center gap-1.5">
                  <HelpCircle className="w-4 h-4 text-indigo-400" />
                  Cara Membuka Blokir Izin di Peramban
                </span>
                {showHelpSteps ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </button>

              {showHelpSteps && (
                <div className="mt-3 space-y-3 text-[11px] text-slate-300 bg-slate-950/60 p-3.5 rounded-2xl border border-slate-800">
                  <div>
                    <strong className="text-white block mb-1">Di Google Chrome (Laptop / PC):</strong>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>Klik ikon <strong>Gembok (🔒)</strong> atau <strong>Setelan Situs</strong> di sebelah kiri alamat URL (`localhost:4000`).</li>
                      <li>Pada menu <strong>Kamera</strong>, ubah pilihan menjadi <strong>Izinkan (Allow)</strong>.</li>
                      <li>Muat ulang halaman (F5).</li>
                    </ol>
                  </div>

                  <div>
                    <strong className="text-white block mb-1">Di Google Chrome (Ponsel Android):</strong>
                    <ol className="list-decimal pl-4 space-y-1">
                      <li>Ketuk ikon titik tiga <strong>(⋮)</strong> di pojok kanan atas &gt; <strong>Setelan</strong>.</li>
                      <li>Pilih <strong>Setelan Situs</strong> &gt; <strong>Kamera</strong>.</li>
                      <li>Cari alamat web ini pada daftar <em>Diblokir</em>, lalu ketuk dan pilih <strong>Izinkan</strong>.</li>
                    </ol>
                  </div>

                  <div>
                    <strong className="text-white block mb-1">Akses via Laptop Proyektor:</strong>
                    <p className="leading-relaxed">
                      Anda juga dapat menjalankan pemindai langsung di laptop yang terhubung ke proyektor
                      dengan menekan tombol <strong>"Buka Pemindai"</strong> pada layar proyektor.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Live Scan Notification Floater */}
        {recentDetections.length > 0 && (
          <div className="absolute top-12 left-4 z-20 space-y-1.5 pointer-events-none max-w-xs">
            {recentDetections.slice(0, 4).map((det, idx) => (
              <div
                key={`${det.studentName}_${det.timestamp}_${idx}`}
                className={`px-3 py-1.5 rounded-xl backdrop-blur-md text-white text-xs font-bold flex items-center gap-2 shadow-lg animate-fade-in ${
                  det.isChange
                    ? 'bg-cyan-950/90 border border-cyan-400 text-cyan-200'
                    : 'bg-slate-950/80 border border-emerald-400/50 text-white'
                }`}
              >
                {det.isChange ? (
                  <RefreshCw className="w-3.5 h-3.5 text-cyan-300 animate-spin shrink-0" />
                ) : (
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                )}
                <span className="truncate">{det.studentName}</span>
                {det.isChange ? (
                  <span className="px-2 py-0.5 rounded-md font-black text-[10px] bg-cyan-400 text-slate-950">
                    Diperbarui
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md font-black text-[10px] bg-emerald-400 text-slate-950">
                    Terekam
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Scanning Reticle Aim Guide */}
        {!cameraError && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-15">
            <div className="w-64 h-64 border border-white/20 rounded-3xl relative">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-3 border-l-3 border-emerald-400 rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-3 border-r-3 border-emerald-400 rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-3 border-l-3 border-emerald-400 rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-3 border-r-3 border-emerald-400 rounded-br-xl" />
            </div>
          </div>
        )}

        {/* Floating Mini Controls when Camera is Maximized */}
        {isCameraMaximized && (
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-slate-950/90 border border-slate-700 backdrop-blur-xl shadow-2xl">
            <span className="px-2.5 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 font-black text-xs border border-indigo-500/30">
              Soal #{currentQuestionIndex + 1}
            </span>
            <span className="text-xs font-bold text-slate-400 px-1">
              <strong className="text-emerald-400">{answeredCount}</strong> / {classStudents.length}
            </span>
            <div className="w-px h-5 bg-slate-700" />
            <button
              type="button"
              disabled={currentQuestionIndex === 0}
              onClick={handlePrevQuestion}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white cursor-pointer transition-colors"
              title="Soal Sebelumnya"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-mono font-bold text-slate-400">
              {currentQuestionIndex + 1}/{quiz.questions.length}
            </span>
            <button
              type="button"
              disabled={currentQuestionIndex >= quiz.questions.length - 1}
              onClick={handleNextQuestion}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white cursor-pointer transition-colors"
              title="Soal Berikutnya"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <div className="w-px h-5 bg-slate-700" />
            <button
              type="button"
              onClick={handleToggleLock}
              className={`p-1.5 rounded-xl transition-colors cursor-pointer ${
                isLocked
                  ? 'bg-rose-600 hover:bg-rose-700 text-white'
                  : 'bg-slate-800 hover:bg-slate-700 text-emerald-400'
              }`}
              title={isLocked ? 'Buka Kunci Soal' : 'Kunci Soal'}
            >
              {isLocked ? <Lock className="w-4 h-4" /> : <Unlock className="w-4 h-4" />}
            </button>
            <button
              type="button"
              onClick={() => setIsCameraMaximized(false)}
              className="p-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white cursor-pointer transition-colors"
              title="Kembalikan Tampilan Normal"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        )}
        </div>

        {/* Question Displayed Directly Below Camera */}
        {!isCameraMaximized && (
        <div className="shrink-0 bg-slate-900 border-t border-slate-800 p-3 sm:p-4 shadow-2xl">
          {/* Header Row: Question Prompt & Nav/Action Controls */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-2.5 min-w-0 flex-1">
              <span className="px-2.5 py-1 rounded-xl bg-indigo-500/20 text-indigo-300 font-black text-xs shrink-0 border border-indigo-500/30 mt-0.5">
                Soal #{currentQuestionIndex + 1}
              </span>
              <div className="text-[11px] sm:text-xs font-medium text-slate-400 leading-snug truncate mt-1">Soal disembunyikan. Klik "Lihat Soal" di atas.</div>
            </div>

            {/* Quick Action & Nav Buttons */}
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                disabled={currentQuestionIndex === 0}
                onClick={handlePrevQuestion}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white cursor-pointer transition-colors"
                title="Soal Sebelumnya"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="text-xs font-mono font-bold text-slate-400 px-1">
                {currentQuestionIndex + 1}/{quiz.questions.length}
              </span>
              <button
                type="button"
                disabled={currentQuestionIndex >= quiz.questions.length - 1}
                onClick={handleNextQuestion}
                className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 disabled:opacity-30 text-white cursor-pointer transition-colors"
                title="Soal Berikutnya"
              >
                <ChevronRight className="w-4 h-4" />
              </button>

                            <button
                type="button"
                onClick={handleFinishQuiz}
                className="ml-2 px-3 sm:px-4 py-1.5 rounded-xl font-bold text-xs flex items-center gap-1.5 transition-all cursor-pointer bg-emerald-600 hover:bg-emerald-700 text-white shadow-md active:scale-95 shrink-0"
                title="Setorkan Jawaban & Tampilkan Statistik"
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Setorkan Jawaban</span>
              </button>
            </div>
          </div>

          {/* Options Grid Hidden - Viewable in Modal */}
          {/* Explanation (Pembahasan) if revealed */}
          {showCorrectAnswer && activeQuestion.explanation && (
            <div className="p-2.5 bg-indigo-950/60 border border-indigo-500/40 rounded-xl flex items-start gap-2 text-xs">
              <Sparkles className="w-3.5 h-3.5 text-amber-300 shrink-0 mt-0.5" />
              <div className="text-indigo-100 font-medium leading-relaxed">
                <span className="font-bold text-indigo-300 uppercase tracking-wider text-[10px]">
                  Pembahasan:
                </span>{' '}
                <LatexRenderer content={activeQuestion.explanation} />
              </div>
            </div>
          )}
        </div>
        )}
        </div>

        {/* Right Sidebar: Live Student Roster Grid */}
        {showStudentList && !isCameraMaximized && (
          <div className="w-80 lg:w-96 border-l border-slate-800 bg-slate-900/95 backdrop-blur-md flex flex-col shrink-0 z-20">
            <div className="p-3.5 border-b border-slate-800 bg-slate-900 flex items-center justify-between">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                  Daftar Siswa
                </span>
                <p className="text-[10px] text-slate-400">
                  <strong className="text-emerald-400 font-bold">{answeredCount}</strong> dari {classStudents.length} sudah menjawab
                </p>
              </div>
              {isLocked ? (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-rose-500/20 text-rose-300 border border-rose-500/30 flex items-center gap-1">
                  <Lock className="w-3 h-3" /> Dikunci
                </span>
              ) : (
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                  Live
                </span>
              )}
            </div>

            {/* Student Grid */}
            <div className="flex-1 p-3 overflow-y-auto grid grid-cols-2 gap-2 content-start">
              {classStudents.map((st, index) => {
                const markerId = st.absentNumber && st.absentNumber > 0 ? st.absentNumber : index + 1;
                const hasAnswered = Boolean(
                  answeredStudentsRef.current[st.uid] ||
                  ((st as any).id && answeredStudentsRef.current[(st as any).id]) ||
                  answeredStudentsRef.current[`marker_${markerId}`] ||
                  answeredStudentsRef.current[markerId]
                );
                const studentAnswer =
                  answeredStudentsRef.current[st.uid] ||
                  ((st as any).id && answeredStudentsRef.current[(st as any).id]) ||
                  answeredStudentsRef.current[`marker_${markerId}`] ||
                  answeredStudentsRef.current[markerId];

                const isJustUpdated = recentDetections.some(
                  (d) =>
                    (d.studentName === st.displayName || d.studentName === `Siswa #${markerId}`) &&
                    Date.now() - d.timestamp < 3000
                );

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
                        {isJustUpdated ? (
                          <span className="text-cyan-300 font-black flex items-center gap-0.5">
                            🔄 Diperbarui
                          </span>
                        ) : hasAnswered ? (
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
        {/* Question Overlay Modal */}
      {showQuestionOverlay && (
        <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col p-4 sm:p-6 overflow-hidden">
          <div className="flex items-center justify-between mb-4 shrink-0">
            <div className="flex items-center gap-3">
              <span className="px-3 py-1.5 rounded-xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 font-black text-sm">
                Soal #{currentQuestionIndex + 1}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowQuestionOverlay(false)}
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm flex items-center gap-2 transition-colors shadow-lg cursor-pointer"
            >
              <Camera className="w-4 h-4" />
              <span className="hidden sm:inline">Kembali Memindai</span>
              <span className="sm:hidden">Kembali</span>
            </button>
          </div>
          
          <div className="flex-1 overflow-y-auto bg-slate-900 border border-slate-800 rounded-3xl p-5 shadow-2xl">
            <div className="text-xl sm:text-2xl font-extrabold text-white leading-relaxed">
              <RichQuestionPrompt text={activeQuestion.prompt} fallbackImageUrl={activeQuestion.imageUrl} theme="dark" />
            </div>

            <div className={`grid gap-3 mt-6 ${availableLetters.length === 2 ? "grid-cols-2 max-w-2xl" : "grid-cols-1 sm:grid-cols-2"}`}>
              {availableLetters.map((letter) => {
                const optIdx = (['A', 'B', 'C', 'D'] as const).indexOf(letter);
                const optionText = activeQuestion.options?.[optIdx] || '';
                return (
                  <div key={letter} className="p-4 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-start gap-4">
                    <span className="w-10 h-10 rounded-xl bg-slate-700 text-slate-300 font-black text-lg flex items-center justify-center shrink-0">
                      {letter}
                    </span>
                    <div className="flex-1 text-sm sm:text-base font-bold text-white pt-1">
                       <RichQuestionPrompt text={optionText} theme="dark" />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Tampilan Statistik Jawaban Siswa setelah Setorkan Jawaban */}
      {showAnalytics && finalSession && (
        <PaperAnalyticsModal
          isOpen={true}
          onClose={() => {
            setShowAnalytics(false);
            onClose();
          }}
          quiz={quiz}
          classId={classId}
          session={finalSession}
        />
      )}
    </div>
    </div>
  );
};












