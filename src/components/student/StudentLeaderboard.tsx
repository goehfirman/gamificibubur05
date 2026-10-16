import React, { useState } from 'react';
import {
  Award,
  Calendar,
  Crown,
  Filter,
  Medal,
  Shield,
  Sparkles,
  Star,
  Trophy,
  Users,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { User, UserStats } from '../../types';
import { getLevelInfo } from '../../utils/gamification';
import { PointIcon } from '../common/PointIcon';

export const StudentLeaderboard: React.FC = () => {
  const { users, userStats, levels, currentUser, currentClassId, classes, pointLedger } = useApp();
  const [periodFilter, setPeriodFilter] = useState<'today' | 'month' | 'semester' | 'all'>('all');

  if (!currentUser) return null;

  const currentClass = classes.find((c) => c.id === currentClassId) || classes[0] || { id: 'cls_none', name: 'Belum Ada Kelas', grade: 6 };

  // Get only students of current class
  const classStudents = users.filter(
    (u) => u.role === 'student' && (u.classIds || []).includes(currentClassId)
  );

  // Map to leaderboard entry with synchronized real points
  const leaderboardEntries = classStudents
    .map((student) => {
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

      const userLedgers = (pointLedger || []).filter((pl) => pl && pl.userId === student.uid);
      const allLedgerPoints = userLedgers.reduce((sum, pl) => sum + (pl.amount || 0), 0);
      const totalPoints = Math.max(0, userLedgers.length > 0 ? allLedgerPoints : (stats.totalPoints || 0));
      const studentXp = stats.totalXp !== undefined ? stats.totalXp : totalPoints;
      let displayPoints = totalPoints;

      if (periodFilter === 'today') {
        const todayStr = new Date().toDateString();
        const earnedToday = userLedgers
          .filter((pl) => new Date(pl.createdAt).toDateString() === todayStr)
          .reduce((sum, pl) => sum + (pl.amount || 0), 0);
        displayPoints = earnedToday;
      } else if (periodFilter === 'month') {
        const now = new Date();
        const cMonth = now.getMonth();
        const cYear = now.getFullYear();
        const earnedMonth = userLedgers
          .filter((pl) => {
            const d = new Date(pl.createdAt);
            return d.getMonth() === cMonth && d.getFullYear() === cYear;
          })
          .reduce((sum, pl) => sum + (pl.amount || 0), 0);
        displayPoints = earnedMonth;
      }

      const levelInfo = getLevelInfo(studentXp, levels);

      return {
        user: student,
        points: displayPoints,
        xp: studentXp,
        level: levelInfo.currentLevel,
        academicPoints: stats.academicPoints,
        participationPoints: stats.participationPoints,
      };
    })
    .sort((a, b) => b.points - a.points);

  // Compute ranks with tie handling
  let currentRank = 1;
  const rankedList = leaderboardEntries.map((entry, index, arr) => {
    if (index > 0 && entry.points < arr[index - 1].points) {
      currentRank = index + 1;
    }
    return {
      ...entry,
      rank: currentRank,
    };
  });

  const top3 = rankedList.slice(0, 3);
  const myRankEntry = rankedList.find((r) => r.user.uid === currentUser.uid);

  return (
    <div className="space-y-6 pb-12">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-[#101936] via-[#1C1242] to-[#364FFF] rounded-3xl p-6 sm:p-8 text-white shadow-2xl shadow-indigo-950/20 border border-white/10 relative overflow-hidden">
        <div className="absolute -right-8 -top-8 w-60 h-60 bg-[#8B20FF]/25 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute left-1/3 -bottom-10 w-48 h-48 bg-[#364FFF]/25 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-[#FFD83D] border border-white/15 text-xs font-black mb-2">
              <Trophy className="w-3.5 h-3.5 fill-current text-[#FFD83D]" />
              <span>Peringkat Belajar {currentClass?.name || 'Kelas'}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold font-display">
              Papan Prestasi Kelas
            </h1>
            <p className="text-xs sm:text-sm text-indigo-100 mt-1 max-w-xl">
              Apresiasi motivasi belajar yang sehat, ceria, dan saling menyemangati antar-teman sekelas.
            </p>
          </div>

          {/* Period Filter Selector */}
          <div className="flex items-center gap-1 bg-black/30 p-1.5 rounded-2xl backdrop-blur-md border border-white/15">
            {[
              { id: 'today', label: 'Hari Ini' },
              { id: 'month', label: 'Bulan Ini' },
              { id: 'all', label: 'Sepanjang Waktu' },
            ].map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPeriodFilter(p.id as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                  periodFilter === p.id
                    ? 'bg-gradient-to-r from-[#364FFF] to-[#8B20FF] text-white shadow-md scale-105'
                    : 'text-indigo-200 hover:text-white'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pinned "Posisi Saya" Card */}
      {myRankEntry && (
        <div className="p-4 sm:p-5 rounded-3xl bg-[#EEF4FF] border-2 border-[#BFDBFE] shadow-sm flex items-center justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-r from-[#364FFF] to-[#8B20FF] text-white flex flex-col items-center justify-center font-black shadow-md shadow-indigo-600/20 shrink-0">
              <span className="text-[9px] uppercase font-bold text-indigo-200">Posisi</span>
              <span className="text-lg font-display leading-none text-[#FFD83D]">#{myRankEntry.rank}</span>
            </div>

            <div className="relative shrink-0">
              <img
                src={myRankEntry.user.avatarUrl}
                alt={myRankEntry.user.displayName}
                className="w-11 h-11 rounded-2xl bg-white border border-[#BFDBFE] object-cover"
              />
              <span className="absolute -bottom-1 -right-1 px-1.5 py-0.5 rounded-md bg-[#FFD83D] text-[#101936] font-black text-[9px] shadow-xs">
                Lvl {myRankEntry.level.level}
              </span>
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="text-sm sm:text-base font-extrabold text-[#101936] truncate">
                  {myRankEntry.user.displayName} (Kamu)
                </h4>
                <span className="text-[10px] font-black px-2 py-0.5 rounded-full bg-gradient-to-r from-[#364FFF] to-[#8B20FF] text-white">
                  Saya
                </span>
              </div>
              <p className="text-xs text-[#364FFF] font-semibold truncate">
                Gelar: {myRankEntry.level.name}
              </p>
            </div>
          </div>

          <div className="text-right shrink-0">
            <div className="flex items-center justify-end gap-1.5">
              <PointIcon className="w-5 h-5 sm:w-6 sm:h-6" />
              <span className="text-xl sm:text-2xl font-black text-[#101936] font-display">
                {myRankEntry.points}
              </span>
            </div>
            <span className="text-xs text-slate-500 font-bold block">Poin Periode</span>
          </div>
        </div>
      )}

      {/* Top 3 Podium Visual (If at least 3 students exist) */}
      {top3.length >= 3 && (
        <div className="bg-white rounded-3xl border border-[#BFDBFE]/50 p-6 shadow-xs">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider text-center mb-6 flex items-center justify-center gap-1.5">
            <Sparkles className="w-4 h-4 text-[#FFD83D]" />
            <span>Bintang Kelas Teratas ({currentClass?.name})</span>
            <Sparkles className="w-4 h-4 text-[#FFD83D]" />
          </h3>

          <div className="flex items-end justify-center gap-3 sm:gap-6 max-w-lg mx-auto pt-6">
            {/* Rank 2 - Silver */}
            <div className="flex flex-col items-center flex-1">
              <div className="relative mb-2">
                <img
                  src={top3[1].user.avatarUrl}
                  alt={top3[1].user.displayName}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border-2 border-slate-300 bg-slate-100 object-cover shadow-sm"
                />
                <div className="absolute -bottom-2 -right-1 w-6 h-6 rounded-full bg-slate-300 text-slate-800 font-black text-xs flex items-center justify-center border-2 border-white shadow-xs">
                  2
                </div>
              </div>
              <p className="text-xs font-bold text-[#101936] text-center truncate w-24">
                {top3[1].user.displayName.split(' ')[0]}
              </p>
              <span className="text-xs font-black text-slate-700 flex items-center justify-center gap-1">
                <PointIcon className="w-3.5 h-3.5" />
                <span>{top3[1].points} Poin</span>
              </span>
              <div className="w-full h-20 bg-gradient-to-t from-slate-200 to-slate-100 rounded-t-2xl mt-3 flex items-center justify-center text-slate-600 font-bold text-sm border-t border-slate-300">
                🥈 Perak
              </div>
            </div>

            {/* Rank 1 - Gold */}
            <div className="flex flex-col items-center flex-1">
              <div className="relative mb-2">
                <div className="absolute -top-6 left-1/2 -translate-x-1/2 text-[#FFD83D] animate-bounce">
                  <Crown className="w-6 h-6 fill-[#FFD83D]" />
                </div>
                <img
                  src={top3[0].user.avatarUrl}
                  alt={top3[0].user.displayName}
                  className="w-18 h-18 sm:w-20 sm:h-20 rounded-3xl border-4 border-[#FFD83D] bg-amber-50 object-cover shadow-xl"
                />
                <div className="absolute -bottom-2 -right-1 w-7 h-7 rounded-full bg-[#FFD83D] text-[#101936] font-black text-xs flex items-center justify-center border-2 border-white shadow-md">
                  1
                </div>
              </div>
              <p className="text-xs sm:text-sm font-black text-[#101936] text-center truncate w-28">
                {top3[0].user.displayName.split(' ')[0]}
              </p>
              <span className="text-xs sm:text-sm font-black text-[#101936] flex items-center justify-center gap-1">
                <PointIcon className="w-4 h-4" />
                <span>{top3[0].points} Poin</span>
              </span>
              <div className="w-full h-28 bg-gradient-to-t from-[#FFD83D] to-amber-300 rounded-t-2xl mt-3 flex items-center justify-center text-[#101936] font-black text-sm shadow-md border-t-2 border-amber-300">
                🥇 Juara 1
              </div>
            </div>

            {/* Rank 3 - Bronze */}
            <div className="flex flex-col items-center flex-1">
              <div className="relative mb-2">
                <img
                  src={top3[2].user.avatarUrl}
                  alt={top3[2].user.displayName}
                  className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl border-2 border-amber-600/40 bg-orange-50 object-cover shadow-sm"
                />
                <div className="absolute -bottom-2 -right-1 w-6 h-6 rounded-full bg-amber-700 text-white font-black text-xs flex items-center justify-center border-2 border-white shadow-xs">
                  3
                </div>
              </div>
              <p className="text-xs font-bold text-[#101936] text-center truncate w-24">
                {top3[2].user.displayName.split(' ')[0]}
              </p>
              <span className="text-xs font-black text-orange-800 flex items-center justify-center gap-1">
                <PointIcon className="w-3.5 h-3.5" />
                <span>{top3[2].points} Poin</span>
              </span>
              <div className="w-full h-16 bg-gradient-to-t from-orange-200 to-orange-100 rounded-t-2xl mt-3 flex items-center justify-center text-orange-800 font-bold text-xs border-t border-orange-300">
                🥉 Perunggu
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Full Leaderboard List (Top 10) */}
      <div className="bg-white rounded-3xl border border-[#BFDBFE]/50 overflow-hidden shadow-xs">
        <div className="p-5 border-b border-slate-100 flex items-center justify-between">
          <h3 className="text-base font-bold text-[#101936] font-display">
            Peringkat 10 Besar Kelas
          </h3>
          <span className="text-xs text-slate-400 font-medium">Total {classStudents.length} Siswa</span>
        </div>

        <div className="divide-y divide-slate-100">
          {rankedList.slice(0, 10).map((entry) => {
            const isMe = entry.user.uid === currentUser.uid;

            return (
              <div
                key={entry.user.uid}
                className={`p-4 sm:px-6 flex items-center justify-between gap-4 transition-colors ${
                  isMe ? 'bg-[#EEF4FF]/70 font-bold' : 'hover:bg-[#F8FAFF]'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center font-extrabold text-xs shrink-0 ${
                      entry.rank === 1
                        ? 'bg-[#FFD83D] text-[#101936] shadow-xs'
                        : entry.rank === 2
                        ? 'bg-slate-200 text-slate-800'
                        : entry.rank === 3
                        ? 'bg-orange-200 text-orange-900'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    #{entry.rank}
                  </div>

                  <img
                    src={entry.user.avatarUrl}
                    alt={entry.user.displayName}
                    className="w-10 h-10 rounded-xl bg-slate-100 object-cover border border-slate-200 shrink-0"
                  />

                  <div className="min-w-0">
                    <p className="text-xs sm:text-sm font-bold text-[#101936] truncate">
                      {entry.user.displayName} {isMe && <span className="text-[#364FFF]">(Kamu)</span>}
                    </p>
                    <p className="text-[11px] text-slate-400 font-medium">
                      Level {entry.level.level} • {entry.level.name}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <div className="flex items-center justify-end gap-1">
                    <PointIcon className="w-3.5 h-3.5" />
                    <span className="text-sm sm:text-base font-black text-[#101936] font-display">
                      {entry.points}
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold block">Poin</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
