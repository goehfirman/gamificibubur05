import { arucoToSVGString } from 'aruco-marker';
import { PaperOption, PaperCardStudentInfo } from '../types/paperMode';

/**
 * Calculates which option (A, B, C, or D) is facing UP on the camera frame,
 * based on the 4 detected corners from js-aruco2.
 * 
 * In js-aruco2, corners are ordered starting from canonical Top-Left (c0) clockwise:
 * - c0: canonical Top-Left
 * - c1: canonical Top-Right
 * - c2: canonical Bottom-Right
 * - c3: canonical Bottom-Left
 * 
 * On the printed card:
 * - Top edge (c0 to c1): Option A
 * - Right edge (c1 to c2): Option B
 * - Bottom edge (c2 to c3): Option C
 * - Left edge (c3 to c0): Option D
 * 
 * In screen coordinates, the edge that is highest in the physical world has the
 * minimum Y coordinate (closest to 0).
 */
export function getMarkerOrientation(corners: { x: number; y: number }[]): {
  option: PaperOption;
  rotationDegrees: number;
  isAmbiguous?: boolean;
} {
  if (!corners || corners.length < 4) {
    return { option: 'A', rotationDegrees: 0 };
  }

  const [c0, c1, c2, c3] = corners;

  // Midpoint of each of the 4 edges
  const midTop = { x: (c0.x + c1.x) / 2, y: (c0.y + c1.y) / 2 }; // Edge A
  const midRight = { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 }; // Edge B
  const midBottom = { x: (c2.x + c3.x) / 2, y: (c2.y + c3.y) / 2 }; // Edge C
  const midLeft = { x: (c3.x + c0.x) / 2, y: (c3.y + c0.y) / 2 }; // Edge D

  // Center of the marker
  const centerX = (c0.x + c1.x + c2.x + c3.x) / 4;
  const centerY = (c0.y + c1.y + c2.y + c3.y) / 4;

  // Vector from center to top edge (A)
  const vecA = { x: midTop.x - centerX, y: midTop.y - centerY };

  // Calculate rotation angle of Edge A relative to UP (0, -1) in degrees (-180 to 180)
  // When Edge A points straight UP, angle is 0°
  // When Edge A points Right, angle is 90°
  // When Edge A points Down, angle is 180°
  // When Edge A points Left, angle is -90° (270°)
  let angle = Math.atan2(vecA.x, -vecA.y) * (180 / Math.PI);
  if (angle < 0) angle += 360;

  // Find edge with lowest Y coordinate (closest to top of frame)
  const edges: { option: PaperOption; y: number }[] = [
    { option: 'A', y: midTop.y },
    { option: 'B', y: midRight.y },
    { option: 'C', y: midBottom.y },
    { option: 'D', y: midLeft.y },
  ];

  edges.sort((a, b) => a.y - b.y);
  const selectedOption = edges[0].option;

  // Approximate marker edge length to detect diagonal tilt ambiguity
  const edgeLen = Math.hypot(c1.x - c0.x, c1.y - c0.y);
  // If the difference between the top 2 edges is less than 7% of marker size,
  // the card is held at a diagonal ~45° corner tilt and orientation is not yet decisive
  const isAmbiguous = (edges[1].y - edges[0].y) < Math.max(3, edgeLen * 0.07);

  return {
    option: selectedOption,
    rotationDegrees: Math.round(angle),
    isAmbiguous,
  };
}

/**
 * Generate SVG string of the inner ArUco marker.
 */
export function getArucoSvgString(markerId: number, size: string = '160px'): string {
  try {
    return arucoToSVGString(markerId, size);
  } catch (err) {
    console.error(`Failed to generate ArUco marker ${markerId}:`, err);
    return `<svg width="${size}" height="${size}" viewBox="0 0 100 100"><rect width="100" height="100" fill="#000"/><text x="50" y="55" fill="#fff" text-anchor="middle" font-size="12">ID ${markerId}</text></svg>`;
  }
}

/**
 * Generate a complete printable HTML / SVG Card for a student with ArUco marker,
 * student metadata, and anti-cheating subtle A, B, C, D labels.
 */
