import {
  Announcement,
  Assignment,
  AuditLog,
  Badge,
  ChatMessage,
  ClassRoom,
  Material,
  MaterialProgress,
  Mission,
  MissionProgress,
  PointLedger,
  Quiz,
  QuizSubmission,
  School,
  Submission,
  User,
  UserBadge,
  UserStats,
} from '../types';

export const INITIAL_SCHOOL: School = {
  id: 'sch_merdeka_01',
  name: 'SD Negeri Harapan Bangsa',
  logoUrl: '',
  academicYear: '2026/2027',
  timezone: 'Asia/Jakarta',
  npsn: '20108890',
  address: 'Jl. Raya Pekayon No. 9, Pasar Rebo, Jakarta Timur',
  principalName: 'Hj. Siti Aminah, M.Pd.',
  motto: 'Cerdas, Berkarakter, dan Berprestasi Unggul',
  contactEmail: 'sdnegeripekayon09@gmail.com',
  contactPhone: '(021) 8712345',
  settings: {
    leaderboardMode: 'top10_self',
    allowLateSubmission: true,
  },
};

export const INITIAL_CLASSES: ClassRoom[] = [
  {
    id: 'cls_6a',
    schoolId: 'sch_merdeka_01',
    name: 'Kelas 6E',
    grade: 6,
    academicYear: '2026/2027',
    teacherIds: ['usr_guru_rahma'],
    status: 'active',
    createdAt: '2026-07-15T08:00:00.000Z',
    studentCount: 0,
  },
  {
    id: 'cls_6b',
    schoolId: 'sch_merdeka_01',
    name: 'Kelas 6B - Rajawali',
    grade: 6,
    academicYear: '2026/2027',
    teacherIds: ['usr_guru_rahma'],
    status: 'active',
    createdAt: '2026-07-15T08:00:00.000Z',
    studentCount: 0,
  },
];

export const INITIAL_BADGES: Badge[] = [
  {
    id: 'bdg_first_submission',
    name: 'Langkah Pertama',
    description: 'Mengumpulkan tugas pertamamu di kelas!',
    iconName: 'Sparkles',
    category: 'academic',
    criteria: 'Kirim 1 tugas',
    rarity: 'common',
  },
  {
    id: 'bdg_early_bird',
    name: 'Juara Tepat Waktu',
    description: 'Mengumpulkan tugas 12 jam sebelum batas tenggat.',
    iconName: 'Clock',
    category: 'streak',
    criteria: 'Kumpul tugas cepat',
    rarity: 'rare',
  },
  {
    id: 'bdg_bookworm',
    name: 'Kutu Buku Cilik',
    description: 'Membaca dan menuntaskan 5 modul materi pelajaran.',
    iconName: 'BookMarked',
    category: 'academic',
    criteria: 'Selesaikan 5 materi',
    rarity: 'rare',
  },
  {
    id: 'bdg_perfect_score',
    name: 'Nilai Sempurna',
    description: 'Meraih skor 100 pada tugas atau kuis.',
    iconName: 'Award',
    category: 'academic',
    criteria: 'Dapat nilai 100',
    rarity: 'epic',
  },
  {
    id: 'bdg_star_student',
    name: 'Bintang Prestasi',
    description: 'Mencapai total 500 poin pembelajaran.',
    iconName: 'Star',
    category: 'special',
    criteria: 'Kumpulkan 500 poin',
    rarity: 'legendary',
  },
];

export const INITIAL_USERS: User[] = [
  // Administrator
  {
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
    createdAt: '2026-07-01T08:00:00.000Z',
    updatedAt: '2026-07-01T08:00:00.000Z',
  },
  // Teacher
  {
    uid: 'usr_guru_rahma',
    role: 'teacher',
    status: 'active',
    displayName: 'Teguh Firmansyah Apriliana, M.Pd',
    searchName: 'teguh firmansyah apriliana guru wali kelas 6e',
    username: 'guru.teguh',
    password: 'guru123',
    avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=TeguhFirmansyah&backgroundColor=b6e3f4',
    schoolId: 'sch_merdeka_01',
    classIds: ['cls_6a', 'cls_6b'],
    email: 'teguh.april92@gmail.com',
    createdAt: '2026-07-01T08:00:00.000Z',
    updatedAt: '2026-07-01T08:00:00.000Z',
  },
];

export const INITIAL_USER_STATS: Record<string, UserStats> = {};

export const INITIAL_USER_BADGES: UserBadge[] = [];

export const INITIAL_MATERIALS: Material[] = [];

export const INITIAL_MATERIAL_PROGRESS: Record<string, MaterialProgress> = {};

// Create a date dynamic to present time
const dateOffset = (days: number, hours: number = 0, minutes: number = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(d.getHours() + hours);
  d.setMinutes(d.getMinutes() + minutes);
  return d.toISOString();
};

