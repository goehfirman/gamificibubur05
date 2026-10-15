import React, { useState } from 'react';
import { UserCheck, ArrowRight, Loader2, School, ChevronDown, AlertCircle } from 'lucide-react';
import { StudentSelector } from './StudentSelector';
import { PasswordInput } from './PasswordInput';
import { User, ClassRoom } from '../../types';

interface StudentLoginProps {
  classes: ClassRoom[];
  selectedClassId: string;
  onSelectClass: (classId: string) => void;
  students: User[];
  selectedStudent: User | null;
  onSelectStudent: (student: User) => void;
  onSubmit: (student: User, pass: string) => void;
  isLoading: boolean;
}

export const StudentLogin: React.FC<StudentLoginProps> = ({
  classes,
  selectedClassId,
  onSelectClass,
  students,
  selectedStudent,
  onSelectStudent,
  onSubmit,
  isLoading,
}) => {
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedStudent) {
      onSubmit(selectedStudent, password);
    }
  };

  const currentSelectedClass = classes.find((c) => c.id === selectedClassId) || classes[0];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* 1. Pilih Kelas yang Terdaftar pada Admin */}
      <div className="space-y-1.5">
        <label
          htmlFor="class-dropdown-select"
          className="block text-xs sm:text-sm font-bold text-[#101936] tracking-wide flex items-center justify-between"
        >
          <span className="flex items-center gap-1.5">
            <School className="w-4 h-4 text-[#364FFF]" />
            <span>Pilih Kelas</span>
          </span>
          <span className="text-[11px] font-medium text-slate-400">
            Terdaftar di Admin
          </span>
        </label>

        <div className="relative">
          <select
            id="class-dropdown-select"
            value={selectedClassId}
            onChange={(e) => onSelectClass(e.target.value)}
            disabled={classes.length === 0}
            className="w-full h-[50px] sm:h-[52px] px-4 rounded-xl border border-slate-200 bg-[#EEF4FF]/50 hover:bg-[#EEF4FF]/80 text-[#101936] text-sm sm:text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#364FFF] focus:border-[#364FFF] focus:bg-white transition-all appearance-none cursor-pointer pr-10 shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {classes.length === 0 ? (
              <option value="">Belum ada kelas terdaftar</option>
            ) : (
              classes.map((cls) => (
                <option key={cls.id} value={cls.id} className="py-2 text-[#101936]">
                  {cls.name} {cls.academicYear ? `(${cls.academicYear})` : ''}
                </option>
              ))
            )}
          </select>
          <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-[#364FFF]">
            <ChevronDown className="w-5 h-5 stroke-[2.5]" />
          </div>
        </div>
      </div>

      {/* 2. Informasi jika belum ada data siswa di kelas yang dipilih */}
      {classes.length > 0 && students.length === 0 ? (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex flex-col gap-1.5">
          <div className="flex items-center gap-2 font-bold text-amber-800">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Belum Ada Siswa di Kelas Ini</span>
          </div>
          <p className="text-amber-700 leading-relaxed text-[11px] sm:text-xs">
            Belum ada murid yang terdaftar di kelas <strong>{currentSelectedClass?.name || 'ini'}</strong>. Data murid harus diinput oleh Guru pengampu melalui <strong>Akun Guru</strong> (Menu <strong>Siswa</strong> &gt; <strong>Tambah Siswa</strong> atau <strong>Import Excel</strong>).
          </p>
        </div>
      ) : (
        <>
          {/* 3. Student Selector (Hanya Siswa di Kelas Tersebut) */}
          <StudentSelector
            students={students}
            selectedStudent={selectedStudent}
            onSelectStudent={onSelectStudent}
          />

          {/* 4. Password Input */}
          <PasswordInput
            id="student-password-input"
            label="Kata Sandi"
            placeholder="Masukkan kata sandi"
            value={password}
            onChange={setPassword}
            required
          />

          {/* 5. Login Button */}
          <button
            type="submit"
            disabled={isLoading || !selectedStudent}
            className="w-full h-[50px] sm:h-[52px] rounded-xl bg-gradient-to-r from-[#364FFF] to-[#8B20FF] hover:from-[#2e42db] hover:to-[#781ad8] active:scale-[0.99] text-white text-sm sm:text-base font-bold shadow-md shadow-indigo-600/20 hover:shadow-lg hover:shadow-indigo-600/30 transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed mt-2"
          >
            {isLoading ? (
              <>
                <Loader2 className="w-5 h-5 animate-spin" />
                <span>Memverifikasi...</span>
              </>
            ) : (
              <>
                <UserCheck className="w-5 h-5" />
                <span>Masuk ke Kelas</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </>
      )}
    </form>
  );
};

export default StudentLogin;
