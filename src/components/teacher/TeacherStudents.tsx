import React, { useState, useRef } from 'react';
import {
  Award,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  Copy,
  Download,
  Edit2,
  Eye,
  EyeOff,
  FileCheck,
  FileSpreadsheet,
  Grid,
  History,
  Key,
  KeyRound,
  LayoutGrid,
  LayoutList,
  List,
  Lock,
  Medal,
  MoreVertical,
  Plus,
  Search,
  Shield,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  UserPlus,
  Users,
  X,
  Crop,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { User, UserStats } from '../../types';
import { uploadDataUrlToServer } from '../../lib/fileUploadService';
import { formatDateIndo, getLevelInfo } from '../../utils/gamification';
import { BadgeIcon } from '../common/BadgeIcon';
import { LevelBadge } from '../common/LevelBadge';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { PointIcon } from '../common/PointIcon';
import { EmptyState } from '../common/EmptyState';
import { TeacherPointAdjustmentModal } from './TeacherPointAdjustmentModal';
import { TeacherStudentInputModal } from './TeacherStudentInputModal';
import { TeacherStudentPhotoModal } from './TeacherStudentPhotoModal';
import { ImageCropModal } from '../common/ImageCropModal';
import { exportStudentsToExcel } from '../../utils/excelImport';

export const TeacherStudents: React.FC = () => {
  const {
    users,
    userStats,
    levels,
    badges,
    userBadges,
    pointLedger,
    classes,
    currentClassId,
    updateStudent,
    deleteStudent, deleteStudents,
    setStudentPassword,
  } = useApp();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);
  const [viewMode, setViewMode] = useState<'list' | 'cards'>('list'); // Default to list view as requested
  const [selectedStudentForPoint, setSelectedStudentForPoint] = useState<User | null>(null);
  const [pointModalMode, setPointModalMode] = useState<'add' | 'deduct'>('add');
  const [showPointModal, setShowPointModal] = useState(false);
  const [inspectStudent, setInspectStudent] = useState<User | null>(null);

  // Quick Credential Modal State
  const [credentialStudent, setCredentialStudent] = useState<User | null>(null);
  const [credNewPass, setCredNewPass] = useState('');
  const [credShowPass, setCredShowPass] = useState(false);
  const [credSuccessMsg, setCredSuccessMsg] = useState('');

  // Input & Import Modal State
  const [showInputModal, setShowInputModal] = useState(false);

  // Photo Modal State
  const [photoStudent, setPhotoStudent] = useState<User | null>(null);

  // Edit Student State
  const [editingStudent, setEditingStudent] = useState<User | null>(null);
  const [editName, setEditName] = useState('');
  const [editNis, setEditNis] = useState('');
  const [editAbsent, setEditAbsent] = useState<number | ''>('');
  const [editUsername, setEditUsername] = useState('');
  const [editPassword, setEditPassword] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');
  const [isProcessingEditPhoto, setIsProcessingEditPhoto] = useState(false);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [cropSourceImage, setCropSourceImage] = useState('');

  // Delete Confirm State
  const [studentToDelete, setStudentToDelete] = useState<User | null>(null);

  // Active Dropdown Action Menu
  const [activeMenuStudentId, setActiveMenuStudentId] = useState<string | null>(null);

  const editPhotoInputRef = useRef<HTMLInputElement>(null);

  const currentClass = classes.find((c) => c.id === currentClassId) || classes[0] || { id: 'cls_none', name: 'Belum Ada Kelas', grade: 6 };

  const classStudents = users
    .filter((u) => {
      if (u.role !== 'student') return false;
      const cIds = u.classIds || ((u as any).classId ? [(u as any).classId] : ['cls_6a']);
      return cIds.includes(currentClassId) || (currentClassId === 'cls_6a' && cIds.length === 0);
    })
    .sort((a, b) => (a.absentNumber || 99) - (b.absentNumber || 99));

  const filteredStudents = classStudents.filter((s) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.displayName.toLowerCase().includes(q) ||
      (s.username && s.username.toLowerCase().includes(q)) ||
      (s.studentNumber && s.studentNumber.includes(q)) ||
      (s.email && s.email.toLowerCase().includes(q))
    );
  });

  const handleOpenAdjustPoint = (student: User, mode: 'add' | 'deduct' = 'add') => {
    setSelectedStudentForPoint(student);
    setPointModalMode(mode);
    setShowPointModal(true);
  };

  const handleOpenCredentials = (student: User) => {
    setCredentialStudent(student);
    setCredNewPass(student.password || '123456');
    setCredSuccessMsg('');
  };

  const handleSaveCredentials = (e: React.FormEvent) => {
    e.preventDefault();
    if (!credentialStudent || !credNewPass.trim()) return;
    setStudentPassword(credentialStudent.uid, credNewPass.trim());
    setCredSuccessMsg('Kata sandi berhasil diperbarui!');
    setTimeout(() => {
      setCredentialStudent(null);
      setCredSuccessMsg('');
    }, 1200);
  };

  const handleOpenEdit = (student: User) => {
    setEditingStudent(student);
    setEditName(student.displayName);
    setEditNis(student.studentNumber || '');
    setEditAbsent(student.absentNumber || 1);
    setEditUsername(student.username || `siswa_${student.studentNumber || student.uid}`);
    setEditPassword(student.password || '123456');
    setEditEmail(student.email || '');
    setEditAvatarUrl(student.avatarUrl || '');
  };

  const handleEditPhotoSelect = async (file: File) => {
    try {
      if (!file.type.startsWith('image/')) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawDataUrl = e.target?.result as string;
        setCropSourceImage(rawDataUrl);
        setIsCropModalOpen(true);
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error('Failed to process image:', err);
    }
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent || !editName.trim()) return;

    let finalAvatar = editAvatarUrl.trim() || editingStudent.avatarUrl;
    if (finalAvatar && finalAvatar.startsWith('data:')) {
      finalAvatar = await uploadDataUrlToServer(finalAvatar, `${editingStudent.username || editingStudent.uid}_avatar.jpg`, 'avatars');
    }

    updateStudent(editingStudent.uid, {
      displayName: editName.trim(),
      studentNumber: editNis.trim(),
      absentNumber: typeof editAbsent === 'number' ? editAbsent : 1,
      username: editUsername.trim() || undefined,
      password: editPassword.trim() || '123456',
      email: editEmail.trim() || undefined,
      avatarUrl: finalAvatar,
    });

    setEditingStudent(null);
  };

  const handleExportExcel = () => {
    const exportData = filteredStudents.map((s) => {
      const stats = userStats[s.uid];
      return {
        absentNumber: s.absentNumber,
        displayName: s.displayName,
        studentNumber: s.studentNumber,
        username: s.username,
        password: s.password || '123456',
        email: s.email,
        level: stats?.level || 1,
        points: stats?.totalPoints || 0,
      };
    });
    exportStudentsToExcel(exportData, currentClass?.name || 'Kelas');
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-indigo-50 text-indigo-700 text-xs font-bold mb-2">
            <Users className="w-3.5 h-3.5" />
            <span>Direktori Siswa & Rapor Prestasi</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display">
            Data Siswa {currentClass?.name}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Kelola data murid, input manual, impor massal dari Excel, dan pantau statistik perkembangan belajar.
          </p>
        </div>

        {/* Action Controls */}
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handleExportExcel}
            className="px-3.5 py-2.5 rounded-2xl bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-2xs transition-colors flex items-center gap-2"
          >
            <Download className="w-4 h-4 text-slate-500" />
            <span>Ekspor Excel</span>
          </button>

          <button
            type="button"
            onClick={() => setShowInputModal(true)}
            className="px-4 py-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md hover:shadow-lg transition-all flex items-center gap-2"
          >
            <UserPlus className="w-4 h-4" />
            <span>+ Tambah Siswa (Manual / Excel)</span>
          </button>
        </div>
      </div>

      {/* Toolbar: Search, Stats & View Mode Toggle */}
      <div className="bg-white rounded-2xl border border-slate-200/80 p-4 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Search */}
        <div className="w-full sm:w-80 relative">
          <Search className="w-4 h-4 text-slate-400 absolute inset-y-0 left-3.5 my-auto pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Cari nama, NIS, atau email..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-200 bg-slate-50/50 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 w-full sm:w-auto">
          <span className="text-xs text-slate-500 font-medium">
            Total <strong className="text-slate-800 font-bold">{filteredStudents.length}</strong> Siswa
          </span>

          {/* View Mode Toggle: List (Ke Bawah) vs Grid (Kartu) */}
          <div className="flex items-center p-1 bg-slate-100 rounded-xl border border-slate-200/60">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'list'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Tampilan List ke Bawah (Tabel Detail)"
            >
              <LayoutList className="w-4 h-4" />
              <span>List</span>
            </button>

            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                viewMode === 'cards'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
              title="Tampilan Kartu Grid"
            >
              <LayoutGrid className="w-4 h-4" />
              <span>Kartu</span>
            </button>
          </div>
        </div>
      </div>
      {/* BULK ACTION BAR */}
      {selectedIds.length > 0 && (
        <div className="bg-indigo-600 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-lg animate-in fade-in slide-in-from-top-4">
          <div className="flex items-center gap-3">
             <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
               <Users className="w-4 h-4 text-white" />
             </div>
             <div className="text-white">
               <div className="font-bold text-sm">{selectedIds.length} Siswa Terpilih</div>
               <div className="text-xs text-indigo-200">Pilih tindakan massal yang ingin dilakukan</div>
             </div>
          </div>
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              onClick={() => setSelectedIds([])}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold text-indigo-100 hover:bg-white/10 transition-colors text-center"
            >
              Batal
            </button>
            <button
              onClick={() => setShowBulkDeleteConfirm(true)}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold shadow-md transition-all flex items-center justify-center gap-2"
            >
              <Trash2 className="w-4 h-4" />
              Hapus Terpilih
            </button>
          </div>
        </div>
      )}

      {/* SELECT ALL CONTROLS */}
      {filteredStudents.length > 0 && (
        <div className="flex items-center px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl gap-3">
          <input
            type="checkbox"
            checked={selectedIds.length === filteredStudents.length && filteredStudents.length > 0}
            onChange={(e) => {
              if (e.target.checked) setSelectedIds(filteredStudents.map(s => s.uid));
              else setSelectedIds([]);
            }}
            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
          />
          <span className="text-xs font-bold text-slate-600">Pilih Semua ({filteredStudents.length} Siswa)</span>
        </div>
      )}

      {/* EMPTY STATE */}
      {filteredStudents.length === 0 ? (
        <EmptyState
          icon={Users}
          title="Tidak ada siswa ditemukan"
          description={
            searchQuery
              ? `Tidak ada siswa yang cocok dengan pencarian "${searchQuery}".`
              : `Belum ada data siswa di ${currentClass?.name}. Silakan tambahkan siswa manual atau impor dari Excel.`
          }
          actionLabel="+ Tambah Siswa Sekarang"
          onAction={() => setShowInputModal(true)}
        />
      ) : viewMode === 'list' ? (
        /* ================== TAMPILAN LIST (SEDERHANA & BEBAS HORIZONTAL SCROLL) ================== */
        <div className="space-y-2.5 relative">
          {/* Backdrop for action menu popover */}
          {activeMenuStudentId && (
            <div
              className="fixed inset-0 z-30"
              onClick={() => setActiveMenuStudentId(null)}
            />
          )}

          {filteredStudents.map((student) => {
            const stats: UserStats = userStats[student.uid] || {
              uid: student.uid,
              schoolId: student.schoolId,
              classId: currentClassId,
              totalPoints: 0,
              academicPoints: 0,
              participationPoints: 0,
              level: 1,
              completedAssignments: 0,
              completedMissions: 0,
              badgeCount: 0,
              updatedAt: new Date().toISOString(),
            };

            const levelInfo = getLevelInfo(stats.totalXp ?? stats.totalPoints, levels);
            const isMenuOpen = activeMenuStudentId === student.uid;

            return (
              <div
                key={student.uid}
                                  className="bg-white rounded-2xl border border-slate-200/80 hover:border-indigo-300 hover:shadow-xs transition-all p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3.5 relative"
                >
                  {/* Identitas Siswa: Absen, Foto, Nama, NIS & Username */}
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(student.uid)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(prev => [...prev, student.uid]);
                        else setSelectedIds(prev => prev.filter(id => id !== student.uid));
                      }}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer shrink-0"
                    />
                  {/* Nomor Absen */}
                  <span
                    className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-slate-100 text-slate-700 font-extrabold text-xs flex items-center justify-center shrink-0"
                    title={`Nomor Absen: ${student.absentNumber || '-'}`}
                  >
                    #{student.absentNumber || '-'}
                  </span>

                  {/* Foto Profil */}
                  <div
                    onClick={() => setPhotoStudent(student)}
                    className="relative group/avatar cursor-pointer shrink-0"
                    title="Klik untuk ubah foto profil"
                  >
                    <img
                      src={student.avatarUrl}
                      alt={student.displayName}
                      className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl bg-indigo-50 border border-slate-200 object-cover group-hover/avatar:opacity-80 transition-opacity"
                    />
                    <div className="absolute inset-0 bg-indigo-900/60 rounded-xl opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center text-white transition-opacity">
                      <Camera className="w-4 h-4" />
                    </div>
                  </div>

                  {/* Nama, NIS, Username & Sandi */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-slate-900 text-sm sm:text-base leading-tight truncate">
                        {student.displayName}
                      </h3>
                      <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                        NIS: {student.studentNumber || '-'}
                      </span>
                    </div>

                    <div className="flex items-center gap-2 mt-1 text-xs text-slate-500 flex-wrap">
                      <span className="font-mono text-[11px] text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded font-semibold">
                        @{student.username || `siswa_${student.studentNumber || student.uid}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenCredentials(student)}
                        className="inline-flex items-center gap-1 text-[11px] text-slate-400 hover:text-indigo-600 font-mono transition-colors"
                        title="Klik untuk atur kata sandi"
                      >
                        <Key className="w-3 h-3" />
                        <span>{student.password || '123456'}</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Level, Poin & Aksi Guru */}
                <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-100">
                  {/* Status Level & Poin */}
                  <div className="flex items-center gap-1.5 sm:gap-2">
                    <span className="text-xs font-bold text-purple-700 bg-purple-50 px-2.5 py-1 rounded-xl border border-purple-200/70 whitespace-nowrap" title="Level Akumulasi XP">
                      Lvl {levelInfo.currentLevel.level} • {stats.totalXp ?? stats.totalPoints} XP
                    </span>
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-amber-100/80 text-amber-950 font-black text-xs whitespace-nowrap" title="Poin Leaderboard & Reward">
                      <PointIcon className="w-3.5 h-3.5" />
                      <span>{stats.totalPoints} Pts</span>
                    </span>
                  </div>

                  {/* Tombol Aksi Cepat & Menu Opsi */}
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenAdjustPoint(student)}
                      className="px-2.5 py-1.5 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 text-xs font-bold border border-purple-200 transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shadow-xs active:scale-95"
                      title="Atur Poin Siswa (Tambah / Kurangi Poin)"
                    >
                      <PointIcon className="w-3.5 h-3.5" />
                      <span>Atur Poin</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setInspectStudent(student)}
                      className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                      title="Lihat Rapor & Statistik Siswa"
                    >
                      <Eye className="w-4 h-4" />
                    </button>

                    {/* Dropdown Menu Opsi Tambahan */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setActiveMenuStudentId(isMenuOpen ? null : student.uid)}
                        className={`p-1.5 rounded-xl border transition-colors ${
                          isMenuOpen
                            ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                            : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                        }`}
                        title="Opsi Tambahan"
                      >
                        <MoreVertical className="w-4 h-4" />
                      </button>

                      {isMenuOpen && (
                        <div className="absolute right-0 top-full mt-1.5 w-48 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuStudentId(null);
                              handleOpenEdit(student);
                            }}
                            className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                            <span>Edit Data Siswa</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuStudentId(null);
                              handleOpenCredentials(student);
                            }}
                            className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                            <span>Atur Akun & Sandi</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuStudentId(null);
                              setPhotoStudent(student);
                            }}
                            className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                          >
                            <Camera className="w-3.5 h-3.5 text-slate-400" />
                            <span>Ganti Foto Profil</span>
                          </button>

                          <div className="my-1 border-t border-slate-100" />

                          <button
                            type="button"
                            onClick={() => {
                              setActiveMenuStudentId(null);
                              setStudentToDelete(student);
                            }}
                            className="w-full px-3.5 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                            <span>Hapus dari Kelas</span>
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* ================== TAMPILAN KARTU (GRID - RESPONSIF) ================== */
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 relative">
          {/* Backdrop for action menu popover */}
          {activeMenuStudentId && (
            <div
              className="fixed inset-0 z-30"
              onClick={() => setActiveMenuStudentId(null)}
            />
          )}

          {filteredStudents.map((student) => {
            const stats: UserStats = userStats[student.uid] || {
              uid: student.uid,
              schoolId: student.schoolId,
              classId: currentClassId,
              totalPoints: 0,
              academicPoints: 0,
              participationPoints: 0,
              level: 1,
              completedAssignments: 0,
              completedMissions: 0,
              badgeCount: 0,
              updatedAt: new Date().toISOString(),
            };

            const levelInfo = getLevelInfo(stats.totalXp ?? stats.totalPoints, levels);
            const isMenuOpen = activeMenuStudentId === student.uid;

            return (
              <div
                key={student.uid}
                                  className="bg-white rounded-2xl border border-slate-200/80 hover:border-indigo-300 hover:shadow-sm transition-all p-4 flex flex-col justify-between relative"
                >
                  <div className="absolute top-4 right-4 z-10">
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(student.uid)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedIds(prev => [...prev, student.uid]);
                        else setSelectedIds(prev => prev.filter(id => id !== student.uid));
                      }}
                      className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex items-start justify-between gap-2.5 mb-3">
                      <div className="flex items-center gap-3 min-w-0">
                      <div
                        onClick={() => setPhotoStudent(student)}
                        className="relative group/avatar cursor-pointer shrink-0"
                        title="Klik untuk ubah foto profil siswa"
                      >
                        <img
                          src={student.avatarUrl}
                          alt={student.displayName}
                          className="w-11 h-11 rounded-xl bg-indigo-50 border border-slate-200 object-cover shadow-2xs group-hover/avatar:opacity-80 transition-opacity"
                        />
                        <div className="absolute inset-0 bg-indigo-900/60 rounded-xl opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center text-white transition-opacity">
                          <Camera className="w-3.5 h-3.5" />
                        </div>
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-slate-100 text-slate-700">
                            #{student.absentNumber || '-'}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            NIS: {student.studentNumber || '-'}
                          </span>
                        </div>
                        <h3 className="text-sm font-bold text-slate-900 font-display mt-0.5 truncate">
                          {student.displayName}
                        </h3>
                      </div>
                    </div>

                    <span className="text-xs font-black text-purple-700 bg-purple-50 px-2.5 py-1 rounded-xl border border-purple-200 shrink-0" title="Level Siswa">
                      Lvl {levelInfo.currentLevel.level}
                    </span>
                  </div>

                  {/* Level & Poin */}
                  <div className="mt-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="font-bold text-slate-700 truncate">{levelInfo.currentLevel.name} ({stats.totalXp ?? stats.totalPoints} XP)</span>
                      <span className="font-black text-amber-700 flex items-center gap-1 shrink-0" title="Poin Leaderboard & Reward">
                        <PointIcon className="w-3 h-3" />
                        <span>{stats.totalPoints} Pts</span>
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
                      <div
                        className="h-full rounded-full bg-amber-500 transition-all duration-500"
                        style={{ width: `${levelInfo.progressPercent}%` }}
                      />
                    </div>
                  </div>

                  {/* Akun & Sandi Card */}
                  <div className="mt-2.5 p-2 rounded-xl bg-indigo-50/50 border border-indigo-100/80 flex items-center justify-between text-xs">
                    <span className="font-mono text-[11px] text-indigo-700 truncate font-semibold">
                      @{student.username || `siswa_${student.studentNumber || student.uid}`}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenCredentials(student)}
                      className="font-mono text-[11px] text-slate-500 hover:text-indigo-600 flex items-center gap-1"
                      title="Ubah Sandi"
                    >
                      <Key className="w-3 h-3 text-slate-400" />
                      <span>{student.password || '123456'}</span>
                    </button>
                  </div>
                </div>

                {/* Bottom Action Bar */}
                <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 flex-1">
                    <button
                      type="button"
                      onClick={() => handleOpenAdjustPoint(student)}
                      className="flex-1 py-1.5 px-2 rounded-xl bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-xs active:scale-95"
                      title="Atur Poin Siswa (Tambah / Kurangi Poin)"
                    >
                      <PointIcon className="w-3.5 h-3.5" />
                      <span>Atur Poin</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setInspectStudent(student)}
                    className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 transition-colors"
                    title="Rincian"
                  >
                    <Eye className="w-4 h-4" />
                  </button>

                  {/* Dropdown Menu Opsi Tambahan */}
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setActiveMenuStudentId(isMenuOpen ? null : student.uid)}
                      className={`p-1.5 rounded-xl border transition-colors ${
                        isMenuOpen
                          ? 'border-indigo-400 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-500 hover:bg-slate-100'
                      }`}
                      title="Opsi Tambahan"
                    >
                      <MoreVertical className="w-4 h-4" />
                    </button>

                    {isMenuOpen && (
                      <div className="absolute right-0 bottom-full mb-1.5 w-48 bg-white rounded-2xl shadow-xl border border-slate-200/90 py-1.5 z-40 animate-in fade-in zoom-in-95 duration-100">
                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuStudentId(null);
                            handleOpenEdit(student);
                          }}
                          className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>Edit Data Siswa</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuStudentId(null);
                            handleOpenCredentials(student);
                          }}
                          className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-slate-400" />
                          <span>Atur Akun & Sandi</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuStudentId(null);
                            setPhotoStudent(student);
                          }}
                          className="w-full px-3.5 py-2 text-left text-xs font-semibold text-slate-700 hover:bg-slate-50 flex items-center gap-2.5 transition-colors"
                        >
                          <Camera className="w-3.5 h-3.5 text-slate-400" />
                          <span>Ganti Foto Profil</span>
                        </button>

                        <div className="my-1 border-t border-slate-100" />

                        <button
                          type="button"
                          onClick={() => {
                            setActiveMenuStudentId(null);
                            setStudentToDelete(student);
                          }}
                          className="w-full px-3.5 py-2 text-left text-xs font-semibold text-rose-600 hover:bg-rose-50 flex items-center gap-2.5 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                          <span>Hapus dari Kelas</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Input / Import Modal */}
      <TeacherStudentInputModal
        isOpen={showInputModal}
        onClose={() => setShowInputModal(false)}
      />

      {/* Quick Credential Manager Modal */}
      {credentialStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 border-b border-slate-100 bg-gradient-to-r from-indigo-50 to-purple-50 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 font-display">
                    Kelola Sandi Akun Siswa
                  </h3>
                  <p className="text-xs text-slate-500">{credentialStudent.displayName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCredentialStudent(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCredentials} className="p-6 space-y-4">
              <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Nama Siswa:</span>
                  <span className="font-bold text-slate-900">{credentialStudent.displayName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Username Login:</span>
                  <span className="font-mono font-bold text-indigo-700">
                    @{credentialStudent.username || `siswa_${credentialStudent.studentNumber}`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">NIS Siswa:</span>
                  <span className="font-mono font-semibold text-slate-700">
                    {credentialStudent.studentNumber || '-'}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 uppercase tracking-wider">
                  Kata Sandi Baru Siswa *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={credShowPass ? 'text' : 'password'}
                    required
                    value={credNewPass}
                    onChange={(e) => setCredNewPass(e.target.value)}
                    placeholder="Masukkan sandi baru siswa"
                    className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50 font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setCredShowPass(!credShowPass)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-600"
                  >
                    {credShowPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">
                  Guru bebas mengatur kata sandi murid agar mudah diingat (misal: <code>123456</code>).
                </p>
              </div>

              {credSuccessMsg && (
                <div className="p-3 rounded-2xl bg-emerald-50 text-emerald-800 text-xs font-bold border border-emerald-200 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>{credSuccessMsg}</span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCredentialStudent(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <KeyRound className="w-4 h-4" />
                  <span>Simpan Sandi Siswa</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900 font-display">
                Edit Data & Akun Siswa
              </h3>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-6 space-y-4">
              {/* Foto Profil Siswa */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center gap-4">
                <input
                  ref={editPhotoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleEditPhotoSelect(e.target.files[0]);
                    }
                  }}
                />

                <div className="relative shrink-0">
                  <div className="w-18 h-18 rounded-2xl bg-white border-2 border-indigo-200 shadow-sm overflow-hidden flex items-center justify-center">
                    {editAvatarUrl ? (
                      <img src={editAvatarUrl} alt="Pratinjau Foto" className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-8 h-8 text-slate-300" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => editPhotoInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-xs cursor-pointer"
                    title="Pilih foto baru"
                  >
                    <Camera className="w-3 h-3" />
                  </button>
                </div>

                <div className="space-y-1 text-center sm:text-left flex-1">
                  <span className="text-[11px] font-bold text-slate-700 block">
                    Foto Profil Siswa
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Foto yang diupload guru akan langsung tampil di dashboard & profil murid.
                  </p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-0.5">
                    <button
                      type="button"
                      onClick={() => editPhotoInputRef.current?.click()}
                      className="px-3 py-1 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 font-bold text-xs shadow-2xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isProcessingEditPhoto ? 'Memproses...' : 'Unggah Foto Baru'}</span>
                    </button>
                    {editAvatarUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setCropSourceImage(editAvatarUrl);
                          setIsCropModalOpen(true);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                        title="Sesuaikan perbesaran, geser posisi, atau putar foto"
                      >
                        <Crop className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Sesuaikan & Crop</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        const s = editingStudent;
                        setEditingStudent(null);
                        setPhotoStudent(s);
                      }}
                      className="px-3 py-1 rounded-xl bg-slate-100 border border-slate-200 hover:bg-slate-200 text-slate-700 font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Camera className="w-3.5 h-3.5" />
                      <span>Kelola Foto Lengkap</span>
                    </button>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Lengkap Siswa *
                </label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  required
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    No. Absen
                  </label>
                  <input
                    type="number"
                    value={editAbsent}
                    onChange={(e) => setEditAbsent(e.target.value ? parseInt(e.target.value, 10) : '')}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    NIS
                  </label>
                  <input
                    type="text"
                    value={editNis}
                    onChange={(e) => setEditNis(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-3">
                <p className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                  <KeyRound className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Kredensial Login Siswa (Diatur Guru)</span>
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Username Siswa
                    </label>
                    <input
                      type="text"
                      value={editUsername}
                      onChange={(e) => setEditUsername(e.target.value)}
                      placeholder="budi2024"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Kata Sandi Siswa
                    </label>
                    <input
                      type="text"
                      value={editPassword}
                      onChange={(e) => setEditPassword(e.target.value)}
                      placeholder="123456"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Email Siswa (Opsional)
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-xs cursor-pointer"
                >
                  Simpan Perubahan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

            {/* Bulk Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showBulkDeleteConfirm}
        title="Hapus Siswa Sekaligus?"
        message={`Apakah Anda yakin ingin menghapus ${selectedIds.length} siswa yang terpilih? Data progres tugas, misi, poin, dan riwayat mereka akan ikut terhapus. Tindakan ini tidak dapat dibatalkan.`}
        confirmLabel={`Ya, Hapus ${selectedIds.length} Siswa`}
        cancelLabel="Batal"
        isDestructive={true}
        onConfirm={() => {
          deleteStudents(selectedIds);
          setSelectedIds([]);
          setShowBulkDeleteConfirm(false);
        }}
        onCancel={() => setShowBulkDeleteConfirm(false)}
      />

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={Boolean(studentToDelete)}
        title="Hapus Siswa dari Kelas?"
        message={`Apakah Anda yakin ingin menghapus "${studentToDelete?.displayName}"? Data progres tugas dan riwayat siswa akan disesuaikan.`}
        confirmLabel="Ya, Hapus Siswa"
        cancelLabel="Batal"
        isDestructive={true}
        onConfirm={() => {
          if (studentToDelete) {
            deleteStudent(studentToDelete.uid);
            setStudentToDelete(null);
          }
        }}
        onCancel={() => setStudentToDelete(null)}
      />

      {/* Student Inspector Modal */}
      {inspectStudent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
            <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/60 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="relative group/avatar cursor-pointer" onClick={() => setPhotoStudent(inspectStudent)}>
                  <img
                    src={inspectStudent.avatarUrl}
                    alt={inspectStudent.displayName}
                    className="w-12 h-12 rounded-2xl bg-white border border-slate-200 object-cover group-hover/avatar:opacity-80"
                  />
                  <div className="absolute inset-0 bg-indigo-900/60 rounded-2xl opacity-0 group-hover/avatar:opacity-100 flex items-center justify-center text-white transition-opacity">
                    <Camera className="w-4 h-4" />
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900 font-display">
                      {inspectStudent.displayName}
                    </h3>
                    <button
                      type="button"
                      onClick={() => setPhotoStudent(inspectStudent)}
                      className="px-2 py-0.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 text-[10px] font-bold hover:bg-indigo-100 flex items-center gap-1"
                    >
                      <Camera className="w-3 h-3" />
                      <span>Ubah Foto</span>
                    </button>
                  </div>
                  <p className="text-xs text-slate-500">
                    Absen #{inspectStudent.absentNumber || 1} • NIS: {inspectStudent.studentNumber}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInspectStudent(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 sm:p-6 overflow-y-auto flex-1 space-y-6">
              {/* Badges collected by this student */}
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  <Medal className="w-4 h-4 text-amber-500" />
                  <span>Koleksi Lencana Siswa</span>
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {badges.map((b) => {
                    const has = userBadges.some(
                      (ub) => ub.userId === inspectStudent.uid && ub.badgeId === b.id
                    );
                    return (
                      <div
                        key={b.id}
                        className={`p-3 rounded-2xl border flex items-center gap-3 ${
                          has ? 'bg-amber-50/60 border-amber-200' : 'bg-slate-50 border-slate-200/60 opacity-40'
                        }`}
                      >
                        <BadgeIcon iconName={b.iconName} rarity={b.rarity} size="sm" isUnlocked={has} />
                        <div>
                          <p className="text-xs font-bold text-slate-800">{b.name}</p>
                          <p className="text-[10px] text-slate-500">{b.description}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Point Ledger */}
              <div>
                <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-1.5">
                  <History className="w-4 h-4 text-purple-500" />
                  <span>Riwayat Perolehan Poin Siswa</span>
                </h4>
                <div className="space-y-2">
                  {pointLedger
                    .filter((l) => l.userId === inspectStudent.uid)
                    .map((item) => (
                      <div
                        key={item.id}
                        className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex items-center justify-between text-xs"
                      >
                        <div>
                          <p className="font-bold text-slate-800">{item.reason}</p>
                          <p className="text-[10px] text-slate-400">{formatDateIndo(item.createdAt)}</p>
                        </div>
                        <span
                          className={`font-black px-2 py-0.5 rounded-md text-xs flex items-center gap-1 ${
                            item.amount > 0
                              ? 'text-amber-800 bg-amber-100'
                              : 'text-rose-700 bg-rose-100'
                          }`}
                        >
                          <PointIcon className="w-3 h-3" />
                          <span>{item.amount > 0 ? `+${item.amount}` : item.amount} Poin</span>
                        </span>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Point Adjustment Modal */}
      <TeacherPointAdjustmentModal
        isOpen={showPointModal}
        onClose={() => {
          setShowPointModal(false);
          setSelectedStudentForPoint(null);
        }}
        targetStudent={selectedStudentForPoint}
        initialMode={pointModalMode}
      />

      {/* Teacher Student Photo Upload Modal */}
      <TeacherStudentPhotoModal
        isOpen={Boolean(photoStudent)}
        onClose={() => setPhotoStudent(null)}
        student={photoStudent}
      />

      {/* Image Crop & Resize Modal */}
      <ImageCropModal
        isOpen={isCropModalOpen}
        imageSrc={cropSourceImage}
        title={editingStudent ? `Sesuaikan Foto Siswa: ${editingStudent.displayName}` : 'Sesuaikan Ukuran Foto'}
        initialShape="circle"
        onClose={() => setIsCropModalOpen(false)}
        onCropComplete={(croppedDataUrl) => {
          setEditAvatarUrl(croppedDataUrl);
        }}
      />
    </div>
  );
};