export const INITIAL_ASSIGNMENTS: Assignment[] = [];

export const INITIAL_SUBMISSIONS: Record<string, Submission> = {};

export const INITIAL_MISSIONS: Mission[] = [
  {
    id: 'mis_01_read_materials',
    schoolId: 'sch_merdeka_01',
    classIds: ['cls_6a', 'cls_6b'],
    title: 'Eksplorasi Modul Belajar',
    description: 'Buka dan selesaikan minimal 2 modul materi pembelajaran minggu ini.',
    type: 'material',
    target: 2,
    rewardPoints: 30,
    badgeId: 'bdg_bookworm',
    startAt: dateOffset(-7),
    endAt: dateOffset(7),
    status: 'active',
    repeat: 'weekly',
    createdBy: 'usr_guru_rahma',
  },
  {
    id: 'mis_02_early_submission',
    schoolId: 'sch_merdeka_01',
    classIds: ['cls_6a'],
    title: 'Disiplin Waktu Kirim Tugas',
    description: 'Kirimkan tugas aktifmu sebelum sisa waktu kurang dari 12 jam.',
    type: 'assignment',
    target: 1,
    rewardPoints: 25,
    badgeId: 'bdg_early_bird',
    startAt: dateOffset(-3),
    endAt: dateOffset(5),
    status: 'active',
    repeat: 'weekly',
    createdBy: 'usr_guru_rahma',
  },
  {
    id: 'mis_03_active_helper',
    schoolId: 'sch_merdeka_01',
    classIds: ['cls_6a'],
    title: 'Sahabat Belajar Kelas',
    description: 'Membantu teman sekelas memahami pelajaran atau piket kelas dengan ceria.',
    type: 'manual',
    target: 1,
    rewardPoints: 20,
    startAt: dateOffset(-2),
    endAt: dateOffset(10),
    status: 'active',
    repeat: 'once',
    createdBy: 'usr_guru_rahma',
  },
];

export const INITIAL_MISSION_PROGRESS: Record<string, MissionProgress> = {};

export const INITIAL_POINT_LEDGER: PointLedger[] = [];

export const INITIAL_ANNOUNCEMENTS: Announcement[] = [
  {
    id: 'ann_01',
    schoolId: 'sch_merdeka_01',
    classIds: ['cls_6a', 'cls_6b'],
    title: 'Persiapan Praktik Model Tata Surya & Pameran Kelas',
    content:
      'Halo anak-anak hebat! Jangan lupa membawa bahan kardus bekas, bola plastisin warna-warni, dan kawat kecil untuk kegiatan kreasi kelompok hari Kamis nanti ya!',
    authorName: 'Teguh Firmansyah Apriliana, M.Pd',
    priority: 'important',
    createdAt: dateOffset(-2, 3),
  },
  {
    id: 'ann_02',
    schoolId: 'sch_merdeka_01',
    classIds: ['cls_6a'],
    title: 'Selamat kepada Peraih Bintang Prestasi Pekan Ini!',
    content:
      'Apresiasi setinggi-tingginya untuk Siti Aisyah dan teman-teman Kelas 6E yang sudah mencapai Level 4 Bintang Kelas. Terus semangat belajar!',
    authorName: 'Teguh Firmansyah Apriliana, M.Pd',
    priority: 'normal',
    createdAt: dateOffset(-1),
  },
];

export const INITIAL_AUDIT_LOGS: AuditLog[] = [
  {
    id: 'log_01',
    schoolId: 'sch_merdeka_01',
    actorId: 'usr_guru_rahma',
    actorName: 'Teguh Firmansyah Apriliana, M.Pd',
    action: 'grade_submission',
    targetType: 'submission',
    targetId: 'asg_02_mtk_latihan_pecahan_usr_budi_01',
    metadata: { score: 95, rewardPoints: 50, studentName: 'Budi Pratama' },
    timestamp: dateOffset(-1, 8),
  },
  {
    id: 'log_02',
    schoolId: 'sch_merdeka_01',
    actorId: 'usr_guru_rahma',
    actorName: 'Teguh Firmansyah Apriliana, M.Pd',
    action: 'publish_assignment',
    targetType: 'assignment',
    targetId: 'asg_03_bindo_analisis_eksplanasi',
    metadata: { title: 'Analisis Struktur Teks Eksplanasi "Terjadinya Pelangi"' },
    timestamp: dateOffset(-1),
  },
];

export const INITIAL_CHAT_MESSAGES: ChatMessage[] = [
  {
    id: 'msg_01',
    classId: 'cls_6a',
    channelType: 'public',
    senderId: 'usr_guru_rahma',
    senderName: 'Teguh Firmansyah Apriliana, M.Pd',
    senderRole: 'teacher',
    senderAvatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=TeguhFirmansyah&backgroundColor=b6e3f4',
    text: 'Selamat pagi anak-anak hebat Kelas 6E! 🌟 Materi Tata Surya dan tugas pembelajaran sudah siap dipelajari. Silakan diskusikan materi atau tanyakan jika ada yang belum dipahami di sini ya.',
    reactions: {},
    createdAt: dateOffset(-1, 8),
  },
];

