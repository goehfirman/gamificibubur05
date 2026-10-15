import React, { useMemo } from 'react';
import { ChevronDown, User as UserIcon } from 'lucide-react';
import { User } from '../../types';

interface StudentSelectorProps {
  students: User[];
  selectedStudent: User | null;
  onSelectStudent: (student: User) => void;
}

export const StudentSelector: React.FC<StudentSelectorProps> = ({
  students,
  selectedStudent,
  onSelectStudent,
}) => {
  // Sort by absentNumber if available, otherwise alphabetically by displayName
  const sortedStudents = useMemo(() => {
    return [...students].sort((a, b) => {
      if (a.absentNumber && b.absentNumber && a.absentNumber !== b.absentNumber) {
        return a.absentNumber - b.absentNumber;
      }
      const nameA = (a.displayName || '').trim();
      const nameB = (b.displayName || '').trim();
      return nameA.localeCompare(nameB, 'id', { sensitivity: 'base' });
    });
  }, [students]);

  return (
    <div className="space-y-1.5">
      <label
        htmlFor="student-dropdown-select"
        className="block text-xs sm:text-sm font-bold text-[#101936] tracking-wide flex items-center justify-between"
      >
        <span className="flex items-center gap-1.5">
          <UserIcon className="w-4 h-4 text-[#364FFF]" />
          <span>Pilih Nama Siswa</span>
        </span>
        {sortedStudents.length > 0 && (
          <span className="text-[11px] font-medium text-slate-400">
            {sortedStudents.length} siswa
          </span>
        )}
      </label>

      {/* Clean Dropdown */}
      <div className="relative">
        <select
          id="student-dropdown-select"
          value={selectedStudent?.uid || ''}
          onChange={(e) => {
            const found = sortedStudents.find((s) => s.uid === e.target.value);
            if (found) onSelectStudent(found);
          }}
          disabled={sortedStudents.length === 0}
          className="w-full h-[50px] sm:h-[52px] px-4 rounded-xl border border-slate-200 bg-[#EEF4FF]/50 hover:bg-[#EEF4FF]/80 text-[#101936] text-sm sm:text-base font-semibold focus:outline-none focus:ring-2 focus:ring-[#8B20FF] focus:border-[#8B20FF] focus:bg-white transition-all appearance-none cursor-pointer pr-10 shadow-xs disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {sortedStudents.length === 0 ? (
            <option value="">Tidak ada siswa terdaftar di kelas ini</option>
          ) : (
            sortedStudents.map((student) => (
              <option key={student.uid} value={student.uid} className="py-2 text-[#101936]">
                {student.absentNumber ? `[${student.absentNumber}] ` : ''}{student.displayName}
              </option>
            ))
          )}
        </select>
        <div className="absolute inset-y-0 right-0 pr-3.5 flex items-center pointer-events-none text-[#364FFF]">
          <ChevronDown className="w-5 h-5 stroke-[2.5]" />
        </div>
      </div>
    </div>
  );
};

export default StudentSelector;