export function generateStudentCardHtml(student: PaperCardStudentInfo, themeIndex: number = 0): string {
  const markerSvg = getArucoSvgString(student.markerId, '240px');
  
  const PALETTES = [
    { primary: '#4f46e5', border: '#6366f1', bgBadge: '#eef2ff', textBadge: '#3730a3', accent: '#818cf8', gradient: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)' },
    { primary: '#059669', border: '#10b981', bgBadge: '#ecfdf5', textBadge: '#065f46', accent: '#34d399', gradient: 'linear-gradient(135deg, #059669 0%, #0d9488 100%)' },
    { primary: '#e11d48', border: '#f43f5e', bgBadge: '#fff1f2', textBadge: '#9f1239', accent: '#fb7185', gradient: 'linear-gradient(135deg, #e11d48 0%, #db2777 100%)' },
    { primary: '#d97706', border: '#f59e0b', bgBadge: '#fffbeb', textBadge: '#92400e', accent: '#fbbf24', gradient: 'linear-gradient(135deg, #d97706 0%, #ea580c 100%)' },
    { primary: '#0891b2', border: '#06b6d4', bgBadge: '#ecfeff', textBadge: '#155e75', accent: '#22d3ee', gradient: 'linear-gradient(135deg, #0891b2 0%, #2563eb 100%)' },
    { primary: '#9333ea', border: '#a855f7', bgBadge: '#faf5ff', textBadge: '#6b21a8', accent: '#c084fc', gradient: 'linear-gradient(135deg, #9333ea 0%, #c026d3 100%)' },
  ];
  const theme = PALETTES[themeIndex % PALETTES.length];

  return `
    <div class="paper-card" style="
      width: 100%;
      max-width: 480px;
      margin: 0 auto;
      border: 2px solid ${theme.border};
      border-radius: 16px;
      padding: 16px;
      background: #ffffff;
      box-sizing: border-box;
      font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #0f172a;
      position: relative;
      overflow: hidden;
      page-break-inside: avoid;
    ">
      <!-- Aesthetic top color strip -->
      <div style="position: absolute; top: 0; left: 0; right: 0; height: 4px; background: ${theme.gradient};"></div>

      <!-- Header -->
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1.5px solid #f1f5f9; padding-bottom: 8px; margin-bottom: 10px;">
        <div>
          <div style="display: inline-block; font-size: 9px; font-weight: 800; letter-spacing: 0.08em; color: ${theme.primary}; background: ${theme.bgBadge}; padding: 2px 7px; border-radius: 9999px; text-transform: uppercase;">GAMI-CLASS • MODE KERTAS</div>
          <div style="font-size: 16px; font-weight: 900; color: #0f172a; line-height: 1.2; margin-top: 3px;">${student.studentName}</div>
          <div style="font-size: 11px; font-weight: 600; color: #64748b; margin-top: 1px;">${student.className} • No. Absen: <strong style="color: #0f172a; font-weight: 800;">${student.absentNumber ?? '-'}</strong></div>
        </div>
        <div style="text-align: right; background: ${theme.bgBadge}; border: 1.5px solid ${theme.accent}; border-radius: 12px; padding: 4px 10px;">
          <div style="font-size: 8px; font-weight: 800; color: ${theme.textBadge}; text-transform: uppercase;">MARKER ID</div>
          <div style="font-size: 18px; font-weight: 900; color: ${theme.textBadge}; line-height: 1;">#${student.markerId}</div>
        </div>
      </div>

      <!-- Marker with Subtle Anti-Cheating A, B, C, D Labels (NO word sisi) -->
      <div style="position: relative; width: 320px; height: 320px; margin: 0 auto; display: flex; align-items: center; justify-content: center;">
        
        <!-- TOP (A) -->
        <div style="position: absolute; top: 0; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 1px;">
          <span style="font-size: 10px; font-weight: 700; color: #94a3b8; line-height: 1;">▲</span>
          <span style="font-size: 11px; font-weight: 700; color: #64748b; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 1px 6px; line-height: 1.2;">A</span>
        </div>

        <!-- RIGHT (B) -->
        <div style="position: absolute; right: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 2px;">
          <span style="font-size: 11px; font-weight: 700; color: #64748b; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 1px 6px; line-height: 1.2;">B</span>
          <span style="font-size: 10px; font-weight: 700; color: #94a3b8; line-height: 1;">▶</span>
        </div>

        <!-- BOTTOM (C) -->
        <div style="position: absolute; bottom: 0; left: 50%; transform: translateX(-50%); display: flex; flex-direction: column; align-items: center; gap: 1px;">
          <span style="font-size: 11px; font-weight: 700; color: #64748b; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 1px 6px; line-height: 1.2;">C</span>
          <span style="font-size: 10px; font-weight: 700; color: #94a3b8; line-height: 1;">▼</span>
        </div>

        <!-- LEFT (D) -->
        <div style="position: absolute; left: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; gap: 2px;">
          <span style="font-size: 10px; font-weight: 700; color: #94a3b8; line-height: 1;">◀</span>
          <span style="font-size: 11px; font-weight: 700; color: #64748b; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 1px 6px; line-height: 1.2;">D</span>
        </div>

        <!-- Central Marker -->
        <div style="background: #ffffff; padding: 6px; border: 1.5px dashed ${theme.border}; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
          ${markerSvg}
        </div>
      </div>

      <!-- Instructions Footer (without word sisi) -->
      <div style="margin-top: 10px; padding-top: 6px; border-top: 1.5px solid #f1f5f9; font-size: 9.5px; color: #64748b; line-height: 1.4; text-align: center; font-weight: 600;">
        Petunjuk: Posisikan huruf pilihan jawabanmu (A, B, C, atau D) di posisi <strong style="color: #0f172a; font-weight: 800;">paling atas</strong>, lalu angkat kartu menghadap ke arah guru.
      </div>
    </div>
  `;
}
