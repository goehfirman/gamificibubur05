import React, { useState } from 'react';
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
} from 'lucide-react';
import { syncDocToFirestore, COLLECTIONS } from '../../lib/firestoreSync';

export const AdminDashboard: React.FC = () => {
  const { users, classes, school, addClass, updateClass, deleteClass, deleteTeacher, deleteStudent } = useApp();

  // Active navigation tab inside Admin Dashboard
  const [activeTab, setActiveTab] = useState<'teachers' | 'classes' | 'students'>('teachers');

  // Search states
  const [teacherSearch, setTeacherSearch] = useState('');
  const [classSearch, setClassSearch] = useState('');
  const [classFilter, setClassFilter] = useState<string>('all');
  const [studentSearch, setStudentSearch] = useState('');
  const [studentClassFilter, setStudentClassFilter] = useState<string>('all');

  // Teacher Modal states
  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
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
    setTeacherForm({
      displayName: '',
      username: '',
      password: '',
      classIds: classes.length > 0 ? [classes[0].id] : [],
      status: 'active',
    });
    setIsTeacherModalOpen(true);
  };

  const handleOpenEditTeacher = (teacher: User) => {
    setEditingTeacher(teacher);
    setShowTeacherPassword(false);
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
    if (!teacherForm.displayName.trim() || !teacherForm.username.trim()) return;

    let userToSave: User;
    if (editingTeacher) {
      userToSave = {
        ...editingTeacher,
        displayName: teacherForm.displayName.trim(),
        searchName: teacherForm.displayName.trim().toLowerCase(),
        username: teacherForm.username.trim().toLowerCase().replace(/\s+/g, ''),
        password: teacherForm.password.trim() || editingTeacher.password || 'guru123',
        classIds: teacherForm.classIds,
        status: teacherForm.status,
        updatedAt: new Date().toISOString(),
      };
    } else {
      const uid = `usr_guru_${Date.now()}`;
      userToSave = {
        uid,
        role: 'teacher',
        status: teacherForm.status,
        displayName: teacherForm.displayName.trim(),
        searchName: teacherForm.displayName.trim().toLowerCase(),
        username: teacherForm.username.trim().toLowerCase().replace(/\s+/g, ''),
        password: teacherForm.password.trim() || 'guru123',
        avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${teacherForm.username.trim()}&backgroundColor=b6e3f4`,
        schoolId: school?.id || 'sch_merdeka_01',
        classIds: teacherForm.classIds,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }

    await syncDocToFirestore(COLLECTIONS.USERS, userToSave.uid, userToSave);
    setIsTeacherModalOpen(false);
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
    setClassForm({
      name: '',
      grade: 6,
      academicYear: '2026/2027',
      teacherIds: [],
      status: 'active',
    });
    setIsClassModalOpen(true);
  };

  const handleOpenEditClass = (cls: ClassRoom) => {
    setEditingClass(cls);
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
    if (!classForm.name.trim()) return;

    if (editingClass) {
      updateClass(editingClass.id, {
        name: classForm.name.trim(),
        grade: Number(classForm.grade),
        academicYear: classForm.academicYear.trim(),
        teacherIds: classForm.teacherIds,
        status: classForm.status,
      });

      // Synchronize teacher assignments
      for (const t of teachers) {
        const isAssigned = classForm.teacherIds.includes(t.uid);
        const currentClasses = t.classIds || [];
        if (isAssigned && !currentClasses.includes(editingClass.id)) {
          const updated = [...currentClasses, editingClass.id];
          await syncDocToFirestore(COLLECTIONS.USERS, t.uid, { ...t, classIds: updated });
        } else if (!isAssigned && currentClasses.includes(editingClass.id)) {
          const updated = currentClasses.filter((id) => id !== editingClass.id);
          await syncDocToFirestore(COLLECTIONS.USERS, t.uid, { ...t, classIds: updated });
        }
      }
    } else {
      const created = addClass({
        name: classForm.name.trim(),
        grade: Number(classForm.grade),
        academicYear: classForm.academicYear.trim(),
        teacherIds: classForm.teacherIds,
        status: classForm.status,
        schoolId: school?.id || 'sch_merdeka_01',
      });

      // Synchronize assigned teachers
      for (const teacherId of classForm.teacherIds) {
        const t = teachers.find((u) => u.uid === teacherId);
        if (t) {
          const updated = Array.from(new Set([...(t.classIds || []), created.id]));
          await syncDocToFirestore(COLLECTIONS.USERS, t.uid, { ...t, classIds: updated });
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
      deleteClass(classId);
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

      {/* ================= MODAL TAMBAH / EDIT GURU ================= */}
      {isTeacherModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <UserCheck className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {editingTeacher ? 'Edit Data Guru' : 'Tambah Guru Baru'}
                  </h3>
                  <p className="text-xs text-slate-400">Atur kredensial dan pemetaan kelas</p>
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

            <form onSubmit={handleSaveTeacher} className="overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Lengkap (dengan Gelar)
                </label>
                <input
                  required
                  type="text"
                  value={teacherForm.displayName}
                  onChange={(e) =>
                    setTeacherForm({ ...teacherForm, displayName: e.target.value })
                  }
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Contoh: Budi Santoso, S.Pd"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Username Login
                  </label>
                  <div className="relative">
                    <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-xs font-mono font-bold text-slate-400">
                      @
                    </span>
                    <input
                      required
                      type="text"
                      value={teacherForm.username}
                      onChange={(e) =>
                        setTeacherForm({
                          ...teacherForm,
                          username: e.target.value.toLowerCase().replace(/\s/g, ''),
                        })
                      }
                      className="w-full pl-7 pr-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder="guru.budi"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Kata Sandi {editingTeacher && '(Kosongkan jika tidak ganti)'}
                  </label>
                  <div className="relative">
                    <input
                      type={showTeacherPassword ? 'text' : 'password'}
                      value={teacherForm.password}
                      onChange={(e) =>
                        setTeacherForm({ ...teacherForm, password: e.target.value })
                      }
                      className="w-full pl-3 pr-9 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                      placeholder={editingTeacher ? '••••••••' : 'guru123'}
                      required={!editingTeacher}
                    />
                    <button
                      type="button"
                      onClick={() => setShowTeacherPassword(!showTeacherPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    >
                      {showTeacherPassword ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* Pemetaan Kelas Diampu */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Pilih Kelas yang Diampu:
                </label>
                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-1">
                  {classes.map((cls) => {
                    const isSelected = teacherForm.classIds.includes(cls.id);
                    return (
                      <div
                        key={cls.id}
                        onClick={() => handleToggleTeacherClass(cls.id)}
                        className={`flex items-center gap-2 p-2.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-900 font-bold'
                            : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                            isSelected
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                        <span className="text-xs truncate">{cls.name}</span>
                      </div>
                    );
                  })}
                  {classes.length === 0 && (
                    <span className="text-xs text-slate-400 italic col-span-2">
                      Belum ada kelas yang terdaftar. Tambahkan kelas terlebih dahulu.
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsTeacherModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  Simpan Data Guru
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= MODAL TAMBAH / EDIT KELAS ================= */}
      {isClassModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
                  <School className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {editingClass ? 'Edit Rombel Kelas' : 'Tambah Kelas Baru'}
                  </h3>
                  <p className="text-xs text-slate-400">Atur identitas rombel dan guru pengampu</p>
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

            <form onSubmit={handleSaveClass} className="overflow-y-auto p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nama Kelas
                </label>
                <input
                  required
                  type="text"
                  value={classForm.name}
                  onChange={(e) => setClassForm({ ...classForm, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  placeholder="Contoh: Kelas 6A, Kelas 5B"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tingkat / Jenjang
                  </label>
                  <select
                    value={classForm.grade}
                    onChange={(e) =>
                      setClassForm({ ...classForm, grade: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-white"
                  >
                    {[1, 2, 3, 4, 5, 6].map((g) => (
                      <option key={g} value={g}>
                        Kelas {g} (Tingkat {g})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Tahun Ajaran
                  </label>
                  <input
                    required
                    type="text"
                    value={classForm.academicYear}
                    onChange={(e) =>
                      setClassForm({ ...classForm, academicYear: e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    placeholder="2026/2027"
                  />
                </div>
              </div>

              {/* Guru Pengampu untuk Kelas ini */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-2">
                  Guru Pengampu (Wali Kelas / Pengajar):
                </label>
                <div className="space-y-1.5 max-h-48 overflow-y-auto p-1">
                  {teachers.map((t) => {
                    const isSelected = classForm.teacherIds.includes(t.uid);
                    return (
                      <div
                        key={t.uid}
                        onClick={() => handleToggleClassTeacher(t.uid)}
                        className={`flex items-center justify-between p-2.5 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'border-emerald-500 bg-emerald-50 text-emerald-950 font-bold'
                            : 'border-slate-200 bg-white hover:border-slate-300 text-slate-600'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <img
                            src={t.avatarUrl}
                            alt=""
                            className="w-7 h-7 rounded-lg bg-slate-100 object-cover shrink-0"
                          />
                          <span className="text-xs truncate">{t.displayName}</span>
                        </div>
                        <div
                          className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                            isSelected
                              ? 'bg-emerald-600 border-emerald-600 text-white'
                              : 'border-slate-300 bg-white'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                        </div>
                      </div>
                    );
                  })}
                  {teachers.length === 0 && (
                    <span className="text-xs text-slate-400 italic">
                      Belum ada guru yang terdaftar. Tambahkan guru terlebih dahulu.
                    </span>
                  )}
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsClassModalOpen(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-xs transition-all cursor-pointer"
                >
                  Simpan Kelas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
