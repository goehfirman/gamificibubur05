import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  Announcement,
  Assignment,
  AuditLog,
  Badge,
  ChatMessage,
  ClassRoom,
  LevelConfig,
  Material,
  MaterialProgress,
  Mission,
  MissionProgress,
  NotificationItem,
  PointLedger,
  Quiz,
  QuizSubmission,
  QuizStudentAnswer,
  School,
  Submission,
  User,
  UserBadge,
  UserPresence,
  UserRole,
  UserStats,
} from '../types';
import {
  INITIAL_ANNOUNCEMENTS,
  INITIAL_ASSIGNMENTS,
  INITIAL_AUDIT_LOGS,
  INITIAL_BADGES,
  INITIAL_CHAT_MESSAGES,
  INITIAL_CLASSES,
  INITIAL_MATERIAL_PROGRESS,
  INITIAL_MATERIALS,
  INITIAL_MISSION_PROGRESS,
  INITIAL_MISSIONS,
  INITIAL_POINT_LEDGER,
  INITIAL_QUIZZES,
  INITIAL_QUIZ_SUBMISSIONS,
  INITIAL_SCHOOL,
  INITIAL_SUBMISSIONS,
  INITIAL_USERS,
  INITIAL_USER_BADGES,
  INITIAL_USER_STATS,
} from '../data/mockData';
import { DEFAULT_LEVELS, fireCelebrationConfetti, getLevelInfo } from '../utils/gamification';
import {
  seedFirestoreIfEmpty,
  syncDocToFirestore,
  deleteDocFromFirestore,
  bulkDeleteFromFirestore,
  loadAllFromFirestore,
  subscribeToRealtimeCollection,
  syncAllStateToFirestore,
  updateUserPresence,
  setUserOffline,
  isFirestoreQuotaExceeded,
  COLLECTIONS,
} from '../lib/firestoreSync';
import { safeStorage, safeSessionStorage } from '../utils/storage';

const STORAGE_KEY = 'classroom_gamifikasi_v5_data';
const SESSION_USER_KEY = 'classroom_gamifikasi_session_user';
const DELETED_IDS_STORAGE_KEY = 'gamificlass_deleted_ids_v2';

function getStoredDeletedIds(): Set<string> {
  try {
    const raw = safeStorage.getItem(DELETED_IDS_STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return new Set(arr);
    }
  } catch (e) {}
  return new Set();
}

function saveDeletedIds(ids: Set<string>) {
  try {
    const arr = Array.from(ids).slice(-500);
    safeStorage.setItem(DELETED_IDS_STORAGE_KEY, JSON.stringify(arr));
  } catch (e) {}
}

interface AppContextType {
  currentUser: User | null;
  currentRole: UserRole | null;
  isAuthenticated: boolean;
  isQuotaExceeded: boolean;
  currentClassId: string;
  setCurrentClassId: (classId: string) => void;
  users: User[];
  school: School;
  classes: ClassRoom[];
  materials: Material[];
  materialProgress: Record<string, MaterialProgress>;
  assignments: Assignment[];
  submissions: Record<string, Submission>;
  quizzes: Quiz[];
  quizSubmissions: Record<string, QuizSubmission>;
  missions: Mission[];
  missionProgress: Record<string, MissionProgress>;
  pointLedger: PointLedger[];
  userStats: Record<string, UserStats>;
  badges: Badge[];
  userBadges: UserBadge[];
  announcements: Announcement[];
  notifications: NotificationItem[];
  auditLogs: AuditLog[];
  chatMessages: ChatMessage[];
  userPresences: Record<string, UserPresence>;
  isUserOnline: (userId: string) => boolean;
  levels: LevelConfig[];
  isFirebaseSynced: boolean;
  syncAllToCloud: () => Promise<boolean>;
  
  // Navigation and Auth
  activeTab: string;
  setActiveTab: (tab: string) => void;
  switchUser: (userId: string) => void;
  loginUser: (identifier: string, pass: string, role: UserRole) => { success: boolean; message?: string };
  logoutUser: () => void;
  updateUserAvatar: (avatarUrl: string) => void;
  updateUserProfile: (data: {
    displayName?: string;
    username?: string;
    password?: string;
    avatarUrl?: string;
  }) => { success: boolean; message?: string };
  updateSchoolProfile: (updatedSchool: Partial<School>) => Promise<{ success: boolean; message?: string }>;
  changePassword: (newPass: string) => void;
  addClass: (newClass: Omit<ClassRoom, 'id' | 'createdAt'>) => ClassRoom;
  updateClass: (classId: string, updates: Partial<ClassRoom>) => void;
  deleteClass: (classId: string) => Promise<void>;
  
  // Student Actions
  markMaterialCompleted: (materialId: string) => void;
  submitAssignment: (assignmentId: string, answerText: string, files: any[]) => void;
  submitQuizAnswers: (quizId: string, answers: Record<string, QuizStudentAnswer>) => { success: boolean; submission: QuizSubmission };
  submitQuiz: (submission: QuizSubmission) => void;
  claimMissionReward: (missionId: string) => void;
  submitMissionForVerification: (missionId: string, note?: string, files?: any[]) => void;
  
  // Teacher Actions
  createMaterial: (mat: Omit<Material, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'schoolId'>) => void;
  updateMaterial: (id: string, mat: Partial<Material>) => void;
  deleteMaterial: (id: string) => void;
  saveMaterial: (mat: Partial<Material>) => void;
  
  createAssignment: (asg: Omit<Assignment, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'schoolId'>) => void;
  updateAssignment: (id: string, asg: Partial<Assignment>) => void;
  deleteAssignment: (id: string) => void;
  saveAssignment: (asg: Partial<Assignment>) => void;
  
  createQuiz: (quiz: Omit<Quiz, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'schoolId'>) => void;
  updateQuiz: (id: string, quiz: Partial<Quiz>) => void;
  deleteQuiz: (id: string) => void;
  saveQuiz: (quiz: Partial<Quiz>) => void;
  gradeQuizSubmission: (
    submissionId: string,
    questionScores: Record<string, { earnedScore: number; feedback?: string; isCorrect?: boolean; isManualOverride?: boolean }>,
    teacherFeedback?: string
  ) => void;
  
  gradeSubmission: (submissionId: string, score: number, feedback: string, rewardPoints: number, rewardXp?: number) => void;
  requestRevision: (submissionId: string, feedback: string) => void;
  
  adjustStudentPoints: (userId: string, amount: number, category: 'academic' | 'participation' | 'adjustment', reason: string) => void;
  createMission: (mis: Omit<Mission, 'id' | 'createdBy' | 'schoolId'>) => void;
  saveMission: (mis: Partial<Mission>) => void;
  deleteMission: (id: string) => void;
  verifyManualMission: (missionId: string, userId: string, score?: number, feedback?: string) => void;
  gradeAndAwardMission: (missionId: string, userId: string, pointsAwarded?: number, feedback?: string) => void;
  gradeAndAwardMissionBulk: (missionId: string, userIds: string[], score: number, feedback?: string, customRewardPoints?: number) => void;
  createAnnouncement: (ann: Omit<Announcement, 'id' | 'createdAt' | 'authorName' | 'schoolId'>) => void;
  saveAnnouncement: (ann: Partial<Announcement>) => void;
  deleteAnnouncement: (id: string) => void;
  refreshFromCloud: () => Promise<void>;
  
  provisionStudent: (student: {
    displayName: string;
    studentNumber: string;
    absentNumber: number;
    classId: string;
    email?: string;
    username?: string;
    password?: string;
    avatarUrl?: string;
  }) => void;
  provisionMultipleStudents: (students: Array<{ displayName: string; studentNumber: string; absentNumber: number; classId: string; email?: string; username?: string; password?: string }>) => number;
  updateStudent: (userId: string, data: Partial<User>) => void;
  updateStudentPhoto: (userId: string, photoUrl: string) => void;
  deleteStudent: (userId: string) => void;
  deleteStudents: (userIds: string[]) => void;
  saveTeacher: (teacher: User) => Promise<void>;
  deleteTeacher: (userId: string) => Promise<void>;
  deleteUser: (userId: string) => Promise<void>;
  setStudentPassword: (userId: string, newPassword: string) => void;
  resetStudentPassword: (userId: string) => string;
  
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  sendChatMessage: (params: {
    text: string;
    channelType?: 'public' | 'direct';
    recipientId?: string;
    imageUrl?: string;
  }) => Promise<{ success: boolean; message?: string }>;
  toggleChatReaction: (messageId: string, emoji: string) => Promise<void>;
  deleteChatMessage: (messageId: string) => Promise<void>;
  resetToInitialData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

// Helper for newest-first sorting across all views
export const getSortTimestamp = (item: any): number => {
  if (!item) return 0;
  const dateStr = item.createdAt || item.publishAt || item.openAt || item.startAt || item.updatedAt;
  if (dateStr) {
    const t = new Date(dateStr).getTime();
    if (!isNaN(t) && t > 0) return t;
  }
  const match = String(item.id || '').match(/\d{10,}/);
  if (match) {
    const n = parseInt(match[0], 10);
    if (!isNaN(n)) return n;
  }
  return 0;
};

export const sortItemsNewestFirst = <T extends any>(items: T[]): T[] => {
  return [...items].sort((a, b) => {
    const diff = getSortTimestamp(b) - getSortTimestamp(a);
    if (diff !== 0) return diff;
    return String((b as any)?.id || '').localeCompare(String((a as any)?.id || ''));
  });
};

// Intelligent bi-directional merge between local state and cloud data
function mergeLocalAndCloud(local: any, cloud: any, deletedIds: Set<string> = new Set()) {
  if (!cloud) return local;

  const now = Date.now();

  // 1. Merge Users: Cloud is strictly authoritative
  const userMap = new Map<string, any>();
  const cloudUsers = (cloud.users || []).filter((u: any) => u?.uid && !deletedIds.has(u.uid));
  const cloudUids = new Set(cloudUsers.map((u: any) => u.uid));

  cloudUsers.forEach((u: any) => {
    const localUser = (local.users || []).find((l: any) => l?.uid === u.uid);
    if (!localUser) {
      userMap.set(u.uid, u);
    } else {
      const cloudTime = new Date(u.updatedAt || u.createdAt || 0).getTime();
      const localTime = new Date(localUser.updatedAt || localUser.createdAt || 0).getTime();
      if (localTime > cloudTime && now - localTime < 3000) {
        userMap.set(u.uid, { ...u, ...localUser });
      } else {
        userMap.set(u.uid, { ...localUser, ...u });
      }
    }
  });

  if (cloudUids.size > 0) {
    (local.users || []).forEach((u: any) => {
      if (!u?.uid || cloudUids.has(u.uid) || deletedIds.has(u.uid)) return;
      const created = new Date(u.createdAt || 0).getTime();
      if (now - created < 15000) {
        userMap.set(u.uid, u);
      }
    });
  } else {
    (local.users || []).forEach((u: any) => {
      if (u?.uid && !deletedIds.has(u.uid)) userMap.set(u.uid, u);
    });
  }

  // 2. Merge User Stats
  const mergedStats: Record<string, any> = {};
  if (cloud.userStats) {
    Object.entries(cloud.userStats).forEach(([uid, cStats]: [string, any]) => {
      if (userMap.has(uid)) {
        mergedStats[uid] = cStats;
      }
    });
  }
  if (local.userStats) {
    Object.entries(local.userStats).forEach(([uid, lStats]: [string, any]) => {
      if (userMap.has(uid) && !mergedStats[uid]) {
        mergedStats[uid] = lStats;
      }
    });
  }

  // 3. Merge Classes: Cloud is strictly authoritative
  let mergedClasses: any[] = [];
  if (Array.isArray(cloud.classes)) {
    const cloudClassIds = new Set(cloud.classes.map((c: any) => c.id));
    const pendingLocal = (local.classes || []).filter((c: any) => {
      if (!c?.id || cloudClassIds.has(c.id) || deletedIds.has(c.id)) return false;
      const created = new Date(c.createdAt || 0).getTime();
      return now - created < 10000;
    });
    mergedClasses = [...cloud.classes.filter((c: any) => c && c.id && !deletedIds.has(c.id)), ...pendingLocal];
  } else {
    mergedClasses = (local.classes || []).filter((c: any) => c && c.id && !deletedIds.has(c.id));
  }

  // 4. Merge Materials: Cloud is authoritative
  let mergedMaterials: any[] = [];
  if (Array.isArray(cloud.materials)) {
    const cloudIds = new Set(cloud.materials.map((m: any) => m.id));
    const pendingLocal = (local.materials || []).filter((m: any) => {
      if (!m?.id || cloudIds.has(m.id)) return false;
      const created = new Date(m.createdAt || 0).getTime();
      return now - created < 10000;
    });
    mergedMaterials = sortItemsNewestFirst([...cloud.materials, ...pendingLocal]);
  } else {
    mergedMaterials = sortItemsNewestFirst(local.materials || []);
  }

  // 5. Merge Assignments: Cloud is authoritative, keeping recent pending local assignments
  let mergedAssignments: any[] = [];
  if (Array.isArray(cloud.assignments)) {
    const cloudIds = new Set(cloud.assignments.map((a: any) => a.id));
    const pendingLocal = (local.assignments || []).filter((a: any) => {
      if (!a?.id || cloudIds.has(a.id)) return false;
      const created = new Date(a.createdAt || 0).getTime();
      return now - created < 15000;
    });
    mergedAssignments = sortItemsNewestFirst([...cloud.assignments, ...pendingLocal]);
  } else {
    mergedAssignments = sortItemsNewestFirst(local.assignments || []);
  }

  // 6. Merge Submissions with timestamp comparison and resilient cross-keying
  const mergedSubmissions: Record<string, any> = { ...(local.submissions || {}) };
  if (cloud.submissions) {
    Object.entries(cloud.submissions).forEach(([key, cSub]: [string, any]) => {
      if (!cSub) return;
      const lSub = mergedSubmissions[key];
      if (!lSub) {
        mergedSubmissions[key] = cSub;
      } else {
        const cTime = new Date(cSub.updatedAt || cSub.submittedAt || 0).getTime();
        const lTime = new Date(lSub.updatedAt || lSub.submittedAt || 0).getTime();
        mergedSubmissions[key] = cTime >= lTime ? { ...lSub, ...cSub } : { ...cSub, ...lSub };
      }
      if (cSub.assignmentId && cSub.userId) {
        const altKey = `${cSub.assignmentId}_${cSub.userId}`;
        if (!mergedSubmissions[altKey]) {
          mergedSubmissions[altKey] = mergedSubmissions[key];
        }
      }
    });
  }

  // 7. Merge Missions: Cloud is authoritative
  let mergedMissions: any[] = [];
  if (Array.isArray(cloud.missions)) {
    const cloudIds = new Set(cloud.missions.map((m: any) => m.id));
    const pendingLocal = (local.missions || []).filter((m: any) => {
      if (!m?.id || cloudIds.has(m.id)) return false;
      const created = new Date(m.createdAt || 0).getTime();
      return now - created < 15000;
    });
    mergedMissions = sortItemsNewestFirst([...cloud.missions, ...pendingLocal]);
  } else {
    mergedMissions = sortItemsNewestFirst(local.missions || []);
  }

  // 8. Progress with timestamp comparison and resilient cross-keying
  const mergedMisProg: Record<string, any> = { ...(local.missionProgress || {}) };
  if (cloud.missionProgress) {
    Object.entries(cloud.missionProgress).forEach(([key, cProg]: [string, any]) => {
      if (!cProg) return;
      const lProg = mergedMisProg[key];
      if (!lProg) {
        mergedMisProg[key] = cProg;
      } else {
        const cTime = new Date(cProg.updatedAt || cProg.completedAt || 0).getTime();
        const lTime = new Date(lProg.updatedAt || lProg.completedAt || 0).getTime();
        mergedMisProg[key] = cTime >= lTime ? { ...lProg, ...cProg } : { ...cProg, ...lProg };
      }
      if (cProg.missionId && cProg.userId) {
        const altKey = `${cProg.missionId}_${cProg.userId}`;
        if (!mergedMisProg[altKey]) mergedMisProg[altKey] = mergedMisProg[key];
      }
    });
  }

  const mergedMatProg: Record<string, any> = { ...(local.materialProgress || {}) };
  if (cloud.materialProgress) {
    Object.entries(cloud.materialProgress).forEach(([key, cProg]: [string, any]) => {
      if (!cProg) return;
      const lProg = mergedMatProg[key];
      if (!lProg) {
        mergedMatProg[key] = cProg;
      } else {
        const cTime = new Date(cProg.completedAt || cProg.openedAt || 0).getTime();
        const lTime = new Date(lProg.completedAt || lProg.openedAt || 0).getTime();
        mergedMatProg[key] = cTime >= lTime ? { ...lProg, ...cProg } : { ...cProg, ...lProg };
      }
      if (cProg.materialId && cProg.userId) {
        const altKey = `${cProg.materialId}_${cProg.userId}`;
        if (!mergedMatProg[altKey]) mergedMatProg[altKey] = mergedMatProg[key];
      }
    });
  }

  // 9. Announcements
  const annMap = new Map<string, any>();
  (local.announcements || []).forEach((an: any) => { if (an?.id) annMap.set(an.id, an); });
  (cloud.announcements || []).forEach((an: any) => {
    if (an?.id) {
      const existing = annMap.get(an.id);
      annMap.set(an.id, existing ? { ...existing, ...an } : an);
    }
  });

  // 10. Point Ledger with deduplication by idempotencyKey || id
  const ledgerMap = new Map<string, any>();
  const seenLedgerKeys = new Set<string>();
  const addLedgerEntry = (pl: any) => {
    if (!pl || !pl.id) return;
    const key = pl.idempotencyKey || pl.id;
    if (!seenLedgerKeys.has(key)) {
      seenLedgerKeys.add(key);
      ledgerMap.set(pl.id, pl);
    }
  };
  (cloud.pointLedger || []).forEach(addLedgerEntry);
  (local.pointLedger || []).forEach(addLedgerEntry);
  const mergedLedger = Array.from(ledgerMap.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  // Reconcile userStats with mergedLedger to ensure 100% mathematical consistency
  const ledgerByUser = new Map<string, any[]>();
  mergedLedger.forEach((pl: any) => {
    if (!pl?.userId) return;
    const list = ledgerByUser.get(pl.userId) || [];
    list.push(pl);
    ledgerByUser.set(pl.userId, list);
  });

  Object.keys(mergedStats).forEach((uid) => {
    const studentLedgers = ledgerByUser.get(uid);
    if (studentLedgers && studentLedgers.length > 0) {
      const ledgerTotal = Math.max(0, studentLedgers.reduce((sum, l) => sum + (Number(l.amount) || 0), 0));
      const academicTotal = Math.max(0, studentLedgers.filter((l) => l.category === 'academic').reduce((sum, l) => sum + (Number(l.amount) || 0), 0));
      const partTotal = Math.max(0, ledgerTotal - academicTotal);
      const totalXp = studentLedgers.reduce((sum, l) => {
        const val = l.xpAmount !== undefined ? l.xpAmount : l.amount;
        return sum + (val > 0 ? Number(val) : 0);
      }, 0);

      mergedStats[uid] = {
        ...mergedStats[uid],
        totalPoints: ledgerTotal,
        academicPoints: academicTotal,
        participationPoints: partTotal,
        totalXp: Math.max(mergedStats[uid]?.totalXp || 0, totalXp),
      };
    }
  });

  // 11. Chat Messages
  const chatMap = new Map<string, any>();
  (local.chatMessages || []).forEach((m: any) => { if (m?.id) chatMap.set(m.id, m); });
  (cloud.chatMessages || []).forEach((m: any) => {
    if (m?.id) {
      const existing = chatMap.get(m.id);
      chatMap.set(m.id, existing ? { ...existing, ...m } : m);
    }
  });
  const mergedChat = Array.from(chatMap.values()).sort(
    (a, b) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
  );

  // 12. Notifications
  const notifMap = new Map<string, any>();
  (local.notifications || []).forEach((n: any) => { if (n?.id) notifMap.set(n.id, n); });
  (cloud.notifications || []).forEach((n: any) => {
    if (n?.id) {
      const existing = notifMap.get(n.id);
      notifMap.set(n.id, existing ? { ...existing, ...n } : n);
    }
  });
  const mergedNotifs = Array.from(notifMap.values()).sort(
    (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  );

  return {
    ...local,
    school: cloud.school ? { ...local.school, ...cloud.school } : local.school,
    classes: mergedClasses,
    users: Array.from(userMap.values()).filter((u: any) => u?.uid && !deletedIds.has(u.uid)),
    userStats: mergedStats,
    materials: mergedMaterials,
    materialProgress: mergedMatProg,
    assignments: mergedAssignments,
    submissions: mergedSubmissions,
    missions: mergedMissions,
    missionProgress: mergedMisProg,
    announcements: Array.from(annMap.values()),
    pointLedger: mergedLedger,
    chatMessages: mergedChat,
    // 13. Quizzes
    quizzes: Array.isArray(cloud.quizzes)
      ? sortItemsNewestFirst([
          ...cloud.quizzes,
          ...(local.quizzes || []).filter((q: any) => {
            if (!q?.id || cloud.quizzes.some((cq: any) => cq.id === q.id)) return false;
            return now - new Date(q.createdAt || 0).getTime() < 10000;
          }),
        ])
      : sortItemsNewestFirst(local.quizzes || []),

    // 14. Quiz Submissions
    quizSubmissions: {
      ...(local.quizSubmissions || {}),
      ...(cloud.quizSubmissions || {}),
    },

    badges: cloud.badges && cloud.badges.length > 0 ? cloud.badges : local.badges,
    userBadges: (cloud.userBadges || []).filter((b: any) => b?.userId && userMap.has(b.userId)),
    notifications: mergedNotifs.length > 0 ? mergedNotifs : (local.notifications || []),
  };
}

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const deletedItemIds = useRef<Set<string>>(getStoredDeletedIds());
  
  // Load initial from storage or defaults
  const [data, setData] = useState(() => {
    let sessionUserId: string | null = null;
    try {
      sessionUserId = safeSessionStorage.getItem(SESSION_USER_KEY) || safeStorage.getItem(SESSION_USER_KEY);
    } catch (e) {}

    let saved: string | null = null;
    try {
      saved = safeStorage.getItem(STORAGE_KEY);
    } catch (e) {}
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        Object.keys(parsed).forEach(k => {
          if (Array.isArray(parsed[k])) {
            parsed[k] = parsed[k].filter((i: any) => i);
          }
        });

        return {
          users: parsed.users || [],
          school: parsed.school || INITIAL_SCHOOL,
          classes: parsed.classes || INITIAL_CLASSES,
          materials: sortItemsNewestFirst(parsed.materials || []),
          materialProgress: parsed.materialProgress || {},
          assignments: sortItemsNewestFirst(parsed.assignments || []),
          submissions: parsed.submissions || {},
          quizzes: sortItemsNewestFirst(parsed.quizzes || []),
          quizSubmissions: parsed.quizSubmissions || {},
          missions: sortItemsNewestFirst(parsed.missions || []),
          missionProgress: parsed.missionProgress || {},
          pointLedger: parsed.pointLedger || [],
          userStats: parsed.userStats || {},
          badges: parsed.badges || INITIAL_BADGES,
          userBadges: parsed.userBadges || [],
          announcements: parsed.announcements || [],
          auditLogs: parsed.auditLogs || [],
          chatMessages: parsed.chatMessages || [],
          notifications: parsed.notifications || [],
          currentUserId: sessionUserId || null,
          currentClassId: parsed.currentClassId || 'cls_6a',
        };
      } catch (e) {
        console.error('Failed to parse stored state', e);
      }
    }
    return {
      users: [],
      school: INITIAL_SCHOOL,
      classes: [],
      materials: [],
      materialProgress: {},
      assignments: [],
      submissions: {},
      quizzes: [],
      quizSubmissions: {},
      missions: [],
      missionProgress: {},
      pointLedger: [],
      userStats: {},
      badges: INITIAL_BADGES,
      userBadges: [],
      announcements: [],
      auditLogs: [],
      chatMessages: [],
      notifications: [] as NotificationItem[],
      currentUserId: sessionUserId || null,
      currentClassId: 'cls_6a',
    };
  });
  
