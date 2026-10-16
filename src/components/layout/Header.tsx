import React, { useState } from 'react';
import {
  Bell,
  Camera,
  Check,
  ChevronDown,
  GraduationCap,
  LogOut,
  Moon,
  Star,
  Sun,
  User,
  UserCheck,
  Users,
  Save,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { getLevelInfo } from '../../utils/gamification';
import { PointIcon } from '../common/PointIcon';

interface HeaderProps {
  onOpenNotifications?: () => void;
  onOpenNotificationModal?: () => void;
  onOpenPasswordModal?: () => void;
  onOpenAvatarPicker: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenNotifications,
  onOpenNotificationModal,
  onOpenAvatarPicker,
}) => {
  const {
    currentUser,
    currentRole,
    classes = [],
    currentClassId,
    setCurrentClassId,
    logoutUser,
    userStats = {},
    levels = [],
    notifications = [],
    isFirebaseSynced,
    syncAllToCloud,
  } = useApp();

  const handleOpenNotif = onOpenNotificationModal || onOpenNotifications || (() => {});

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showClassMenu, setShowClassMenu] = useState(false);

  if (!currentUser) {
    return null;
  }

  const safeNotifications = notifications || [];
  const stats = (userStats && userStats[currentUser.uid]) || { totalPoints: 0, totalXp: 0, level: 1 };
  const studentXp = stats.totalXp !== undefined ? stats.totalXp : (stats.totalPoints || 0);
  const levelInfo = getLevelInfo(studentXp, levels);
  const unreadCount = safeNotifications.filter((n) => n && n.userId === currentUser.uid && !n.isRead).length;

  const safeClasses = classes || [];
  const currentClass = safeClasses.find((c) => c.id === currentClassId) || safeClasses[0] || { id: 'cls_none', name: 'Belum Ada Kelas', grade: 6 };

  return (
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-[#BFDBFE]/40 shadow-xs">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18">
          {/* Brand */}
          <div className="flex items-center gap-2.5 sm:gap-3.5">
            <div className="flex items-center gap-2 sm:gap-2.5">
              <img
                src="https://i.ibb.co.com/XrCv2wfM/Chat-GPT-Image-5-Sep-2026-22-21-34.png"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).src = '/gamificlass-logo.png';
                }}
                alt="GamifiClass"
                className="h-7 sm:h-8 md:h-8.5 w-auto object-contain select-none"
                loading="eager"
                referrerPolicy="no-referrer"
              />
              <span className="text-[10px] sm:text-xs font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-gradient-to-r from-[#364FFF]/15 to-[#8B20FF]/15 text-[#364FFF] border border-[#A66CFF]/30">
                {currentRole === 'admin' ? 'PANEL ADMIN' : (currentClass?.name || 'KELAS 6E')}
              </span>
            </div>
          </div>

          {/* Center / Right controls */}
          <div className="flex items-center gap-1.5 sm:gap-3.5">
            {/* Class Selector Dropdown (Hanya Tampil untuk Guru) */}
            {currentRole === 'teacher' && (
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setShowClassMenu(!showClassMenu)}
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-200 hover:border-[#8B20FF]/40 bg-[#EEF4FF]/60 hover:bg-[#EEF4FF] text-xs font-bold text-[#101936] transition-colors"
                >
                  <Users className="w-3.5 h-3.5 text-[#364FFF]" />
                  <span className="hidden xs:inline">{currentClass?.name || 'Pilih Kelas'}</span>
                  <span className="xs:hidden">{currentClass?.name ? (currentClass.name.split(' ')[1] || currentClass.name) : 'Kelas'}</span>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                </button>

                {showClassMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setShowClassMenu(false)} />
                    <div className="absolute right-0 mt-2 w-52 bg-white rounded-2xl shadow-xl border border-slate-100 py-1.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                      <div className="px-3 py-1.5 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                        Pilih Kelas Pembelajaran
                      </div>
                      {classes.map((cls) => (
                        <button
                          key={cls.id}
                          type="button"
                          onClick={() => {
                            setCurrentClassId(cls.id);
                            setShowClassMenu(false);
                          }}
                          className={`w-full flex items-center justify-between px-3.5 py-2 text-xs text-left hover:bg-[#EEF4FF] ${
                            cls.id === currentClassId ? 'font-bold text-[#364FFF] bg-[#EEF4FF]/70' : 'text-slate-700'
                          }`}
                        >
                          <span>{cls.name}</span>
                          {cls.id === currentClassId && <Check className="w-4 h-4 text-[#364FFF]" />}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Student Points (Leaderboard) & Level/XP Pill */}
            {currentRole === 'student' && (
              <div className="flex items-center gap-1.5 sm:gap-2">
                {/* Points Pill (Leaderboard) */}
                <div 
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-gradient-to-r from-[#FFD83D]/25 to-amber-500/15 border border-[#FFD83D]/60 text-[#101936] shadow-xs"
                  title="Poin untuk Peringkat Leaderboard & Reward Guru"
                >
                  <PointIcon className="w-4 h-4 sm:w-4.5 sm:h-4.5 shrink-0" />
                  <div className="flex items-baseline gap-1">
                    <span className="text-xs sm:text-sm font-black text-[#101936]">
                      {stats.totalPoints || 0}
                    </span>
                    <span className="text-[10px] font-bold text-amber-800 hidden sm:inline">
                      Poin
                    </span>
                  </div>
                </div>

                {/* Level Pill (XP) - Hidden on Mobile View */}
                <div 
                  className="hidden sm:flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-xl bg-indigo-50 border border-indigo-200/80 text-indigo-900 shadow-xs"
                  title={`Level ${levelInfo.currentLevel.level} • ${studentXp} XP`}
                >
                  <span className="text-xs sm:text-sm font-black text-indigo-700">
                    Lvl {levelInfo.currentLevel.level}
                  </span>
                  <span className="text-[10px] font-bold text-indigo-500 hidden md:inline">
                    ({studentXp} XP)
                  </span>
                </div>
              </div>
            )}

            {/* Notification Bell */}
            <button
              type="button"
              onClick={handleOpenNotif}
              className="relative p-2 sm:p-2.5 rounded-xl border border-slate-200 hover:border-[#8B20FF]/40 hover:bg-[#EEF4FF]/60 text-slate-600 hover:text-[#364FFF] transition-colors cursor-pointer"
              title="Notifikasi"
            >
              <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 w-4 h-4 sm:w-5 sm:h-5 rounded-full bg-rose-500 text-white text-[9px] sm:text-[10px] font-black flex items-center justify-center shadow-xs animate-bounce">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            {/* User Profile Pill & Quick Switcher Dropdown */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowUserMenu(!showUserMenu)}
                className="flex items-center gap-1.5 sm:gap-2 p-1 sm:px-2.5 sm:py-1.5 rounded-xl border border-slate-200 hover:border-[#8B20FF]/40 hover:bg-[#EEF4FF]/40 transition-colors cursor-pointer"
              >
                <img
                  src={currentUser.avatarUrl}
                  alt={currentUser.displayName}
                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-indigo-50 object-cover border border-slate-200"
                />
                <div className="text-left hidden md:block">
                  <p className="text-xs font-bold text-[#101936] leading-tight truncate max-w-[120px]">
                    {currentUser.displayName}
                  </p>
                  <p className="text-[10px] font-semibold text-[#364FFF]">
                    {currentRole === 'admin' ? 'Administrator' : currentRole === 'teacher' ? 'Guru Kelas' : `Absen #`}
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
              </button>

              {showUserMenu && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setShowUserMenu(false)} />
                  <div className="absolute right-0 mt-2 w-64 bg-white rounded-3xl shadow-2xl border border-slate-100 p-2.5 z-50 animate-in fade-in zoom-in-95 duration-150">
                    {/* Header in dropdown */}
                    <div className="p-3 bg-[#EEF4FF] rounded-2xl mb-2 flex items-center gap-3 border border-[#BFDBFE]/50">
                      <img
                        src={currentUser.avatarUrl}
                        alt={currentUser.displayName}
                        className="w-10 h-10 rounded-xl bg-white border border-slate-200 object-cover"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#101936] truncate">
                          {currentUser.displayName}
                        </p>
                        <p className="text-[11px] text-[#364FFF] font-semibold">
                          {currentRole === 'admin' ? 'Administrator Sistem' : currentRole === 'teacher' ? 'Guru Kelas' : `Siswa ()`}
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        onOpenAvatarPicker();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-[#EEF4FF] hover:text-[#364FFF] rounded-xl transition-colors mb-1 cursor-pointer"
                    >
                      {currentRole === 'teacher' ? (
                        <>
                          <UserCheck className="w-4 h-4 text-[#364FFF]" />
                          <span>Edit Profil Guru</span>
                        </>
                      ) : (
                        <>
                          <Camera className="w-4 h-4 text-[#364FFF]" />
                          <span>Ganti Foto Profil</span>
                        </>
                      )}
                    </button>

                    <div className="border-t border-slate-100 my-1.5" />

                    <button
                      type="button"
                      onClick={() => {
                        setShowUserMenu(false);
                        logoutUser();
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-xl transition-colors cursor-pointer"
                    >
                      <LogOut className="w-4 h-4 text-rose-500" />
                      <span>Keluar (Logout)</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

