import React, { useState, useRef } from 'react';
import {
  X,
  UserPlus,
  FileSpreadsheet,
  Download,
  Upload,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Users,
  Trash2,
  FileText,
  ClipboardPaste,
  Camera,
  Sliders,
  Check,
  Crop,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  downloadStudentExcelTemplate,
  downloadStudentCsvTemplate,
  analyzeExcelFile,
  generateStudentsFromMatrix,
  ExcelWorkbookAnalysis,
  ParsedStudentRow,
} from '../../utils/excelImport';
import { ImageCropModal } from '../common/ImageCropModal';
import { uploadDataUrlToServer } from '../../lib/fileUploadService';

interface TeacherStudentInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

export const TeacherStudentInputModal: React.FC<TeacherStudentInputModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const { classes, currentClassId, provisionStudent, provisionMultipleStudents } = useApp();

  const [activeMode, setActiveMode] = useState<'manual' | 'excel' | 'paste'>('manual');
  const [selectedClassId, setSelectedClassId] = useState<string>(currentClassId);

  // Manual Form State
  const [displayName, setDisplayName] = useState('');
  const [absentNumber, setAbsentNumber] = useState<number | ''>('');
  const [studentNumber, setStudentNumber] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('123456');
  const [email, setEmail] = useState('');
  const [avatarUrl, setAvatarUrl] = useState('');
  const [manualError, setManualError] = useState('');
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);

  // Excel / CSV File Import State
  const [isDragging, setIsDragging] = useState(false);
  const [parsedRows, setParsedRows] = useState<ParsedStudentRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [isLoadingFile, setIsLoadingFile] = useState(false);
  const [importError, setImportError] = useState('');
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [workbookAnalysis, setWorkbookAnalysis] = useState<ExcelWorkbookAnalysis | null>(null);
  const [activeSheet, setActiveSheet] = useState<string>('');
  const [nameColIdx, setNameColIdx] = useState<number>(-1);
  const [absentColIdx, setAbsentColIdx] = useState<number>(-1);
  const [nisColIdx, setNisColIdx] = useState<number>(-1);
  const [emailColIdx, setEmailColIdx] = useState<number>(-1);
  const [dataStartRowIdx, setDataStartRowIdx] = useState<number>(1);

  // Paste Text Mode State
  const [pastedText, setPastedText] = useState('');
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [cropSourceImage, setCropSourceImage] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const currentClass = classes.find((c) => c.id === selectedClassId) || classes[0] || { id: 'cls_none', name: 'Belum Ada Kelas', grade: 6 };

  // Handle manual photo select
  const handleManualPhotoSelect = async (file: File) => {
    try {
      if (!file.type.startsWith('image/')) {
        setManualError('Format berkas harus berupa foto / gambar (JPG, PNG, atau WEBP).');
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => {
        setManualError('Gagal membaca berkas gambar.');
      };
      reader.onload = (e) => {
        const rawDataUrl = e.target?.result as string;
        setCropSourceImage(rawDataUrl);
        setIsCropModalOpen(true);
      };
      reader.readAsDataURL(file);
    } catch (err: any) {
      setManualError(err.message || 'Gagal memproses foto.');
    }
  };

  // Handle Manual Submit
  const handleManualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setManualError('');

    if (!displayName.trim()) {
      setManualError('Nama lengkap siswa wajib diisi');
      return;
    }

    const nis = studentNumber.trim() || `2024${String(absentNumber || 1).padStart(3, '0')}`;
    const absent = typeof absentNumber === 'number' ? absentNumber : 1;
    const cleanUsername = username.trim() || (nis ? `siswa_${nis}` : displayName.toLowerCase().replace(/[^a-z0-9]/g, '') + absent);

    let finalAvatarUrl = avatarUrl.trim() || undefined;
    if (finalAvatarUrl && finalAvatarUrl.startsWith('data:')) {
      finalAvatarUrl = await uploadDataUrlToServer(finalAvatarUrl, `${cleanUsername}_photo.jpg`, 'avatars');
    }

    provisionStudent({
      displayName: displayName.trim(),
      studentNumber: nis,
      absentNumber: absent,
      classId: selectedClassId,
      username: cleanUsername,
      password: password.trim() || '123456',
      email: email.trim() || undefined,
      avatarUrl: finalAvatarUrl,
    });

    // Reset Form
    setDisplayName('');
    setAbsentNumber('');
    setStudentNumber('');
    setUsername('');
    setPassword('123456');
    setEmail('');
    setAvatarUrl('');
    if (onSuccess) onSuccess();
    onClose();
  };

  // Handle File Upload & Analysis
  const handleFileChange = async (file: File, sheetOverride?: string) => {
    setImportError('');
    setIsLoadingFile(true);
    setFileName(file.name);
    setCurrentFile(file);

    try {
      const analysis = await analyzeExcelFile(file, sheetOverride);
      setWorkbookAnalysis(analysis);
      setActiveSheet(analysis.selectedSheet);
      setNameColIdx(analysis.detectedMapping.nameColIdx);
      setAbsentColIdx(analysis.detectedMapping.absentColIdx);
      setNisColIdx(analysis.detectedMapping.nisColIdx);
      setEmailColIdx(analysis.detectedMapping.emailColIdx);
      setDataStartRowIdx(analysis.detectedMapping.dataStartRowIndex);
      setParsedRows(analysis.parsedStudents);

      if (analysis.parsedStudents.length === 0) {
        if (analysis.detectedMapping.nameColIdx === -1) {
          setImportError('Nama siswa belum terdeteksi otomatis. Silakan tentukan "Kolom Nama Siswa" pada dropdown pengaturan kolom di bawah.');
        } else {
          setImportError('Tidak ditemukan baris nama yang valid pada sheet ini. Silakan periksa pilihan kolom atau sheet di bawah.');
        }
      }
    } catch (err: any) {
      console.error('Failed to parse excel file', err);
      setImportError('Gagal membaca berkas. Pastikan format file adalah .xlsx, .xls, atau .csv');
    } finally {
      setIsLoadingFile(false);
    }
  };

  const handleRecalculateMapping = (
    nameIdx: number,
    absentIdx: number,
    nisIdx: number,
    emailIdx: number,
    startRow: number
  ) => {
    if (!workbookAnalysis || !workbookAnalysis.rawMatrix) return;
    const students = generateStudentsFromMatrix(workbookAnalysis.rawMatrix, {
      nameColIdx: nameIdx,
      absentColIdx: absentIdx,
      nisColIdx: nisIdx,
      emailColIdx: emailIdx,
      usernameColIdx: workbookAnalysis.detectedMapping.usernameColIdx,
      passwordColIdx: workbookAnalysis.detectedMapping.passwordColIdx,
      dataStartRowIndex: startRow,
    });
    setParsedRows(students);
    if (students.length === 0 && nameIdx !== -1) {
      setImportError('Tidak ada nama siswa yang terdeteksi pada kolom tersebut. Pastikan kolom yang dipilih memuat nama siswa.');
    } else {
      setImportError('');
    }
  };

  // Handle Drag & Drop
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  // Handle Quick Paste from Sheets
  const handleProcessPastedText = () => {
    setImportError('');
    if (!pastedText.trim()) {
      setImportError('Silakan tempel baris data siswa terlebih dahulu.');
      return;
    }

    const lines = pastedText.split(/\r?\n/).filter((l) => l.trim().length > 0);
    const parsed: ParsedStudentRow[] = [];

    lines.forEach((line, idx) => {
      // Split by tab (Excel copy) or comma (CSV)
      const parts = line.includes('\t') ? line.split('\t') : line.split(',');
      if (parts.length === 0) return;

      let absent = idx + 1;
      let name = '';
      let nis = '';
      let userEmail = '';

      if (parts.length === 1) {
        name = parts[0].trim();
      } else if (parts.length >= 2) {
        // If first column is number
        if (!isNaN(parseInt(parts[0].trim(), 10)) && parts[0].trim().length <= 3) {
          absent = parseInt(parts[0].trim(), 10);
          name = parts[1]?.trim() || '';
          nis = parts[2]?.trim() || '';
          userEmail = parts[3]?.trim() || '';
        } else {
          name = parts[0]?.trim() || '';
          nis = parts[1]?.trim() || '';
          userEmail = parts[2]?.trim() || '';
        }
      }

      if (name) {
        parsed.push({
          absentNumber: absent,
          displayName: name,
          studentNumber: nis || `2024${String(absent).padStart(3, '0')}`,
          email: userEmail || undefined,
          isValid: name.length >= 2,
          errorMessage: name.length < 2 ? 'Nama terlalu pendek' : undefined,
        });
      }
    });

    if (parsed.length === 0) {
      setImportError('Format data yang ditempel tidak sesuai.');
    } else {
      setParsedRows(parsed);
      setFileName(`Tempel Data (${parsed.length} Siswa)`);
    }
  };

  // Execute Batch Import
  const handleBatchImport = () => {
    const validRows = parsedRows.filter((r) => r.isValid);
    if (validRows.length === 0) {
      setImportError('Tidak ada siswa yang valid untuk diimpor.');
      return;
    }

    provisionMultipleStudents(
      validRows.map((r) => ({
        displayName: r.displayName,
        studentNumber: r.studentNumber,
        absentNumber: r.absentNumber || 1,
        classId: selectedClassId,
        username: r.username,
        password: r.password,
        email: r.email,
      }))
    );

    // Reset & close
    setParsedRows([]);
    setFileName('');
    setPastedText('');
    setWorkbookAnalysis(null);
    setCurrentFile(null);
    setNameColIdx(-1);
    if (onSuccess) onSuccess();
    onClose();
  };

  const validCount = parsedRows.filter((r) => r.isValid).length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="w-full max-w-3xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-5 sm:p-6 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md">
              <UserPlus className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg sm:text-xl font-extrabold text-slate-900 font-display">
                Tambah Data Siswa
              </h2>
              <p className="text-xs text-slate-500">
                Pilih input manual satu per satu atau impor massal melalui berkas Excel / CSV
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Selector Tabs */}
        <div className="px-6 pt-4 pb-2 border-b border-slate-100 bg-slate-50/30 flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center p-1 bg-slate-100 rounded-2xl">
            <button
              type="button"
              onClick={() => setActiveMode('manual')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeMode === 'manual'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              <span>Input Manual</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode('excel')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeMode === 'excel'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Impor Excel / CSV</span>
            </button>

            <button
              type="button"
              onClick={() => setActiveMode('paste')}
              className={`hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all ${
                activeMode === 'paste'
                  ? 'bg-white text-indigo-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ClipboardPaste className="w-4 h-4 text-blue-600" />
              <span>Tempel Teks</span>
            </button>
          </div>

          {/* Class Target */}
          <div className="flex items-center gap-2 text-xs font-bold text-slate-700">
            <span>Kelas Target:</span>
            <select
              value={selectedClassId}
              onChange={(e) => setSelectedClassId(e.target.value)}
              className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white font-bold text-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* TAB 1: MANUAL INPUT */}
          {activeMode === 'manual' && (
            <form onSubmit={handleManualSubmit} className="space-y-4 max-w-xl mx-auto">
              {manualError && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{manualError}</span>
                </div>
              )}

              {/* Photo Upload Section */}
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 flex flex-col sm:flex-row items-center gap-4">
                <input
                  ref={photoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleManualPhotoSelect(e.target.files[0]);
                    }
                  }}
                />

                <div className="relative shrink-0">
                  <div className="w-20 h-20 rounded-2xl bg-white border-2 border-indigo-200 shadow-sm overflow-hidden flex items-center justify-center">
                    {avatarUrl ? (
                      <img src={avatarUrl} alt="Pratinjau Foto" className="w-full h-full object-cover" />
                    ) : (
                      <Users className="w-10 h-10 text-slate-300" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => photoInputRef.current?.click()}
                    className="absolute -bottom-1 -right-1 p-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-full shadow-xs cursor-pointer"
                    title="Pilih foto profil siswa"
                  >
                    <Camera className="w-3.5 h-3.5" />
                  </button>
                </div>

                <div className="space-y-1 text-center sm:text-left flex-1">
                  <span className="text-[11px] font-bold text-slate-700 block">
                    Foto Profil Siswa (Opsional)
                  </span>
                  <p className="text-[11px] text-slate-400">
                    Foto ini akan tampil langsung di Dashboard Murid. Guru bisa mengunggahnya sekarang atau menyusul.
                  </p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      className="px-3 py-1 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 text-indigo-600 font-bold text-xs shadow-2xs flex items-center gap-1.5 cursor-pointer"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      <span>{isProcessingPhoto ? 'Memproses...' : avatarUrl ? 'Ganti Foto' : 'Unggah Foto'}</span>
                    </button>
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => {
                          setCropSourceImage(avatarUrl);
                          setIsCropModalOpen(true);
                        }}
                        className="px-2.5 py-1 rounded-xl bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs border border-indigo-200 shadow-2xs flex items-center gap-1 cursor-pointer"
                        title="Sesuaikan perbesaran, geser posisi, atau putar foto"
                      >
                        <Crop className="w-3.5 h-3.5 text-indigo-600" />
                        <span>Sesuaikan & Crop</span>
                      </button>
                    )}
                    {avatarUrl && (
                      <button
                        type="button"
                        onClick={() => setAvatarUrl('')}
                        className="text-[11px] text-rose-600 hover:underline font-medium cursor-pointer"
                      >
                        Hapus Foto
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Nama Lengkap Siswa *
                </label>
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Contoh: Muhammad Rizky Pratama"
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Nomor Absen
                  </label>
                  <input
                    type="number"
                    value={absentNumber}
                    onChange={(e) => setAbsentNumber(e.target.value ? parseInt(e.target.value, 10) : '')}
                    placeholder="Contoh: 1"
                    min={1}
                    max={100}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    NIS / Nomor Induk Siswa
                  </label>
                  <input
                    type="text"
                    value={studentNumber}
                    onChange={(e) => setStudentNumber(e.target.value)}
                    placeholder="Contoh: 2024015"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Username Login Siswa (Opsional)
                  </label>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="Contoh: rizky2024 (Otomatis jika kosong)"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Digunakan murid untuk memilih akun di halaman login.
                  </span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    Kata Sandi Akun Siswa
                  </label>
                  <input
                    type="text"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Default: 123456"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 mt-1 block">
                    Diatur oleh guru (bawaan: 123456).
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Email Siswa (Opsional)
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Contoh: rizky@sekolah.id"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="p-3.5 rounded-2xl bg-indigo-50/60 border border-indigo-100 flex items-start gap-2.5">
                <Sparkles className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <p className="text-xs text-indigo-900 leading-relaxed">
                  Siswa yang ditambahkan akan otomatis mendapatkan akun murid, avatar profil bawaan, dan saldo awal 0 XP level 1 siap belajar.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold transition-colors"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-md transition-colors flex items-center gap-1.5"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Simpan Siswa</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: EXCEL / CSV IMPORT */}
          {activeMode === 'excel' && (
            <div className="space-y-5">
              {/* Template Download Card */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h4 className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                    <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                    <span>Format File Excel yang Didukung</span>
                  </h4>
                  <p className="text-[11px] text-emerald-800 mt-0.5">
                    Gunakan template resmi kami yang sudah tersusun kolom No Absen, Nama Lengkap, NIS, dan Email.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => downloadStudentExcelTemplate(currentClass?.name)}
                    className="px-3 py-1.5 rounded-xl bg-white border border-emerald-300 text-emerald-800 hover:bg-emerald-100 text-xs font-bold shadow-2xs transition-colors flex items-center gap-1.5"
                  >
                    <Download className="w-3.5 h-3.5 text-emerald-600" />
                    <span>Unduh .XLSX</span>
                  </button>
                  <button
                    type="button"
                    onClick={downloadStudentCsvTemplate}
                    className="px-2.5 py-1.5 rounded-xl bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-bold transition-colors"
                  >
                    .CSV
                  </button>
                </div>
              </div>

              {/* Upload Dropzone */}
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-3xl p-6 sm:p-8 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-indigo-500 bg-indigo-50/50'
                    : 'border-slate-300 hover:border-indigo-400 bg-slate-50/50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls, .csv"
                  onChange={(e) => {
                    if (e.target.files && e.target.files.length > 0) {
                      handleFileChange(e.target.files[0]);
                    }
                  }}
                  className="hidden"
                />

                <div className="w-12 h-12 rounded-2xl bg-indigo-100 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                  <Upload className="w-6 h-6" />
                </div>

                <h4 className="text-sm font-bold text-slate-800">
                  {fileName ? fileName : 'Pilih atau Seret Berkas Excel (.xlsx, .xls, .csv)'}
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  {fileName ? 'Klik untuk mengganti berkas lain' : 'Klik di sini untuk menjelajah berkas di komputermu'}
                </p>
              </div>

              {/* Column Mapping Configuration (if file analyzed) */}
              {workbookAnalysis && (
                <div className="p-4 rounded-3xl bg-indigo-50/60 border border-indigo-100 space-y-3.5 animate-in fade-in duration-200">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                        <Sliders className="w-3.5 h-3.5" />
                      </div>
                      <span className="text-xs font-bold text-slate-800">
                        Pengaturan Kolom Berkas Excel
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {validCount > 0 ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 text-[11px] font-bold">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          <span>{validCount} Siswa Terdeteksi</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-[11px] font-bold">
                          <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                          <span>Nama Siswa Belum Dipilih</span>
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Sheet Selector if multiple sheets */}
                  {workbookAnalysis.sheetNames.length > 1 && (
                    <div className="p-2.5 rounded-2xl bg-white border border-indigo-100 flex items-center justify-between gap-3">
                      <label className="text-xs font-bold text-slate-700 whitespace-nowrap">
                        Pilih Sheet / Halaman:
                      </label>
                      <select
                        value={activeSheet}
                        onChange={(e) => {
                          if (currentFile) {
                            handleFileChange(currentFile, e.target.value);
                          }
                        }}
                        className="px-3 py-1.5 rounded-xl border border-indigo-200 bg-slate-50 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        {workbookAnalysis.sheetNames.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}

                  {/* Column Selectors */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* Kolom Nama Siswa */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-extrabold text-indigo-950 flex items-center justify-between">
                        <span>Kolom Nama Siswa</span>
                        <span className="text-[10px] text-rose-500 font-bold">*Wajib</span>
                      </label>
                      <select
                        value={nameColIdx}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setNameColIdx(val);
                          handleRecalculateMapping(val, absentColIdx, nisColIdx, emailColIdx, dataStartRowIdx);
                        }}
                        className={`w-full px-2.5 py-2 rounded-xl border text-xs font-bold transition-all focus:outline-none focus:ring-2 ${
                          nameColIdx !== -1
                            ? 'border-indigo-300 bg-white text-indigo-900 ring-1 ring-indigo-200 focus:ring-indigo-400'
                            : 'border-rose-300 bg-rose-50/80 text-rose-800 focus:ring-rose-400'
                        }`}
                      >
                        <option value={-1}>-- Pilih Kolom Nama --</option>
                        {workbookAnalysis.columnOptions.map((opt) => (
                          <option key={opt.index} value={opt.index}>
                            {opt.headerLabel}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Kolom No Absen */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700">
                        Kolom No. Absen:
                      </label>
                      <select
                        value={absentColIdx}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setAbsentColIdx(val);
                          handleRecalculateMapping(nameColIdx, val, nisColIdx, emailColIdx, dataStartRowIdx);
                        }}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        <option value={-1}>-- Otomatis (1, 2, 3...) --</option>
                        {workbookAnalysis.columnOptions.map((opt) => (
                          <option key={opt.index} value={opt.index}>
                            {opt.headerLabel}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Kolom NIS / NISN */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700">
                        Kolom NIS / NISN:
                      </label>
                      <select
                        value={nisColIdx}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setNisColIdx(val);
                          handleRecalculateMapping(nameColIdx, absentColIdx, val, emailColIdx, dataStartRowIdx);
                        }}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        <option value={-1}>-- Otomatis (Buat NIS Baru) --</option>
                        {workbookAnalysis.columnOptions.map((opt) => (
                          <option key={opt.index} value={opt.index}>
                            {opt.headerLabel}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Mulai Baris Siswa */}
                    <div className="space-y-1">
                      <label className="block text-[11px] font-bold text-slate-700">
                        Mulai Baris Siswa:
                      </label>
                      <select
                        value={dataStartRowIdx}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          setDataStartRowIdx(val);
                          handleRecalculateMapping(nameColIdx, absentColIdx, nisColIdx, emailColIdx, val);
                        }}
                        className="w-full px-2.5 py-2 rounded-xl border border-slate-200 bg-white text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-400"
                      >
                        {Array.from({ length: Math.min(workbookAnalysis.rawMatrix.length, 30) }, (_, i) => (
                          <option key={i} value={i}>
                            Baris {i + 1}
                            {i === workbookAnalysis.detectedMapping.dataStartRowIndex ? ' (Otomatis)' : ''}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <p className="text-[11px] text-indigo-700/80 italic">
                    Tips: Jika nama siswa belum terdeteksi otomatis, pilih kolom yang sesuai pada pilihan <strong>"Kolom Nama Siswa"</strong> di atas.
                  </p>
                </div>
              )}

              {importError && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{importError}</span>
                </div>
              )}

              {/* Preview parsed data */}
              {parsedRows.length > 0 && (
                <div className="space-y-3 pt-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      <span>
                        Pratinjau Data: {validCount} dari {parsedRows.length} Siswa Siap Diimpor
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        setParsedRows([]);
                        setFileName('');
                        setWorkbookAnalysis(null);
                        setCurrentFile(null);
                        setNameColIdx(-1);
                      }}
                      className="text-xs font-bold text-rose-600 hover:text-rose-800 flex items-center gap-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Hapus Pratinjau</span>
                    </button>
                  </div>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="px-3 py-2">No. Absen</th>
                          <th className="px-3 py-2">Nama Siswa</th>
                          <th className="px-3 py-2">NIS</th>
                          <th className="px-3 py-2">Email</th>
                          <th className="px-3 py-2 text-right">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedRows.map((row, idx) => (
                          <tr key={idx} className={row.isValid ? 'hover:bg-slate-50' : 'bg-rose-50/50'}>
                            <td className="px-3 py-2 font-bold text-slate-600">#{row.absentNumber}</td>
                            <td className="px-3 py-2 font-semibold text-slate-900">{row.displayName}</td>
                            <td className="px-3 py-2 text-slate-600">{row.studentNumber}</td>
                            <td className="px-3 py-2 text-slate-500">{row.email || '-'}</td>
                            <td className="px-3 py-2 text-right">
                              {row.isValid ? (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                                  Siap
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-md bg-rose-100 text-rose-800 text-[10px] font-extrabold">
                                  {row.errorMessage}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleBatchImport}
                      disabled={validCount === 0}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold shadow-md transition-colors flex items-center gap-1.5"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Impor {validCount} Siswa ke {currentClass?.name}</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: PASTE TEXT MODE */}
          {activeMode === 'paste' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Tempel Baris Teks / Salin Kolom dari Google Sheets atau Excel:
                </label>
                <textarea
                  rows={6}
                  value={pastedText}
                  onChange={(e) => setPastedText(e.target.value)}
                  placeholder={`Contoh (bisa pisahkan dengan Tab atau Koma):\n1\tMuhammad Rizky\t2024001\trizky@sekolah.id\n2\tSiti Nurhaliza\t2024002\tsiti@sekolah.id`}
                  className="w-full p-3 rounded-2xl border border-slate-200 font-mono text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-slate-50/50"
                />
              </div>

              {importError && (
                <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{importError}</span>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={handleProcessPastedText}
                  className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-xs flex items-center gap-1.5"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Proses & Pratinjau</span>
                </button>
              </div>

              {/* Parsed table */}
              {parsedRows.length > 0 && (
                <div className="space-y-3 pt-2">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                    <span>Terdeteksi {validCount} siswa valid</span>
                  </span>

                  <div className="border border-slate-200 rounded-2xl overflow-hidden max-h-48 overflow-y-auto">
                    <table className="w-full text-left text-xs">
                      <thead className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200 sticky top-0">
                        <tr>
                          <th className="px-3 py-2">No. Absen</th>
                          <th className="px-3 py-2">Nama Siswa</th>
                          <th className="px-3 py-2">NIS</th>
                          <th className="px-3 py-2">Email</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {parsedRows.map((row, idx) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-bold text-slate-600">#{row.absentNumber}</td>
                            <td className="px-3 py-2 font-semibold text-slate-900">{row.displayName}</td>
                            <td className="px-3 py-2 text-slate-600">{row.studentNumber}</td>
                            <td className="px-3 py-2 text-slate-500">{row.email || '-'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="pt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-bold"
                    >
                      Batal
                    </button>
                    <button
                      type="button"
                      onClick={handleBatchImport}
                      className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-md flex items-center gap-1.5"
                    >
                      <UserPlus className="w-4 h-4" />
                      <span>Simpan {validCount} Siswa</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Image Crop & Resize Modal */}
      <ImageCropModal
        isOpen={isCropModalOpen}
        imageSrc={cropSourceImage}
        title="Sesuaikan Foto Profil Siswa"
        initialShape="circle"
        onClose={() => setIsCropModalOpen(false)}
        onCropComplete={(croppedDataUrl) => {
          setAvatarUrl(croppedDataUrl);
        }}
      />
    </div>
  );
};
