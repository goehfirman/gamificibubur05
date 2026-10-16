import React, { useState } from 'react';
import {
  Award,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  Filter,
  GraduationCap,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { User, UserStats } from '../../types';
import { getLevelInfo } from '../../utils/gamification';
import { PointIcon } from '../common/PointIcon';

export const TeacherReports: React.FC = () => {
  const {
    users,
    assignments,
    submissions,
    userStats,
    userBadges,
    levels,
    classes,
    currentClassId,
  } = useApp();

  const [activeReportTab, setActiveReportTab] = useState<'grades' | 'gamification'>('grades');

  const currentClass = classes.find((c) => c.id === currentClassId) || classes[0] || { id: 'cls_none', name: 'Belum Ada Kelas', grade: 6 };
  const classStudents = users
    .filter((u) => u.role === 'student' && (u.classIds || []).includes(currentClassId))
    .sort((a, b) => (a.absentNumber || 99) - (b.absentNumber || 99));

  // Export Gradebook CSV
  const handleExportGradesCSV = () => {
    const headers = [
      'No Absen',
      'NIS',
      'Nama Siswa',
      ...assignments.map((a) => `${a.title} (${a.subject})`),
      'Rata-rata Nilai',
    ];

    const rows = classStudents.map((s) => {
      let totalScore = 0;
      let gradedCount = 0;

      const asgScores = assignments.map((a) => {
        const sub = submissions[`${a.id}_${s.uid}`];
        if (sub && sub.status === 'graded' && sub.score !== undefined) {
          totalScore += sub.score;
          gradedCount += 1;
          return sub.score;
        }
        return sub ? sub.status : 'Belum Kumpul';
      });

      const avg = gradedCount > 0 ? (totalScore / gradedCount).toFixed(1) : '0.0';

      return [
        s.absentNumber || '',
        s.studentNumber || '',
        `"${s.displayName}"`,
        ...asgScores,
        avg,
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Rekap_Nilai_${currentClass?.name ? currentClass.name.replace(/\s+/g, '_') : 'Kelas'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Gamification CSV
  const handleExportGamificationCSV = () => {
    const headers = [
      'No Absen',
      'NIS',
      'Nama Siswa',
      'Level',
      'Gelar Level',
      'Total Poin',
      'Poin Akademik',
      'Poin Partisipasi',
      'Jumlah Lencana',
      'Tugas Selesai',
    ];

    const rows = classStudents.map((s) => {
      const stats: UserStats = userStats[s.uid] || {
        uid: s.uid,
        schoolId: s.schoolId,
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
      const lvl = getLevelInfo(stats.totalPoints, levels);
      const bCount = userBadges.filter((b) => b.userId === s.uid).length;

      return [
        s.absentNumber || '',
        s.studentNumber || '',
        `"${s.displayName}"`,
        lvl.currentLevel.level,
        `"${lvl.currentLevel.name}"`,
        stats.totalPoints,
        stats.academicPoints,
        stats.participationPoints,
        bCount,
        stats.completedAssignments,
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Rekap_Kelas_${currentClass?.name ? currentClass.name.replace(/\s+/g, '_') : 'Kelas'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-xs font-bold mb-2">
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span>Rekap Akademik & Ekspor Laporan</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 font-display">
            Laporan & Rekap Nilai
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Unduh rekap nilai siswa dan catatan perolehan poin prestasi dalam format CSV untuk pelaporan sekolah
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeReportTab === 'grades' ? (
            <button
              type="button"
              onClick={handleExportGradesCSV}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md shadow-emerald-200 transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Ekspor Rekap Nilai (CSV)</span>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleExportGamificationCSV}
              className="px-5 py-2.5 rounded-xl bg-purple-600 hover:bg-purple-700 active:scale-95 text-white font-bold text-xs sm:text-sm shadow-md shadow-purple-200 transition-all flex items-center gap-2"
            >
              <Download className="w-4 h-4" />
              <span>Ekspor Rekap Prestasi (CSV)</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs Switch */}
      <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="flex items-center border-b border-slate-100 p-2 bg-slate-50/50">
          <button
            type="button"
            onClick={() => setActiveReportTab('grades')}
            className={`flex-1 py-3 text-xs sm:text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2 ${
              activeReportTab === 'grades'
                ? 'bg-white text-emerald-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <GraduationCap className="w-4 h-4" />
            <span>Rekap Nilai Tugas ({assignments.length} Tugas)</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveReportTab('gamification')}
            className={`flex-1 py-3 text-xs sm:text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2 ${
              activeReportTab === 'gamification'
                ? 'bg-white text-purple-700 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <PointIcon className="w-4 h-4" />
            <span>Rekap Prestasi & Poin Kelas</span>
          </button>
        </div>

        {/* Tab 1: Gradebook Table */}
        {activeReportTab === 'grades' ? (
          <div className="p-4 sm:p-6 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider">
                  <th className="py-3 px-3">No</th>
                  <th className="py-3 px-3">Siswa</th>
                  {assignments.map((a) => (
                    <th key={a.id} className="py-3 px-3 whitespace-nowrap min-w-[120px]">
                      {a.title}
                    </th>
                  ))}
                  <th className="py-3 px-3 text-right">Rata-rata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {classStudents.map((student) => {
                  let sum = 0;
                  let gradedCount = 0;

                  return (
                    <tr key={student.uid} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-3 font-bold text-slate-400">
                        {student.absentNumber || '-'}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={student.avatarUrl}
                            alt={student.displayName}
                            className="w-7 h-7 rounded-lg object-cover"
                          />
                          <span className="font-bold text-slate-900 truncate max-w-[150px]">
                            {student.displayName}
                          </span>
                        </div>
                      </td>
                      {assignments.map((asg) => {
                        const sub = submissions[`${asg.id}_${student.uid}`];
                        if (sub && sub.status === 'graded' && sub.score !== undefined) {
                          sum += sub.score;
                          gradedCount += 1;
                          return (
                            <td key={asg.id} className="py-3.5 px-3">
                              <span className="font-extrabold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-md">
                                {sub.score}
                              </span>
                            </td>
                          );
                        }
                        if (sub && (sub.status === 'submitted' || sub.status === 'resubmitted')) {
                          return (
                            <td key={asg.id} className="py-3.5 px-3 text-amber-600 font-bold text-[11px]">
                              Terkirim
                            </td>
                          );
                        }
                        if (sub && sub.status === 'revision_requested') {
                          return (
                            <td key={asg.id} className="py-3.5 px-3 text-orange-600 font-bold text-[11px]">
                              Revisi
                            </td>
                          );
                        }
                        return (
                          <td key={asg.id} className="py-3.5 px-3 text-slate-300">
                            -
                          </td>
                        );
                      })}
                      <td className="py-3.5 px-3 text-right font-black text-slate-900 text-sm">
                        {gradedCount > 0 ? (sum / gradedCount).toFixed(1) : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          /* Tab 2: Gamification Table */
          <div className="p-4 sm:p-6 overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-400 font-extrabold uppercase tracking-wider">
                  <th className="py-3 px-3">No</th>
                  <th className="py-3 px-3">Siswa</th>
                  <th className="py-3 px-3">Level & Gelar</th>
                  <th className="py-3 px-3 text-center">Akademik</th>
                  <th className="py-3 px-3 text-center">Partisipasi</th>
                  <th className="py-3 px-3 text-center">Lencana</th>
                  <th className="py-3 px-3 text-right">Total Poin</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                {classStudents.map((student) => {
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
                  const lvl = getLevelInfo(stats.totalPoints, levels);
                  const bCount = userBadges.filter((b) => b.userId === student.uid).length;

                  return (
                    <tr key={student.uid} className="hover:bg-slate-50 transition-colors">
                      <td className="py-3.5 px-3 font-bold text-slate-400">
                        {student.absentNumber || '-'}
                      </td>
                      <td className="py-3.5 px-3">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={student.avatarUrl}
                            alt={student.displayName}
                            className="w-7 h-7 rounded-lg object-cover"
                          />
                          <span className="font-bold text-slate-900 truncate max-w-[150px]">
                            {student.displayName}
                          </span>
                        </div>
                      </td>
                      <td className="py-3.5 px-3">
                        <span className="font-bold text-indigo-700">
                          Level {lvl.currentLevel.level} ({lvl.currentLevel.name})
                        </span>
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-blue-700">
                        {stats.academicPoints}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-purple-700">
                        {stats.participationPoints}
                      </td>
                      <td className="py-3.5 px-3 text-center font-bold text-emerald-700">
                        {bCount} Badge
                      </td>
                      <td className="py-3.5 px-3 text-right font-black text-amber-700 text-sm">
                        <span className="inline-flex items-center justify-end gap-1">
                          <PointIcon className="w-3.5 h-3.5" />
                          <span>{stats.totalPoints} Poin</span>
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
