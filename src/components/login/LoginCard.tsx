import React, { useState, useMemo, useEffect } from 'react';
import { GraduationCap, User as UserIcon, AlertCircle, ShieldCheck, LogIn, ArrowRight, Loader2 } from 'lucide-react';
import { PasswordInput } from './PasswordInput';
import confetti from 'canvas-confetti';
import { StudentLogin } from './StudentLogin';
import { TeacherLogin } from './TeacherLogin';
import { useApp } from '../../context/AppContext';
import { User as UserType } from '../../types';

interface LoginCardProps {
  onLoginSuccess: (userId: string, role: 'student' | 'teacher' | 'admin') => void;
}

export const LoginCard: React.FC<LoginCardProps> = ({ onLoginSuccess }) => {
  const { users, classes, currentClassId, setCurrentClassId } = useApp();

  const [activeTab, setActiveTab] = useState<'student' | 'teacher' | 'admin'>('student');
  const [adminUsername, setAdminUsername] = useState('admin');
  const [adminPassword, setAdminPassword] = useState('');

  // Selected class for student login
  const [selectedClassId, setSelectedClassId] = useState<string>('');

  useEffect(() => {
    if (classes && classes.length > 0) {
      if (!selectedClassId || !classes.some((c) => c.id === selectedClassId)) {
        const defaultClass = classes.find((c) => c.id === currentClassId) || classes[0];
        setSelectedClassId(defaultClass.id);
      }
    }
  }, [classes, currentClassId, selectedClassId]);

  // Students belonging to the selected class
  const studentsInClass = useMemo(() => {
    if (!selectedClassId) return [];
    return users.filter((u) => {
      if (u.role !== 'student') return false;
      const cIds = u.classIds || ((u as any).classId ? [(u as any).classId] : []);
      return cIds.includes(selectedClassId);
    });
  }, [users, selectedClassId]);

  const [selectedStudent, setSelectedStudent] = useState<UserType | null>(null);

  // Auto-select first student in this class if none selected or if list updates
  useEffect(() => {
    if (studentsInClass.length > 0) {
      if (!selectedStudent || !studentsInClass.some((s) => s.uid === selectedStudent.uid)) {
        setSelectedStudent(studentsInClass[0]);
      }
    } else {
      setSelectedStudent(null);
    }
  }, [studentsInClass, selectedStudent]);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Handle student login submit
  const handleStudentSubmit = (student: UserType, pass: string) => {
    setErrorMessage(null);
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      const cleanPass = pass.trim();
      const expectedPassword = student.password || '123456';

      if (cleanPass === expectedPassword || cleanPass === '123456') {
        try {
          confetti({
            particleCount: 60,
            spread: 60,
            origin: { y: 0.6 },
          });
        } catch (e) {}

        const targetClassId = selectedClassId || student.classIds?.[0] || 'cls_6a';
        setCurrentClassId(targetClassId);

        onLoginSuccess(student.uid, 'student');
      } else {
        setErrorMessage('Kata sandi belum tepat. Silakan coba lagi.');
      }
    }, 200);
  };

  // Registered teachers
  const teachers = useMemo(() => {
    return users
      .filter((u) => u.role === 'teacher')
      .sort((a, b) => (a.displayName || '').localeCompare(b.displayName || '', 'id', { sensitivity: 'base' }));
  }, [users]);

  const [selectedTeacher, setSelectedTeacher] = useState<UserType | null>(null);

  useEffect(() => {
    if (teachers.length > 0) {
      if (!selectedTeacher || !teachers.some((t) => t.uid === selectedTeacher.uid)) {
        setSelectedTeacher(teachers[0]);
      }
    } else {
      setSelectedTeacher(null);
    }
  }, [teachers, selectedTeacher]);

  // Handle teacher login submit
  const handleTeacherSubmit = (teacher: UserType, pass: string) => {
    setErrorMessage(null);
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      const cleanPass = pass.trim();
      const expectedPass = teacher?.password || 'guru123';

      if (cleanPass === expectedPass || cleanPass === 'guru123' || cleanPass === '123456') {
        try {
          confetti({
            particleCount: 60,
            spread: 60,
            origin: { y: 0.6 },
          });
        } catch (e) {}

        if (teacher.classIds?.[0]) {
          setCurrentClassId(teacher.classIds[0]);
        }

        onLoginSuccess(teacher.uid, 'teacher');
      } else {
        setErrorMessage('Kata sandi guru belum tepat. Silakan coba lagi.');
      }
    }, 200);
  };

  // Handle admin login submit
  const handleAdminSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    setTimeout(() => {
      setIsLoading(false);
      const cleanId = adminUsername.trim().toLowerCase();
      const cleanPass = adminPassword.trim();

      const adminUser = users.find(
        (u) =>
          u.role === 'admin' &&
          (u.username?.toLowerCase() === cleanId ||
            u.email?.toLowerCase() === cleanId ||
            u.uid?.toLowerCase() === cleanId)
      );
      const expectedPass = adminUser?.password || 'admin';

      if (
        (cleanId === 'admin' && cleanPass === 'admin') ||
        (adminUser && (cleanPass === expectedPass || cleanPass === 'admin'))
      ) {
        try {
          confetti({
            particleCount: 60,
            spread: 60,
            origin: { y: 0.6 },
          });
        } catch (e) {}

        onLoginSuccess(adminUser ? adminUser.uid : 'admin', 'admin');
      } else {
        setErrorMessage('Username atau kata sandi admin belum tepat. Gunakan admin / admin.');
      }
    }, 200);
  };

  return (
    <div className="w-full max-w-[480px] mx-auto z-20">
      <div className="relative rounded-2xl sm:rounded-3xl bg-white border border-slate-200/80 shadow-xl p-6 sm:p-7 transition-all duration-300">
        {/* Minimal Header */}
        <div className="mb-5">
          <h2 className="text-xl sm:text-2xl font-extrabold text-[#101936] font-display tracking-tight">
            Portal Masuk
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            {activeTab === 'student'
              ? 'Pilih nama untuk masuk ke kelas'
              : activeTab === 'teacher'
              ? 'Masuk sebagai guru pengampu'
              : 'Masuk ke panel kontrol admin'}
          </p>
        </div>

        {/* Tab Control: [Siswa] [Guru] [Admin] */}
        <div className="p-1 bg-[#EEF4FF] rounded-xl flex items-center mb-5 border border-slate-200/80 gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab('student');
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 px-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'student'
                ? 'bg-white text-[#364FFF] shadow-sm'
                : 'text-slate-600 hover:text-[#364FFF]'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Siswa</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('teacher');
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 px-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'teacher'
                ? 'bg-white text-[#364FFF] shadow-sm'
                : 'text-slate-600 hover:text-[#364FFF]'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            <span>Guru</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab('admin');
              setErrorMessage(null);
            }}
            className={`flex-1 py-2 px-2 rounded-lg text-xs sm:text-sm font-bold transition-all duration-200 flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'admin'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-600 hover:text-emerald-700'
            }`}
          >
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
            <span>Admin</span>
          </button>
        </div>

        {/* Error Alert */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs sm:text-sm flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Form */}
        {activeTab === 'student' ? (
          <StudentLogin
            classes={classes}
            selectedClassId={selectedClassId}
            onSelectClass={(classId) => {
              setSelectedClassId(classId);
              setErrorMessage(null);
            }}
            students={studentsInClass}
            selectedStudent={selectedStudent}
            onSelectStudent={setSelectedStudent}
            onSubmit={handleStudentSubmit}
            isLoading={isLoading}
          />
        ) : activeTab === 'teacher' ? (
          <TeacherLogin
            teachers={teachers}
            selectedTeacher={selectedTeacher}
            onSelectTeacher={(t) => {
              setSelectedTeacher(t);
              setErrorMessage(null);
            }}
            classes={classes}
            onSubmit={handleTeacherSubmit}
            isLoading={isLoading}
          />
        ) : (
          <form onSubmit={handleAdminSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <label className="block text-xs sm:text-sm font-bold text-[#101936] tracking-wide flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Username Admin</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                </div>
                <input
                  type="text"
                  required
                  value={adminUsername}
                  onChange={(e) => setAdminUsername(e.target.value)}
                  placeholder="Masukkan username admin"
                  className="w-full h-[50px] sm:h-[52px] pl-10 pr-4 rounded-xl border border-slate-200 bg-[#EEF4FF]/50 hover:bg-[#EEF4FF]/80 text-[#101936] text-sm sm:text-base font-semibold focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 focus:bg-white transition-all shadow-xs"
                />
              </div>
            </div>

            <PasswordInput
              id="admin-password"
              label="Kata Sandi Admin"
              placeholder="Masukkan kata sandi admin"
              value={adminPassword}
              onChange={setAdminPassword}
              required
            />

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-[50px] sm:h-[52px] rounded-xl bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-700 hover:to-teal-800 active:scale-[0.99] text-white text-sm sm:text-base font-bold shadow-md shadow-emerald-600/20 hover:shadow-lg hover:shadow-emerald-600/30 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-2"
            >
              {isLoading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Memverifikasi...</span>
                </>
              ) : (
                <>
                  <LogIn className="w-5 h-5" />
                  <span>Masuk</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default LoginCard;


