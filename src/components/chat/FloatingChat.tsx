import React, { useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ChevronDown,
  Circle,
  GraduationCap,
  Image as ImageIcon,
  MessageCircle,
  MessageSquare,
  Minus,
  Paperclip,
  Radio,
  Search,
  Send,
  Smile,
  Sparkles,
  Trash2,
  User,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { ChatMessage, User as AppUser } from '../../types';
import { compressGeneralImage } from '../../utils/imageUtils';
import { uploadDataUrlToServer } from '../../lib/fileUploadService';

// Kid-friendly classroom emoji palette
const CLASSROOM_EMOJIS = ['👍', '❤️', '👏', '🌟', '🚀', '💡', '📚', '✍️', '🎯', '🏆', '😀', '🤩', '🎒', '🪐', '💯', '🎨'];

// Quick action chips
const STUDENT_PROMPTS = [
  '👋 Halo Bu Guru!',
  '❓ Mau tanya tentang tugas hari ini',
  '📖 Materi ini ada latihan soalnya?',
  '⭐ Bagaimana cara mengumpulkan poin?',
  '⏰ Kapan batas waktu pengumpulan tugas?',
];

const TEACHER_PROMPTS = [
  '📢 Halo anak-anak hebat, ada yang ingin ditanyakan?',
  '👍 Pertanyaan yang sangat bagus!',
  '✅ Tugas dan revisi sudah Ibu periksa ya.',
  '💡 Jangan lupa pelajari kembali rangkuman materi.',
  '🚀 Semangat belajar untuk kalian semua!',
];

export const FloatingChat: React.FC = () => {
  const {
    currentUser,
    currentRole,
    classes = [],
    currentClassId,
    users = [],
    userStats = {},
    chatMessages = [],
    sendChatMessage,
    toggleChatReaction,
    deleteChatMessage,
    isFirebaseSynced,
    userPresences = {},
    isUserOnline,
  } = useApp();

  // Floating Window State
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [activeChannel, setActiveChannel] = useState<'public' | 'online' | 'direct'>('public');
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [onlineRoleFilter, setOnlineRoleFilter] = useState<'all' | 'teacher' | 'student'>('all');
  const [onlineSearchQuery, setOnlineSearchQuery] = useState('');

  // Input & Upload State
  const [messageText, setMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [previewImageModal, setPreviewImageModal] = useState<string | null>(null);

  // Unread badge tracker
  const [lastReadTimestamp, setLastReadTimestamp] = useState<string>(() => new Date().toISOString());

  // Refs
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Current classroom info
  const currentClass = classes.find((c) => c.id === currentClassId) || classes[0] || { id: 'cls_none', name: 'Kelas 6E', grade: 6 };
  const classNameDisplay = currentClass ? currentClass.name : 'Kelas 6E';

  // Identify teachers and students in current class
  const classStudents = useMemo(() => {
    return users.filter(
      (u) => u.role === 'student' && (u.classIds?.includes(currentClassId) || !u.classIds || u.classIds.length === 0)
    );
  }, [users, currentClassId]);

  const classTeachers = useMemo(() => {
    return users.filter((u) => u.role === 'teacher' || u.role === 'admin');
  }, [users]);

  const homeroomTeacher = useMemo(() => {
    return classTeachers[0] || {
      uid: 'usr_guru_rahma',
      displayName: 'Teguh Firmansyah Apriliana, M.Pd',
      role: 'teacher' as const,
      avatarUrl: 'https://api.dicebear.com/7.x/bottts/svg?seed=TeguhFirmansyah&backgroundColor=b6e3f4',
    };
  }, [classTeachers]);

  const homeroomTeacherUid = homeroomTeacher.uid;
  const firstStudentUid = classStudents[0]?.uid || '';

  // For students, the direct recipient is always the homeroom teacher
  // For teachers, default selectedStudentId to the first student
  useEffect(() => {
    if (currentRole === 'student') {
      setSelectedStudentId((prev) => (prev !== homeroomTeacherUid ? homeroomTeacherUid : prev));
    } else if (currentRole === 'teacher') {
      setSelectedStudentId((prev) => (!prev && firstStudentUid ? firstStudentUid : prev));
    }
  }, [currentRole, homeroomTeacherUid, firstStudentUid]);

  // Filter messages based on active channel and direct target
  const filteredMessages = useMemo(() => {
    return chatMessages.filter((msg) => {
      if (activeChannel === 'public') {
        // Show public messages
        const isPublic = !msg.channelType || msg.channelType === 'public';
        if (!isPublic) return false;
      } else {
        // Direct messages
        if (msg.channelType !== 'direct') return false;
        if (!currentUser) return false;

        if (currentRole === 'student') {
          // As a student, show direct messages where I am sender or recipient
          const isMyDirect = msg.senderId === currentUser.uid || msg.recipientId === currentUser.uid;
          if (!isMyDirect) return false;
        } else {
          // As a teacher, show messages between teacher and the selected student
          if (!selectedStudentId) {
            const isMyDirect = msg.senderId === currentUser.uid || msg.recipientId === currentUser.uid;
            if (!isMyDirect) return false;
          } else {
            const isSelectedDirect =
              (msg.senderId === currentUser.uid && msg.recipientId === selectedStudentId) ||
              (msg.senderId === selectedStudentId && msg.recipientId === currentUser.uid);
            if (!isSelectedDirect) return false;
          }
        }
      }

      // Text search query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const textMatch = msg.text.toLowerCase().includes(q);
        const senderMatch = msg.senderName.toLowerCase().includes(q);
        return textMatch || senderMatch;
      }

      return true;
    });
  }, [
    chatMessages,
    activeChannel,
    currentClassId,
    currentUser,
    currentRole,
    homeroomTeacherUid,
    selectedStudentId,
    searchQuery,
  ]);

  // Update last read timestamp whenever chat is opened, without cyclic state updates
  useEffect(() => {
    if (isOpen && !isMinimized) {
      setLastReadTimestamp(new Date().toISOString());
    }
  }, [isOpen, isMinimized]);

  // Calculate unread messages count cleanly as derived state
  const unreadCount = useMemo(() => {
    if (isOpen && !isMinimized) return 0;
    return chatMessages.filter((m) => {
      if (currentUser && m.senderId === currentUser.uid) return false;
      return new Date(m.createdAt).getTime() > new Date(lastReadTimestamp).getTime();
    }).length;
  }, [chatMessages, isOpen, isMinimized, lastReadTimestamp, currentUser]);

  // Auto-scroll to bottom on new messages or channel switch
  useEffect(() => {
    if (isOpen && !isMinimized) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredMessages.length, isOpen, isMinimized, activeChannel, selectedStudentId]);

  if (!currentUser) return null;

  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if ((!messageText.trim() && !attachedImage) || isSending) return;

    setIsSending(true);
    const textToSend = messageText.trim();
    const imageToSend = attachedImage || undefined;

    setMessageText('');
    setAttachedImage(null);
    setShowEmojiPicker(false);

    try {
      const recipientId = activeChannel === 'direct'
        ? (currentRole === 'student' ? homeroomTeacher.uid : selectedStudentId)
        : undefined;

      let finalImageUrl = imageToSend;
      if (imageToSend && imageToSend.startsWith('data:')) {
        finalImageUrl = await uploadDataUrlToServer(imageToSend, `chat_${Date.now()}.jpg`, 'chat');
      }

      await sendChatMessage({
        text: textToSend,
        channelType: activeChannel === 'direct' ? 'direct' : 'public',
        recipientId,
        imageUrl: finalImageUrl,
      });
    } catch (err) {
      console.error('Failed to send message:', err);
    } finally {
      setIsSending(false);
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Hanya berkas gambar (JPG, PNG, WEBP) yang didukung untuk lampiran chat.');
      return;
    }

    try {
      setIsUploadingImage(true);
      const compressedDataUrl = await compressGeneralImage(file, 800, 0.8);
      setAttachedImage(compressedDataUrl);
    } catch (err) {
      console.error('Image compression failed:', err);
      alert('Gagal memproses gambar. Silakan coba gambar lain.');
    } finally {
      setIsUploadingImage(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleEmojiInsert = (emoji: string) => {
    setMessageText((prev) => prev + emoji);
    setShowEmojiPicker(false);
    textareaRef.current?.focus();
  };

  const handleQuickPromptClick = (prompt: string) => {
    setMessageText(prompt);
    textareaRef.current?.focus();
  };

  const formatMessageTime = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
      return isToday ? timeStr : `${date.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })} ${timeStr}`;
    } catch {
      return '';
    }
  };

  // Real online & offline users in the classroom based on Firestore presence heartbeats
  const { trulyOnlineUsers, offlineClassUsers } = useMemo(() => {
    if (!currentUser) return { trulyOnlineUsers: [], offlineClassUsers: [] };

    // Combine classroom members
    const allMembers = Array.from(new Map([...classTeachers, ...classStudents].map((m) => [m.uid, m])).values());

    const onlineList: Array<{
      user: AppUser;
      isCurrentUser: boolean;
      role: 'teacher' | 'student' | 'admin';
      activity: string;
      totalPoints: number;
      level: number;
      lastSeen?: number;
    }> = [];

    const offlineList: Array<{
      user: AppUser;
      isCurrentUser: boolean;
      role: 'teacher' | 'student' | 'admin';
      lastSeenText: string;
      totalPoints: number;
      level: number;
      lastSeen?: number;
    }> = [];

    allMembers.forEach((u) => {
      const isOnline = isUserOnline ? isUserOnline(u.uid) : (u.uid === currentUser.uid);
      const presence = userPresences ? userPresences[u.uid] : undefined;
      const isSelf = currentUser.uid === u.uid;
      const stats = (userStats && userStats[u.uid]) || { totalPoints: 0, level: 1 };

      if (isOnline) {
        onlineList.push({
          user: u,
          isCurrentUser: isSelf,
          role: (u.role as any) || 'student',
          activity: isSelf ? 'Sedang Aktif (Anda)' : (presence?.activity || 'Sedang Aktif di Aplikasi'),
          totalPoints: stats.totalPoints || 0,
          level: stats.level || 1,
          lastSeen: presence?.lastSeen,
        });
      } else {
        let lastSeenText = 'Offline';
        if (presence?.lastSeen) {
          const diffMinutes = Math.floor((Date.now() - presence.lastSeen) / 60000);
          if (diffMinutes < 1) lastSeenText = 'Baru saja keluar';
          else if (diffMinutes < 60) lastSeenText = `Aktif ${diffMinutes}m lalu`;
          else {
            const diffHours = Math.floor(diffMinutes / 60);
            if (diffHours < 24) lastSeenText = `Aktif ${diffHours}j lalu`;
            else lastSeenText = 'Offline';
          }
        }
        offlineList.push({
          user: u,
          isCurrentUser: isSelf,
          role: (u.role as any) || 'student',
          lastSeenText,
          totalPoints: stats.totalPoints || 0,
          level: stats.level || 1,
          lastSeen: presence?.lastSeen,
        });
      }
    });

    // Sort online: current user first, then teachers, then students alphabetically
    onlineList.sort((a, b) => {
      if (a.isCurrentUser) return -1;
      if (b.isCurrentUser) return 1;
      if (a.role === 'teacher' && b.role !== 'teacher') return -1;
      if (b.role === 'teacher' && a.role !== 'teacher') return 1;
      return a.user.displayName.localeCompare(b.user.displayName);
    });

    // Sort offline: teachers first, then students alphabetically
    offlineList.sort((a, b) => {
      if (a.role === 'teacher' && b.role !== 'teacher') return -1;
      if (b.role === 'teacher' && a.role !== 'teacher') return 1;
      return a.user.displayName.localeCompare(b.user.displayName);
    });

    return { trulyOnlineUsers: onlineList, offlineClassUsers: offlineList };
  }, [currentUser, classTeachers, classStudents, isUserOnline, userPresences, userStats]);

  // Alias for backward compatibility
  const onlineUsers = trulyOnlineUsers;

  // Filtered online users based on search and role filter
  const filteredOnlineUsers = useMemo(() => {
    return trulyOnlineUsers.filter((item) => {
      if (onlineRoleFilter === 'teacher' && item.role !== 'teacher' && item.role !== 'admin') return false;
      if (onlineRoleFilter === 'student' && item.role !== 'student') return false;

      if (onlineSearchQuery.trim()) {
        const q = onlineSearchQuery.toLowerCase().trim();
        const matchName = item.user.displayName.toLowerCase().includes(q);
        const matchNis = item.user.studentNumber?.toLowerCase().includes(q);
        const matchAbsent = item.user.absentNumber?.toString().includes(q);
        return matchName || matchNis || matchAbsent;
      }
      return true;
    });
  }, [trulyOnlineUsers, onlineRoleFilter, onlineSearchQuery]);

  // Filtered offline users based on search and role filter
  const filteredOfflineUsers = useMemo(() => {
    return offlineClassUsers.filter((item) => {
      if (onlineRoleFilter === 'teacher' && item.role !== 'teacher' && item.role !== 'admin') return false;
      if (onlineRoleFilter === 'student' && item.role !== 'student') return false;

      if (onlineSearchQuery.trim()) {
        const q = onlineSearchQuery.toLowerCase().trim();
        const matchName = item.user.displayName.toLowerCase().includes(q);
        const matchNis = item.user.studentNumber?.toLowerCase().includes(q);
        const matchAbsent = item.user.absentNumber?.toString().includes(q);
        return matchName || matchNis || matchAbsent;
      }
      return true;
    });
  }, [offlineClassUsers, onlineRoleFilter, onlineSearchQuery]);

  const handleGreetUser = (targetUser: AppUser) => {
    setActiveChannel('public');
    setMessageText(`@${targetUser.displayName} Halo! 👋 `);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 150);
  };

  const handleStartDirectChat = (targetUser: AppUser) => {
    setSelectedStudentId(targetUser.uid);
    setActiveChannel('direct');
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 150);
  };

  // Selected student details for teacher view in Direct Messages
  const selectedStudent = classStudents.find((s) => s.uid === selectedStudentId);

  return (
    <>
      {/* Floating Chat Trigger Button */}
      <div className="fixed bottom-20 right-4 sm:bottom-6 sm:right-6 z-40">
        <motion.button
          id="btn-floating-chat-trigger"
          type="button"
          onClick={() => {
            setIsOpen((prev) => !prev);
            setIsMinimized(false);
          }}
          whileHover={{ scale: 1.06 }}
          whileTap={{ scale: 0.94 }}
          className={`relative group flex items-center justify-center p-3.5 sm:p-4 rounded-full shadow-2xl transition-all duration-300 cursor-pointer ${
            isOpen && !isMinimized
              ? 'bg-slate-900 text-white shadow-slate-900/30'
              : 'bg-gradient-to-tr from-indigo-600 via-indigo-600 to-purple-600 text-white shadow-indigo-500/40 hover:shadow-indigo-500/60 ring-4 ring-indigo-100'
          }`}
          aria-label="Buka Chat Room Kelas"
          title="Ruang Diskusi & User Online"
        >
          {isOpen && !isMinimized ? (
            <X className="w-6 h-6 transition-transform duration-200" />
          ) : (
            <>
              <MessageCircle className="w-6 h-6 transition-transform group-hover:rotate-12 duration-200" />
              {/* Animated ping dot for active indicator */}
              <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-3.5 w-3.5 bg-emerald-500 border-2 border-white" />
              </span>
            </>
          )}

          {/* Unread badge count */}
          {!isOpen && unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1.5 -left-1.5 bg-rose-500 text-white text-[11px] font-black rounded-full min-w-5 h-5 px-1 flex items-center justify-center border-2 border-white shadow-md"
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.span>
          )}

          {/* Tooltip hint on hover (Desktop) */}
          <span className="hidden sm:group-hover:flex absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-slate-900/90 backdrop-blur-xs text-white text-xs font-semibold px-3 py-1.5 rounded-xl whitespace-nowrap shadow-lg items-center gap-1.5 pointer-events-none">
            <Sparkles className="w-3.5 h-3.5 text-yellow-300" />
            <span>Chat Room {classNameDisplay}</span>
          </span>
        </motion.button>
      </div>

      {/* Floating Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            id="floating-chat-room-container"
            initial={{ opacity: 0, y: 30, scale: 0.92 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: 1,
              height: isMinimized ? 'auto' : undefined,
            }}
            exit={{ opacity: 0, y: 30, scale: 0.92 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            className={`fixed bottom-20 right-3 left-3 sm:left-auto sm:right-6 sm:bottom-24 z-50 sm:w-[420px] md:w-[440px] bg-white rounded-3xl shadow-2xl border border-slate-200/90 flex flex-col overflow-hidden transition-all duration-200 ${
              isMinimized ? 'h-auto max-h-16' : 'h-[580px] max-h-[calc(100vh-120px)]'
            }`}
          >
            {/* Header */}
            <div className="bg-gradient-to-r from-indigo-600 via-indigo-700 to-purple-700 text-white p-3.5 sm:p-4 shrink-0 flex items-center justify-between border-b border-indigo-700/50 shadow-sm">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-10 h-10 rounded-2xl bg-white/15 backdrop-blur-xs flex items-center justify-center shrink-0 border border-white/20">
                  {activeChannel === 'public' ? (
                    <Users className="w-5 h-5 text-white" />
                  ) : activeChannel === 'online' ? (
                    <UserCheck className="w-5 h-5 text-emerald-300" />
                  ) : (
                    <GraduationCap className="w-5 h-5 text-yellow-300" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="font-bold text-sm text-white truncate font-display">
                      {activeChannel === 'public'
                        ? `Diskusi ${classNameDisplay}`
                        : activeChannel === 'online'
                        ? `User Online (${onlineUsers.length})`
                        : `Pesan: ${selectedStudent?.displayName || homeroomTeacher.displayName}`}
                    </h3>
                  </div>
                </div>
              </div>

              {/* Header Action Buttons */}
              <div className="flex items-center gap-1 shrink-0">
                <button
                  id="btn-chat-search-toggle"
                  type="button"
                  onClick={() => setShowSearch((prev) => !prev)}
                  className={`p-1.5 rounded-xl transition-colors ${
                    showSearch ? 'bg-white/25 text-white' : 'text-indigo-200 hover:text-white hover:bg-white/10'
                  }`}
                  title="Cari Pesan"
                  aria-label="Cari Pesan"
                >
                  <Search className="w-4 h-4" />
                </button>

                <button
                  id="btn-chat-minimize"
                  type="button"
                  onClick={() => setIsMinimized((prev) => !prev)}
                  className="p-1.5 rounded-xl text-indigo-200 hover:text-white hover:bg-white/10 transition-colors"
                  title={isMinimized ? 'Perbesar' : 'Minimalkan'}
                  aria-label="Minimalkan Chat"
                >
                  <Minus className="w-4 h-4" />
                </button>

                <button
                  id="btn-chat-close"
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="p-1.5 rounded-xl text-indigo-200 hover:text-white hover:bg-white/10 transition-colors"
                  title="Tutup Chat"
                  aria-label="Tutup Chat"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* If NOT minimized, show full chat content */}
            {!isMinimized && (
              <>
                {/* Search Bar (Expandable) */}
                {showSearch && (
                  <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
                    <Search className="w-4 h-4 text-slate-400 shrink-0" />
                    <input
                      id="input-chat-search"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Cari pesan atau nama..."
                      className="w-full text-xs bg-transparent border-none outline-none text-slate-700 placeholder-slate-400"
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="text-slate-400 hover:text-slate-600 text-xs"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}

                {/* Channel Switcher Tabs */}
                <div className="px-3 pt-2.5 pb-1.5 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
                  <div className="grid grid-cols-3 p-0.5 bg-slate-200/70 rounded-xl w-full text-xs font-semibold gap-0.5">
                    <button
                      id="tab-channel-public"
                      type="button"
                      onClick={() => setActiveChannel('public')}
                      className={`py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        activeChannel === 'public'
                          ? 'bg-white text-indigo-600 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Users className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">Diskusi</span>
                    </button>

                    <button
                      id="tab-channel-direct"
                      type="button"
                      onClick={() => setActiveChannel('direct')}
                      className={`py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        activeChannel === 'direct'
                          ? 'bg-white text-indigo-600 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <MessageSquare className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{currentRole === 'student' ? 'Tanya Guru' : 'Pesan Siswa'}</span>
                    </button>

                    <button
                      id="tab-channel-online"
                      type="button"
                      onClick={() => setActiveChannel('online')}
                      className={`py-1.5 px-2 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer ${
                        activeChannel === 'online'
                          ? 'bg-white text-emerald-600 shadow-xs font-bold'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <span className="relative flex h-2 w-2 shrink-0">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                      </span>
                      <span className="truncate">Online</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold shrink-0 ${
                          activeChannel === 'online'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-300/70 text-slate-700'
                        }`}
                      >
                        {trulyOnlineUsers.length}
                      </span>
                    </button>
                  </div>
                </div>

                {/* View 1: User Online View */}
                {activeChannel === 'online' ? (
                  <div className="flex-1 flex flex-col min-h-0 bg-slate-50/50">
                    {/* Search & Role Filter Header */}
                    <div className="p-3 bg-white border-b border-slate-200 space-y-2.5 shrink-0">
                      {/* Search Input */}
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                        <input
                          id="input-search-online-users"
                          type="text"
                          value={onlineSearchQuery}
                          onChange={(e) => setOnlineSearchQuery(e.target.value)}
                          placeholder="Cari nama siswa atau guru..."
                          className="w-full text-xs pl-8 pr-7 py-2 bg-slate-100 hover:bg-slate-150 focus:bg-white text-slate-800 placeholder-slate-400 rounded-xl outline-none border border-transparent focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all"
                        />
                        {onlineSearchQuery && (
                          <button
                            type="button"
                            onClick={() => setOnlineSearchQuery('')}
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      {/* Filter Role Badges */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setOnlineRoleFilter('all')}
                            className={`px-2 py-1 rounded-lg font-semibold text-[11px] transition-all cursor-pointer ${
                              onlineRoleFilter === 'all'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Semua ({trulyOnlineUsers.length + offlineClassUsers.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setOnlineRoleFilter('teacher')}
                            className={`px-2 py-1 rounded-lg font-semibold text-[11px] transition-all cursor-pointer ${
                              onlineRoleFilter === 'teacher'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Guru ({classTeachers.length})
                          </button>
                          <button
                            type="button"
                            onClick={() => setOnlineRoleFilter('student')}
                            className={`px-2 py-1 rounded-lg font-semibold text-[11px] transition-all cursor-pointer ${
                              onlineRoleFilter === 'student'
                                ? 'bg-indigo-600 text-white shadow-xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Siswa ({classStudents.length})
                          </button>
                        </div>

                        <div className="flex items-center gap-1 text-[11px] text-emerald-600 font-bold shrink-0">
                          <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
                          </span>
                          <span>{trulyOnlineUsers.length} Online</span>
                        </div>
                      </div>
                    </div>

                    {/* Online Users List Area */}
                    <div id="online-users-scroll-area" className="flex-1 overflow-y-auto p-3 space-y-3">
                      {/* Section 1: Truly Online Users */}
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-emerald-500" />
                            Sedang Online ({filteredOnlineUsers.length})
                          </span>
                          <span className="text-[10px] text-emerald-600 font-semibold">Realtime Presence</span>
                        </div>

                        {filteredOnlineUsers.length === 0 ? (
                          <div className="bg-white rounded-xl p-4 text-center border border-slate-200/60 shadow-xs">
                            <p className="text-xs font-semibold text-slate-600">Tidak ada user online yang cocok dengan filter.</p>
                          </div>
                        ) : (
                          filteredOnlineUsers.map((item) => (
                            <div
                              key={item.user.uid}
                              className={`flex items-center justify-between gap-2.5 p-2.5 rounded-xl transition-all ${
                                item.isCurrentUser
                                  ? 'bg-indigo-50/70 border border-indigo-200/80 shadow-xs'
                                  : 'bg-white hover:bg-slate-50 border border-slate-200/70 shadow-xs'
                              }`}
                            >
                              {/* Avatar with live pulse dot */}
                              <div className="relative shrink-0">
                                <img
                                  src={item.user.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=avatar'}
                                  alt={item.user.displayName}
                                  className="w-10 h-10 rounded-full object-cover bg-white border border-slate-200 shadow-xs"
                                  referrerPolicy="no-referrer"
                                />
                                <span className="absolute bottom-0 right-0 flex h-3 w-3">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                                  <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 ring-2 ring-white" />
                                </span>
                              </div>

                              {/* User details */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-bold text-slate-800 truncate">
                                    {item.user.displayName}
                                  </span>

                                  {item.isCurrentUser && (
                                    <span className="text-[9px] bg-indigo-600 text-white font-extrabold px-1.5 py-0.2 rounded-md">
                                      Anda
                                    </span>
                                  )}

                                  {item.role === 'teacher' || item.role === 'admin' ? (
                                    <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1.5 py-0.2 rounded-md border border-amber-200/60 flex items-center gap-0.5">
                                      <Sparkles className="w-2.5 h-2.5 text-amber-600" />
                                      Wali Kelas
                                    </span>
                                  ) : (
                                    <span className="text-[9px] bg-slate-100 text-slate-600 font-medium px-1.5 py-0.2 rounded-md">
                                      Absen #{item.user.absentNumber || '-'}
                                    </span>
                                  )}
                                </div>

                                {/* Activity & Status */}
                                <div className="flex items-center gap-1.5 mt-0.5 text-[10px]">
                                  <span className="inline-flex items-center gap-1 text-emerald-600 font-semibold shrink-0">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                                    Online Sekarang
                                  </span>
                                  <span className="text-slate-300">•</span>
                                  <span className="text-slate-500 truncate" title={item.activity}>
                                    {item.activity}
                                  </span>
                                </div>
                              </div>

                              {/* Quick Actions */}
                              <div className="shrink-0 flex items-center gap-1">
                                {!item.isCurrentUser ? (
                                  <>
                                    <button
                                      type="button"
                                      onClick={() => handleGreetUser(item.user)}
                                      className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                                      title={`Sapa ${item.user.displayName} di Diskusi Kelas`}
                                    >
                                      <span>Sapa 👋</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleStartDirectChat(item.user)}
                                      className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                      title="Kirim Pesan Pribadi"
                                    >
                                      <MessageSquare className="w-4 h-4" />
                                    </button>
                                  </>
                                ) : (
                                  <span className="text-[10px] text-indigo-600 font-bold bg-indigo-100/70 px-2 py-1 rounded-lg">
                                    Aktif
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                        )}
                      </div>

                      {/* Informative helper if user is online alone */}
                      {trulyOnlineUsers.length === 1 && trulyOnlineUsers[0].isCurrentUser && (
                        <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl p-3 text-[11px] text-emerald-900 flex items-start gap-2.5">
                          <span className="text-base leading-none shrink-0">💡</span>
                          <div className="space-y-1">
                            <p className="font-bold text-emerald-950">Anda sedang online sendiri saat ini</p>
                            <p className="text-emerald-800 leading-relaxed">
                              Sistem kehadiran online terhubung secara nyata ke database Firebase. Buka aplikasi di jendela <strong>Incognito</strong> atau browser lain lalu login dengan akun Siswa atau Guru lain untuk menguji obrolan realtime dan melihat indikator online bertambah secara langsung!
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Section 2: Offline Members */}
                      <div className="space-y-1.5 pt-2">
                        <div className="flex items-center justify-between px-1">
                          <span className="text-[11px] font-bold text-slate-500 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-slate-300" />
                            Anggota Kelas Lainnya ({filteredOfflineUsers.length} Offline)
                          </span>
                        </div>

                        {filteredOfflineUsers.length === 0 ? (
                          <div className="bg-white/60 rounded-xl p-3 text-center border border-slate-200/40">
                            <p className="text-[11px] text-slate-400">Semua anggota kelas sedang online!</p>
                          </div>
                        ) : (
                          filteredOfflineUsers.map((item) => (
                            <div
                              key={item.user.uid}
                              className="flex items-center justify-between gap-2.5 p-2 rounded-xl bg-white/70 hover:bg-white border border-slate-200/50 transition-colors"
                            >
                              {/* Avatar with offline dot */}
                              <div className="relative shrink-0">
                                <img
                                  src={item.user.avatarUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=avatar'}
                                  alt={item.user.displayName}
                                  className="w-8 h-8 rounded-full object-cover bg-slate-100 border border-slate-200 grayscale-30"
                                  referrerPolicy="no-referrer"
                                />
                                <span className="absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full bg-slate-400 ring-1 ring-white" />
                              </div>

                              {/* User details */}
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-xs font-medium text-slate-700 truncate">
                                    {item.user.displayName}
                                  </span>
                                  {item.role === 'teacher' || item.role === 'admin' ? (
                                    <span className="text-[9px] bg-slate-100 text-slate-600 font-semibold px-1.5 py-0.2 rounded-md">
                                      Wali Kelas
                                    </span>
                                  ) : (
                                    <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.2 rounded-md">
                                      Absen #{item.user.absentNumber || '-'}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[10px] text-slate-400">
                                  {item.lastSeenText}
                                </div>
                              </div>

                              {/* Quick Action to send direct message */}
                              <div className="shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleStartDirectChat(item.user)}
                                  className="px-2 py-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg text-[10px] font-semibold transition-colors flex items-center gap-1 cursor-pointer border border-slate-200"
                                  title="Tinggalkan pesan pribadi"
                                >
                                  <MessageSquare className="w-3 h-3" />
                                  <span>Pesan</span>
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Footer notice */}
                    <div className="p-2.5 bg-white border-t border-slate-200 text-[11px] text-slate-500 flex items-center justify-between shrink-0">
                      <span className="flex items-center gap-1 text-slate-600">
                        <Users className="w-3.5 h-3.5 text-indigo-600" />
                        Status online otomatis diperbarui via heartbeat Firestore.
                      </span>
                      <button
                        type="button"
                        onClick={() => setActiveChannel('public')}
                        className="text-xs font-bold text-indigo-600 hover:underline cursor-pointer"
                      >
                        Buka Diskusi →
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* If in Direct Message mode: Top back navigation bar & student selector */}
                    {activeChannel === 'direct' && (
                      <div className="px-3.5 py-1.5 bg-indigo-50/90 border-b border-indigo-100 flex items-center justify-between gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setActiveChannel('online')}
                          className="flex items-center gap-1 text-xs font-bold text-indigo-700 hover:text-indigo-900 cursor-pointer"
                        >
                          <ArrowLeft className="w-3.5 h-3.5" />
                          <span>Kembali ke User Online</span>
                        </button>
                        <span className="text-[11px] text-indigo-900 font-medium truncate">
                          {currentRole === 'teacher'
                            ? `Pesan: ${selectedStudent?.displayName || 'Pilih Siswa'}`
                            : `Pesan: ${homeroomTeacher.displayName}`}
                        </span>
                      </div>
                    )}

                    {/* If Teacher in Direct Message mode: Student Selector */}
                    {activeChannel === 'direct' && currentRole === 'teacher' && (
                      <div className="px-3.5 py-2 bg-indigo-50/70 border-b border-indigo-100 flex items-center gap-2 shrink-0">
                        <span className="text-[11px] font-bold text-indigo-900 shrink-0">Pilih Siswa:</span>
                        <select
                          id="select-chat-direct-student"
                          value={selectedStudentId}
                          onChange={(e) => setSelectedStudentId(e.target.value)}
                          className="text-xs bg-white border border-indigo-200 rounded-lg px-2 py-1 text-slate-800 font-medium w-full outline-indigo-500 focus:ring-1 focus:ring-indigo-400"
                        >
                          {classStudents.map((std) => (
                            <option key={std.uid} value={std.uid}>
                              {std.absentNumber ? `No. ${std.absentNumber} - ` : ''}
                              {std.displayName} ({std.studentNumber || 'Siswa'})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Quick Prompts Chips Bar (For public or direct) */}
                    {activeChannel === 'public' && (
                      <div className="px-3 py-1.5 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto no-scrollbar shrink-0">
                        <span className="text-[10px] text-slate-400 uppercase tracking-wider font-bold shrink-0">
                          Cepat:
                        </span>
                        {(currentRole === 'student' ? STUDENT_PROMPTS : TEACHER_PROMPTS).map((prompt, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => handleQuickPromptClick(prompt)}
                            className="text-[11px] bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200/80 rounded-full px-2.5 py-1 whitespace-nowrap transition-colors shrink-0 font-medium"
                          >
                            {prompt}
                          </button>
                        ))}
                      </div>
                    )}

                {/* Message Stream Area */}
                <div
                  id="chat-messages-scroll-area"
                  className="flex-1 p-3.5 overflow-y-auto space-y-3.5 bg-gradient-to-b from-slate-50/50 to-white"
                >
                  {filteredMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center mb-2.5">
                        <MessageSquare className="w-6 h-6" />
                      </div>
                      <p className="text-xs font-semibold text-slate-600 mb-1">Belum ada pesan di sini</p>
                      <p className="text-[11px] text-slate-400 max-w-xs">
                        {activeChannel === 'public'
                          ? `Jadilah yang pertama menyapa teman-teman dan guru di ${classNameDisplay}!`
                          : currentRole === 'student'
                          ? 'Mulai konsultasi atau ajukan pertanyaan kepada Ibu Guru secara privat.'
                          : `Mulai obrolan privat dengan siswa ${selectedStudent?.displayName || ''}.`}
                      </p>
                    </div>
                  ) : (
                    filteredMessages.map((msg) => {
                      const isMe = currentUser.uid === msg.senderId;
                      const isTeacher = msg.senderRole === 'teacher' || msg.senderRole === 'admin';

                      return (
                        <div
                          key={msg.id}
                          className={`flex items-end gap-2 group ${isMe ? 'justify-end' : 'justify-start'}`}
                        >
                          {/* Left Avatar for Others */}
                          {!isMe && (
                            <img
                              src={users?.find(u => u.uid === msg.senderId)?.avatarUrl || msg.senderAvatar || 'https://api.dicebear.com/7.x/bottts/svg?seed=avatar'}
                              alt={msg.senderName}
                              className="w-7 h-7 rounded-full object-cover shrink-0 border border-slate-200 bg-white"
                              referrerPolicy="no-referrer"
                            />
                          )}

                          {/* Message Bubble Container */}
                          <div className={`max-w-[78%] flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                            {/* Sender Name & Role Badge (For Others) */}
                            {!isMe && (
                              <div className="flex items-center gap-1.5 mb-1 px-1">
                                <span className="text-[11px] font-bold text-slate-700 truncate">
                                  {msg.senderName}
                                </span>
                                {isTeacher ? (
                                  <span className="text-[9px] font-extrabold bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded-full flex items-center gap-0.5 border border-indigo-200">
                                    <Sparkles className="w-2.5 h-2.5 text-indigo-600" />
                                    Guru
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-semibold bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-full">
                                    Siswa
                                  </span>
                                )}
                              </div>
                            )}

                            {/* Bubble Content */}
                            <div
                              className={`relative px-3.5 py-2.5 rounded-2xl text-xs leading-relaxed shadow-xs break-words ${
                                isMe
                                  ? 'bg-gradient-to-tr from-indigo-600 to-indigo-700 text-white rounded-tr-xs'
                                  : isTeacher
                                  ? 'bg-indigo-50/80 border border-indigo-100 text-slate-800 rounded-tl-xs'
                                  : 'bg-slate-100 text-slate-800 rounded-tl-xs'
                              }`}
                            >
                              {/* Attached Image (if any) */}
                              {msg.imageUrl && (
                                <div className="mb-2 overflow-hidden rounded-xl cursor-pointer border border-black/10">
                                  <img
                                    src={msg.imageUrl}
                                    alt="Lampiran chat"
                                    className="max-h-48 w-auto rounded-lg object-cover hover:opacity-95 transition-opacity"
                                    onClick={() => setPreviewImageModal(msg.imageUrl || null)}
                                    referrerPolicy="no-referrer"
                                  />
                                </div>
                              )}

                              {/* Text */}
                              <p className="whitespace-pre-wrap selection:bg-white/20">{msg.text}</p>

                              {/* Timestamp and Delivery check */}
                              <div
                                className={`flex items-center justify-end gap-1 mt-1 text-[10px] ${
                                  isMe ? 'text-indigo-200' : 'text-slate-400'
                                }`}
                              >
                                <span>{formatMessageTime(msg.createdAt)}</span>
                                {isMe && <CheckCheck className="w-3.5 h-3.5 text-indigo-300" />}
                              </div>
                            </div>

                            {/* Reactions Badges */}
                            {msg.reactions && Object.keys(msg.reactions).length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1 px-1">
                                {Object.entries(msg.reactions).map(([emoji, uids]) => {
                                  const userIds = (Array.isArray(uids) ? uids : []) as string[];
                                  if (userIds.length === 0) return null;
                                  const hasReacted = userIds.includes(currentUser.uid);

                                  return (
                                    <button
                                      key={emoji}
                                      type="button"
                                      onClick={() => toggleChatReaction(msg.id, emoji)}
                                      className={`text-[10px] px-2 py-0.5 rounded-full border transition-all flex items-center gap-1 ${
                                        hasReacted
                                          ? 'bg-indigo-100 border-indigo-300 text-indigo-800 font-bold scale-105'
                                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                      }`}
                                    >
                                      <span>{emoji}</span>
                                      <span>{userIds.length}</span>
                                    </button>
                                  );
                                })}
                              </div>
                            )}

                            {/* Hover Actions: Quick Reaction & Delete */}
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 mt-1 px-1">
                              {/* Quick Emoji Toggles */}
                              {['👍', '❤️', '👏', '🌟'].map((em) => (
                                <button
                                  key={em}
                                  type="button"
                                  onClick={() => toggleChatReaction(msg.id, em)}
                                  className="text-xs hover:scale-125 transition-transform p-0.5"
                                  title={`Beri reaksi ${em}`}
                                >
                                  {em}
                                </button>
                              ))}

                              {/* Delete message option (Guru can delete any, student can delete own) */}
                              {(currentRole === 'teacher' || isMe) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm('Hapus pesan ini?')) {
                                      deleteChatMessage(msg.id);
                                    }
                                  }}
                                  className="text-slate-400 hover:text-rose-500 transition-colors p-1 ml-1"
                                  title="Hapus pesan"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Attached Image Preview before Sending */}
                {attachedImage && (
                  <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <img
                        src={attachedImage}
                        alt="Preview upload"
                        className="w-12 h-12 rounded-lg object-cover border border-slate-300"
                      />
                      <div>
                        <p className="text-xs font-semibold text-slate-700">Gambar siap dikirim</p>
                        <p className="text-[10px] text-slate-400">Terkompresi otomatis</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAttachedImage(null)}
                      className="p-1 rounded-full text-slate-400 hover:text-rose-500 hover:bg-slate-200 transition-colors"
                      title="Batal lampirkan"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                )}

                {/* Emoji Palette Popover */}
                {showEmojiPicker && (
                  <div className="p-2.5 bg-white border-t border-slate-200 grid grid-cols-8 gap-1.5">
                    {CLASSROOM_EMOJIS.map((em) => (
                      <button
                        key={em}
                        type="button"
                        onClick={() => handleEmojiInsert(em)}
                        className="text-lg p-1.5 rounded-xl hover:bg-indigo-50 hover:scale-120 transition-all flex items-center justify-center cursor-pointer"
                      >
                        {em}
                      </button>
                    ))}
                  </div>
                )}

                {/* Bottom Input Form */}
                <form
                  onSubmit={handleSendMessage}
                  className="p-2.5 sm:p-3 bg-white border-t border-slate-200 flex items-center gap-1.5 shrink-0"
                >
                  {/* Image Attachment Trigger */}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileSelect}
                  />
                  <button
                    id="btn-chat-attach-image"
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploadingImage}
                    className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors cursor-pointer disabled:opacity-50"
                    title="Lampirkan Foto / Gambar Tugas"
                    aria-label="Lampirkan Gambar"
                  >
                    <ImageIcon className="w-5 h-5" />
                  </button>

                  {/* Emoji Picker Trigger */}
                  <button
                    id="btn-chat-emoji-toggle"
                    type="button"
                    onClick={() => setShowEmojiPicker((prev) => !prev)}
                    className={`p-2 rounded-xl transition-colors cursor-pointer ${
                      showEmojiPicker ? 'text-indigo-600 bg-indigo-50' : 'text-slate-400 hover:text-indigo-600 hover:bg-indigo-50'
                    }`}
                    title="Pilih Emoji"
                    aria-label="Pilih Emoji"
                  >
                    <Smile className="w-5 h-5" />
                  </button>

                  {/* Textarea Input */}
                  <textarea
                    ref={textareaRef}
                    id="input-chat-message"
                    rows={1}
                    value={messageText}
                    onChange={(e) => setMessageText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      activeChannel === 'public'
                        ? 'Tulis pesan untuk kelas...'
                        : currentRole === 'student'
                        ? 'Tanya sesuatu ke Ibu Guru...'
                        : 'Balas pesan siswa...'
                    }
                    className="flex-1 text-xs sm:text-sm bg-slate-100 hover:bg-slate-150 focus:bg-white text-slate-800 placeholder-slate-400 rounded-2xl px-3.5 py-2 outline-none border border-transparent focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-all resize-none max-h-24"
                  />

                  {/* Send Button */}
                  <button
                    id="btn-chat-send"
                    type="submit"
                    disabled={(!messageText.trim() && !attachedImage) || isSending}
                    className="p-2.5 rounded-2xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 text-white shadow-md shadow-indigo-500/20 transition-all duration-200 cursor-pointer disabled:cursor-not-allowed shrink-0"
                    title="Kirim Pesan (Enter)"
                    aria-label="Kirim Pesan"
                  >
                    <Send className="w-4 h-4" />
                  </button>
                </form>

                {/* Footer Etiquette Reminder */}
                <div className="px-3 py-1 bg-slate-50 border-t border-slate-150 text-[10px] text-slate-400 text-center font-medium">
                  🌟 Ruang diskusi positif: gunakan sapaan dan bahasa yang santun.
                </div>
              </>
            )}
          </>
        )}
      </motion.div>
    )}
  </AnimatePresence>

      {/* Image Zoom Preview Modal */}
      {previewImageModal && (
        <div
          className="fixed inset-0 z-60 bg-slate-900/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewImageModal(null)}
        >
          <div className="relative max-w-2xl max-h-[85vh] bg-transparent flex flex-col items-center">
            <button
              type="button"
              onClick={() => setPreviewImageModal(null)}
              className="absolute -top-10 right-0 text-white hover:text-slate-300 p-1"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewImageModal}
              alt="Preview besar"
              className="max-w-full max-h-[80vh] rounded-2xl shadow-2xl object-contain"
              referrerPolicy="no-referrer"
            />
          </div>
        </div>
      )}
    </>
  );
};