  const [activeTab, setActiveTab] = useState<string>('beranda');
  const [isFirebaseSynced, setIsFirebaseSynced] = useState<boolean>(false);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState<boolean>(() => isFirestoreQuotaExceeded());
  const [userPresences, setUserPresences] = useState<Record<string, UserPresence>>({});
  const isSavingRef = useRef<boolean>(false);
  const hasLoadedCloudRef = useRef(false);

  // 1. Initial State Load (runs synchronously on first render)
  useEffect(() => {
    const handleQuota = (e: any) => {
      setIsQuotaExceeded(Boolean(e.detail?.exceeded));
    };
    window.addEventListener('firestore-quota-exceeded', handleQuota);
    return () => window.removeEventListener('firestore-quota-exceeded', handleQuota);
  }, []);

  // Initialize and seed Firebase if needed on mount, plus subscribe to real-time collections
  useEffect(() => {
    let isMounted = true;
    let unsubList: Array<() => void> = [];

    async function initFirebaseSync() {
      try {
        await seedFirestoreIfEmpty();
        if (isMounted) {
          setIsFirebaseSynced(true);
        }

        const cloudData = await loadAllFromFirestore();
        if (isMounted && cloudData) {
          setData((prev: any) => {
            const merged = mergeLocalAndCloud(prev, cloudData, deletedItemIds.current);
            return merged;
          });
          hasLoadedCloudRef.current = true;
        }

        // Real-time synchronization listeners across all clients
        const unsubSubmissions = subscribeToRealtimeCollection(COLLECTIONS.SUBMISSIONS, (items) => {
          if (!isMounted) return;
          setData((prev: any) => {
            const updatedSubs: Record<string, any> = {};
            (items || []).forEach((sub: any) => {
              if (deletedItemIds.current.has(sub.id) || (sub.userId && deletedItemIds.current.has(sub.userId))) return;
              if (sub.id) {
                updatedSubs[sub.id] = sub;
              }
              if (sub.assignmentId && sub.userId) {
                updatedSubs[`${sub.assignmentId}_${sub.userId}`] = sub;
              }
            });
            return { ...prev, submissions: updatedSubs };
          });
        });
        unsubList.push(unsubSubmissions);

        const unsubAssignments = subscribeToRealtimeCollection(COLLECTIONS.ASSIGNMENTS, (items) => {
          if (!isMounted) return;
          const sorted = sortItemsNewestFirst((items || []) as Assignment[]).filter(a => !deletedItemIds.current.has(a.id));
          setData((prev: any) => ({ ...prev, assignments: sorted }));
        });
        unsubList.push(unsubAssignments);

        const unsubMaterials = subscribeToRealtimeCollection(COLLECTIONS.MATERIALS, (items) => {
          if (!isMounted) return;
          const sorted = sortItemsNewestFirst((items || []) as Material[]).filter(a => !deletedItemIds.current.has(a.id));
          setData((prev: any) => ({ ...prev, materials: sorted }));
        });
        unsubList.push(unsubMaterials);

        const unsubAnnouncements = subscribeToRealtimeCollection(COLLECTIONS.ANNOUNCEMENTS, (items) => {
          if (!isMounted) return;
          const valid = (items || []).filter((an: any) => an && an.id && !deletedItemIds.current.has(an.id));
          setData((prev: any) => ({ ...prev, announcements: valid as Announcement[] }));
        });
        unsubList.push(unsubAnnouncements);

        const unsubUsers = subscribeToRealtimeCollection(COLLECTIONS.USERS, (items) => {
          if (!isMounted) return;
          setData((prev: any) => {
            const validItems = (items || []).filter((u: any) => u?.uid && !deletedItemIds.current.has(u.uid));
            const firestoreUids = new Set(validItems.map((u: any) => u.uid));
            const now = Date.now();
            // Preserve locally provisioned users from the last 15s not yet in Firestore
            const pendingLocal = (prev.users || []).filter((u: any) => {
              if (!u?.uid || deletedItemIds.current.has(u.uid) || firestoreUids.has(u.uid)) return false;
              const created = new Date(u.createdAt || 0).getTime();
              return now - created < 15000;
            });
            const merged = validItems.map((cloudUser: any) => {
              const local = (prev.users || []).find((u: any) => u.uid === cloudUser.uid);
              if (local) {
                const cloudTime = new Date(cloudUser.updatedAt || cloudUser.createdAt || 0).getTime();
                const localTime = new Date(local.updatedAt || local.createdAt || 0).getTime();
                if (localTime > cloudTime && now - localTime < 5000) {
                  return { ...cloudUser, ...local };
                }
                return { ...local, ...cloudUser };
              }
              return cloudUser;
            });
            return { ...prev, users: [...merged, ...pendingLocal] };
          });
        });
        unsubList.push(unsubUsers);

        const unsubClasses = subscribeToRealtimeCollection(COLLECTIONS.CLASSES, (items) => {
          if (!isMounted) return;
          const validClasses = (items || []).filter((c: any) => c && c.id && !deletedItemIds.current.has(c.id));
          setData((prev: any) => ({ ...prev, classes: validClasses }));
        });
        unsubList.push(unsubClasses);

        const unsubUserStats = subscribeToRealtimeCollection(COLLECTIONS.USER_STATS, (items) => {
          if (!isMounted) return;
          const updated: Record<string, any> = {};
          (items || []).forEach((st: any) => {
            const id = st.uid || st.id;
            if (id && !deletedItemIds.current.has(id)) {
              updated[id] = st;
            }
          });
          setData((prev: any) => ({ ...prev, userStats: updated }));
        });
        unsubList.push(unsubUserStats);

        const unsubPointLedger = subscribeToRealtimeCollection(COLLECTIONS.POINT_LEDGER, (items) => {
          if (!isMounted) return;
          const valid = (items || []).filter((pl: any) => pl && pl.id && !deletedItemIds.current.has(pl.id) && !deletedItemIds.current.has(pl.userId));
          const sorted = valid.sort(
            (a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          );
          setData((prev: any) => ({ ...prev, pointLedger: sorted }));
        });
        unsubList.push(unsubPointLedger);

        const unsubMatProgress = subscribeToRealtimeCollection(COLLECTIONS.MATERIAL_PROGRESS, (items) => {
          if (!isMounted) return;
          setData((prev: any) => {
            const updated: Record<string, any> = {};
            (items || []).forEach((p: any) => {
              if (deletedItemIds.current.has(p.userId)) return;
              const key = `${p.materialId}_${p.userId}`;
              updated[key] = p;
            });
            return { ...prev, materialProgress: updated };
          });
        });
        unsubList.push(unsubMatProgress);

        const unsubMisProgress = subscribeToRealtimeCollection(COLLECTIONS.MISSION_PROGRESS, (items) => {
          if (!isMounted) return;
          setData((prev: any) => {
            const updated: Record<string, any> = {};
            (items || []).forEach((p: any) => {
              if (deletedItemIds.current.has(p.userId)) return;
              if (p.id) updated[p.id] = p;
              const key = `${p.missionId}_${p.userId}_${p.periodKey || 'w1'}`;
              updated[key] = p;
              if (p.missionId && p.userId) {
                updated[`${p.missionId}_${p.userId}`] = p;
                updated[`${p.missionId}_${p.userId}_once`] = p;
                updated[`${p.missionId}_${p.userId}_w1`] = p;
              }
            });
            return { ...prev, missionProgress: updated };
          });
        });
        unsubList.push(unsubMisProgress);

        const unsubMissions = subscribeToRealtimeCollection(COLLECTIONS.MISSIONS, (items) => {
          if (!isMounted) return;
          const sorted = sortItemsNewestFirst((items || []) as Mission[]).filter(a => !deletedItemIds.current.has(a.id));
          setData((prev: any) => ({ ...prev, missions: sorted }));
        });
        unsubList.push(unsubMissions);

        const unsubUserBadges = subscribeToRealtimeCollection(COLLECTIONS.USER_BADGES, (items) => {
          if (!isMounted) return;
          const valid = (items || []).filter((b: any) => b && !deletedItemIds.current.has(b.userId));
          setData((prev: any) => ({ ...prev, userBadges: valid }));
        });
        unsubList.push(unsubUserBadges);

        const unsubQuizzes = subscribeToRealtimeCollection(COLLECTIONS.QUIZZES, (items) => {
          if (!isMounted) return;
          const sorted = sortItemsNewestFirst((items || []) as Quiz[]).filter(q => !deletedItemIds.current.has(q.id));
          setData((prev: any) => ({ ...prev, quizzes: sorted }));
        });
        unsubList.push(unsubQuizzes);

        const unsubQuizSubmissions = subscribeToRealtimeCollection(COLLECTIONS.QUIZ_SUBMISSIONS, (items) => {
          if (!isMounted) return;
          setData((prev: any) => {
            const updated: Record<string, any> = {};
            (items || []).forEach((sub: any) => {
              if (deletedItemIds.current.has(sub.userId)) return;
              if (sub.id) updated[sub.id] = sub;
              if (sub.quizId && sub.userId) updated[`${sub.quizId}_${sub.userId}`] = sub;
            });
            return { ...prev, quizSubmissions: updated };
          });
        });
        unsubList.push(unsubQuizSubmissions);

        const unsubChat = subscribeToRealtimeCollection(COLLECTIONS.CHAT_MESSAGES, (items) => {
          if (!isMounted) return;
          setData((prev: any) => {
            const validItems = (items || []).filter((m: any) => m && m.id && !deletedItemIds.current.has(m.id));
            const firestoreIds = new Set(validItems.map((m: any) => m.id));
            const now = Date.now();
            // Preserve pending optimistic messages sent by currentUser within last 15s
            const pendingLocal = (prev.chatMessages || []).filter((m: any) => {
              if (firestoreIds.has(m.id) || deletedItemIds.current.has(m.id)) return false;
              const msgTime = new Date(m.createdAt || 0).getTime();
              return now - msgTime < 15000 && m.senderId === prev.currentUserId;
            });

            const combined = [
              ...validItems.map((m: any) => ({
                ...m,
                reactions: m.reactions || {},
              })),
              ...pendingLocal,
            ];

            const sorted = combined.sort(
              (a: any, b: any) => new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()
            );
            return { ...prev, chatMessages: sorted };
          });
        });
        unsubList.push(unsubChat);

        const unsubNotifications = subscribeToRealtimeCollection(COLLECTIONS.NOTIFICATIONS, (items) => {
          if (!isMounted) return;
          const valid = (items || []).filter((n: any) => n && n.id && !deletedItemIds.current.has(n.id) && !deletedItemIds.current.has(n.userId));
          const sorted = valid.sort(
            (a: any, b: any) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
          );
          setData((prev: any) => ({ ...prev, notifications: sorted }));
        });
        unsubList.push(unsubNotifications);

        const unsubPresence = subscribeToRealtimeCollection(COLLECTIONS.USER_PRESENCE, (items) => {
          if (!isMounted) return;
          const presMap: Record<string, UserPresence> = {};
          items.forEach((p: any) => {
            const uid = p.userId || p.id;
            if (uid) {
              presMap[uid] = {
                userId: uid,
                displayName: p.displayName || '',
                role: p.role || 'student',
                avatarUrl: p.avatarUrl,
                classId: p.classId,
                isOnline: Boolean(p.isOnline),
                lastSeen: typeof p.lastSeen === 'number' ? p.lastSeen : Date.now(),
                lastSeenIso: p.lastSeenIso || new Date().toISOString(),
                activity: p.activity,
              };
            }
          });
          setUserPresences(presMap);
        });
        unsubList.push(unsubPresence);
      } catch (err) {
        console.warn('Firebase sync status:', err instanceof Error ? err.message : String(err));
      }
    }

    initFirebaseSync();

    return () => {
      isMounted = false;
      unsubList.forEach((unsub) => unsub());
    };
  }, []);

  const fallbackAdminUser: User = {
    uid: 'admin',
    role: 'admin',
    status: 'active',
    displayName: 'Administrator',
    searchName: 'administrator admin',
    username: 'admin',
    password: 'admin',
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=Admin&backgroundColor=10b981',
    schoolId: 'sch_merdeka_01',
    classIds: ['cls_6a'],
  };

  const currentUser: User | null = data.currentUserId
    ? (data.users.find((u: User) => u.uid === data.currentUserId) || (data.currentUserId === 'admin' ? fallbackAdminUser : null))
    : null;
  const currentRole: UserRole | null = currentUser?.role || null;
  const isAuthenticated: boolean = !!currentUser;

  // Heartbeat mechanism for currentUser to maintain real-time online presence in Firestore
  useEffect(() => {
    if (!currentUser || isFirestoreQuotaExceeded()) return;

    let isSubscribed = true;

    const reportHeartbeat = (isOnline: boolean = true) => {
      if (!isSubscribed || !currentUser || isFirestoreQuotaExceeded()) return;
      updateUserPresence({
        userId: currentUser.uid,
        displayName: currentUser.displayName,
        role: currentUser.role,
        avatarUrl: currentUser.avatarUrl,
        classId: data.currentClassId || currentUser.classIds?.[0] || 'cls_6a',
        isOnline,
        lastSeen: Date.now(),
        lastSeenIso: new Date().toISOString(),
        activity: 'Aktif di Aplikasi',
      });
    };

    // Immediate heartbeat upon mount / login
    reportHeartbeat(true);

    // Heartbeat every 90 seconds while page is active
    const heartbeatTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && !isFirestoreQuotaExceeded()) {
        reportHeartbeat(true);
      }
    }, 90000);

