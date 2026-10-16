import React, { useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  Camera,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock,
  FilePlus,
  FileSpreadsheet,
  GraduationCap,
  Megaphone,
  PenLine,
  Plus,
  Coins,
  Sparkles,
  Trophy,
  UserCheck,
  Users,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDateIndo, formatShortDate } from '../../utils/gamification';
import { PointIcon } from '../common/PointIcon';
import { TeacherGradingModal } from './TeacherGradingModal';
import { TeacherMissionGradingModal } from './TeacherMissionGradingModal';
import { TeacherPointAdjustmentModal } from './TeacherPointAdjustmentModal';

interface TeacherDashboardProps {
  onNavigateTab: (tab: string) => void;
  onOpenCreateAssignment: () => void;
  onOpenCreateMaterial?: () => void;
  onOpenCreateAnnouncement: () => void;
  onOpenEditProfile?: () => void;
}

export const TeacherDashboard: React.FC<TeacherDashboardProps> = ({
  onNavigateTab,
  onOpenCreateAssignment,
  onOpenCreateMaterial,
  onOpenCreateAnnouncement,
  onOpenEditProfile,
}) => {
  const {
    currentUser,
    users,
    assignments,
    submissions,
    missions,
    missionProgress,
    materials,
    classes,
    currentClassId,
    userStats,
    pointLedger,
  } = useApp();

  const [activeGradingSubId, setActiveGradingSubId] = useState<string | null>(null);
  const [activeGradingMission, setActiveGradingMission] = useState<any | null>(null);
  const [pointModalMode, setPointModalMode] = useState<'add' | 'deduct'>('add');
  const [showPointModal, setShowPointModal] = useState(false);

  if (!currentUser) return null;

  const currentClass = classes.find((c) => c.id === currentClassId) || classes[0] || { id: 'cls_none', name: 'Belum Ada Kelas', grade: 6 };
  const classStudents = users.filter(
    (u) => u.role === 'student' && (u.classIds || []).includes(currentClassId)
  );
  const currentClassStudentIds = new Set(classStudents.map(s => s.uid));

  // Pending grading submissions (deduplicated latest per assignment+student)
  const pendingSubMap = new Map<string, any>();
    (Object.values(submissions) as any[])
    .filter((s) => s && (s.status === 'submitted' || s.status === 'resubmitted') && s.assignmentId && s.userId && currentClassStudentIds.has(s.userId))
    .forEach((s) => {
      const key = `${s.assignmentId}_${s.userId}`;
      const existing = pendingSubMap.get(key);
      if (!existing || new Date(s.submittedAt || 0).getTime() >= new Date(existing.submittedAt || 0).getTime()) {
        pendingSubMap.set(key, s);
      }
    });
  const pendingSubmissions = Array.from(pendingSubMap.values())
    .sort((a, b) => new Date(a.submittedAt).getTime() - new Date(b.submittedAt).getTime());

  // Pending mission verifications
    const pendingMissionsList = Object.entries(missionProgress)
    .filter(([_, prog]: [string, any]) => prog && prog.status === 'pending_verification' && currentClassStudentIds.has(prog.userId))
    .map(([key, prog]: [string, any]) => {
      const student = users.find((u) => u.uid === prog.userId);
      const mission = missions.find((m) => m.id === prog.missionId);
      return { key, prog, student, mission };
    })
    .filter((item) => item.student && item.mission);

  // Graded submissions for average score calculation
    const gradedSubs = (Object.values(submissions) as any[]).filter(
    (s) => s.status === 'graded' && currentClassStudentIds.has(s.userId)
  );
  const avgScore =
    gradedSubs.length > 0
      ? Math.round(gradedSubs.reduce((acc, curr) => acc + (curr.score || 0), 0) / gradedSubs.length)
      : 0;

  

  return (
    <div className="space-y-6 pb-12">
      {/* Welcome Banner */}
      <div className="bg-gradient-to-r from-[#101936] via-[#1C1242] to-[#364FFF] rounded-3xl p-5 sm:p-6 lg:p-7 text-white shadow-2xl shadow-indigo-950/20 border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-5 relative overflow-hidden">
        <div className="absolute -right-12 -top-12 w-64 h-64 rounded-full bg-[#8B20FF]/25 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 -bottom-16 w-80 h-80 rounded-full bg-[#364FFF]/20 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex items-center gap-3.5 sm:gap-5 min-w-0">
          <div className="relative shrink-0 group">
            <div className="w-14 h-14 sm:w-16 sm:h-16 lg:w-20 lg:h-20 rounded-2xl sm:rounded-3xl bg-white/15 backdrop-blur-md p-1 border-2 border-white/40 shadow-xl overflow-hidden">
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.displayName}
                className="w-full h-full rounded-xl sm:rounded-2xl object-cover"
              />
            </div>
            {onOpenEditProfile && (
              <button
                type="button"
                onClick={onOpenEditProfile}
                className="absolute -bottom-1 -right-1 p-1 sm:p-1.5 bg-[#FFD83D] text-[#101936] rounded-lg sm:rounded-xl shadow-md hover:scale-105 transition-transform cursor-pointer border border-white"
                title="Edit Profil & Foto Guru"
              >
                <Camera className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              </button>
            )}
          </div>
          <div className="min-w-0 space-y-0.5">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/10 backdrop-blur-md text-[#FFD83D] text-[11px] font-bold mb-1 border border-white/10">
              <GraduationCap className="w-3.5 h-3.5" />
              <span>Portal Guru & Pengajar</span>
            </div>
            <p className="text-xs sm:text-sm font-bold text-indigo-100 tracking-wide">
              Selamat Mengajar,
            </p>
            <h1 className="text-lg sm:text-2xl lg:text-3xl font-black font-display text-[#FFD83D] tracking-tight">
              {currentUser.displayName}
            </h1>
          </div>
        </div>

        {/* Quick action icon buttons */}
        <div className="relative z-10 flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={onOpenCreateAssignment}
            className="h-10 px-3 rounded-2xl bg-white text-[#364FFF] hover:bg-[#EEF4FF] shadow-md transition-all flex items-center gap-1.5 text-xs font-bold cursor-pointer shrink-0"
            title="Buat Tugas Baru untuk Siswa"
          >
            <Plus className="w-4 h-4 text-[#364FFF]" strokeWidth={2.5} />
            <span>Tugas Baru</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setPointModalMode('add');
              setShowPointModal(true);
            }}
            className="h-10 px-3.5 rounded-2xl bg-gradient-to-r from-[#FFD83D] to-amber-400 hover:opacity-95 text-[#101936] shadow-md transition-all flex items-center gap-1.5 text-xs font-black cursor-pointer shrink-0 border border-white/40"
            title="Kelola Poin Siswa (Tambah / Kurangi Poin)"
          >
            <PointIcon className="w-4 h-4" />
            <span>Atur Poin</span>
          </button>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="bg-white rounded-3xl border border-[#BFDBFE]/50 p-5 shadow-xs">
          <div className="w-10 h-10 rounded-2xl bg-[#EEF4FF] text-[#364FFF] flex items-center justify-center mb-3 border border-[#BFDBFE]/40">
            <Users className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            Siswa Terdaftar
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl sm:text-3xl font-black text-[#101936] font-display">
              {classStudents.length}
            </span>
            <span className="text-xs text-slate-400 font-medium">Siswa {currentClass?.name || 'Belum Ada Kelas'}</span>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-[#BFDBFE]/50 p-5 shadow-xs">
          <div className="w-10 h-10 rounded-2xl bg-[#FFD83D]/20 text-[#101936] flex items-center justify-center mb-3 border border-[#FFD83D]/40">
            <CheckSquare className="w-5 h-5 text-amber-600" />
          </div>
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            Perlu Dinilai Segera
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl sm:text-3xl font-black text-amber-600 font-display">
              {pendingSubmissions.length + pendingMissionsList.length}
            </span>
            <span className="text-xs text-slate-400 font-medium">
              {pendingSubmissions.length} Tugas • {pendingMissionsList.length} Misi
            </span>
          </div>
        </div>

        <div className="bg-white rounded-3xl border border-[#BFDBFE]/50 p-5 shadow-xs">
          <div className="w-10 h-10 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3 border border-emerald-100">
            <Award className="w-5 h-5" />
          </div>
          <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
            Rata-rata Nilai
          </span>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-2xl sm:text-3xl font-black text-emerald-600 font-display">
              {avgScore}
            </span>
            <span className="text-xs text-slate-400 font-medium">Skala 100</span>
          </div>
        </div>

        
      </div>

      {/* Main Sections: Grading Queue & Quick Action Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Grading Queue */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-3xl border border-[#BFDBFE]/50 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-[#FFD83D]/20 text-amber-700 flex items-center justify-center border border-[#FFD83D]/40">
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-[#101936] font-display">
                    Antrean Penilaian Tugas Siswa
                  </h3>
                  <p className="text-xs text-slate-500">
                    Beri skor dan feedback konstruktif agar poin siswa segera terdistribusi
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => onNavigateTab('tugas')}
                className="text-xs font-bold text-[#364FFF] hover:text-[#8B20FF] flex items-center gap-1 cursor-pointer"
              >
                <span>Kelola Semua</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {pendingSubmissions.length === 0 && pendingMissionsList.length === 0 ? (
              <div className="p-8 text-center bg-[#F8FAFF] rounded-2xl border border-dashed border-[#BFDBFE] text-slate-400 text-xs">
                <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
                <p className="font-bold text-[#101936]">Semua kiriman tugas dan misi sudah dinilai!</p>
                <p className="text-slate-400 mt-0.5">Tidak ada antrean penilaian yang tertunda saat ini.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Pending Assignment Submissions */}
                {pendingSubmissions.slice(0, 4).map((sub) => {
                  const student = users.find((u) => u.uid === sub.userId);
                  const asg = assignments.find((a) => a.id === sub.assignmentId);

                  return (
                    <div
                      key={sub.id || `${sub.assignmentId}_${sub.userId}`}
                      className="p-4 rounded-2xl border border-slate-200/80 bg-[#F8FAFF] hover:bg-[#EEF4FF]/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <img
                          src={student?.avatarUrl}
                          alt={student?.displayName}
                          className="w-10 h-10 rounded-xl bg-white border border-slate-200 object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-xs sm:text-sm font-bold text-[#101936] truncate">
                              {student?.displayName}
                            </h4>
                            <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-indigo-100 text-indigo-700">
                              Tugas
                            </span>
                            {sub.isLate && (
                              <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-rose-100 text-rose-700">
                                Telat
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 truncate">
                            Tugas: <strong className="text-slate-700">{asg?.title}</strong>
                          </p>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            Dikirim {formatDateIndo(sub.submittedAt)} • {sub.files?.length || 0} Lampiran
                          </p>
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center justify-end">
                        <button
                          type="button"
                          onClick={() => setActiveGradingSubId(sub.id || `${sub.assignmentId}_${sub.userId}`)}
                          className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#364FFF] to-[#8B20FF] hover:opacity-95 active:scale-95 text-white font-bold text-xs shadow-md shadow-indigo-600/20 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                          <Award className="w-3.5 h-3.5 text-[#FFD83D]" />
                          <span>Beri Nilai & Poin</span>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {/* Pending Mission Verifications */}
                {pendingMissionsList.slice(0, 3).map((item) => (
                  <div
                    key={item.key}
                    className="p-4 rounded-2xl border border-amber-200/80 bg-amber-50/50 hover:bg-amber-100/40 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <img
                        src={item.student?.avatarUrl}
                        alt={item.student?.displayName}
                        className="w-10 h-10 rounded-xl bg-white border border-amber-200 object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                            {item.student?.displayName}
                          </h4>
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800">
                            Laporan Misi
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 truncate">
                          Misi: <strong className="text-amber-900">{item.mission?.title}</strong>
                        </p>
                        <p className="text-[10px] text-slate-500 mt-0.5">
                          {item.prog.notes ? `"${item.prog.notes.slice(0, 50)}..."` : 'Laporan siap diverifikasi'}
                        </p>
                      </div>
                    </div>

                    <div className="shrink-0 flex items-center justify-end">
                      <button
                        type="button"
                        onClick={() => setActiveGradingMission(item.mission)}
                        className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:opacity-95 active:scale-95 text-white font-bold text-xs shadow-md shadow-amber-500/20 transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        <Award className="w-3.5 h-3.5" />
                        <span>Verifikasi Misi</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Quick Management Shortcards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              type="button"
              onClick={onOpenCreateAssignment}
              className="p-5 rounded-3xl bg-white border border-[#BFDBFE]/50 hover:border-[#364FFF]/60 hover:shadow-md transition-all text-left group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-2xl bg-[#EEF4FF] text-[#364FFF] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <CheckSquare className="w-5 h-5" />
              </div>
              <h4 className="text-sm font-bold text-[#101936] font-display">Posting Tugas Baru</h4>
              <p className="text-xs text-slate-400 mt-1">Judul, petunjuk, lampiran & setingan</p>
            </button>

            <button
              type="button"
              onClick={() => {
                setPointModalMode('add');
                setShowPointModal(true);
              }}
              className="p-5 rounded-3xl bg-white border border-[#BFDBFE]/50 hover:border-[#FFD83D]/80 hover:shadow-md transition-all text-left group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-2xl bg-[#FFD83D]/20 text-[#101936] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Sparkles className="w-5 h-5 text-amber-600" />
              </div>
              <h4 className="text-sm font-bold text-[#101936] font-display">Kelola Poin Siswa</h4>
              <p className="text-xs text-slate-400 mt-1">Reward gamifikasi & apresiasi</p>
            </button>

            <button
              type="button"
              onClick={onOpenCreateAnnouncement}
              className="p-5 rounded-3xl bg-white border border-[#BFDBFE]/50 hover:border-[#8B20FF]/60 hover:shadow-md transition-all text-left group cursor-pointer"
            >
              <div className="w-10 h-10 rounded-2xl bg-[#EEF4FF] text-[#8B20FF] flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Megaphone className="w-5 h-5 text-[#8B20FF]" />
              </div>
              <h4 className="text-sm font-bold text-[#101936] font-display">Kirim Pengumuman</h4>
              <p className="text-xs text-slate-400 mt-1">Siarkan info penting ke kelas</p>
            </button>
          </div>
        </div>

        {/* Right Col: Recent Activity & Top Students */}
        <div className="space-y-6">
          {/* Top Students in Class */}
          <div className="bg-white rounded-3xl border border-[#BFDBFE]/50 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#FFD83D]/20 text-amber-700 flex items-center justify-center">
                  <Trophy className="w-4 h-4 text-amber-600" />
                </div>
                <h3 className="text-sm font-bold text-[#101936] font-display">
                  Siswa Poin Tertinggi
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('leaderboard')}
                className="text-xs font-bold text-[#364FFF] hover:text-[#8B20FF] cursor-pointer"
              >
                Lihat Peringkat →
              </button>
            </div>

            <div className="space-y-2.5">
              {classStudents
                .map((student) => ({
                  student,
                  points: userStats[student.uid]?.totalPoints || 0,
                  level: userStats[student.uid]?.level || 1,
                }))
                .sort((a, b) => b.points - a.points)
                .slice(0, 4)
                .map((item, idx) => (
                  <div
                    key={item.student.uid}
                    className="flex items-center justify-between p-2.5 rounded-2xl bg-[#F8FAFF] border border-slate-100"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-6 h-6 rounded-lg bg-white border border-slate-200 font-bold text-xs flex items-center justify-center text-slate-500 shrink-0">
                        {idx + 1}
                      </span>
                      <img
                        src={item.student.avatarUrl}
                        alt={item.student.displayName}
                        className="w-8 h-8 rounded-xl object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#101936] truncate">
                          {item.student.displayName}
                        </p>
                        <p className="text-[10px] text-slate-400">Level {item.level}</p>
                      </div>
                    </div>
                    <span className="text-xs font-black text-[#101936] bg-[#FFD83D]/20 px-2 py-0.5 rounded-md border border-[#FFD83D]/40 flex items-center gap-1">
                      <PointIcon className="w-3.5 h-3.5" />
                      <span>{item.points} Poin</span>
                    </span>
                  </div>
                ))}
            </div>
          </div>

          {/* Point Ledger Recent Log */}
          <div className="bg-white rounded-3xl border border-[#BFDBFE]/50 p-6 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-[#EEF4FF] flex items-center justify-center">
                  <PointIcon className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-[#101936] font-display">
                  Riwayat Poin Terkini
                </h3>
              </div>
              <button
                type="button"
                onClick={() => onNavigateTab('audit')}
                className="text-xs font-bold text-[#364FFF] hover:text-[#8B20FF] cursor-pointer"
              >
                Log Audit
              </button>
            </div>

            <div className="space-y-2.5">
              {pointLedger.slice(0, 3).map((item) => (
                <div key={item.id} className="p-2.5 rounded-2xl bg-[#F8FAFF] border border-slate-100 text-xs">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-[#101936] truncate">{item.reason}</span>
                    <span
                      className={`font-black shrink-0 flex items-center gap-1 ${
                        item.amount > 0 ? 'text-amber-800' : 'text-rose-600'
                      }`}
                    >
                      <PointIcon className="w-3.5 h-3.5" />
                      <span>{item.amount > 0 ? `+${item.amount}` : item.amount}</span>
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400">
                    Oleh: {item.actorName} • {formatShortDate(item.createdAt)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Grading Modal */}
      {activeGradingSubId && (
        <TeacherGradingModal
          submissionId={activeGradingSubId}
          onClose={() => setActiveGradingSubId(null)}
        />
      )}

      {/* Mission Grading Modal */}
      {activeGradingMission && (
        <TeacherMissionGradingModal
          mission={activeGradingMission}
          isOpen={!!activeGradingMission}
          onClose={() => setActiveGradingMission(null)}
        />
      )}

      {/* Point Adjustment Modal */}
      <TeacherPointAdjustmentModal
        isOpen={showPointModal}
        onClose={() => setShowPointModal(false)}
        initialMode={pointModalMode}
      />
    </div>
  );
};





