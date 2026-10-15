import React, { useState } from 'react';
import { GraduationCap, ChevronDown, LogIn, ArrowRight, Loader2, AlertCircle, BookOpen } from 'lucide-react';
import { PasswordInput } from './PasswordInput';
import { User, ClassRoom } from '../../types';

interface TeacherLoginProps {
  teachers: User[];
  selectedTeacher: User | null;
  onSelectTeacher: (teacher: User) => void;
  classes?: ClassRoom[];
  onSubmit: (teacher: User, pass: string) => void;
  isLoading: boolean;
}

export const TeacherLogin: React.FC<TeacherLoginProps> = ({
  teachers,
  selectedTeacher,
  onSelectTeacher,
  classes = [],
  onSubmit,
  isLoading,
}) => {
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTeacher) {
      onSubmit(selectedTeacher, password);
    }
  };

  // Get assigned classes names for selected teacher
  const selectedTeacherClasses = (selectedTeacher?.classIds || [])
    .map((cId) => classes.find((c) => c.id === cId)?.name)
    .filter(Boolean);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 1. Pilih Nama Guru (Dropdown) */}
      <div className="space-y-1.5">
        <label
          htmlFor="teacher-dropdown-select"
          className="block text-xs sm:text-sm font-bold text-[#101936] tracking-wide flex items-center justify-between"
        >
          <span className="flex items-center gap-1.5">
            <GraduationCap className="w-4 h-4 text-[#364FFF]" />
            <span>Pilih Nama Guru</span>
          </span>
          {teachers.length > 0 && (
            <span className="text-[11px] font-medium text-slate-400">
              {teachers.length} guru terdaftar
            </span>
          )}
        </label>

        <div className="relative">
          <select
            id="teacher-dropdown-select"
            value={selectedTeacher?.uid || ''}
            onChange={(e) => {
              const found = teachers.find((t) => t.uid === e.target.value);
              if (found) onSelectTeacher(found);
            }}
            disabled={teachers.length === 0}
            className="w-full h-[50px] sm:h-[52px] px-4 rounded-xl border border-slate-200 bg-[#EEF4FF]/50 hover:bg-[#EEF4FF]/80 text-[#101936] text-sm sm:text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#8B20FF] focus:border-[#8B20FF] focus:bg-white transition-all appearance-none cursor-pointer pr-10 shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {teachers.length === 0 ? (
              <option value="">Belum ada guru terdaftar</option>
            ) : (
              teachers.map((teacher) => {
                const assignedClassNames = (teacher.classIds || [])
                  .map((cId) => classes.find((c) => c.id === cId)?.name)
                  .filter(Boolean)
                  .join(', ');

                return (
                  <option key={teacher.uid} value={teacher.uid} className="py-2 text-[#101936]">
                    {teacher.displayName} {assignedClassNames ? `(${assignedClassNames})` : ''}
                  </option>
                );
              })
            )}
          </select>
          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-[#364FFF]">
            <ChevronDown className="w-5 h-5 stroke-[2.5]" />
          </div>
        </div>
      </div>

      {/* 2. Informasi jika belum ada guru */}
      {teachers.length === 0 ? (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-col gap-1.5">
          <div className="flex items-center gap-2 font-bold text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Belum Ada Guru Terdaftar</span>
          </div>
          <p className="text-amber-700 leading-relaxed text-[11px] sm:text-xs">
            Belum ada akun guru yang dibuat. Administrator sekolah dapat menambahkan akun guru melalui menu <strong>Admin &gt; Tambah Guru</strong>.
          </p>
        </div>
      ) : (
        <>
          {/* Info Singkat Guru Terpilih */}
          {selectedTeacher && (
            <div className="p-2.5 rounded-xl bg-indigo-50/60 border border-indigo-100 flex items-center gap-3">
              <img
                src={selectedTeacher.avatarUrl || `https://api.dicebear.com/7.x/bottts/svg?seed=${selectedTeacher.uid}`}
                alt={selectedTeacher.displayName}
                className="w-9 h-9 rounded-lg bg-white border border-indigo-200/60 object-cover shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold text-[#101936] truncate">
                  {selectedTeacher.displayName}
                </div>
                <div className="text-[11px] text-indigo-600 font-medium flex items-center gap-1 truncate">
                  <BookOpen className="w-3 h-3 shrink-0" />
                  <span>
                    {selectedTeacherClasses.length > 0
                      ? `Pengampu: ${selectedTeacherClasses.join(', ')}`
                      : 'Wali / Guru Kelas'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* 3. Password Input */}
          <PasswordInput
            id="teacher-password"
            label="Kata Sandi Guru"
            placeholder="Masukkan kata sandi guru"
            value={password}
            onChange={setPassword}
            required
          />

          {/* 4. Submit Button */}
          <button
            type="submit"
            disabled={isLoading || !selectedTeacher}
            className="w-full h-[50px] sm:h-[52px] rounded-xl bg-gradient-to-r from-[#364FFF] to-[#8B20FF] hover:from-[#2e42db] hover:to-[#781ad8] active:scale-[0.99] text-white text-sm sm:text-base font-bold shadow-md shadow-indigo-600/20 hover:shadow-lg hover:shadow-indigo-600/30 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Memverifikasi...</span>
              </>
            ) : (
              <>
                <LogIn className="w-5 h-5" />
                <span>Masuk sebagai Guru</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </>
      )}
    </form>
  );
};

export default TeacherLogin;