    const handleBeforeUnload = () => {
      if (!isFirestoreQuotaExceeded()) {
        setUserOffline(currentUser.uid);
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && !isFirestoreQuotaExceeded()) {
        reportHeartbeat(true);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleBeforeUnload);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      isSubscribed = false;
      clearInterval(heartbeatTimer);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleBeforeUnload);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      handleBeforeUnload();
    };
  }, [currentUser?.uid, data.currentClassId, isQuotaExceeded]);

  // Real-time online check:
  // Current user is always online.
  // Other users are strictly online only if isOnline === true and their heartbeat is within the last 60 seconds.
  const isUserOnline = (userId: string): boolean => {
    if (!userId) return false;
    if (currentUser && currentUser.uid === userId) return true;
    const pres = userPresences[userId];
    if (!pres || !pres.isOnline) return false;
    const now = Date.now();
    return (now - (pres.lastSeen || 0)) < 60000;
  };

  const refreshFromCloud = async () => {
    if (isFirestoreQuotaExceeded()) return;
    try {
      const cloudData = await loadAllFromFirestore();
      if (cloudData) {
        setData((prev: any) => {
          const merged = mergeLocalAndCloud(prev, cloudData, deletedItemIds.current);
          return merged;
        });
        setIsFirebaseSynced(true);
      }
    } catch (e) {
      console.warn('Refresh error:', e);
    }
  };

  const syncAllToCloud = async (): Promise<boolean> => {
    if (isFirestoreQuotaExceeded()) return false;
    try {
      setIsFirebaseSynced(false);
      const res = await syncAllStateToFirestore(data);
      if (res) {
        setIsFirebaseSynced(true);
      }
      return res;
    } catch (e) {
      console.warn('Manual sync warning:', e);
      return false;
    }
  };

  // Debounced save to local storage (runs at most once every 1000ms, never blocking UI)
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        const cacheSnapshot = {
          school: data.school,
          classes: data.classes,
          currentClassId: data.currentClassId,
          users: (data.users || []).map((u: any) => ({
            uid: u.uid,
            displayName: u.displayName,
            role: u.role,
            avatarUrl: u.avatarUrl,
            studentNumber: u.studentNumber,
            absentNumber: u.absentNumber,
            classIds: u.classIds,
          })),
          assignments: data.assignments,
          materials: data.materials,
          quizzes: data.quizzes,
          missions: data.missions,
          userStats: data.userStats,
        };
        safeStorage.setItem(STORAGE_KEY, JSON.stringify(cacheSnapshot));
      } catch (e) {
        console.warn('Storage cache error:', e);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [data]);

  // Pastikan siswa selalu berada di kelas tempat ia terdaftar dan tidak dapat memilih kelas lain
  const studentFirstClassId = currentUser?.role === 'student' ? currentUser.classIds?.[0] : undefined;
  useEffect(() => {
    if (studentFirstClassId && data.currentClassId !== studentFirstClassId) {
      setData((prev: any) => ({ ...prev, currentClassId: studentFirstClassId }));
    }
  }, [currentUser?.uid, studentFirstClassId, data.currentClassId]);

  const setCurrentClassId = (classId: string) => {
    setData((prev: any) => ({ ...prev, currentClassId: classId }));
  };

  const switchUser = (userId: string) => {
    let target = (data.users || []).find((u: User) => u.uid === userId);
    if (!target && userId === 'admin') {
      target = fallbackAdminUser;
    }
    if (target) {
      try {
        safeSessionStorage.setItem(SESSION_USER_KEY, userId);
      } catch (e) {}

      setData((prev: any) => {
        const hasAdmin = (prev.users || []).some((u: User) => u.uid === 'admin');
        const updatedUsers = hasAdmin ? prev.users : [fallbackAdminUser, ...(prev.users || [])];
        return {
          ...prev,
          users: updatedUsers,
          currentUserId: userId,
          currentClassId: target.classIds?.[0] || prev.currentClassId || 'cls_6a',
        };
      });
      setActiveTab('beranda');
    }
  };

  const loginUser = (identifier: string, pass: string, role: UserRole) => {
    const cleanId = identifier.trim().toLowerCase();
    const cleanPass = pass.trim();

    if (role === 'admin' || cleanId === 'admin') {
      if (cleanPass === 'admin' || cleanPass === 'admin123') {
        switchUser('admin');
        return { success: true };
      }
    }

    const found = data.users.find((u: User) => {
      if (u.role !== role) return false;
      if (u.uid && u.uid.toLowerCase() === cleanId) return true;
      if (u.username && u.username.toLowerCase() === cleanId) return true;
      if (u.email && u.email.toLowerCase() === cleanId) return true;
      if (u.studentNumber && u.studentNumber.toLowerCase() === cleanId) return true;
      if (u.displayName && u.displayName.toLowerCase() === cleanId) return true;
      return false;
    });

    if (!found) {
      return {
        success: false,
        message: role === 'student' 
          ? 'Username / Akun siswa tidak ditemukan. Silakan pilih dari dropdown atau hubungi guru.' 
          : 'Email atau username guru tidak ditemukan.',
      };
    }

    const expectedPassword = found.password || (role === 'teacher' ? 'guru123' : '123456');
    const isPasswordValid = cleanPass === expectedPassword;

    if (!isPasswordValid) {
      return {
        success: false,
        message: role === 'teacher'
          ? 'Kata sandi guru salah. Silakan periksa kembali kata sandi akun Anda.'
          : 'Kata sandi salah. Silakan tanyakan kata sandi kepada guru kelas jika lupa.',
      };
    }

    switchUser(found.uid);
    return { success: true };
  };

  const logoutUser = () => {
    try {
      safeSessionStorage.removeItem(SESSION_USER_KEY);
    } catch (e) {}
    setData((prev: any) => ({
      ...prev,
      currentUserId: null,
    }));
  };

  const updateUserProfile = (profileData: {
    displayName?: string;
    username?: string;
    password?: string;
    avatarUrl?: string;
  }): { success: boolean; message?: string } => {
    if (!currentUser) return { success: false, message: 'Tidak ada sesi pengguna aktif.' };
    const now = new Date().toISOString();
    const cleanName = profileData.displayName?.trim();
    const cleanUsername = profileData.username?.trim().toLowerCase();
    const cleanPassword = profileData.password?.trim();

    // Check username uniqueness if modified
    if (cleanUsername && cleanUsername !== currentUser.username?.toLowerCase()) {
      const isUsernameTaken = data.users.some(
        (u: User) => u.uid !== currentUser.uid && u.username?.toLowerCase() === cleanUsername
      );
      if (isUsernameTaken) {
        return {
          success: false,
          message: `Username "${cleanUsername}" sudah digunakan oleh akun lain. Silakan pilih username yang berbeda.`,
        };
      }
    }

    setData((prev: any) => {
      const updatedUsers = prev.users.map((u: User) => {
        if (u.uid === currentUser.uid) {
          const updated: User = {
            ...u,
            ...(cleanName ? { displayName: cleanName, searchName: cleanName.toLowerCase() } : {}),
            ...(cleanUsername ? { username: cleanUsername } : {}),
            ...(cleanPassword ? { password: cleanPassword, mustChangePassword: false } : {}),
            ...(profileData.avatarUrl ? { avatarUrl: profileData.avatarUrl } : {}),
            updatedAt: now,
          };
          syncDocToFirestore(COLLECTIONS.USERS, currentUser.uid, updated);
          return updated;
        }
        return u;
      });

      return {
        ...prev,
        users: updatedUsers,
      };
    });

    return { success: true };
  };

  const updateUserAvatar = (avatarUrl: string) => {
    updateUserProfile({ avatarUrl });
  };

  const updateSchoolProfile = async (updated: Partial<School>): Promise<{ success: boolean; message?: string }> => {
    try {
      const now = new Date().toISOString();
      const updatedSchool: School = {
        ...data.school,
        ...updated,
        settings: {
          ...data.school.settings,
          ...(updated.settings || {}),
        },
      };

      setData((prev: any) => ({
        ...prev,
        school: updatedSchool,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            schoolId: updatedSchool.id,
            actorId: currentUser?.uid || 'usr_guru',
            actorName: currentUser?.displayName || 'Guru Kelas',
            action: 'update_school_profile',
            targetType: 'school',
            targetId: updatedSchool.id,
            details: `Profil sekolah diperbarui menjadi "${updatedSchool.name}" (NPSN: ${updatedSchool.npsn || '-'}).`,
            timestamp: now,
          },
          ...(prev.auditLogs || []),
        ],
      }));

      await syncDocToFirestore(COLLECTIONS.SCHOOL, updatedSchool.id, updatedSchool);
      return { success: true };
    } catch (err: any) {
      console.error('Gagal memperbarui profil sekolah ke Firestore:', err);
      return { success: false, message: err?.message || 'Gagal menyimpan profil sekolah ke database.' };
    }
  };

  const changePassword = (newPass: string) => {
    if (!currentUser) return;
    const now = new Date().toISOString();
    const updatedUser = { ...currentUser, mustChangePassword: false, password: newPass, updatedAt: now };
    setData((prev: any) => ({
      ...prev,
      users: prev.users.map((u: User) =>
        u.uid === currentUser.uid ? updatedUser : u
      ),
    }));
    syncDocToFirestore(COLLECTIONS.USERS, currentUser.uid, updatedUser);
  };

  const addNotification = (userId: string, title: string, message: string, type: any, targetTab?: string, targetId?: string) => {
    const newNotif: NotificationItem = {
      id: `notif_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      userId,
      title,
      message,
      type,
      targetTab,
      targetId,
      isRead: false,
      createdAt: new Date().toISOString(),
    };
    setData((prev: any) => ({
      ...prev,
      notifications: [newNotif, ...prev.notifications],
    }));
    syncDocToFirestore(COLLECTIONS.NOTIFICATIONS, newNotif.id, newNotif);
  };

  const markNotificationRead = (id: string) => {
    setData((prev: any) => ({
      ...prev,
      notifications: prev.notifications.map((n: NotificationItem) => (n.id === id ? { ...n, isRead: true } : n)),
    }));
    syncDocToFirestore(COLLECTIONS.NOTIFICATIONS, id, { isRead: true });
  };

  const markAllNotificationsRead = () => {
    if (!currentUser) return;
    setData((prev: any) => {
      const updated = prev.notifications.map((n: NotificationItem) =>
        n.userId === currentUser.uid ? { ...n, isRead: true } : n
      );
      updated
        .filter((n: NotificationItem) => n.userId === currentUser.uid)
        .forEach((n: NotificationItem) => {
          syncDocToFirestore(COLLECTIONS.NOTIFICATIONS, n.id, { isRead: true });
        });
      return {
        ...prev,
        notifications: updated,
      };
    });
  };

  // Helper to safely update stats, totalPoints (Leaderboard) & totalXp (Leveling)
  const recalculateUserStats = (
    currentStatsMap: Record<string, UserStats>,
    userId: string,
    pointsDelta: number,
    category: 'academic' | 'participation' | 'mission' | 'adjustment',
    xpDelta: number = 0
  ): Record<string, UserStats> => {
    const user = data.users.find((u: User) => u.uid === userId);
    const existing = currentStatsMap[userId] || {
      uid: userId,
      schoolId: user?.schoolId || INITIAL_SCHOOL.id,
      classId: user?.classIds?.[0] || 'cls_6a',
      totalPoints: 0,
      totalXp: 0,
      academicPoints: 0,
      participationPoints: 0,
      level: 1,
      completedAssignments: 0,
      completedMissions: 0,
      badgeCount: 0,
      updatedAt: new Date().toISOString(),
    };

    const newTotalPoints = Math.max(0, (existing.totalPoints || 0) + pointsDelta);
    // XP is strictly non-negative and cumulative for leveling
    const currentXp = existing.totalXp !== undefined ? existing.totalXp : (existing.totalPoints || 0);
    const newTotalXp = Math.max(0, currentXp + Math.max(0, xpDelta));

    let newAcademic = existing.academicPoints || 0;
    if (category === 'academic') {
      newAcademic = Math.max(0, newAcademic + pointsDelta);
    }
    // Participation points balances totalPoints so that academicPoints + participationPoints === totalPoints
    const newParticipation = Math.max(0, newTotalPoints - newAcademic);

    // Level is calculated from XP
    const { currentLevel } = getLevelInfo(newTotalXp, DEFAULT_LEVELS);
    const prevLevel = existing.level || 1;

    if (currentLevel.level > prevLevel && currentUser && userId === currentUser.uid) {
      fireCelebrationConfetti('level_up');
      addNotification(
        userId,
        `🎉 Selamat! Kamu Naik ke Level ${currentLevel.level}`,
        `Hebat! Kamu sekarang bergelar "${currentLevel.name}". Terus kumpulkan XP untuk naik level dan Poin untuk leaderboard!`,
        'point'
      );
    }

    return {
      ...currentStatsMap,
      [userId]: {
        ...existing,
        totalPoints: newTotalPoints,
        totalXp: newTotalXp,
        academicPoints: newAcademic,
        participationPoints: newParticipation,
        level: currentLevel.level,
        updatedAt: new Date().toISOString(),
      },
    };
  };

  // Student marks material reading complete
  const markMaterialCompleted = (materialId: string) => {
    if (!currentUser) return;
    const key = `${materialId}_${currentUser.uid}`;
    const now = new Date().toISOString();

    setData((prev: any) => {
      const alreadyCompleted = prev.materialProgress[key]?.status === 'completed';

      const updatedProg = {
        ...prev.materialProgress,
        [key]: {
          materialId,
          userId: currentUser.uid,
          classId: data.currentClassId,
          status: 'completed',
          openedAt: prev.materialProgress[key]?.openedAt || now,
          completedAt: now,
        },
      };

      let updatedStats = { ...prev.userStats };
      let updatedLedger = [...prev.pointLedger];

      const targetMat = prev.materials.find((m: Material) => m.id === materialId);
      const pointsEarned = targetMat?.rewardPoints ?? 20;
      const xpEarned = targetMat?.rewardXp ?? (targetMat?.rewardPoints ?? 25);

      if (!alreadyCompleted && (pointsEarned > 0 || xpEarned > 0)) {
        // Award points & XP to student
        const ledgerEntry: PointLedger = {
          id: `led_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          schoolId: data.school.id,
          classId: data.currentClassId,
          userId: currentUser.uid,
          amount: pointsEarned,
          xpAmount: xpEarned,
          category: 'participation',
          sourceType: 'material',
          sourceId: materialId,
          idempotencyKey: `complete_mat_${materialId}_${currentUser.uid}`,
          reason: `Mempelajari Modul Materi: ${targetMat?.title || 'Materi Belajar'}`,
          actorId: 'system',
          actorName: 'Sistem Kelas 6E',
          createdAt: now,
        };
        updatedLedger = [ledgerEntry, ...updatedLedger];
        updatedStats = recalculateUserStats(prev.userStats, currentUser.uid, pointsEarned, 'participation', xpEarned);

        fireCelebrationConfetti('level_up');
        addNotification(
          currentUser.uid,
          '⭐ Reward Materi Diperoleh!',
          `Hebat! Kamu telah menuntaskan modul "${targetMat?.title || 'Materi'}" dan mendapatkan +${pointsEarned} Poin & +${xpEarned} XP!`,
          'material',
          'materi'
        );
      }

      // Check mission progress for reading materials
      let updatedMissionsProg = { ...prev.missionProgress };
      const activeMaterialMission = prev.missions.find(
        (m: Mission) => m.type === 'material' && m.status === 'active'
      );

      if (activeMaterialMission) {
        const misKey = `${activeMaterialMission.id}_${currentUser.uid}_w1`;
        const currentMProg = updatedMissionsProg[misKey]?.progress || 0;
        const newProg = Math.min(activeMaterialMission.target, currentMProg + 1);
        const isDone = newProg >= activeMaterialMission.target;

        updatedMissionsProg[misKey] = {
          missionId: activeMaterialMission.id,
          userId: currentUser.uid,
          classId: data.currentClassId,
          periodKey: 'w1',
          progress: newProg,
          status: isDone ? 'completed' : 'in_progress',
          completedAt: isDone ? now : undefined,
        };

        if (isDone) {
          addNotification(
            currentUser.uid,
            '🎯 Misi Eksplorasi Materi Selesai!',
            `Kamu telah menuntaskan target membaca materi. Buka menu Misi untuk klaim +${activeMaterialMission.rewardPoints} Poin!`,
            'mission',
            'misi'
          );
        }
      }

      return {
        ...prev,
        materialProgress: updatedProg,
        missionProgress: updatedMissionsProg,
        pointLedger: updatedLedger,
        userStats: updatedStats,
      };
    });

    // Firestore online synchronization for material completion
    const progData = {
      materialId,
      userId: currentUser.uid,
      classId: data.currentClassId,
      status: 'completed',
      openedAt: data.materialProgress[key]?.openedAt || now,
      completedAt: now,
      updatedAt: now,
    };
    syncDocToFirestore(COLLECTIONS.MATERIAL_PROGRESS, key, progData);

    const targetMat = data.materials.find((m: Material) => m.id === materialId);
    const pointsEarned = targetMat?.rewardPoints ?? 20;
    const wasAlreadyCompleted = data.materialProgress[key]?.status === 'completed';

    if (!wasAlreadyCompleted && pointsEarned > 0) {
      const ledgerEntry = {
        id: `led_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        schoolId: data.school.id,
        classId: data.currentClassId,
        userId: currentUser.uid,
        amount: pointsEarned,
        category: 'participation',
        sourceType: 'material',
        sourceId: materialId,
        idempotencyKey: `complete_mat_${materialId}_${currentUser.uid}`,
        reason: `Mempelajari Modul Materi: ${targetMat?.title || 'Materi Belajar'}`,
        actorId: 'system',
        actorName: 'Sistem Kelas 6E',
        createdAt: now,
      };
      syncDocToFirestore(COLLECTIONS.POINT_LEDGER, ledgerEntry.id, ledgerEntry);
      const updatedUserStat = recalculateUserStats(data.userStats, currentUser.uid, pointsEarned, 'participation')[currentUser.uid];
      if (updatedUserStat) {
        syncDocToFirestore(COLLECTIONS.USER_STATS, currentUser.uid, updatedUserStat);
      }
    }

    const activeMaterialMission = data.missions.find(
      (m: Mission) => m.type === 'material' && m.status === 'active'
    );
    if (activeMaterialMission) {
      const pKey = activeMaterialMission.repeat === 'once' ? 'once' : 'w1';
      const misKey = `${activeMaterialMission.id}_${currentUser.uid}_${pKey}`;
      const currentMProg = data.missionProgress[misKey]?.progress || 0;
      const newProg = Math.min(activeMaterialMission.target, currentMProg + 1);
      const isDone = newProg >= activeMaterialMission.target;
      const requiresTeacherVerification = activeMaterialMission.rewardMode === 'manual_verification';
      const targetStatus: MissionProgress['status'] = isDone
        ? (requiresTeacherVerification ? 'pending_verification' : 'completed')
        : 'in_progress';

      const progData: MissionProgress = {
        id: misKey,
        missionId: activeMaterialMission.id,
        userId: currentUser.uid,
        classId: data.currentClassId,
        periodKey: pKey,
        progress: newProg,
        status: targetStatus,
        completedAt: isDone && !requiresTeacherVerification ? now : undefined,
        submittedAt: isDone && requiresTeacherVerification ? now : undefined,
        updatedAt: now,
      };

      syncDocToFirestore(COLLECTIONS.MISSION_PROGRESS, misKey, progData);
      syncDocToFirestore(COLLECTIONS.MISSION_PROGRESS, `${activeMaterialMission.id}_${currentUser.uid}`, progData);

      setData((prev: any) => ({
        ...prev,
        missionProgress: {
          ...prev.missionProgress,
          [misKey]: progData,
          [`${activeMaterialMission.id}_${currentUser.uid}`]: progData,
          [`${activeMaterialMission.id}_${currentUser.uid}_w1`]: progData,
          [`${activeMaterialMission.id}_${currentUser.uid}_once`]: progData,
        },
      }));

      if (isDone && requiresTeacherVerification) {
        const teachers = data.users.filter((u: User) => u.role === 'teacher');
        teachers.forEach((t: User) => {
          addNotification(
            t.uid,
            `📥 Misi Perlu Diverifikasi: ${activeMaterialMission.title}`,
            `${currentUser.displayName} telah menyelesaikan target materi untuk misi "${activeMaterialMission.title}". Siap untuk diperiksa & dinilai guru.`,
            'mission',
            'misi',
            activeMaterialMission.id
          );
        });
      }
    }
  };

  // Student submits assignment
  const submitAssignment = (assignmentId: string, answerText: string, files: any[]) => {
    if (!currentUser) return;
    const targetAsg = data.assignments.find((a: Assignment) => a.id === assignmentId);
    if (!targetAsg) return;

    const subKey = `${assignmentId}_${currentUser.uid}`;
    const existingSub = data.submissions[subKey] || Object.values(data.submissions).find(
      (s: any) => s.assignmentId === assignmentId && s.userId === currentUser.uid
    );
    const now = new Date().toISOString();
    const isLate = new Date(now) > new Date(targetAsg.dueAt);
    const resolvedClassId = targetAsg.classIds?.[0] || currentUser.classIds?.[0] || data.currentClassId || 'cls_6a';

    const newSub: Submission = {
      id: subKey,
      assignmentId,
      userId: currentUser.uid,
      classId: resolvedClassId,
      answerText,
      files,
      status: 'submitted',
      attempt: (existingSub?.attempt || 0) + 1,
      submittedAt: now,
      isLate,
      updatedAt: now,
    };

    fireCelebrationConfetti('submission');

    const isFirstSubmission = !existingSub || !existingSub.submittedAt;
    let updatedMissionsProg = { ...data.missionProgress };
    if (isFirstSubmission) {
      // Update mission progress for assignment submission
      const assignmentMissions = data.missions.filter((m: Mission) => m.type === 'assignment' && m.status === 'active');
      assignmentMissions.forEach((mis: Mission) => {
        const pKey = mis.repeat === 'once' ? 'once' : 'w1';
        const misKey = `${mis.id}_${currentUser.uid}_${pKey}`;
        const currentProg = data.missionProgress[misKey]?.progress || 0;
        const newProg = Math.min(mis.target, currentProg + 1);
        const isDone = newProg >= mis.target;
        const requiresTeacherVerification = mis.rewardMode === 'manual_verification';
        const targetStatus: MissionProgress['status'] = isDone
          ? (requiresTeacherVerification ? 'pending_verification' : 'completed')
          : 'in_progress';

        const progData: MissionProgress = {
          id: misKey,
          missionId: mis.id,
          userId: currentUser.uid,
          classId: resolvedClassId,
          periodKey: pKey,
          progress: newProg,
          status: targetStatus,
          completedAt: isDone && !requiresTeacherVerification ? now : undefined,
          submittedAt: isDone && requiresTeacherVerification ? now : undefined,
          updatedAt: now,
        };
        updatedMissionsProg[misKey] = progData;
        updatedMissionsProg[`${mis.id}_${currentUser.uid}`] = progData;
        updatedMissionsProg[`${mis.id}_${currentUser.uid}_w1`] = progData;
        updatedMissionsProg[`${mis.id}_${currentUser.uid}_once`] = progData;
        syncDocToFirestore(COLLECTIONS.MISSION_PROGRESS, misKey, progData);
        syncDocToFirestore(COLLECTIONS.MISSION_PROGRESS, `${mis.id}_${currentUser.uid}`, progData);

        if (isDone && requiresTeacherVerification) {
          const teachers = data.users.filter((u: User) => u.role === 'teacher');
          teachers.forEach((t: User) => {
            addNotification(
              t.uid,
              `📥 Misi Perlu Diverifikasi: ${mis.title}`,
              `${currentUser.displayName} telah menyelesaikan target pengumpulan untuk misi "${mis.title}". Siap untuk diperiksa & dinilai guru.`,
              'mission',
              'misi',
              mis.id
            );
          });
        }
      });
    }

    setData((prev: any) => {
      const updatedSubmissions = {
        ...prev.submissions,
        [subKey]: newSub,
        [newSub.id]: newSub,
      };
      
      // Update student completedAssignments count
      const userStat = prev.userStats[currentUser.uid] || {
        uid: currentUser.uid,
        schoolId: prev.school.id,
        classId: resolvedClassId,
        totalPoints: 0,
        academicPoints: 0,
        participationPoints: 0,
        level: 1,
        completedAssignments: 0,
        completedMissions: 0,
        badgeCount: 0,
        updatedAt: now,
      };

      const updatedStats = {
        ...prev.userStats,
        [currentUser.uid]: {
          ...userStat,
          completedAssignments: (userStat.completedAssignments || 0) + (existingSub?.status ? 0 : 1),
          updatedAt: now,
        },
      };

      // Check first submission badge
      let updatedBadges = [...prev.userBadges];
      const hasFirstBadge = updatedBadges.some(
        (b) => b.userId === currentUser.uid && b.badgeId === 'bdg_first_submission'
      );
      if (!hasFirstBadge) {
        updatedBadges.push({
          id: `${currentUser.uid}_bdg_first_submission`,
          userId: currentUser.uid,
          badgeId: 'bdg_first_submission',
          source: targetAsg.title,
          awardedAt: now,
        });
        fireCelebrationConfetti('badge');
        addNotification(
          currentUser.uid,
          '🎖️ Badge Baru: Langkah Pertama!',
          'Selamat! Kamu meraih lencana pengumpulan tugas pertamamu.',
          'system',
          'profil'
        );
      }

      // Check early bird
      if (!isLate && new Date(targetAsg.dueAt).getTime() - new Date(now).getTime() > 12 * 60 * 60 * 1000) {
        const hasEarlyBadge = updatedBadges.some(
          (b) => b.userId === currentUser.uid && b.badgeId === 'bdg_early_bird'
        );
        if (!hasEarlyBadge) {
          updatedBadges.push({
            id: `${currentUser.uid}_bdg_early_bird`,
            userId: currentUser.uid,
            badgeId: 'bdg_early_bird',
            source: targetAsg.title,
            awardedAt: now,
          });
        }
      }

      return {
        ...prev,
        submissions: updatedSubmissions,
        userStats: updatedStats,
        userBadges: updatedBadges,
        missionProgress: { ...prev.missionProgress, ...updatedMissionsProg },
      };
    });

    // Online persistent synchronization: sync submission and userStats to Firestore
    syncDocToFirestore(COLLECTIONS.SUBMISSIONS, subKey, newSub);
    if (newSub.id !== subKey) {
      syncDocToFirestore(COLLECTIONS.SUBMISSIONS, newSub.id, newSub);
    }
    const updatedUserStat = recalculateUserStats(data.userStats, currentUser.uid, 0, 'academic')[currentUser.uid];
    if (updatedUserStat) {
      syncDocToFirestore(COLLECTIONS.USER_STATS, currentUser.uid, updatedUserStat);
    }

    addNotification(
      currentUser.uid,
      '✅ Tugas Berhasil Dikirim',
      `Tugas "${targetAsg.title}" telah diterima server pada ${new Date().toLocaleTimeString('id-ID')}. Menunggu penilaian guru.`,
      'assignment',
      'tugas'
    );

    // Notify all teachers so they immediately see the submission in their notifications and pending queue
    const teachers = data.users.filter((u: User) => u.role === 'teacher');
    teachers.forEach((t: User) => {
      addNotification(
        t.uid,
        `📥 Tugas Baru Masuk: ${targetAsg.title}`,
        `${currentUser.displayName} baru saja mengumpulkan tugas "${targetAsg.title}". Siap untuk dinilai.`,
        'submission',
        'tugas',
        targetAsg.id
      );
    });
  };

  // Student claims completed mission
  const claimMissionReward = (missionId: string) => {
    if (!currentUser) return;
    const targetMission = data.missions.find((m: Mission) => m.id === missionId);
    if (!targetMission) return;

    const periodKey = targetMission.repeat === 'once' ? 'once' : 'w1';
    const misKey = `${missionId}_${currentUser.uid}_${periodKey}`;
    const idempotencyKey = `claim_${missionId}_${currentUser.uid}_${periodKey}`;
    const prog = data.missionProgress[misKey] ||
      data.missionProgress[`${missionId}_${currentUser.uid}`] ||
      data.missionProgress[`${missionId}_${currentUser.uid}_w1`] ||
      data.missionProgress[`${missionId}_${currentUser.uid}_once`];

    if (!prog || prog.status !== 'completed') return;

    // Strict requirement: Missions with manual_verification can ONLY be awarded by teacher, student cannot claim directly
    if (targetMission.rewardMode === 'manual_verification') {
      return;
    }

    // Prevent duplicate claim if already in ledger or already claimed
    const alreadyAwarded = (data.pointLedger || []).some(
      (pl: PointLedger) => pl.idempotencyKey === idempotencyKey
    );
    if (alreadyAwarded || prog.status === 'claimed') return;

    const now = new Date().toISOString();
    const pointsAmount = targetMission.rewardPoints || 0;
    const xpAmount = targetMission.rewardXp ?? (targetMission.rewardPoints || 30);

    const ledgerEntry: PointLedger = {
      id: `led_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      schoolId: data.school.id,
      classId: data.currentClassId,
      userId: currentUser.uid,
      amount: pointsAmount,
      xpAmount,
      category: 'mission',
      sourceType: 'mission',
      sourceId: missionId,
      idempotencyKey,
      reason: `Menyelesaikan Misi: ${targetMission.title}`,
      actorId: 'system',
      actorName: 'Sistem Kelas 6E',
      createdAt: now,
    };

    fireCelebrationConfetti('level_up');

    setData((prev: any) => {
      if ((prev.pointLedger || []).some((pl: PointLedger) => pl.idempotencyKey === idempotencyKey)) {
        return prev;
      }

      const updatedProg = {
        ...prev.missionProgress,
        [misKey]: {
          ...prog,
          status: 'claimed',
        },
      };

      const updatedStats = recalculateUserStats(
        prev.userStats,
        currentUser.uid,
        pointsAmount,
        'mission',
        xpAmount
      );
      // Increment completed missions
      if (updatedStats[currentUser.uid]) {
        updatedStats[currentUser.uid].completedMissions =
          (updatedStats[currentUser.uid].completedMissions || 0) + 1;
      }

      return {
        ...prev,
        missionProgress: updatedProg,
        pointLedger: [ledgerEntry, ...prev.pointLedger],
        userStats: updatedStats,
      };
    });

    // Online persistent synchronization for claimed missions
    syncDocToFirestore(COLLECTIONS.MISSION_PROGRESS, misKey, { ...prog, status: 'claimed', updatedAt: now });
    syncDocToFirestore(COLLECTIONS.POINT_LEDGER, ledgerEntry.id, ledgerEntry);
    const updatedUserStat = recalculateUserStats(data.userStats, currentUser.uid, pointsAmount, 'mission', xpAmount)[currentUser.uid];
    if (updatedUserStat) {
      syncDocToFirestore(COLLECTIONS.USER_STATS, currentUser.uid, updatedUserStat);
    }

    addNotification(
      currentUser.uid,
      '🎁 Reward Misi Berhasil Diklaim!',
      `Kamu memperoleh +${pointsAmount} Poin & +${xpAmount} XP dari misi "${targetMission.title}".`,
      'point',
      'profil'
    );
  };

  // Teacher grades a submission
  const gradeSubmission = (
    submissionId: string,
    score: number,
    feedback: string,
    rewardPoints: number,
    rewardXp?: number
  ) => {
    const sub = data.submissions[submissionId] || Object.values(data.submissions).find(
      (s: any) => s.id === submissionId || `${s.assignmentId}_${s.userId}` === submissionId
    );
    if (!sub) return;

    const targetAsg = data.assignments.find((a: Assignment) => a.id === sub.assignmentId);
    const targetStudent = data.users.find((u: User) => u.uid === sub.userId);
    const now = new Date().toISOString();

    const idempotencyKey = `grade_${sub.assignmentId}_${sub.userId}`;
    const alreadyGraded = sub.status === 'graded';
    const alreadyAwardedInLedger = (data.pointLedger || []).some(
      (pl: PointLedger) => pl.userId === sub.userId && (
        pl.sourceId === sub.assignmentId || 
        pl.idempotencyKey === idempotencyKey ||
        (pl.sourceType === 'assignment' && pl.sourceId === sub.assignmentId)
      )
    );

    const finalPoints = Math.max(0, rewardPoints || 0);
    const finalXp = rewardXp !== undefined ? Math.max(0, rewardXp) : (targetAsg?.rewardXp ?? finalPoints);

    const updatedSub: Submission = {
      ...sub,
      status: 'graded',
      score,
      feedback,
      gradedBy: currentUser?.uid || 'usr_guru_01',
      gradedAt: now,
      updatedAt: now,
    };

    const auditEntry: AuditLog = {
      id: `log_${Date.now()}`,
      schoolId: data.school.id,
      actorId: currentUser?.uid || 'usr_guru_01',
      actorName: currentUser?.displayName || 'Teguh Firmansyah Apriliana, M.Pd',
      action: 'grade_submission',
      targetType: 'submission',
      targetId: submissionId,
      metadata: {
        score,
        rewardPoints: finalPoints,
        rewardXp: finalXp,
        studentName: targetStudent?.displayName,
        assignmentTitle: targetAsg?.title,
      },
      timestamp: now,
    };

    let createdLedgerEntry: PointLedger | null = null;

    setData((prev: any) => {
      let updatedLedger = [...prev.pointLedger];
      let updatedStats = { ...prev.userStats };
      let updatedBadges = [...prev.userBadges];

      const alreadyAwarded = alreadyAwardedInLedger || (prev.pointLedger || []).some(
        (pl: PointLedger) => pl.userId === sub.userId && (
          pl.sourceId === sub.assignmentId || 
          pl.idempotencyKey === idempotencyKey ||
          (pl.sourceType === 'assignment' && pl.sourceId === sub.assignmentId)
        )
      );

      // Add points and XP if and only if NOT already awarded
      if (!alreadyAwarded && (finalPoints > 0 || finalXp > 0)) {
        createdLedgerEntry = {
          id: `led_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          schoolId: data.school.id,
          classId: sub.classId,
          userId: sub.userId,
          amount: finalPoints,
          xpAmount: finalXp,
          category: 'academic',
          sourceType: 'assignment',
          sourceId: sub.assignmentId,
          idempotencyKey,
          reason: `Nilai ${score} pada Tugas: ${targetAsg?.title || 'Tugas Kelas'}`,
          actorId: currentUser?.uid || 'usr_guru_01',
          actorName: currentUser?.displayName || 'Teguh Firmansyah Apriliana, M.Pd',
          createdAt: now,
        };
        updatedLedger = [createdLedgerEntry, ...updatedLedger];
        updatedStats = recalculateUserStats(prev.userStats, sub.userId, finalPoints, 'academic', finalXp);
      }

      // Check perfect score badge
      if (score === 100) {
        const hasPerfectBadge = updatedBadges.some(
          (b) => b.userId === sub.userId && b.badgeId === 'bdg_perfect_score'
        );
        if (!hasPerfectBadge) {
          updatedBadges.push({
            id: `${sub.userId}_bdg_perfect_score`,
            userId: sub.userId,
            badgeId: 'bdg_perfect_score',
            source: targetAsg?.title || 'Nilai 100',
            awardedAt: now,
          });
        }
      }

      return {
        ...prev,
        submissions: {
          ...prev.submissions,
          [submissionId]: updatedSub,
          [sub.id]: updatedSub,
          [`${sub.assignmentId}_${sub.userId}`]: updatedSub,
        },
        pointLedger: updatedLedger,
        userStats: updatedStats,
        userBadges: updatedBadges,
        auditLogs: [auditEntry, ...prev.auditLogs],
      };
    });

    // Firestore online synchronization for submission grading and points
    syncDocToFirestore(COLLECTIONS.SUBMISSIONS, submissionId, updatedSub);
    if (sub.id && sub.id !== submissionId) {
      syncDocToFirestore(COLLECTIONS.SUBMISSIONS, sub.id, updatedSub);
    }
    const altKey = `${sub.assignmentId}_${sub.userId}`;
    if (altKey !== submissionId) {
      syncDocToFirestore(COLLECTIONS.SUBMISSIONS, altKey, updatedSub);
    }

    if (!alreadyAwardedInLedger && (finalPoints > 0 || finalXp > 0)) {
      const updatedUserStat = recalculateUserStats(data.userStats, sub.userId, finalPoints, 'academic', finalXp)[sub.userId];
      if (updatedUserStat) {
        syncDocToFirestore(COLLECTIONS.USER_STATS, sub.userId, updatedUserStat);
      }
      if (createdLedgerEntry) {
        syncDocToFirestore(COLLECTIONS.POINT_LEDGER, (createdLedgerEntry as PointLedger).id, createdLedgerEntry);
      }
    }

    addNotification(
      sub.userId,
      `📝 Tugas "${targetAsg?.title}" Telah Dinilai`,
      `Nilai kamu: ${score}/100 (+${finalPoints} Poin & +${finalXp} XP). Ulasan guru: "${feedback}"`,
      'grade',
      'tugas',
      sub.assignmentId
    );
  };

  // Teacher requests revision
  const requestRevision = (submissionId: string, feedback: string) => {
    const sub = data.submissions[submissionId] || Object.values(data.submissions).find(
      (s: any) => s.id === submissionId || `${s.assignmentId}_${s.userId}` === submissionId
    );
    if (!sub) return;

    const targetAsg = data.assignments.find((a: Assignment) => a.id === sub.assignmentId);
    const now = new Date().toISOString();

    const updatedSub: Submission = {
      ...sub,
      status: 'revision_requested',
      feedback,
      gradedBy: currentUser?.uid || 'usr_guru_01',
      updatedAt: now,
    };

    setData((prev: any) => ({
      ...prev,
      submissions: {
        ...prev.submissions,
        [submissionId]: updatedSub,
        [sub.id]: updatedSub,
        [`${sub.assignmentId}_${sub.userId}`]: updatedSub,
      },
    }));

    syncDocToFirestore(COLLECTIONS.SUBMISSIONS, submissionId, updatedSub);
    if (sub.id && sub.id !== submissionId) {
      syncDocToFirestore(COLLECTIONS.SUBMISSIONS, sub.id, updatedSub);
    }
    const altKey = `${sub.assignmentId}_${sub.userId}`;
    if (altKey !== submissionId) {
      syncDocToFirestore(COLLECTIONS.SUBMISSIONS, altKey, updatedSub);
    }

    addNotification(
      sub.userId,
      `🔄 Permintaan Revisi Tugas: ${targetAsg?.title || 'Tugas'}`,
      `Guru meminta kamu memperbaiki tugas. Catatan: "${feedback}". Silakan unggah perbaikan.`,
      'assignment',
      'tugas',
      sub.assignmentId
    );
  };

  // Teacher manually adjusts points
  const adjustStudentPoints = (
    userId: string,
    amount: number,
    category: 'academic' | 'participation' | 'adjustment',
    reason: string
  ) => {
    const targetUser = data.users.find((u: User) => u.uid === userId);
    const now = new Date().toISOString();

    const ledgerEntry: PointLedger = {
      id: `led_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      schoolId: data.school.id,
      classId: targetUser?.classIds?.[0] || data.currentClassId,
      userId,
      amount,
      category,
      sourceType: 'manual',
      sourceId: `manual_${Date.now()}`,
      idempotencyKey: `adjust_${userId}_${Date.now()}`,
      reason,
      actorId: currentUser.uid,
      actorName: currentUser.displayName,
      createdAt: now,
    };

    const auditEntry: AuditLog = {
      id: `log_${Date.now()}`,
      schoolId: data.school.id,
      actorId: currentUser.uid,
      actorName: currentUser.displayName,
      action: 'adjust_points',
      targetType: 'points',
      targetId: userId,
      metadata: { amount, reason, studentName: targetUser?.displayName, category },
      timestamp: now,
    };

    setData((prev: any) => ({
      ...prev,
      pointLedger: [ledgerEntry, ...prev.pointLedger],
      userStats: recalculateUserStats(prev.userStats, userId, amount, category),
      auditLogs: [auditEntry, ...prev.auditLogs],
    }));

    // Sync points adjustment to Firestore online
    syncDocToFirestore(COLLECTIONS.POINT_LEDGER, ledgerEntry.id, ledgerEntry);
    const updatedUserStat = recalculateUserStats(data.userStats, userId, amount, category)[userId];
    if (updatedUserStat) {
      syncDocToFirestore(COLLECTIONS.USER_STATS, userId, updatedUserStat);
    }

    const isPositive = amount > 0;
    addNotification(
      userId,
      isPositive ? `🌟 Bonus Poin dari Guru (+${amount})` : `⚠️ Pengurangan Poin: Pelanggaran (${amount})`,
      isPositive
        ? `Apresiasi: "${reason}" oleh ${currentUser.displayName}.`
        : `Konsekuensi Pelanggaran: "${reason}" dicatat oleh ${currentUser.displayName}. Poin kamu berkurang ${Math.abs(amount)} poin.`,
      'point',
      'profil'
    );
  };

  // Materials CRUD
  const createMaterial = (mat: Omit<Material, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'schoolId'>) => {
    const id = `mat_${Date.now()}`;
    const now = new Date().toISOString();
    const newMat: Material = {
      ...mat,
      id,
      rewardPoints: mat.rewardPoints ?? 20,
      schoolId: data.school.id,
      createdBy: currentUser?.uid || 'usr_guru_01',
      createdAt: now,
      updatedAt: now,
    };

    setData((prev: any) => {
      const updatedMaterials = sortItemsNewestFirst([newMat, ...(prev.materials || [])]);
      const newState = {
        ...prev,
        materials: updatedMaterials,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            schoolId: data.school.id,
            actorId: currentUser?.uid || 'usr_guru_01',
            actorName: currentUser?.displayName || 'Guru Kelas',
            action: 'create_material',
            targetType: 'material',
            targetId: id,
            metadata: { title: mat.title, subject: mat.subject },
            timestamp: now,
          },
          ...prev.auditLogs,
        ],
      };
      return newState;
    });

    // Sync to Firestore online
    syncDocToFirestore(COLLECTIONS.MATERIALS, id, newMat);

    // Notify students
    data.users
      .filter((u: User) => {
        if (u.role !== 'student') return false;
        if (!mat.classIds.some((cid) => (u.classIds || []).includes(cid))) return false;
        if (mat.assignedUserIds && mat.assignedUserIds.length > 0) {
          return mat.assignedUserIds.includes(u.uid);
        }
        return true;
      })
      .forEach((student: User) => {
        addNotification(
          student.uid,
          `📚 Materi Baru: ${mat.title}`,
          `Materi pelajaran "${mat.subject}" telah diterbitkan oleh ${currentUser?.displayName || 'Guru'}.`,
          'material',
          'materi',
          id
        );
      });
  };

  const updateMaterial = (id: string, mat: Partial<Material>) => {
    const now = new Date().toISOString();
    setData((prev: any) => {
      const updated = sortItemsNewestFirst((prev.materials || []).map((m: Material) => (m.id === id ? { ...m, ...mat, updatedAt: now } : m)));
      const target = updated.find((m: Material) => m.id === id);
      if (target) {
        syncDocToFirestore(COLLECTIONS.MATERIALS, id, target);
      }
      return { ...prev, materials: updated };
    });
  };

  const deleteMaterial = (id: string) => {
    deletedItemIds.current.add(id);
    saveDeletedIds(deletedItemIds.current);
    setData((prev: any) => {
      const updatedMaterials = (prev.materials || []).filter((m: Material) => m.id !== id);
      const updatedProg = { ...(prev.materialProgress || {}) };
      Object.keys(updatedProg).forEach((key) => {
        if (key.startsWith(`${id}_`) || updatedProg[key]?.materialId === id) {
          delete updatedProg[key];
        }
      });
      return {
        ...prev,
        materials: updatedMaterials,
        materialProgress: updatedProg,
      };
    });
    deleteDocFromFirestore(COLLECTIONS.MATERIALS, id);
  };

  const saveMaterial = (mat: Partial<Material>) => {
    if (mat.id) {
      updateMaterial(mat.id, mat);
    } else {
      createMaterial(mat as any);
    }
  };

  // Assignments CRUD
  const createAssignment = (asg: Omit<Assignment, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'schoolId'>) => {
    const id = `asg_${Date.now()}`;
    const now = new Date().toISOString();
    const newAsg: Assignment = {
      ...asg,
      id,
      schoolId: data.school.id,
      createdBy: currentUser?.uid || 'usr_guru_01',
      createdAt: now,
      updatedAt: now,
    };

    setData((prev: any) => {
      const updatedAssignments = sortItemsNewestFirst([newAsg, ...(prev.assignments || [])]);
      const newState = {
        ...prev,
        assignments: updatedAssignments,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            schoolId: data.school.id,
            actorId: currentUser?.uid || 'usr_guru_01',
            actorName: currentUser?.displayName || 'Guru Kelas',
            action: 'create_assignment',
            targetType: 'assignment',
            targetId: id,
            metadata: { title: asg.title, subject: asg.subject, dueAt: asg.dueAt },
            timestamp: now,
          },
          ...prev.auditLogs,
        ],
      };
      return newState;
    });

    // Sync to Firestore online
    syncDocToFirestore(COLLECTIONS.ASSIGNMENTS, id, newAsg);

    // Notify students
    data.users
      .filter((u: User) => {
        if (u.role !== 'student') return false;
        if (!asg.classIds.some((cid) => (u.classIds || []).includes(cid))) return false;
        if (asg.assignedUserIds && asg.assignedUserIds.length > 0) {
          return asg.assignedUserIds.includes(u.uid);
        }
        return true;
      })
      .forEach((student: User) => {
        addNotification(
          student.uid,
          `📝 Tugas Baru: ${asg.title}`,
          `Tugas ${asg.subject} berhadiah +${asg.rewardPoints} Poin. Batas pengumpulan: ${new Date(
            asg.dueAt
          ).toLocaleDateString('id-ID')}.`,
          'assignment',
          'tugas',
          id
        );
      });
  };

  const updateAssignment = (id: string, asg: Partial<Assignment>) => {
    const now = new Date().toISOString();
    setData((prev: any) => {
      const updated = sortItemsNewestFirst((prev.assignments || []).map((a: Assignment) => (a.id === id ? { ...a, ...asg, updatedAt: now } : a)));
      const target = updated.find((a: Assignment) => a.id === id);
      if (target) {
        syncDocToFirestore(COLLECTIONS.ASSIGNMENTS, id, target);
      }
      return { ...prev, assignments: updated };
    });
  };

  const deleteAssignment = (id: string) => {
    deletedItemIds.current.add(id);
    saveDeletedIds(deletedItemIds.current);
    setData((prev: any) => {
      const updatedAssignments = (prev.assignments || []).filter((a: Assignment) => a.id !== id);
      const updatedSubs = { ...(prev.submissions || {}) };
      Object.keys(updatedSubs).forEach((key) => {
        if (key.startsWith(`${id}_`) || updatedSubs[key]?.assignmentId === id) {
          delete updatedSubs[key];
        }
      });
      return {
        ...prev,
        assignments: updatedAssignments,
        submissions: updatedSubs,
      };
    });
    deleteDocFromFirestore(COLLECTIONS.ASSIGNMENTS, id);
  };

  const saveAssignment = (asg: Partial<Assignment>) => {
    if (asg.id) {
      updateAssignment(asg.id, asg);
    } else {
      createAssignment(asg as any);
    }
  };

  // ─── Quizzes CRUD & Submissions ──────────────────────────────────────────────

  const createQuiz = (quiz: Omit<Quiz, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'schoolId'>) => {
    const id = `quiz_${Date.now()}`;
    const now = new Date().toISOString();
    const newQuiz: Quiz = {
      ...quiz,
      id,
      schoolId: data.school.id,
      createdBy: currentUser?.uid || 'usr_guru_01',
      createdAt: now,
      updatedAt: now,
    };

    setData((prev: any) => {
      const updatedQuizzes = sortItemsNewestFirst([newQuiz, ...(prev.quizzes || [])]);
      const newState = {
        ...prev,
        quizzes: updatedQuizzes,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            schoolId: data.school.id,
            actorId: currentUser?.uid || 'usr_guru_01',
            actorName: currentUser?.displayName || 'Guru Kelas',
            action: 'create_quiz',
            targetType: 'assignment',
            targetId: id,
            metadata: { title: quiz.title, subject: quiz.subject, durationMinutes: quiz.durationMinutes },
            timestamp: now,
          },
          ...prev.auditLogs,
        ],
      };
      return newState;
    });

    syncDocToFirestore(COLLECTIONS.QUIZZES, id, newQuiz);

    // Notify students
    data.users
      .filter((u: User) => {
        if (u.role !== 'student') return false;
        if (!quiz.classIds.some((cid) => (u.classIds || []).includes(cid))) return false;
        if (quiz.assignedUserIds && quiz.assignedUserIds.length > 0) {
          return quiz.assignedUserIds.includes(u.uid);
        }
        return true;
      })
      .forEach((student: User) => {
        addNotification(
          student.uid,
          `🎯 Kuis Baru: ${quiz.title}`,
          `Kuis ${quiz.subject} berhadiah +${quiz.rewardPoints} Poin telah tersedia. Durasi: ${quiz.durationMinutes > 0 ? quiz.durationMinutes + ' menit' : 'Bebas'}.`,
          'assignment',
          'quiz',
          id
        );
      });
  };

  const updateQuiz = (id: string, quizData: Partial<Quiz>) => {
    const now = new Date().toISOString();
    setData((prev: any) => {
      const updated = sortItemsNewestFirst((prev.quizzes || []).map((q: Quiz) => (q.id === id ? { ...q, ...quizData, updatedAt: now } : q)));
      const target = updated.find((q: Quiz) => q.id === id);
      if (target) {
        syncDocToFirestore(COLLECTIONS.QUIZZES, id, target);
      }
      return { ...prev, quizzes: updated };
    });
  };

  const deleteQuiz = (id: string) => {
    deletedItemIds.current.add(id);
    saveDeletedIds(deletedItemIds.current);
    setData((prev: any) => {
      const updatedQuizzes = (prev.quizzes || []).filter((q: Quiz) => q.id !== id);
      const updatedSubs = { ...(prev.quizSubmissions || {}) };
      Object.keys(updatedSubs).forEach((key) => {
        if (key.startsWith(`${id}_`) || updatedSubs[key]?.quizId === id) {
          delete updatedSubs[key];
        }
      });
      return {
        ...prev,
        quizzes: updatedQuizzes,
        quizSubmissions: updatedSubs,
      };
    });
    deleteDocFromFirestore(COLLECTIONS.QUIZZES, id);
  };

  const saveQuiz = (quizData: Partial<Quiz>) => {
    if (quizData.id) {
      updateQuiz(quizData.id, quizData);
    } else {
      createQuiz(quizData as any);
    }
  };

  // Student submits quiz answers with auto-scoring for PG, PG Kompleks, Menjodohkan, and Isian
  const submitQuizAnswers = (quizId: string, answers: Record<string, QuizStudentAnswer>) => {
    if (!currentUser) return { success: false, submission: {} as QuizSubmission };
    const targetQuiz = data.quizzes.find((q: Quiz) => q.id === quizId);
    if (!targetQuiz) return { success: false, submission: {} as QuizSubmission };

    const subKey = `${quizId}_${currentUser.uid}`;
    const now = new Date().toISOString();
    const resolvedClassId = targetQuiz.classIds?.[0] || currentUser.classIds?.[0] || data.currentClassId || 'cls_6a';
    const isLate = targetQuiz.dueAt ? new Date(now) > new Date(targetQuiz.dueAt) : false;

    let totalEarnedScore = 0;
    let totalMaxScore = 0;
    let hasEssay = false;
    const evaluatedAnswers: Record<string, QuizStudentAnswer> = {};

    targetQuiz.questions.forEach((q) => {
      const qPoints = q.points || 10;
      totalMaxScore += qPoints;
      const studentAns: QuizStudentAnswer = answers[q.id] || { questionId: q.id, type: q.type };
      let earned = 0;
      let isCorrect = false;

      if (q.type === 'single_choice') {
        isCorrect = studentAns.selectedOptionIndex !== undefined && studentAns.selectedOptionIndex === q.correctOptionIndex;
        earned = isCorrect ? qPoints : 0;
      } else if (q.type === 'complex_multiple_choice') {
        if (q.complexMode === 'true_false' && q.complexStatements && q.complexStatements.length > 0) {
          let correctCount = 0;
          q.complexStatements.forEach((stmt) => {
            const studentStmtVal = studentAns.statementAnswers?.[stmt.id];
            if (studentStmtVal === stmt.isCorrect) {
              correctCount++;
            }
          });
          const ratio = correctCount / q.complexStatements.length;
          earned = Math.round(ratio * qPoints);
          isCorrect = correctCount === q.complexStatements.length;
        } else if (q.correctOptionIndices && q.correctOptionIndices.length > 0) {
          const selected = (studentAns.selectedOptionIndices || []).slice().sort();
          const target = q.correctOptionIndices.slice().sort();
          isCorrect = selected.length === target.length && selected.every((val, idx) => val === target[idx]);
          earned = isCorrect ? qPoints : 0;
        }
      } else if (q.type === 'matching') {
        if (q.matchingPairs && q.matchingPairs.length > 0) {
          let matchedCount = 0;
          q.matchingPairs.forEach((pair) => {
            if (studentAns.matchingPairsAnswer?.[pair.id] === pair.right) {
              matchedCount++;
            }
          });
          const ratio = matchedCount / q.matchingPairs.length;
          earned = Math.round(ratio * qPoints);
          isCorrect = matchedCount === q.matchingPairs.length;
        }
      } else if (q.type === 'short_answer') {
        const studentText = (studentAns.shortAnswerText || '').trim();
        const accepted = q.acceptedAnswers || [];
        if (q.caseSensitive) {
          isCorrect = accepted.some((ans) => ans.trim() === studentText);
        } else {
          isCorrect = accepted.some((ans) => ans.trim().toLowerCase() === studentText.toLowerCase());
        }
        earned = isCorrect ? qPoints : 0;
      } else if (q.type === 'essay') {
        hasEssay = true;
        earned = 0;
        isCorrect = false;
      }

      evaluatedAnswers[q.id] = {
        ...studentAns,
        earnedScore: earned,
        maxScore: qPoints,
        isCorrect: q.type === 'essay' ? undefined : isCorrect,
        originalAutoScore: earned,
        originalIsCorrect: q.type === 'essay' ? undefined : isCorrect,
      };

      totalEarnedScore += earned;
    });

    const status: 'in_progress' | 'submitted' | 'graded' = hasEssay ? 'submitted' : 'graded';
    // Nilai akhir kuis otomatis dikonversi ke skala 100 berapapun total bobot poin tiap soal
    const percentageScore = totalMaxScore > 0 ? Math.min(100, Math.max(0, Math.round((totalEarnedScore / totalMaxScore) * 100))) : 0;
    const finalScore100 = percentageScore;
    
    // 1 Nilai = 1 Poin & 1 XP secara otomatis
    const rewardPointsAwarded = status === 'graded' ? finalScore100 : 0;
    const rewardXpAwarded = status === 'graded' ? finalScore100 : 0;

    const newSub: QuizSubmission = {
      id: subKey,
      quizId,
      userId: currentUser.uid,
      classId: resolvedClassId,
      answers: evaluatedAnswers,
      status,
      startedAt: now,
      submittedAt: now,
      totalScore: finalScore100,
      maxScore: 100,
      percentageScore: finalScore100,
      rewardPointsAwarded,
      rewardXpAwarded,
      isLate,
      updatedAt: now,
    };

    fireCelebrationConfetti(percentageScore >= 75 ? 'level_up' : 'submission');

    let createdLedgerEntry: PointLedger | null = null;
    if (status === 'graded' && (rewardPointsAwarded > 0 || rewardXpAwarded > 0)) {
      createdLedgerEntry = {
        id: `led_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        schoolId: data.school.id,
        classId: resolvedClassId,
        userId: currentUser.uid,
        amount: rewardPointsAwarded,
        xpAmount: rewardXpAwarded,
        category: 'academic',
        sourceType: 'assignment',
        sourceId: quizId,
        idempotencyKey: `quiz_reward_${quizId}_${currentUser.uid}`,
        reason: `Mengerjakan Kuis: ${targetQuiz.title} (Skor: ${percentageScore})`,
        actorId: 'system',
        actorName: 'Sistem Kuis Gamifikasi',
        createdAt: now,
      };
      syncDocToFirestore(COLLECTIONS.POINT_LEDGER, createdLedgerEntry.id, createdLedgerEntry);
    }

    setData((prev: any) => {
      const updatedSubmissions = {
        ...prev.quizSubmissions,
        [subKey]: newSub,
        [newSub.id]: newSub,
      };

      let updatedStats = prev.userStats;
      let updatedLedger = prev.pointLedger || [];
      if (createdLedgerEntry) {
        updatedLedger = [createdLedgerEntry, ...updatedLedger];
        updatedStats = recalculateUserStats(prev.userStats, currentUser.uid, rewardPointsAwarded, 'academic', rewardXpAwarded);
      }

      return {
        ...prev,
        quizSubmissions: updatedSubmissions,
        pointLedger: updatedLedger,
        userStats: updatedStats,
      };
    });

    syncDocToFirestore(COLLECTIONS.QUIZ_SUBMISSIONS, subKey, newSub);

    addNotification(
      currentUser.uid,
      status === 'graded' ? '🎉 Kuis Selesai & Dinilai Otomatis' : '✅ Kuis Berhasil Dikumpulkan',
      status === 'graded'
        ? `Kamu memperoleh nilai ${percentageScore}, +${rewardPointsAwarded} Poin & +${rewardXpAwarded} XP pada kuis "${targetQuiz.title}".`
        : `Jawaban kuis "${targetQuiz.title}" telah terkirim. Menunggu pemeriksaan soal uraian oleh guru.`,
      'assignment',
      'quiz',
      quizId
    );

    // Notify teachers
    const teachers = data.users.filter((u: User) => u.role === 'teacher');
    teachers.forEach((t: User) => {
      addNotification(
        t.uid,
        `📊 Kuis Dikerjakan: ${targetQuiz.title}`,
        `${currentUser.displayName} telah menyelesaikan kuis "${targetQuiz.title}" (Skor: ${percentageScore}).`,
        'submission',
        'quiz',
        quizId
      );
    });

    return { success: true, submission: newSub };
  };

  const submitQuiz = (submission: QuizSubmission) => {
    setData((prev: any) => ({
      ...prev,
      quizSubmissions: {
        ...prev.quizSubmissions,
        [submission.id]: submission,
      },
    }));
    syncDocToFirestore(COLLECTIONS.QUIZ_SUBMISSIONS, submission.id, submission);
  };

  // Teacher grades & manually corrects questions in a quiz submission
  const gradeQuizSubmission = (
    submissionId: string,
    questionScores: Record<string, { earnedScore: number; feedback?: string; isCorrect?: boolean; isManualOverride?: boolean }>,
    teacherFeedback?: string
  ) => {
    const sub = data.quizSubmissions[submissionId] || Object.values(data.quizSubmissions).find((s: any) => s.id === submissionId);
    if (!sub) return;

    const targetQuiz = data.quizzes.find((q: Quiz) => q.id === sub.quizId);
    const now = new Date().toISOString();

    const updatedAnswers = { ...sub.answers };
    let totalScore = 0;
    let totalMaxScore = 0;

    const questionsList = targetQuiz?.questions || [];
    questionsList.forEach((q) => {
      const qId = q.id;
      const ans: QuizStudentAnswer = updatedAnswers[qId] ? { ...updatedAnswers[qId] } : {
        questionId: qId,
        type: q.type,
        earnedScore: 0,
        maxScore: q.points,
        isCorrect: false,
      };

      const manual = questionScores?.[qId];
      if (manual) {
        ans.earnedScore = Math.min(q.points, Math.max(0, Number(manual.earnedScore) || 0));
        if (manual.feedback !== undefined) {
          ans.teacherFeedback = manual.feedback;
        }
        ans.isCorrect = manual.isCorrect !== undefined ? manual.isCorrect : (ans.earnedScore > 0);
        ans.isManualOverride = manual.isManualOverride ?? true;
      }

      totalScore += ans.earnedScore || 0;
      totalMaxScore += q.points || ans.maxScore || 10;
      updatedAnswers[qId] = ans;
    });

    const percentageScore = totalMaxScore > 0 ? Math.min(100, Math.max(0, Math.round((totalScore / totalMaxScore) * 100))) : 0;
    const finalScore100 = percentageScore;

    // 1 Nilai = 1 Poin & 1 XP secara otomatis
    const rewardPoints = finalScore100;
    const rewardXp = finalScore100;

    const oldPoints = sub.rewardPointsAwarded || 0;
    const oldXp = sub.rewardXpAwarded || 0;
    const pointsDelta = rewardPoints - oldPoints;
    const xpDelta = Math.max(0, rewardXp - oldXp);

    const updatedSub: QuizSubmission = {
      ...sub,
      answers: updatedAnswers,
      status: 'graded',
      totalScore: finalScore100,
      maxScore: 100,
      percentageScore: finalScore100,
      rewardPointsAwarded: rewardPoints,
      rewardXpAwarded: Math.max(oldXp, rewardXp),
      feedback: teacherFeedback !== undefined ? teacherFeedback : sub.feedback,
      gradedBy: currentUser?.uid || 'usr_guru_01',
      gradedAt: now,
      updatedAt: now,
    };

    let createdLedgerEntry: PointLedger | null = null;
    if (pointsDelta !== 0 || xpDelta > 0) {
      const isReGrade = sub.status === 'graded';
      createdLedgerEntry = {
        id: `led_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        schoolId: data.school.id,
        classId: sub.classId || data.currentClassId,
        userId: sub.userId,
        amount: pointsDelta,
        xpAmount: xpDelta,
        category: 'academic',
        sourceType: 'assignment',
        sourceId: sub.quizId,
        idempotencyKey: isReGrade 
          ? `quiz_grade_adj_${sub.quizId}_${sub.userId}_${Date.now()}`
          : `quiz_grade_${sub.quizId}_${sub.userId}`,
        reason: isReGrade 
          ? `Koreksi Nilai Kuis: ${targetQuiz?.title || 'Kuis'} (Skor Akhir: ${percentageScore})`
          : `Penilaian Kuis: ${targetQuiz?.title || 'Kuis'} (Skor Akhir: ${percentageScore})`,
        actorId: currentUser?.uid || 'usr_guru_01',
        actorName: currentUser?.displayName || 'Guru Kelas',
        createdAt: now,
      };
      syncDocToFirestore(COLLECTIONS.POINT_LEDGER, createdLedgerEntry.id, createdLedgerEntry);
    }

    setData((prev: any) => {
      const updatedSubmissions = {
        ...prev.quizSubmissions,
        [submissionId]: updatedSub,
        [updatedSub.id]: updatedSub,
      };

      let updatedStats = prev.userStats;
      let updatedLedger = prev.pointLedger || [];
      if (createdLedgerEntry) {
        updatedLedger = [createdLedgerEntry, ...updatedLedger];
        updatedStats = recalculateUserStats(prev.userStats, sub.userId, pointsDelta, 'academic', xpDelta);
      }

      return {
        ...prev,
        quizSubmissions: updatedSubmissions,
        pointLedger: updatedLedger,
        userStats: updatedStats,
      };
    });

    syncDocToFirestore(COLLECTIONS.QUIZ_SUBMISSIONS, updatedSub.id, updatedSub);

    addNotification(
      sub.userId,
      '📋 Hasil Penilaian Kuis',
      `Kuis "${targetQuiz?.title || 'Kuis'}" telah selesai diperiksa guru dengan Skor Akhir: ${percentageScore}/100 (+${rewardPoints} Poin & +${rewardXp} XP).`,
      'grade',
      'quiz',
      sub.quizId
    );
  };

  // Missions CRUD
  const createMission = (mis: Omit<Mission, 'id' | 'createdBy' | 'schoolId'>) => {
    const id = `mis_${Date.now()}`;
    const now = new Date().toISOString();
    const newMis: Mission = {
      ...mis,
      id,
      schoolId: data.school.id,
      createdBy: currentUser?.uid || 'usr_guru_01',
      createdAt: now,
      updatedAt: now,
    };

    setData((prev: any) => {
      const updatedMissions = sortItemsNewestFirst([newMis, ...(prev.missions || [])]);
      return {
        ...prev,
        missions: updatedMissions,
      };
    });

    // Sync to Firestore online
    syncDocToFirestore(COLLECTIONS.MISSIONS, id, newMis);
  };

  const saveMission = (mis: Partial<Mission>) => {
    const now = new Date().toISOString();
    if (mis.id) {
      setData((prev: any) => {
        const updated = sortItemsNewestFirst((prev.missions || []).map((m: Mission) => (m.id === mis.id ? { ...m, ...mis, updatedAt: now } : m)));
        const target = updated.find((m: Mission) => m.id === mis.id);
        if (target) {
          syncDocToFirestore(COLLECTIONS.MISSIONS, mis.id!, target);
        }
        return { ...prev, missions: updated };
      });
    } else {
      createMission(mis as any);
    }
  };

  const deleteMission = (id: string) => {
    deletedItemIds.current.add(id);
    saveDeletedIds(deletedItemIds.current);
    setData((prev: any) => {
      const updatedMissions = (prev.missions || []).filter((m: Mission) => m.id !== id);
      const updatedMisProg = { ...(prev.missionProgress || {}) };
      Object.keys(updatedMisProg).forEach((key) => {
        if (key.startsWith(`${id}_`) || updatedMisProg[key]?.missionId === id) {
          delete updatedMisProg[key];
        }
      });
      return {
        ...prev,
        missions: updatedMissions,
        missionProgress: updatedMisProg,
      };
    });
    deleteDocFromFirestore(COLLECTIONS.MISSIONS, id);
  };

  const submitMissionForVerification = (missionId: string, answerText?: string, files?: any[]) => {
    if (!currentUser) return;
    const targetMis = data.missions.find((m: Mission) => m.id === missionId);
    if (!targetMis) return;

    const periodKey = targetMis.repeat === 'once' ? 'once' : 'w1';
    const misKey = `${missionId}_${currentUser.uid}_${periodKey}`;
    const now = new Date().toISOString();
    const existingProg = data.missionProgress[misKey] || data.missionProgress[`${missionId}_${currentUser.uid}`];

    const isManual = targetMis.rewardMode === 'manual_verification' || (!targetMis.rewardMode && (targetMis.type === 'custom' || targetMis.type === 'manual'));
    const targetStatus: MissionProgress['status'] = isManual ? 'pending_verification' : 'completed';

    const progData: MissionProgress = {
      id: misKey,
      missionId,
      userId: currentUser.uid,
      classId: data.currentClassId,
      periodKey,
      progress: targetMis.target,
      status: targetStatus,
      submittedAt: now,
      completedAt: isManual ? undefined : now,
      answerText: answerText || '',
      files: files || [],
      attempt: (existingProg?.attempt || 0) + 1,
      updatedAt: now,
    };

    fireCelebrationConfetti(isManual ? 'submission' : 'level_up');

    setData((prev: any) => ({
      ...prev,
      missionProgress: {
        ...prev.missionProgress,
        [misKey]: progData,
        [`${missionId}_${currentUser.uid}`]: progData,
        [`${missionId}_${currentUser.uid}_w1`]: progData,
        [`${missionId}_${currentUser.uid}_once`]: progData,
      },
    }));

    syncDocToFirestore(COLLECTIONS.MISSION_PROGRESS, misKey, progData);
    syncDocToFirestore(COLLECTIONS.MISSION_PROGRESS, `${missionId}_${currentUser.uid}`, progData);

    if (isManual) {
      addNotification(
        currentUser.uid,
        '🎯 Laporan Misi Berhasil Dikirim',
        `Laporan untuk misi "${targetMis.title}" telah dikirim ke guru. Menunggu verifikasi & penilaian guru (Poin belum bertambah).`,
        'mission',
        'misi'
      );

      // Notify teachers
      const teachers = data.users.filter((u: User) => u.role === 'teacher');
      teachers.forEach((t: User) => {
        addNotification(
          t.uid,
          `📥 Misi Perlu Diverifikasi: ${targetMis.title}`,
          `${currentUser.displayName} telah menyelesaikan dan mengirimkan bukti misi "${targetMis.title}". Siap untuk diperiksa & dinilai guru.`,
          'mission',
          'misi',
          targetMis.id
        );
      });
    } else {
      addNotification(
        currentUser.uid,
        '🎉 Misi Selesai!',
        `Selamat! Misi "${targetMis.title}" telah selesai. Silakan klaim hadiah poin & XP kamu sekarang!`,
        'mission',
        'misi'
      );
    }
  };

  const verifyManualMission = (missionId: string, userId: string, score?: number, feedback?: string) => {
    const targetMis = data.missions.find((m: Mission) => m.id === missionId);
    if (targetMis?.rewardMode === 'manual_verification') {
      // For manual verification missions, points MUST be awarded directly by teacher (no student claim)
      gradeAndAwardMission(missionId, userId, score !== undefined ? score : 100, feedback);
      return;
    }
    const periodKey = targetMis?.repeat === 'once' ? 'once' : 'w1';
    const misKey = `${missionId}_${userId}_${periodKey}`;
    const now = new Date().toISOString();
    const existing = data.missionProgress[misKey] || data.missionProgress[`${missionId}_${userId}`];

    const progData: MissionProgress = {
      ...existing,
      id: misKey,
      missionId,
      userId,
      classId: existing?.classId || data.currentClassId,
      periodKey,
      progress: targetMis?.target || 1,
      status: 'completed',
      completedAt: now,
      verifiedBy: currentUser?.uid || 'usr_guru_01',
      score: score !== undefined ? score : 100,
      feedback: feedback || 'Disetujui dan diverifikasi oleh guru.',
      updatedAt: now,
    };

    setData((prev: any) => ({
      ...prev,
      missionProgress: {
        ...prev.missionProgress,
        [misKey]: progData,
        [`${missionId}_${userId}`]: progData,
        [`${missionId}_${userId}_once`]: progData,
        [`${missionId}_${userId}_w1`]: progData,
      },
    }));

    syncDocToFirestore(COLLECTIONS.MISSION_PROGRESS, misKey, progData);
    syncDocToFirestore(COLLECTIONS.MISSION_PROGRESS, `${missionId}_${userId}`, progData);

    addNotification(
      userId,
      `🎯 Misi Diverifikasi Guru: ${targetMis?.title || 'Misi'}`,
      `Guru telah menyetujui penyelesaian misimu! ${score ? `(Nilai: ${score}/100)` : ''} Silakan buka menu Misi untuk klaim hadiah!`,
      'mission',
      'misi'
    );
  };

  const gradeAndAwardMission = (missionId: string, userId: string, score: number, feedback?: string) => {
    const targetMis = data.missions.find((m: Mission) => m.id === missionId);
    if (!targetMis) return;
    const periodKey = targetMis.repeat === 'once' ? 'once' : 'w1';
    const misKey = `${missionId}_${userId}_${periodKey}`;
    const now = new Date().toISOString();
    const existing = data.missionProgress[misKey] || data.missionProgress[`${missionId}_${userId}`];
    const rewardPoints = targetMis.rewardPoints || 0;

    const progData: MissionProgress = {
      ...existing,
      id: misKey,
      missionId,
      userId,
      classId: existing?.classId || data.currentClassId,
      periodKey,
      progress: targetMis.target || 1,
      status: 'claimed',
      completedAt: now,
      verifiedBy: currentUser?.uid || 'usr_guru_01',
      score,
      feedback: feedback || `Dinilai oleh guru: ${score}/100`,
      updatedAt: now,
    };

    const ledgerEntry: PointLedger = {
      id: `led_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      schoolId: data.school.id,
      classId: data.currentClassId,
      userId,
      amount: rewardPoints,
      category: 'mission',
      sourceType: 'mission',
      sourceId: missionId,
      idempotencyKey: `grade_mis_${missionId}_${userId}_${Date.now()}`,
      reason: `Nilai ${score} pada Misi: ${targetMis.title}`,
      actorId: currentUser?.uid || 'usr_guru_01',
      actorName: currentUser?.displayName || 'Teguh Firmansyah Apriliana, M.Pd',
      createdAt: now,
    };

    setData((prev: any) => {
      const updatedStats = recalculateUserStats(prev.userStats, userId, rewardPoints, 'mission');
      if (updatedStats[userId]) {
        updatedStats[userId].completedMissions = (updatedStats[userId].completedMissions || 0) + 1;
      }

      return {
        ...prev,
        missionProgress: {
          ...prev.missionProgress,
          [misKey]: progData,
          [`${missionId}_${userId}`]: progData,
          [`${missionId}_${userId}_once`]: progData,
          [`${missionId}_${userId}_w1`]: progData,
        },
        pointLedger: [ledgerEntry, ...prev.pointLedger],
        userStats: updatedStats,
      };
    });

    syncDocToFirestore(COLLECTIONS.MISSION_PROGRESS, misKey, progData);
    syncDocToFirestore(COLLECTIONS.MISSION_PROGRESS, `${missionId}_${userId}`, progData);
    syncDocToFirestore(COLLECTIONS.POINT_LEDGER, ledgerEntry.id, ledgerEntry);

    const updatedUserStat = recalculateUserStats(data.userStats, userId, rewardPoints, 'mission')[userId];
    if (updatedUserStat) {
      syncDocToFirestore(COLLECTIONS.USER_STATS, userId, updatedUserStat);
    }

    addNotification(
      userId,
      `🎉 Misi "${targetMis.title}" Dinilai & Poin Diberikan!`,
      `Nilai kamu: ${score}/100 (+${rewardPoints} Poin). ${feedback ? `Ulasan: "${feedback}"` : ''}`,
      'point',
      'misi'
    );
  };

  const gradeAndAwardMissionBulk = (
    missionId: string,
    userIds: string[],
    score: number,
    feedback?: string,
    customRewardPoints?: number
  ) => {
    const targetMis = data.missions.find((m: Mission) => m.id === missionId);
    if (!targetMis || !userIds || userIds.length === 0) return;

    const periodKey = targetMis.repeat === 'once' ? 'once' : 'w1';
    const now = new Date().toISOString();
    const rewardPoints = customRewardPoints !== undefined ? customRewardPoints : (targetMis.rewardPoints || 0);

    const newProgressEntries: Record<string, MissionProgress> = {};
    const newLedgerEntries: PointLedger[] = [];
    let currentStats = { ...data.userStats };

    userIds.forEach((userId, index) => {
      const misKey = `${missionId}_${userId}_${periodKey}`;
      const existing = data.missionProgress[misKey] || data.missionProgress[`${missionId}_${userId}`];

      const progData: MissionProgress = {
        ...existing,
        id: misKey,
        missionId,
        userId,
        classId: existing?.classId || data.currentClassId,
        periodKey,
        progress: targetMis.target || 1,
        status: 'claimed',
        completedAt: now,
        verifiedBy: currentUser?.uid || 'usr_guru_01',
        score,
        feedback: feedback || `Dinilai secara masal oleh guru: ${score}/100`,
        updatedAt: now,
      };

      newProgressEntries[misKey] = progData;
      newProgressEntries[`${missionId}_${userId}`] = progData;
      newProgressEntries[`${missionId}_${userId}_once`] = progData;
      newProgressEntries[`${missionId}_${userId}_w1`] = progData;

      const ledgerEntry: PointLedger = {
        id: `led_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 6)}`,
        schoolId: data.school.id,
        classId: data.currentClassId,
        userId,
        amount: rewardPoints,
        category: 'mission',
        sourceType: 'mission',
        sourceId: missionId,
        idempotencyKey: `grade_mis_${missionId}_${userId}_${Date.now()}_${index}`,
        reason: `Nilai ${score} pada Misi: ${targetMis.title} (Penilaian Masal)`,
        actorId: currentUser?.uid || 'usr_guru_01',
        actorName: currentUser?.displayName || 'Teguh Firmansyah Apriliana, M.Pd',
        createdAt: now,
      };

      newLedgerEntries.push(ledgerEntry);

      currentStats = recalculateUserStats(currentStats, userId, rewardPoints, 'mission');
      if (currentStats[userId]) {
        currentStats[userId] = {
          ...currentStats[userId],
          completedMissions: (currentStats[userId].completedMissions || 0) + 1,
        };
      }

      // Sync to Cloud / Firestore
      syncDocToFirestore(COLLECTIONS.MISSION_PROGRESS, misKey, progData);
      syncDocToFirestore(COLLECTIONS.MISSION_PROGRESS, `${missionId}_${userId}`, progData);
      syncDocToFirestore(COLLECTIONS.POINT_LEDGER, ledgerEntry.id, ledgerEntry);
      if (currentStats[userId]) {
        syncDocToFirestore(COLLECTIONS.USER_STATS, userId, currentStats[userId]);
      }

      addNotification(
        userId,
        `🎉 Misi "${targetMis.title}" Dinilai & Poin Diberikan!`,
        `Nilai kamu: ${score}/100 (+${rewardPoints} Poin). ${feedback ? `Ulasan: "${feedback}"` : ''}`,
        'point',
        'misi'
      );
    });

    setData((prev: any) => ({
      ...prev,
      missionProgress: {
        ...prev.missionProgress,
        ...newProgressEntries,
      },
      pointLedger: [...newLedgerEntries, ...prev.pointLedger],
      userStats: currentStats,
    }));
  };

  // Announcements
  const createAnnouncement = (ann: Omit<Announcement, 'id' | 'createdAt' | 'authorName' | 'schoolId'>) => {
    const id = `ann_${Date.now()}`;
    const newAnn: Announcement = {
      ...ann,
      id,
      authorName: currentUser?.displayName || 'Guru Kelas',
      schoolId: data.school.id,
      createdAt: new Date().toISOString(),
    };

    setData((prev: any) => ({
      ...prev,
      announcements: [newAnn, ...prev.announcements],
    }));

    // Sync to Firestore online
    syncDocToFirestore(COLLECTIONS.ANNOUNCEMENTS, id, newAnn);

    data.users
      .filter((u: User) => u.role === 'student' && ann.classIds.some((cid) => u.classIds.includes(cid)))
      .forEach((student: User) => {
        addNotification(
          student.uid,
          `📢 Pengumuman: ${ann.title}`,
          ann.content.substring(0, 100) + '...',
          'system',
          'beranda'
        );
      });
  };

  const saveAnnouncement = (ann: Partial<Announcement>) => {
    if (ann.id) {
      setData((prev: any) => {
        const updated = prev.announcements.map((a: Announcement) => (a.id === ann.id ? { ...a, ...ann } : a));
        const target = updated.find((a: Announcement) => a.id === ann.id);
        if (target) {
          syncDocToFirestore(COLLECTIONS.ANNOUNCEMENTS, ann.id!, target);
        }
        return { ...prev, announcements: updated };
      });
    } else {
      createAnnouncement(ann as any);
    }
  };

  const deleteAnnouncement = (id: string) => {
    deletedItemIds.current.add(id);
    saveDeletedIds(deletedItemIds.current);
    setData((prev: any) => ({
      ...prev,
      announcements: prev.announcements.filter((a: Announcement) => a.id !== id),
    }));
    deleteDocFromFirestore(COLLECTIONS.ANNOUNCEMENTS, id);
  };

  // Student Provisioning (Teacher/Admin)
  const provisionStudent = (student: {
    displayName: string;
    studentNumber: string;
    absentNumber: number;
    classId: string;
    email?: string;
    username?: string;
    password?: string;
    avatarUrl?: string;
  }) => {
    const uid = `usr_std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    deletedItemIds.current.delete(uid);
    saveDeletedIds(deletedItemIds.current);
    const now = new Date().toISOString();
    const avatarIndex = Math.floor(Math.random() * 10);
    const seeds = ['Panda', 'Tiger', 'Falcon', 'Dolphin', 'Eagle', 'Koala', 'Fox', 'Lion'];
    const seed = seeds[avatarIndex % seeds.length];

    const cleanUsername = student.username?.trim().toLowerCase() ||
      (student.studentNumber ? `siswa_${student.studentNumber.trim()}` : student.displayName.toLowerCase().replace(/[^a-z0-9]/g, '') + student.absentNumber);
    const initialPassword = student.password?.trim() || '123456';
    const finalAvatar = student.avatarUrl?.trim() || `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}&backgroundColor=b6e3f4`;

    const newUser: User = {
      uid,
      role: 'student',
      status: 'active',
      displayName: student.displayName.trim(),
      searchName: student.displayName.toLowerCase().trim(),
      username: cleanUsername,
      password: initialPassword,
      avatarUrl: finalAvatar,
      schoolId: data.school.id,
      classIds: [student.classId],
      studentNumber: student.studentNumber.trim(),
      absentNumber: student.absentNumber,
      email: student.email?.trim(),
      mustChangePassword: false,
      createdAt: now,
      updatedAt: now,
    };

    const newStats: UserStats = {
      uid,
      schoolId: data.school.id,
      classId: student.classId,
      totalPoints: 0,
      academicPoints: 0,
      participationPoints: 0,
      level: 1,
      completedAssignments: 0,
      completedMissions: 0,
      badgeCount: 0,
      updatedAt: now,
    };

    setData((prev: any) => ({
      ...prev,
      users: [...prev.users, newUser],
      userStats: { ...prev.userStats, [uid]: newStats },
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          schoolId: data.school.id,
          actorId: currentUser?.uid || 'usr_guru_01',
          actorName: currentUser?.displayName || 'Guru Kelas',
          action: 'provision_student',
          targetType: 'student',
          targetId: uid,
          metadata: { name: student.displayName, nis: student.studentNumber, username: cleanUsername, classId: student.classId },
          timestamp: now,
        },
        ...prev.auditLogs,
      ],
    }));

    // Firestore sync
    syncDocToFirestore(COLLECTIONS.USERS, uid, newUser);
    syncDocToFirestore(COLLECTIONS.USER_STATS, uid, newStats);
  };

  const provisionMultipleStudents = (
    students: Array<{
      displayName: string;
      studentNumber: string;
      absentNumber: number;
      classId: string;
      email?: string;
      username?: string;
      password?: string;
    }>
  ): number => {
    if (!students.length) return 0;
    const now = new Date().toISOString();
    const seeds = ['Panda', 'Tiger', 'Falcon', 'Dolphin', 'Eagle', 'Koala', 'Fox', 'Lion', 'Bunny', 'Penguin'];

    const newUsers: User[] = [];
    const newStatsMap: Record<string, UserStats> = {};

    students.forEach((s, idx) => {
      const uid = `usr_std_${Date.now()}_${idx}_${Math.random().toString(36).substring(2, 6)}`;
      deletedItemIds.current.delete(uid);
      const seed = seeds[(idx + Math.floor(Math.random() * 5)) % seeds.length];

      const cleanUsername = s.username?.trim().toLowerCase() ||
        (s.studentNumber ? `siswa_${s.studentNumber.toString().trim()}` : s.displayName.toLowerCase().replace(/[^a-z0-9]/g, '') + (s.absentNumber || idx + 1));
      const initialPassword = s.password?.trim() || '123456';

      const u: User = {
        uid,
        role: 'student',
        status: 'active',
        displayName: s.displayName.trim(),
        searchName: s.displayName.toLowerCase().trim(),
        username: cleanUsername,
        password: initialPassword,
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${seed}&backgroundColor=b6e3f4`,
        schoolId: data.school.id,
        classIds: [s.classId],
        studentNumber: s.studentNumber?.toString().trim() || '',
        absentNumber: s.absentNumber || idx + 1,
        email: s.email?.trim(),
        mustChangePassword: false,
        createdAt: now,
        updatedAt: now,
      };

      const stats: UserStats = {
        uid,
        schoolId: data.school.id,
        classId: s.classId,
        totalPoints: 0,
        academicPoints: 0,
        participationPoints: 0,
        level: 1,
        completedAssignments: 0,
        completedMissions: 0,
        badgeCount: 0,
        updatedAt: now,
      };

      newUsers.push(u);
      newStatsMap[uid] = stats;

      // Firestore sync in background
      syncDocToFirestore(COLLECTIONS.USERS, uid, u);
      syncDocToFirestore(COLLECTIONS.USER_STATS, uid, stats);
    });

    saveDeletedIds(deletedItemIds.current);

    setData((prev: any) => ({
      ...prev,
      users: [...prev.users, ...newUsers],
      userStats: { ...prev.userStats, ...newStatsMap },
      auditLogs: [
        {
          id: `log_${Date.now()}`,
          schoolId: data.school.id,
          actorId: currentUser?.uid || 'usr_guru_01',
          actorName: currentUser?.displayName || 'Guru Kelas',
          action: 'import_students_excel',
          targetType: 'student',
          targetId: `batch_${newUsers.length}`,
          metadata: { count: newUsers.length, classId: students[0]?.classId },
          timestamp: now,
        },
        ...prev.auditLogs,
      ],
    }));

    return newUsers.length;
  };

  const updateStudent = (userId: string, updateData: Partial<User>) => {
    const now = new Date().toISOString();
    setData((prev: any) => {
      const updatedUsers = prev.users.map((u: User) => {
        if (u.uid === userId) {
          const updated = {
            ...u,
            ...updateData,
            searchName: (updateData.displayName || u.displayName).toLowerCase().trim(),
            updatedAt: now,
          };
          syncDocToFirestore(COLLECTIONS.USERS, userId, updated);
          return updated;
        }
        return u;
      });
      return {
        ...prev,
        users: updatedUsers,
      };
    });
  };

  const updateStudentPhoto = (userId: string, photoUrl: string) => {
    const now = new Date().toISOString();
    const targetUser = data.users.find((u: User) => u.uid === userId);
    if (!targetUser) return;

    setData((prev: any) => {
      const updatedUsers = prev.users.map((u: User) => {
        if (u.uid === userId) {
          const updated = {
            ...u,
            avatarUrl: photoUrl,
            updatedAt: now,
          };
          syncDocToFirestore(COLLECTIONS.USERS, userId, updated);
          return updated;
        }
        return u;
      });

      return {
        ...prev,
        users: updatedUsers,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            schoolId: data.school.id,
            actorId: currentUser?.uid || 'usr_guru_01',
            actorName: currentUser?.displayName || 'Guru Kelas',
            action: 'update_student_photo',
            targetType: 'student',
            targetId: userId,
            metadata: { name: targetUser.displayName },
            timestamp: now,
          },
          ...prev.auditLogs,
        ],
      };
    });

    addNotification(
      userId,
      '📸 Foto Profil Baru',
      'Guru telah memperbarui foto profil resmimu.',
      'system',
      'beranda'
    );
  };

  const setStudentPassword = (userId: string, newPassword: string) => {
    const now = new Date().toISOString();
    setData((prev: any) => {
      const updatedUsers = prev.users.map((u: User) => {
        if (u.uid === userId) {
          const updated = {
            ...u,
            password: newPassword.trim(),
            mustChangePassword: false,
            updatedAt: now,
          };
          syncDocToFirestore(COLLECTIONS.USERS, userId, updated);
          return updated;
        }
        return u;
      });

      return {
        ...prev,
        users: updatedUsers,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            schoolId: data.school.id,
            actorId: currentUser?.uid || 'usr_guru_01',
            actorName: currentUser?.displayName || 'Guru Kelas',
            action: 'set_student_password',
            targetType: 'student',
            targetId: userId,
            metadata: { updatedBy: currentUser?.displayName || 'Guru Kelas' },
            timestamp: now,
          },
          ...prev.auditLogs,
        ],
      };
    });
  };

  const deleteStudent = (userId: string) => {
    deleteStudents([userId]);
  };

  const deleteStudents = (userIds: string[]) => {
    userIds.forEach(id => deletedItemIds.current.add(id));
    saveDeletedIds(deletedItemIds.current);
    setData((prev: any) => {
      const userIdsSet = new Set(userIds);
      const updatedUsers = (prev.users || []).filter((u: User) => !userIdsSet.has(u.uid));
      const updatedStats = { ...(prev.userStats || {}) };
      userIds.forEach(id => delete updatedStats[id]);

      const updatedSubs = { ...(prev.submissions || {}) };
      Object.keys(updatedSubs).forEach((key) => {
        if (userIdsSet.has(updatedSubs[key]?.userId)) delete updatedSubs[key];
      });

      const updatedMisProg = { ...(prev.missionProgress || {}) };
      Object.keys(updatedMisProg).forEach((key) => {
        if (userIdsSet.has(updatedMisProg[key]?.userId)) delete updatedMisProg[key];
      });

      const updatedMatProg = { ...(prev.materialProgress || {}) };
      Object.keys(updatedMatProg).forEach((key) => {
        if (userIdsSet.has(updatedMatProg[key]?.userId)) delete updatedMatProg[key];
      });

      const updatedLedger = (prev.pointLedger || []).filter((pl: any) => !userIdsSet.has(pl.userId));
      const updatedBadges = (prev.userBadges || []).filter((b: any) => !userIdsSet.has(b.userId));

      return {
        ...prev,
        users: updatedUsers,
        userStats: updatedStats,
        submissions: updatedSubs,
        missionProgress: updatedMisProg,
        materialProgress: updatedMatProg,
        pointLedger: updatedLedger,
        userBadges: updatedBadges,
      };
    });

    const deletes: { collection: string, id: string }[] = [];
    userIds.forEach(userId => {
      deletes.push({ collection: COLLECTIONS.USERS, id: userId });
      deletes.push({ collection: COLLECTIONS.USER_STATS, id: userId });
    });
    bulkDeleteFromFirestore(deletes);
  };

  const saveTeacher = async (teacher: User) => {
    deletedItemIds.current.delete(teacher.uid);
    saveDeletedIds(deletedItemIds.current);
    setData((prev: any) => {
      const existingIdx = (prev.users || []).findIndex((u: User) => u.uid === teacher.uid);
      let updatedUsers = [...(prev.users || [])];
      if (existingIdx >= 0) {
        updatedUsers[existingIdx] = { ...updatedUsers[existingIdx], ...teacher };
      } else {
        updatedUsers.push(teacher);
      }
      return { ...prev, users: updatedUsers };
    });
    await syncDocToFirestore(COLLECTIONS.USERS, teacher.uid, teacher);
  };

  const deleteUser = async (userId: string) => {
    deletedItemIds.current.add(userId);
    saveDeletedIds(deletedItemIds.current);
    setData((prev: any) => {
      const updatedUsers = (prev.users || []).filter((u: User) => u.uid !== userId);
      const updatedStats = { ...(prev.userStats || {}) };
      delete updatedStats[userId];

      const updatedClasses = (prev.classes || []).map((c: ClassRoom) => ({
        ...c,
        teacherIds: (c.teacherIds || []).filter((tId: string) => tId !== userId),
      }));

      return {
        ...prev,
        users: updatedUsers,
        userStats: updatedStats,
        classes: updatedClasses,
      };
    });

    await Promise.allSettled([
      deleteDocFromFirestore(COLLECTIONS.USERS, userId),
      deleteDocFromFirestore(COLLECTIONS.USER_STATS, userId),
    ]);
  };

  const deleteTeacher = async (userId: string) => {
    await deleteUser(userId);
  };

  const resetStudentPassword = (userId: string): string => {
    const tempPass = `sd${Math.floor(1000 + Math.random() * 9000)}`;
    setData((prev: any) => {
      const updatedUsers = prev.users.map((u: User) =>
        u.uid === userId ? { ...u, password: tempPass, mustChangePassword: true, updatedAt: new Date().toISOString() } : u
      );
      const target = updatedUsers.find((u: User) => u.uid === userId);
      if (target) {
        syncDocToFirestore(COLLECTIONS.USERS, userId, target);
      }
      return {
        ...prev,
        users: updatedUsers,
        auditLogs: [
          {
            id: `log_${Date.now()}`,
            schoolId: data.school.id,
            actorId: currentUser.uid,
            actorName: currentUser.displayName,
            action: 'reset_student_password',
            targetType: 'student',
            targetId: userId,
            metadata: { tempPass },
            timestamp: new Date().toISOString(),
          },
          ...prev.auditLogs,
        ],
      };
    });
    return tempPass;
  };

  const sendChatMessage = async (params: {
    text: string;
    channelType?: 'public' | 'direct';
    recipientId?: string;
    imageUrl?: string;
  }): Promise<{ success: boolean; message?: string }> => {
    if (!currentUser) {
      return { success: false, message: 'Harus masuk terlebih dahulu.' };
    }
    const trimmedText = params.text.trim();
    if (!trimmedText && !params.imageUrl) {
      return { success: false, message: 'Pesan tidak boleh kosong.' };
    }

    const now = new Date().toISOString();
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const channelType = params.channelType || 'public';

    const newMessage: ChatMessage = {
      id: messageId,
      classId: data.currentClassId || 'cls_6a',
      channelType,
      recipientId: channelType === 'direct' ? params.recipientId : undefined,
      senderId: currentUser.uid,
      senderName: currentUser.displayName,
      senderRole: currentUser.role,
      senderAvatar: currentUser.avatarUrl,
      text: trimmedText,
      imageUrl: params.imageUrl,
      reactions: {},
      createdAt: now,
    };

    setData((prev: any) => ({
      ...prev,
      chatMessages: [...(prev.chatMessages || []), newMessage],
    }));

    // Async sync to Firestore
    syncDocToFirestore(COLLECTIONS.CHAT_MESSAGES, messageId, newMessage);

    // If direct message, notify the recipient
    if (channelType === 'direct' && params.recipientId && params.recipientId !== currentUser.uid) {
      addNotification(
        params.recipientId,
        `💬 Pesan Baru dari ${currentUser.displayName}`,
        trimmedText.slice(0, 80) || 'Mengirim gambar lampiran...',
        'system',
        'beranda'
      );
    }

    return { success: true };
  };

  const toggleChatReaction = async (messageId: string, emoji: string): Promise<void> => {
    if (!currentUser || !messageId || !emoji) return;

    setData((prev: any) => {
      let targetMessage: ChatMessage | null = null;
      const updatedMessages = (prev.chatMessages || []).map((msg: ChatMessage) => {
        if (msg.id === messageId) {
          const reactions = { ...(msg.reactions || {}) };
          const userList = new Set<string>(reactions[emoji] || []);
          if (userList.has(currentUser.uid)) {
            userList.delete(currentUser.uid);
          } else {
            userList.add(currentUser.uid);
          }

          if (userList.size === 0) {
            delete reactions[emoji];
          } else {
            reactions[emoji] = Array.from(userList);
          }

          const updated: ChatMessage = { ...msg, reactions };
          targetMessage = updated;
          return updated;
        }
        return msg;
      });

      if (targetMessage) {
        syncDocToFirestore(COLLECTIONS.CHAT_MESSAGES, messageId, targetMessage);
      }

      return {
        ...prev,
        chatMessages: updatedMessages,
      };
    });
  };

  const deleteChatMessage = async (messageId: string): Promise<void> => {
    if (!currentUser || !messageId) return;

    deletedItemIds.current.add(messageId);
    saveDeletedIds(deletedItemIds.current);

    setData((prev: any) => {
      const filtered = (prev.chatMessages || []).filter((msg: ChatMessage) => msg.id !== messageId);
      return {
        ...prev,
        chatMessages: filtered,
      };
    });

    deleteDocFromFirestore(COLLECTIONS.CHAT_MESSAGES, messageId);
  };

  const addClass = (newClass: Omit<ClassRoom, 'id' | 'createdAt'>) => {
    const classId = `cls_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    deletedItemIds.current.delete(classId);
    saveDeletedIds(deletedItemIds.current);

    const created: ClassRoom = {
      ...newClass,
      id: classId,
      schoolId: data.school?.id || 'sch_merdeka_01',
      status: newClass.status || 'active',
      teacherIds: newClass.teacherIds || [],
      createdAt: new Date().toISOString(),
    };

    setData((prev: any) => ({
      ...prev,
      classes: [...(prev.classes || []), created],
    }));

    syncDocToFirestore(COLLECTIONS.CLASSES, classId, created);
    return created;
  };

  const updateClass = (classId: string, updates: Partial<ClassRoom>) => {
    setData((prev: any) => {
      const updatedClasses = (prev.classes || []).map((c: ClassRoom) =>
        c.id === classId ? { ...c, ...updates } : c
      );
      return { ...prev, classes: updatedClasses };
    });

    const existing = (data.classes || []).find((c: ClassRoom) => c.id === classId);
    if (existing) {
      syncDocToFirestore(COLLECTIONS.CLASSES, classId, { ...existing, ...updates });
    }
  };

  const deleteClass = async (classId: string) => {
    deletedItemIds.current.add(classId);
    saveDeletedIds(deletedItemIds.current);

    setData((prev: any) => {
      const updatedClasses = (prev.classes || []).filter((c: ClassRoom) => c.id !== classId);
      const updatedUsers = (prev.users || []).map((u: User) => {
        if (Array.isArray(u.classIds) && u.classIds.includes(classId)) {
          return { ...u, classIds: u.classIds.filter((cid: string) => cid !== classId) };
        }
        return u;
      });
      return {
        ...prev,
        classes: updatedClasses,
        users: updatedUsers,
      };
    });

    await deleteDocFromFirestore(COLLECTIONS.CLASSES, classId);
  };

  const resetToInitialData = async () => {
    try {
      safeStorage.removeItem(STORAGE_KEY);
      safeSessionStorage.removeItem(SESSION_USER_KEY);
    } catch (e) {}
    await refreshFromCloud();
  };

  return (
    <AppContext.Provider
      value={{
        currentUser,
        currentRole,
        isAuthenticated,
        currentClassId: data.currentClassId,
        setCurrentClassId,
        users: data.users || [],
        school: data.school || INITIAL_SCHOOL,
        classes: data.classes || [],
        materials: data.materials || [],
        materialProgress: data.materialProgress || {},
        assignments: data.assignments || [],
        submissions: data.submissions || {},
        quizzes: data.quizzes || [],
        quizSubmissions: data.quizSubmissions || {},
        missions: data.missions || [],
        missionProgress: data.missionProgress || {},
        pointLedger: data.pointLedger || [],
        userStats: data.userStats || {},
        badges: data.badges || [],
        userBadges: data.userBadges || [],
        announcements: data.announcements || [],
        notifications: data.notifications || [],
        auditLogs: data.auditLogs || [],
        chatMessages: data.chatMessages || [],
        userPresences,
        isUserOnline,
        levels: DEFAULT_LEVELS,
        isFirebaseSynced,
        activeTab,
        setActiveTab,
        switchUser,
        loginUser,
        logoutUser,
        updateUserAvatar,
        updateUserProfile,
        updateSchoolProfile,
        changePassword,
        addClass,
        updateClass,
        deleteClass,
        markMaterialCompleted,
        submitAssignment,
        submitQuizAnswers,
        submitQuiz,
        claimMissionReward,
        createMaterial,
        updateMaterial,
        deleteMaterial,
        saveMaterial,
        createAssignment,
        updateAssignment,
        deleteAssignment,
        saveAssignment,
        createQuiz,
        updateQuiz,
        deleteQuiz,
        saveQuiz,
        gradeQuizSubmission,
        gradeSubmission,
        requestRevision,
        adjustStudentPoints,
        createMission,
        saveMission,
        deleteMission,
        submitMissionForVerification,
        verifyManualMission,
        gradeAndAwardMission,
        gradeAndAwardMissionBulk,
        createAnnouncement,
        saveAnnouncement,
        deleteAnnouncement,
        refreshFromCloud,
        provisionStudent,
        provisionMultipleStudents,
        updateStudent,
        updateStudentPhoto,
        deleteStudent,
        deleteStudents,
        saveTeacher,
        deleteTeacher,
        deleteUser,
        setStudentPassword,
        resetStudentPassword,
        markNotificationRead,
        markAllNotificationsRead,
        sendChatMessage,
        toggleChatReaction,
        deleteChatMessage,
        resetToInitialData,
        syncAllToCloud,
        isQuotaExceeded,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};






