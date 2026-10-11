// src/core/GameDepths.ts

export const GAME_DEPTHS = {
  // --- TẦNG NỀN (BACKGROUND) ---
  BG_IMAGE: 0,
  FLOOR: 10,
  GRID_LINES: 15,

  // --- TẦNG VẬT THỂ GAME (WORLD) ---
  WALL: 20,
  BOX_SHADOW: 21, // (Dự phòng) Bóng của hộp
  TARGET: 29, // Đích nằm trên tường/sàn
  BOX: 30, // Hộp nằm trên đích
  PLAYER_SHADOW: 39,
  PLAYER: 40, // Người chơi nằm trên cùng của thế giới vật lý
  TARGET_HIGHLIGHT: 45, // Ô đích nhấp nháy khi người chơi đứng trên ô đích

  // --- TẦNG HIỆU ỨNG (VFX) ---
  PARTICLES: 50, // Bụi, tia lửa nổ
  FLOATING_TEXT: 60, // Điểm số bay lên (+100)

  // Badge-row HUD labels (category/level/timer/moves) — must sit above the 3D Sokoban HUD
  // scrim (UI_BACKGROUND - 10 = 90, see PlayScene.addHudScrim) or it paints over them, but
  // below UI_BACKGROUND so a win/lose modal still dims them like everything else.
  HUD_LABEL: 95,

  // --- TẦNG GIAO DIỆN (UI) ---
  UI_BACKGROUND: 100, // Nền đen mờ khi có popup
  UI_PANEL: 110, // Khung viền popup
  UI_TEXT: 120, // Chữ trong popup
  UI_BUTTONS: 130, // Nút bấm tương tác

  // --- TẦNG HỆ THỐNG TRÊN CÙNG ---
  CURSOR: 999, // Con trỏ chuột custom (nếu có)
  ERROR_TOAST: 1000, // Thông báo lỗi khẩn cấp
} as const;