export const INITIAL_QUIZZES: Quiz[] = [
  {
    id: 'quiz_ipas_01',
    schoolId: 'sch_merdeka_01',
    classIds: ['cls_6a', 'cls_6b'],
    subject: 'Ilmu Pengetahuan Alam & Sosial (IPAS)',
    topic: 'Tata Surya & Planet',
    title: 'Kuis Evaluasi Bab 1: Sistem Tata Surya & Penjelajahan Luar Angkasa',
    description: 'Uji pemahamanmu seputar planet, karakteristik benda langit, dan kedudukan bumi dalam tata surya.',
    durationMinutes: 30,
    openAt: dateOffset(-2),
    dueAt: dateOffset(5, 18),
    shuffleQuestions: false,
    showScoreImmediately: true,
    maxScore: 100,
    rewardPoints: 75,
    status: 'published',
    createdBy: 'usr_guru_rahma',
    createdAt: dateOffset(-2, 9),
    updatedAt: dateOffset(-2, 9),
    questions: [
      {
        id: 'q_01',
        type: 'single_choice',
        prompt: 'Planet apakah yang memiliki ukuran terbesar di dalam sistem tata surya kita?',
        points: 20,
        options: ['Mars', 'Bumi', 'Yupiter', 'Saturnus'],
        correctOptionIndex: 2,
        explanation: 'Yupiter merupakan planet terbesar di tata surya dengan diameter lebih dari 142.000 km.',
      },
      {
        id: 'q_02',
        type: 'complex_multiple_choice',
        prompt: 'Tentukan kebenaran dari setiap pernyataan mengenai karakteristik planet berikut ini!',
        points: 20,
        complexMode: 'true_false',
        complexStatements: [
          { id: 'stmt_1', statement: 'Merkurius adalah planet yang letaknya paling dekat dengan Matahari.', isCorrect: true },
          { id: 'stmt_2', statement: 'Mars dikenal sebagai Planet Merah karena atmosfernya kaya akan gas metana.', isCorrect: false },
          { id: 'stmt_3', statement: 'Saturnus memiliki sistem cincin yang sangat indah dan tersusun dari partikel es dan batu.', isCorrect: true },
          { id: 'stmt_4', statement: 'Bulan merupakan salah satu contoh planet dalam tata surya.', isCorrect: false },
        ],
        explanation: 'Merkurius terdekat dengan matahari. Mars berwarna merah karena oksida besi (karat), bukan metana. Bulan adalah satelit alami, bukan planet.',
      },
      {
        id: 'q_03',
        type: 'matching',
        prompt: 'Jodohkanlah nama planet di sebelah kiri dengan julukan/karakteristiknya yang tepat di sebelah kanan!',
        points: 20,
        matchingPairs: [
          { id: 'pair_1', left: 'Mars', right: 'Planet Merah' },
          { id: 'pair_2', left: 'Saturnus', right: 'Planet Bercincin' },
          { id: 'pair_3', left: 'Venus', right: 'Bintang Kejora' },
          { id: 'pair_4', left: 'Bumi', right: 'Planet Biru' },
        ],
        explanation: 'Mars = Planet Merah, Saturnus = Planet Bercincin, Venus = Bintang Kejora, Bumi = Planet Biru.',
      },
      {
        id: 'q_04',
        type: 'short_answer',
        prompt: 'Pusat tata surya yang memancarkan cahaya sendiri dan dikelilingi oleh semua planet adalah ...',
        points: 20,
        acceptedAnswers: ['Matahari', 'matahari', 'Sang Surya', 'Surya'],
        caseSensitive: false,
        explanation: 'Matahari adalah bintang induk dan pusat orbit dari sistem tata surya kita.',
      },
      {
        id: 'q_05',
        type: 'essay',
        prompt: 'Jelaskan mengapa Planet Bumi menjadi satu-satunya tempat di tata surya yang mendukung adanya kehidupan makhluk hidup!',
        points: 20,
        minWords: 15,
        essayRubric: 'Siswa menyebutkan: keberadaan air cair, atmosfer yang mengandung oksigen untuk bernapas, lapisan ozon pelindung radiasi, dan jarak yang ideal (zona laik huni/Goldilocks zone).',
        explanation: 'Bumi memiliki air dalam wujud cair, atmosfer pelindung kaya oksigen, suhu permukaan yang stabil, dan jarak ideal dari matahari.',
      },
    ],
  },
];

export const INITIAL_QUIZ_SUBMISSIONS: Record<string, QuizSubmission> = {};

