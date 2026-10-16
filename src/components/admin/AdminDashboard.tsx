import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { User, ClassRoom } from '../../types';
import {
  ShieldCheck,
  Plus,
  UserCheck,
  KeyRound,
  Pencil,
  Trash2,
  X,
  Check,
  Search,
  School,
  GraduationCap,
  Users,
  Eye,
  EyeOff,
  BookOpen,
  Calendar,
  Layers,
  RefreshCw,
  AlertTriangle,
  Copy,
  ExternalLink,
} from 'lucide-react';
import { syncDocToFirestore, COLLECTIONS } from '../../lib/firestoreSync';

export const AdminDashboard: React.FC = () => {
  const {
    users,
    classes,
    school,
    addClass,
    updateClass,
    deleteClass,
    saveTeacher,
    deleteTeacher,
    deleteStudent,
    syncAllToCloud,
    isFirebaseSynced,
  } = useApp();

  // Active navigation tab inside Admin Dashboard
  const [activeTab, setActiveTab] = useState<'teachers' | 'classes' | 'students'>('teachers');
  const [hasPermissionDenied, setHasPermissionDenied] = useState(false);
  const [showRulesModal, setShowRulesModal] = useState(false);
  const [copiedRules, setCopiedRules] = useState(false);
  const [customLoginOpen, setCustomLoginOpen] = useState(false);
  const [classAdvancedOpen, setClassAdvancedOpen] = useState(false);

  useEffect(() => {
    const handlePerm = () => setHasPermissionDenied(true);
    window.addEventListener('firestore-permission-denied', handlePerm);
    return () => window.removeEventListener('firestore-permission-denied', handlePerm);
  }, []);

  // Search states
  const [teacherSearch, setTeacherSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('all');

  // Teacher Modal states
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [isSavingTeacher, setIsSavingTeacher] = useState(false);
  const [editingTeacher, setEditingTeacher] = useState<User | null>(null);
  const [showTeacherPassword, setShowTeacherPassword] = useState(false);
  const [teacherForm, setTeacherForm] = useState({
    displayName: '',
    username: '',
    password: '',
    classIds: [] as string[],
    status: 'active' as 'active' | 'inactive',
  });

  // Class Modal states
  const [isClassModalOpen, setIsClassModalOpen] = useState(false);
  const [editingClass, setEditingClass] = useState<ClassRoom | null>(null);
  const [classForm, setClassForm] = useState({
    name: '',
    grade: 6,
    academicYear: '2026/2027',
    teacherIds: [] as string[],
    status: 'active' as 'active' | 'archived',
  });

  // Filtered lists
  const teachers = users.filter((u) => u.role === 'teacher');
  const students = users.filter((u) => u.role === 'student');

  const filteredTeachers = teachers.filter((t) => {
    const matchSearch =
      t.displayName.toLowerCase().includes(teacherSearch.toLowerCase()) ||
      (t.username || '').toLowerCase().includes(teacherSearch.toLowerCase());
    const matchClass =
      classFilter === 'all' || (t.classIds || []).includes(classFilter);
    return matchSearch && matchClass;
  });

  const filteredClasses = classes.filter((c) =>
    c.name.toLowerCase().includes(classSearch.toLowerCase()) ||
    c.academicYear.toLowerCase().includes(classSearch.toLowerCase())
  );

  const filteredStudents = students.filter((s) => {
    const matchSearch =
      s.displayName.toLowerCase().includes(studentSearch.toLowerCase()) ||
      (s.username || '').toLowerCase().includes(studentSearch.toLowerCase()) ||
      (s.studentNumber || '').includes(studentSearch);
    const matchClass =
      studentClassFilter === 'all' || (s.classIds || []).includes(studentClassFilter);
    return matchSearch && matchClass;
  });

  const handleDeleteStudent = async (uid: string) => {
    const target = students.find((s) => s.uid === uid);
    if (!target) return;
    if (window.confirm(`Yakin ingin menghapus siswa "${target.displayName}" secara permanen? Data nilai, tugas, dan poin siswa akan ikut terhapus.`)) {
      deleteStudent(uid);
    }
  };

  // --- TEACHER ACTIONS ---
  const handleOpenAddTeacher = () => {
    setEditingTeacher(null);
    setShowTeacherPassword(false);
    setCustomLoginOpen(false);
    setTeacherForm({
      displayName: '',
      username: '',
      password: 'guru123',
      classIds: classes.length > 0 ? [classes[0].id] : [],
      status: 'active',
    });
    setIsTeacherModalOpen(true);
  };

  const handleOpenEditTeacher = (teacher: User) => {
    setEditingTeacher(teacher);
    setShowTeacherPassword(false);
    setCustomLoginOpen(false);
    setTeacherForm({
      displayName: teacher.displayName,
      username: teacher.username || '',
      password: teacher.password || '',
      classIds: teacher.classIds || [],
      status: teacher.status || 'active',
    });
    setIsTeacherModalOpen(true);
  };

  const handleToggleTeacherClass = (classId: string) => {
    setTeacherForm((prev) => ({
      ...prev,
      classIds: prev.classIds.includes(classId)
        ? prev.classIds.filter((id) => id !== classId)
        : [...prev.classIds, classId],
    }));
  };

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = teacherForm.displayName.trim();
    if (!name) return;

    setIsSavingTeacher(true);
    try {
      // Auto-generate username from name if empty
      const firstWord = name.split(/[\s,.]+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '');
      const username = (teacherForm.username.trim() || `guru.${firstWord || 'baru'}`).toLowerCase().replace(/\s+/g, '');
      const password = teacherForm.password.trim() || 'guru123';

      let userToSave: User;
      if (editingTeacher) {
        userToSave = {
          ...editingTeacher,
          id: editingTeacher.uid || editingTeacher.id,
          displayName: name,
          searchName: name.toLowerCase(),
          username,
          password: teacherForm.password.trim() || editingTeacher.password || 'guru123',
          classIds: teacherForm.classIds,
          status: teacherForm.status || 'active',
          updatedAt: new Date().toISOString(),
        };
      } else {
        const uid = `usr_guru_${Date.now()}`;
        userToSave = {
          id: uid,
          uid,
          role: 'teacher',
          status: 'active',
          displayName: name,
          searchName: name.toLowerCase(),
          username,
          password,
          avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${username}&backgroundColor=b6e3f4`,
          schoolId: school?.id || 'sch_merdeka_01',
          classIds: teacherForm.classIds,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
      }

      await saveTeacher(userToSave);
      if (userToSave.classIds && userToSave.classIds.length > 0) {
        userToSave.classIds.forEach((cId) => {
          const cls = classes.find((c) => c.id === cId);
          if (cls && !cls.teacherIds?.includes(userToSave.uid)) {
            updateClass(cId, { teacherIds: [...(cls.teacherIds || []), userToSave.uid] });
          }
        });
      }
      setIsTeacherModalOpen(false);
    } catch (err: any) {
      alert('Gagal menyimpan guru: ' + (err?.message || err));
    } finally {
      setIsSavingTeacher(false);
    }
  };

  const handleDeleteTeacher = async (uid: string) => {
    const target = users.find((u) => u.uid === uid);
    if (!target) return;
    if (window.confirm(`Yakin ingin menghapus guru "${target.displayName}" secara permanen? Data akun guru dan kelas yang diampu akan disesuaikan.`)) {
      await deleteTeacher(uid);
    }
  };

  // --- CLASS ACTIONS ---
  const handleOpenAddClass = () => {
    setEditingClass(null);
    setClassAdvancedOpen(false);
    setClassForm({
      name: '',
      grade: 6,
      academicYear: '2026/2027',
      teacherIds: teachers.length > 0 ? [teachers[0].uid] : [],
      status: 'active',
    });
    setIsClassModalOpen(true);
  };

  const handleOpenEditClass = (cls: ClassRoom) => {
    setEditingClass(cls);
    setClassAdvancedOpen(false);
    setClassForm({
      name: cls.name,
      grade: cls.grade || 6,
      academicYear: cls.academicYear || '2026/2027',
      teacherIds: cls.teacherIds || [],
      status: cls.status || 'active',
    });
    setIsClassModalOpen(true);
  };

  const handleToggleClassTeacher = (teacherId: string) => {
    setClassForm((prev) => ({
      ...prev,
      teacherIds: prev.teacherIds.includes(teacherId)
        ? prev.teacherIds.filter((id) => id !== teacherId)
        : [...prev.teacherIds, teacherId],
    }));
  };

  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = classForm.name.trim();
    if (!name) return;

    // Smart detect grade from name (e.g. "6A" -> 6, "Kelas 5B" -> 5)
    let grade = classForm.grade;
    const match = name.match(/\b([1-6])\b/) || name.match(/([1-6])/);
    if (match) {
      grade = Number(match[1]);
    }

    const academicYear = classForm.academicYear.trim() || '2026/2027';

    if (editingClass) {
      updateClass(editingClass.id, {
        name,
        grade,
        academicYear,
        teacherIds: classForm.teacherIds,
        status: classForm.status,
      });

      // Synchronize teacher assignments
      for (const t of teachers) {
        const isAssigned = classForm.teacherIds.includes(t.uid);
        const currentClasses = t.classIds || [];
        if (isAssigned && !currentClasses.includes(editingClass.id)) {
          const updated = [...currentClasses, editingClass.id];
          await saveTeacher({ ...t, classIds: updated });
        } else if (!isAssigned && currentClasses.includes(editingClass.id)) {
          const updated = currentClasses.filter((id) => id !== editingClass.id);
          await saveTeacher({ ...t, classIds: updated });
        }
      }
    } else {
      const created = addClass({
        name,
        grade,
        academicYear,
        teacherIds: classForm.teacherIds,
        status: 'active',
        schoolId: school?.id || 'sch_merdeka_01',
      });

      // Synchronize assigned teachers
      for (const teacherId of classForm.teacherIds) {
        const t = teachers.find((u) => u.uid === teacherId);
        if (t) {
          const updated = Array.from(new Set([...(t.classIds || []), created.id]));
          await saveTeacher({ ...t, classIds: updated });
        }
      }
    }

    setIsClassModalOpen(false);
  };

  const handleDeleteClass = async (classId: string) => {
    const cls = classes.find((c) => c.id === classId);
    const studentCount = students.filter((s) => (s.classIds || []).includes(classId)).length;
    if (
      window.confirm(
        `Yakin ingin menghapus ${cls?.name || 'kelas ini'}? Terdapat ${studentCount} siswa terdaftar di kelas ini.`
      )
    ) {
      await deleteClass(classId);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Welcome & Overview Header */}
      <div className="bg-gradient-to-r from-emerald-950 via-teal-900 to-indigo-950 rounded-3xl p-6 sm:p-8 text-white shadow-2xl relative overflow-hidden border border-emerald-500/20">
        <div className="absolute -right-12 -top-12 w-64 h-64 rounded-full bg-emerald-500/15 blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 -bottom-16 w-80 h-80 rounded-full bg-teal-500/15 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-400/30 mb-3">
              <ShieldCheck className="w-4 h-4" />
              <span>Panel Administrator Sekolah</span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black font-display tracking-tight">
              Manajemen Guru & Kelas
            </h2>
            <p className="text-emerald-200/90 mt-1 text-sm max-w-xl">
              Tambah dan atur akun pengajar, pantau pemetaan rombel kelas, serta kelola kredensial login dengan cepat dan aman.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleOpenAddTeacher}
              className="px-4 py-2.5 rounded-2xl bg-white text-emerald-950 font-bold text-xs sm:text-sm hover:bg-emerald-50 transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-emerald-600" />
              <span>Tambah Guru</span>
            </button>
            <button
              onClick={handleOpenAddClass}
              className="px-4 py-2.5 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-xs sm:text-sm transition-all shadow-md flex items-center gap-2 cursor-pointer"
            >
              <School className="w-4 h-4" />
              <span>Tambah Kelas</span>
            </button>
          </div>
        </div>

        {/* Quick Stats Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mt-6 pt-6 border-t border-white/10">
          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
            <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider block">
              Guru Terdaftar
            </span>
            <span className="text-2xl sm:text-3xl font-black text-white font-display">
              {teachers.length}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10">
            <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider block">
              Kelas Aktif
            </span>
            <span className="text-2xl sm:text-3xl font-black text-white font-display">
              {classes.length}
            </span>
          </div>

          <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10 col-span-2 sm:col-span-1">
            <span className="text-[11px] font-bold text-emerald-200 uppercase tracking-wider block">
              Total Siswa Terdaftar
            </span>
            <span className="text-2xl sm:text-3xl font-black text-white font-display">
              {students.length}
            </span>
          </div>
        </div>
      </div>

      {/* Permission Denied Banner */}
      {hasPermissionDenied && (
        <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-amber-900">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-sm text-amber-900">Pemberitahuan Izin Firebase (permission-denied)</p>
              <p className="text-xs text-amber-800 mt-0.5">
                Cloud Firestore memerlukan aturan akses (Rules) agar Web App diizinkan menyimpan & menghapus data langsung.
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowRulesModal(true)}
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer shrink-0"
          >
            Lihat Aturan Firebase
          </button>
        </div>
      )}

      {/* Firebase Rules Modal */}
      {showRulesModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-indigo-900 font-bold">
                <ShieldCheck className="w-5 h-5 text-indigo-600" />
                <span>Aturan (Rules) Firebase Cloud Firestore</span>
              </div>
              <button
                onClick={() => setShowRulesModal(false)}
                className="p-1 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-all cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Secara default, Firebase mengunci database agar tidak dapat ditulis. Salin aturan berikut lalu terapkan di Firebase Console:
            </p>

            <div className="bg-slate-900 text-emerald-400 rounded-2xl p-4 font-mono text-xs overflow-x-auto relative">
              <pre>{`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`}</pre>
              <button
                onClick={() => {
                  navigator.clipboard.writeText(`rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}`);
                  setCopiedRules(true);
                  setTimeout(() => setCopiedRules(false), 2000);
                }}
                className="absolute top-2.5 right-2.5 px-2.5 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold flex items-center gap-1 cursor-pointer transition-all"
              >
                {copiedRules ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedRules ? 'Tersalin' : 'Salin'}</span>
              </button>
            </div>

            <div className="space-y-1 text-xs text-slate-600">
              <p className="font-bold text-slate-800">Langkah Penerapan:</p>
              <ol className="list-decimal list-inside space-y-1 text-[11px]">
                <li>Buka Firebase Console project <strong>gamificlasscibubur05</strong>.</li>
                <li>Pilih <strong>Firestore Database</strong> lalu klik tab <strong>Rules (Aturan)</strong>.</li>
                <li>Tempel aturan di atas, lalu klik tombol <strong>Publish (Publikasikan)</strong>.</li>
              </ol>
            </div>

            <div className="pt-2 flex justify-end gap-2">
              <a
                href="https://console.firebase.google.com/project/gamificlasscibubur05/firestore/rules"
                target="_blank"
                rel="noreferrer"
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <span>Buka Firebase Console</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
              <button
                onClick={() => setShowRulesModal(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Tab Controls: [Kelola Guru] | [Kelola Kelas] */}
      <div className="flex border-b border-slate-200 bg-white rounded-2xl p-1.5 shadow-xs">
        <button
          onClick={() => setActiveTab('teachers')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'teachers'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-emerald-700 hover:bg-slate-50'
          }`}
        >
          <UserCheck className="w-4 h-4" />
          <span>Kelola Akun Guru ({teachers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('classes')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'classes'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-emerald-700 hover:bg-slate-50'
          }`}
        >
          <School className="w-4 h-4" />
          <span>Kelola Rombel & Kelas ({classes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('students')}
          className={`flex-1 py-3 px-4 rounded-xl text-xs sm:text-sm font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
            activeTab === 'students'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-emerald-700 hover:bg-slate-50'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Kelola Data Siswa ({students.length})</span>
        </button>
      </div>

      {/* ================= TAB 1: KELOLA GURU ================= */}
      {activeTab === 'teachers' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          {/* Filter & Search Bar */}
          <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row gap-3 justify-between items-center">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama atau username guru..."
                value={teacherSearch}
                onChange={(e) => setTeacherSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto">
              <span className="text-xs font-bold text-slate-500 shrink-0">Filter Kelas:</span>
              <select
                value={classFilter}
                onChange={(e) => setClassFilter(e.target.value)}
                className="px-3 py-2 text-xs font-bold rounded-xl border border-slate-200 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              >
                <option value="all">Semua Kelas</option>
                {classes.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Teacher Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase font-extrabold text-slate-400">
                <tr>
                  <th className="px-5 py-3.5">Nama Guru</th>
                  <th className="px-5 py-3.5">Username Login</th>
                  <th className="px-5 py-3.5">Kata Sandi</th>
                  <th className="px-5 py-3.5">Kelas Diampu</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredTeachers.map((teacher) => (
                  <tr key={teacher.uid} className="hover:bg-slate-50/70 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <img
                          src={teacher.avatarUrl}
                          alt=""
                          className="w-10 h-10 rounded-2xl bg-indigo-50 border border-slate-200 object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-bold text-slate-900 truncate">
                            {teacher.displayName}
                          </div>
                          <div className="text-[11px] text-slate-400 font-medium">
                            {teacher.email || 'Email belum diisi'}
                          </div>
                        </div>
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <span className="font-mono text-xs text-indigo-700 font-bold px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100">
                        @{teacher.username || 'belum_ada'}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 font-mono text-xs text-slate-500">
                      {teacher.password ? (
                        <span className="px-2 py-0.5 rounded bg-slate-100 font-mono text-slate-700">
                          {teacher.password}
                        </span>
                      ) : (
                        <span className="italic text-slate-400">bawaan: guru123</span>
                      )}
                    </td>

                    <td className="px-5 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {(teacher.classIds || []).map((cId) => {
                          const cls = classes.find((c) => c.id === cId);
                          return cls ? (
                            <span
                              key={cId}
                              className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 text-[11px] font-bold border border-emerald-200"
                            >
                              {cls.name}
                            </span>
                          ) : null;
                        })}
                        {(!teacher.classIds || teacher.classIds.length === 0) && (
                          <span className="text-slate-400 italic text-xs">Belum dipetakan</span>
                        )}
                      </div>
                    </td>

                    <td className="px-5 py-3.5">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                          teacher.status === 'active'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {teacher.status === 'active' ? 'Aktif' : 'Nonaktif'}
                      </span>
                    </td>

                    <td className="px-5 py-3.5 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => handleOpenEditTeacher(teacher)}
                          className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-all cursor-pointer"
                          title="Edit Guru & Pemetaan Kelas"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteTeacher(teacher.uid)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                          title="Hapus Guru Secara Permanen"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

                {filteredTeachers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-slate-400 text-sm">
                      Tidak ada data guru yang cocok dengan pencarian.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= TAB 2: KELOLA KELAS ================= */}
      {activeTab === 'classes' && (
        <div className="space-y-4">
          {/* Class Search & Quick Actions */}
          <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-xs flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama kelas atau tahun ajaran..."
                value={classSearch}
                onChange={(e) => setClassSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-2xs"
              />
            </div>

            <button
              onClick={handleOpenAddClass}
              className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs sm:text-sm transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Tambah Kelas Baru</span>
            </button>
          </div>

          {/* Classes Grid Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {filteredClasses.map((cls) => {
              const assignedTeachers = teachers.filter((t) =>
                (t.classIds || []).includes(cls.id) || (cls.teacherIds || []).includes(t.uid)
              );
              const classStudentCount = students.filter((s) =>
                (s.classIds || []).includes(cls.id)
              ).length;

              return (
                <div
                  key={cls.id}
                  className="bg-white rounded-3xl border border-slate-200/80 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
                >
                  <div className="space-y-3">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700 font-black text-lg font-display">
                          {cls.grade}
                        </div>
                        <div>
                          <h4 className="text-base font-extrabold text-slate-900 font-display">
                            {cls.name}
                          </h4>
                          <span className="text-[11px] font-bold text-slate-400">
                            Tahun Ajaran {cls.academicYear}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditClass(cls)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                          title="Edit Kelas"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDeleteClass(cls.id)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Hapus Kelas"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* Stats pills */}
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2">
                        <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block uppercase">
                            Siswa
                          </span>
                          <span className="text-xs font-black text-slate-800">
                            {classStudentCount} Siswa
                          </span>
                        </div>
                      </div>

                      <div className="p-2 rounded-xl bg-slate-50 border border-slate-100 flex items-center gap-2">
                        <UserCheck className="w-4 h-4 text-emerald-600 shrink-0" />
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 block uppercase">
                            Pengampu
                          </span>
                          <span className="text-xs font-black text-slate-800">
                            {assignedTeachers.length} Guru
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Teacher Avatars */}
                    <div className="pt-2">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block mb-1.5">
                        Guru Pengampu:
                      </span>
                      {assignedTeachers.length > 0 ? (
                        <div className="space-y-1.5">
                          {assignedTeachers.map((t) => (
                            <div
                              key={t.uid}
                              className="flex items-center gap-2 text-xs font-bold text-slate-700 bg-slate-50 p-1.5 rounded-xl border border-slate-100"
                            >
                              <img
                                src={t.avatarUrl}
                                alt=""
                                className="w-6 h-6 rounded-lg bg-white object-cover"
                              />
                              <span className="truncate">{t.displayName}</span>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400 italic">
                          Belum ada guru pengampu yang dihubungkan
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}

            {filteredClasses.length === 0 && (
              <div className="col-span-full bg-white rounded-3xl p-10 text-center border border-slate-200 text-slate-400">
                Tidak ada kelas yang ditemukan. Klik tombol Tambah Kelas Baru untuk menambahkan.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= TAB 3: KELOLA SISWA ================= */}
      {activeTab === 'students' && (
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden space-y-4">
          {/* Filter & Search Bar */}
          <div className="p-4 sm:p-5 border-b border-slate-100 bg-slate-50/70 flex flex-col sm:flex-row gap-3 justify-between items-center">
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari nama, NIS, atau username..."
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white rounded-xl border border-slate-200 text-xs sm:text-sm focus:outline-emerald-500"
              />
            </div>

            <div className="flex items-center gap-3 w-full sm:w-auto">
              <select
                value={studentClassFilter}
                onChange={(e) => setStudentClassFilter(e.target.value)}
                className="px-3.5 py-2 bg-white rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-700 cursor-pointer"
              >
                <option value="all">Semua Kelas ({students.length} Siswa)</option>
                {classes.map((cls) => {
                  const count = students.filter((s) => (s.classIds || []).includes(cls.id)).length;
                  return (
                    <option key={cls.id} value={cls.id}>
                      {cls.name} ({count} Siswa)
                    </option>
                  );
                })}
              </select>
            </div>
          </div>

          {/* Students Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50/50 text-[11px] font-black text-slate-400 uppercase tracking-wider">
                  <th className="px-5 py-3.5">Profil Siswa</th>
                  <th className="px-5 py-3.5">No. Absen / NIS</th>
                  <th className="px-5 py-3.5">Kelas Terdaftar</th>
                  <th className="px-5 py-3.5">Username Login</th>
                  <th className="px-5 py-3.5 text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs sm:text-sm font-medium text-slate-700">
                {filteredStudents.map((student) => {
                  const studentClasses = classes.filter((c) => (student.classIds || []).includes(c.id));
                  return (
                    <tr key={student.uid} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-3">
                          <img
                            src={student.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${student.uid}`}
                            alt=""
                            className="w-9 h-9 rounded-xl bg-slate-100 object-cover border border-slate-200 shrink-0"
                          />
                          <div>
                            <span className="font-bold text-slate-900 block">{student.displayName}</span>
                            <span className="text-[11px] text-slate-400 font-mono">{student.username}</span>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-slate-600">
                        <span className="font-bold">No. Absen: {student.absentNumber || '-'}</span>
                        {student.studentNumber && (
                          <span className="block text-[11px] text-slate-400">NIS: {student.studentNumber}</span>
                        )}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex flex-wrap gap-1">
                          {studentClasses.map((c) => (
                            <span
                              key={c.id}
                              className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[11px] font-bold border border-emerald-100"
                            >
                              {c.name}
                            </span>
                          ))}
                          {studentClasses.length === 0 && (
                            <span className="text-slate-400 text-xs italic">Belum ada kelas</span>
                          )}
                        </div>
                      </td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-600">
                        {student.username || '-'}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <button
                          onClick={() => handleDeleteStudent(student.uid)}
                          className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer inline-flex items-center gap-1.5"
                          title="Hapus Siswa Secara Permanen"
                        >
                          <Trash2 className="w-4 h-4" />
                          <span className="text-xs font-bold hidden sm:inline">Hapus</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {filteredStudents.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-slate-400 text-sm">
                      Tidak ada data siswa yang cocok dengan pencarian atau filter kelas ini.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ================= MODAL TAMBAH / EDIT GURU (SUPER SIMPEL) ================= */}
      {isTeacherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {editingTeacher ? 'Edit Data Guru' : 'Tambah Guru Baru'}
                  </h3>
                  <p className="text-xs text-slate-400">Cukup masukkan nama, akun otomatis dibuat</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTeacherModalOpen(false)}
                className="p-2 text-slate-400 hover:bg-slate-200/60 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTeacher} className="p-5 space-y-4">
              {/* 1. Nama Lengkap Guru */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nama Guru <span className="text-rose-500">*</span>
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  value={teacherForm.displayName}
                  onChange={(e) => {
                    const name = e.target.value;
                    const autoUsername = !editingTeacher && !customLoginOpen
                      ? `guru.${name.trim().split(/[\s,.]+/)[0].toLowerCase().replace(/[^a-z0-9]/g, '')}`
                      : teacherForm.username;
                    setTeacherForm({
                      ...teacherForm,
                      displayName: name,
                      username: autoUsername,
                    });
                  }}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 transition-all shadow-xs"
                  placeholder="Contoh: Siti Aminah, S.Pd"
                />
              </div>

              {/* 2. Pilih Kelas yang Diampu (Pills/Chips) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Kelas yang Diampu (Wali Kelas):
                </label>
                {classes.length > 0 ? (
                  <div className="flex flex-wrap gap-2">
                    {classes.map((cls) => {
                      const isSelected = teacherForm.classIds.includes(cls.id);
                      return (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => handleToggleTeacherClass(cls.id)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                            isSelected
                              ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                          <span>{cls.name}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Belum ada kelas. Anda dapat menambah kelas nanti.</p>
                )}
              </div>

              {/* 3. Kredensial Login (Auto / Ringkas) */}
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Info Login Guru
                  </span>
                  <button
                    type="button"
                    onClick={() => setCustomLoginOpen(!customLoginOpen)}
                    className="text-xs text-emerald-700 hover:text-emerald-800 font-bold cursor-pointer"
                  >
                    {customLoginOpen ? 'Tutup Kustom' : 'Ubah Username / Sandi'}
                  </button>
                </div>

                {!customLoginOpen ? (
                  <div className="flex items-center justify-between text-xs text-slate-700 bg-white p-2.5 rounded-xl border border-slate-200/60 font-mono">
                    <span>
                      User: <strong className="text-slate-900">{teacherForm.username || 'guru.[nama]'}</strong>
                    </span>
                    <span>
                      Sandi: <strong className="text-slate-900">{teacherForm.password || 'guru123'}</strong>
                    </span>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2.5 pt-1">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Username</label>
                      <input
                        type="text"
                        value={teacherForm.username}
                        onChange={(e) => setTeacherForm({ ...teacherForm, username: e.target.value.toLowerCase().replace(/\s/g, '') })}
                        className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="guru.siti"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Kata Sandi</label>
                      <input
                        type="text"
                        value={teacherForm.password}
                        onChange={(e) => setTeacherForm({ ...teacherForm, password: e.target.value })}
                        className="w-full px-3 py-2 text-xs font-mono font-bold rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        placeholder="guru123"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTeacherModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={isSavingTeacher}
                  className="px-6 py-2.5 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  {isSavingTeacher ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      <span>Menyimpan ke Cloud...</span>
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      <span>Simpan Guru</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL TAMBAH / EDIT KELAS (SUPER SIMPEL) ================= */}
      {isClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-teal-100 text-teal-700 flex items-center justify-center font-bold">
                  <School className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {editingClass ? 'Edit Rombel Kelas' : 'Tambah Kelas Baru'}
                  </h3>
                  <p className="text-xs text-slate-400">Ketik nama kelas, tingkat otomatis diatur</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsClassModalOpen(false)}
                className="p-2 text-slate-400 hover:bg-slate-200/60 rounded-xl cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="p-5 space-y-4">
              {/* 1. Nama Kelas */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nama Kelas <span className="text-rose-500">*</span>
                </label>
                <input
                  required
                  autoFocus
                  type="text"
                  value={classForm.name}
                  onChange={(e) => {
                    const name = e.target.value;
                    let detectedGrade = classForm.grade;
                    const match = name.match(/([1-6])/);
                    if (match && !classAdvancedOpen) {
                      detectedGrade = Number(match[1]);
                    }
                    setClassForm({
                      ...classForm,
                      name,
                      grade: detectedGrade,
                    });
                  }}
                  className="w-full px-4 py-3 rounded-2xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-teal-500 transition-all shadow-xs"
                  placeholder="Contoh: 6A, 6B, atau Kelas 5A"
                />
              </div>

              {/* 2. Pilih Guru / Wali Kelas (Chips) */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Pilih Wali Kelas / Pengampu (Opsional):
                </label>
                {teachers.length > 0 ? (
                  <div className="flex flex-wrap gap-2 max-h-36 overflow-y-auto p-1">
                    {teachers.map((t) => {
                      const isSelected = classForm.teacherIds.includes(t.uid);
                      return (
                        <button
                          key={t.uid}
                          type="button"
                          onClick={() => handleToggleClassTeacher(t.uid)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border ${
                            isSelected
                              ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                              : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {isSelected && <Check className="w-3.5 h-3.5" />}
                          <span className="truncate max-w-[150px]">{t.displayName}</span>
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">Belum ada guru terdaftar. Anda dapat menentukan wali kelas nanti.</p>
                )}
              </div>

              {/* 3. Pengaturan Lanjutan (Opsional) */}
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                    Tingkat {classForm.grade} • TA {classForm.academicYear}
                  </span>
                  <button
                    type="button"
                    onClick={() => setClassAdvancedOpen(!classAdvancedOpen)}
                    className="text-xs text-teal-700 hover:text-teal-800 font-bold cursor-pointer"
                  >
                    {classAdvancedOpen ? 'Tutup' : 'Ubah Tingkat/TA'}
                  </button>
                </div>

                {classAdvancedOpen && (
                  <div className="grid grid-cols-2 gap-2.5 pt-2.5 mt-2 border-t border-slate-200/60">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Tingkat Kelas</label>
                      <select
                        value={classForm.grade}
                        onChange={(e) => setClassForm({ ...classForm, grade: Number(e.target.value) })}
                        className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-white"
                      >
                        {[1, 2, 3, 4, 5, 6].map((g) => (
                          <option key={g} value={g}>Kelas {g}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-600 mb-1">Tahun Ajaran</label>
                      <input
                        type="text"
                        value={classForm.academicYear}
                        onChange={(e) => setClassForm({ ...classForm, academicYear: e.target.value })}
                        className="w-full px-2.5 py-1.5 text-xs font-bold rounded-xl border border-slate-200 bg-white"
                        placeholder="2026/2027"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer transition-all"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-6 py-2.5 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>Simpan Kelas</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
