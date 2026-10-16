import React, { useState } from 'react';
import {
  Award,
  BookOpen,
  Calendar,
  Camera,
  CheckCircle2,
  ChevronRight,
  Flame,
  History,
  Lock,
  LogOut,
  Medal,
  Shield,
  Sparkles,
  Star,
  Trophy,
  User,
  Zap,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { formatDateIndo, getLevelInfo } from '../../utils/gamification';
import { BadgeIcon } from '../common/BadgeIcon';
import { LevelBadge } from '../common/LevelBadge';
import { PointIcon } from '../common/PointIcon';

interface StudentProfileProps {
  onOpenAvatarPicker: () => void;
}

export const StudentProfile: React.FC<StudentProfileProps> = ({ onOpenAvatarPicker }) => {
  const {
    currentUser,
    userStats = {},
    badges = [],
    userBadges = [],
    pointLedger = [],
    levels = [],
    classes = [],
    currentClassId,
    logoutUser,
  } = useApp();
  const [activeSubTab, setActiveSubTab] = useState<'badges' | 'ledger'>('badges');

  if (!currentUser) return null;

  const safeBadges = badges || [];
  const safeUserBadges = userBadges || [];
  const safePointLedger = pointLedger || [];

  const stats = (userStats && userStats[currentUser.uid]) || {
    totalPoints: 0,
    academicPoints: 0,
    participationPoints: 0,
    level: 1,
    completedAssignments: 0,
    completedMissions: 0,
    badgeCount: 0,
  };

  const studentXp = stats.totalXp !== undefined ? stats.totalXp : (stats.totalPoints || 0);
  const levelInfo = getLevelInfo(studentXp, levels);
  const currentClass = (classes || []).find((c) => c.id === currentClassId) || (classes || [])[0] || { id: 'cls_none', name: 'Belum Ada Kelas', grade: 6 };

  const myBadges = safeUserBadges.filter((b) => b && b.userId === currentUser.uid);
  const myLedger = safePointLedger.filter((l) => l && l.userId === currentUser.uid);

  return (
    <div className="space-y-6 pb-12">
      {/* Profile Card */}
      <div className="bg-white rounded-3xl border border-slate-200/80 p-6 sm:p-8 shadow-xs">
        <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
          {/* Avatar with edit trigger: larger, crisp, and cleaner */}
          <div className="relative group shrink-0">
            <div className="w-32 h-32 sm:w-36 sm:h-36 md:w-40 md:h-40 rounded-3xl bg-indigo-50 border-4 border-indigo-100 overflow-hidden shadow-lg">
              <img
                src={currentUser.avatarUrl}
                alt={currentUser.displayName}
                className="w-full h-full object-cover group-hover:scale-105 transition-transform"
              />
            </div>
            <button
              type="button"
              onClick={onOpenAvatarPicker}
              className="absolute -bottom-2 -right-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 active:scale-95 text-white text-xs font-bold shadow-md flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <Camera className="w-3.5 h-3.5" />
              <span>Ganti Foto</span>
            </button>
          </div>

          {/* Bio info */}
          <div className="flex-1 text-center sm:text-left min-w-0">
            <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 mb-2">
              <span className="px-3 py-1 rounded-full bg-indigo-100 text-indigo-700 text-xs font-bold">
                {currentClass?.name || 'Belum Ada Kelas'}
              </span>
              <span className="px-3 py-1 rounded-full bg-amber-100 text-amber-800 text-xs font-bold flex items-center gap-1">
                <Star className="w-3 h-3 fill-current" />
                <span>Level {levelInfo.currentLevel.level} • {levelInfo.currentLevel.name}</span>
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h1 className="text-2xl sm:text-3xl font-black text-slate-900 font-display">
                  {currentUser.displayName}
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 mt-1">
                  Nomor Absen: <strong>#{currentUser.absentNumber || 1}</strong> • NIS:{' '}
                  <strong>{currentUser.studentNumber || '2024001'}</strong>
                </p>
              </div>

              {/* Action buttons */}
              <div className="flex items-center justify-center sm:justify-end gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    logoutUser();
                  }}
                  className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-rose-50 text-slate-700 hover:text-rose-600 font-bold text-xs transition-colors border border-slate-200 hover:border-rose-200 flex items-center gap-1.5 cursor-pointer"
                  title="Keluar dari akun siswa saat ini"
                >
                  <LogOut className="w-3.5 h-3.5 text-rose-500" />
                  <span>Keluar Akun (Logout)</span>
                </button>
              </div>
            </div>

            {/* Quick stats pills */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              <div className="p-3 rounded-2xl bg-amber-50/80 border border-amber-200/60 text-center">
                <span className="text-[10px] font-extrabold uppercase text-amber-800 tracking-wider flex items-center justify-center gap-1 mb-1">
                  <PointIcon className="w-3 h-3" />
                  <span>Total Poin</span>
                </span>
                <span className="text-lg sm:text-xl font-black text-amber-900 font-display">
                  {stats.totalPoints}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-blue-50/80 border border-blue-200/60 text-center">
                <span className="text-[10px] font-extrabold uppercase text-blue-800 tracking-wider flex items-center justify-center gap-1 mb-1">
                  <PointIcon className="w-3 h-3" />
                  <span>Poin Akademik</span>
                </span>
                <span className="text-lg sm:text-xl font-black text-blue-900 font-display">
                  {stats.academicPoints}
                </span>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50/80 border border-emerald-200/60 text-center">
                <span className="text-[10px] font-extrabold uppercase text-emerald-800 tracking-wider block">
                  Lencana Diraih
                </span>
                <span className="text-lg sm:text-xl font-black text-emerald-900 font-display">
                  {myBadges.length}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Level Progress Detailed Card */}
      <LevelBadge
        level={levelInfo.currentLevel}
        showProgress={true}
        progressPercent={levelInfo.progressPercent}
        pointsToNext={levelInfo.pointsToNext}
        totalPoints={stats.totalPoints}
      />

      {/* Sub Tabs: Koleksi Badge vs Riwayat Poin */}
      <div className="bg-white rounded-3xl border border-slate-200/80 overflow-hidden shadow-xs">
        <div className="flex items-center border-b border-slate-100 p-2 bg-slate-50/50">
          <button
            type="button"
            onClick={() => setActiveSubTab('badges')}
            className={`flex-1 py-3 text-xs sm:text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2 ${
              activeSubTab === 'badges'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <Medal className="w-4 h-4" />
            <span>Koleksi Lencana ({myBadges.length}/{safeBadges.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('ledger')}
            className={`flex-1 py-3 text-xs sm:text-sm font-bold rounded-2xl transition-all flex items-center justify-center gap-2 ${
              activeSubTab === 'ledger'
                ? 'bg-white text-indigo-600 shadow-sm'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Riwayat Perolehan Poin ({myLedger.length})</span>
          </button>
        </div>

        <div className="p-6">
          {activeSubTab === 'badges' ? (
            /* Badges Grid */
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {badges.map((badge) => {
                const userBadge = myBadges.find((ub) => ub.badgeId === badge.id);
                const isUnlocked = !!userBadge;

                return (
                  <div
                    key={badge.id}
                    className={`p-4 rounded-2xl border flex items-start gap-3.5 transition-all ${
                      isUnlocked
                        ? 'bg-white border-amber-200/80 shadow-xs'
                        : 'bg-slate-50/70 border-slate-200/60 opacity-60'
                    }`}
                  >
                    <BadgeIcon
                      iconName={badge.iconName}
                      rarity={badge.rarity}
                      size="md"
                      isUnlocked={isUnlocked}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1">
                        <h4 className="text-xs sm:text-sm font-bold text-slate-900 truncate">
                          {badge.name}
                        </h4>
                        {isUnlocked ? (
                          <span className="text-[10px] font-black uppercase text-amber-700 bg-amber-100 px-2 py-0.5 rounded-md">
                            Terbuka
                          </span>
                        ) : (
                          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-0.5">
                            <Lock className="w-3 h-3" />
                            <span>Terkunci</span>
                          </span>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                        {badge.description}
                      </p>

                      {isUnlocked && userBadge && (
                        <p className="text-[10px] text-amber-600 font-semibold mt-2">
                          Diraih: {formatDateIndo(userBadge.awardedAt)}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* Point Ledger History */
            <div className="space-y-3">
              {myLedger.length === 0 ? (
                <p className="text-xs text-slate-400 text-center py-6">
                  Belum ada riwayat transaksi poin tercatat.
                </p>
              ) : (
                myLedger.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50/70 border border-slate-100 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className={`px-2.5 py-1.5 rounded-xl flex items-center justify-center gap-1 font-black text-xs shrink-0 ${
                          item.amount > 0 ? 'bg-amber-100 text-amber-900 border border-amber-200' : 'bg-rose-100 text-rose-900 border border-rose-200'
                        }`}
                      >
                        <PointIcon className="w-3.5 h-3.5" />
                        <span>{item.amount > 0 ? `+${item.amount}` : item.amount}</span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 truncate">
                          {item.reason}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Kategori: <strong className="capitalize">{item.category}</strong> • Aktor: {item.actorName || 'Guru'} • {formatDateIndo(item.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="text-right shrink-0">
                      <span className="text-xs font-extrabold text-slate-600 bg-white border border-slate-200 px-2.5 py-1 rounded-xl shadow-2xs">
                        {item.sourceType}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
