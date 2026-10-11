// GameColors.ts

export const GameColors = {
  // 🎨 HỆ HEX NUMBER (Dùng cho Phaser Graphics, FillStyle, Background...)
  Hex: {
    WHITE: 0xffffff,
    BLACK: 0x000000,
    GRAY_LIGHT: 0xcccccc,
    GRAY_MEDIUM: 0x888888,
    GRAY_DARK: 0x333333,

    RED: 0xff0000,
    GREEN: 0x00ff00,
    BLUE: 0x0000ff,
    YELLOW: 0xffff00,
    ORANGE: 0xffa500,
    CYAN: 0x00ffff,
    PURPLE: 0x800080,
    PINK: 0xffc0cb,
    BROWN: 0x8b4513,
  },

  // 🔤 HỆ HEX STRING (Dùng cho Phaser Text, HTML DOM, CSS...)
  Str: {
    WHITE: '#FFFFFF',
    BLACK: '#000000',
    GRAY_LIGHT: '#CCCCCC',
    GRAY_MEDIUM: '#888888',
    GRAY_DARK: '#333333',

    RED: '#FF0000',
    GREEN: '#00FF00',
    BLUE: '#0000FF',
    YELLOW: '#FFFF00',
    ORANGE: '#FFA500',
    CYAN: '#00FFFF',
    PURPLE: '#800080',
    PINK: '#FFC0CB',
    BROWN: '#8B4513',
  },

  // 🎯 BẢNG MÀU SEMANTIC UI (Dành cho Button, Popup, Thông báo)
  UI: {
    // Trạng thái bình thường (Primary/Secondary)
    PRIMARY_BG: 0x2c3e50,
    PRIMARY_TEXT: '#ECF0F1',
    SECONDARY_BG: 0x7f8c8d,
    SECONDARY_TEXT: '#FFFFFF',

    // Trạng thái thành công / Đúng (Success)
    SUCCESS_BG: 0x27ae60,
    SUCCESS_TEXT: '#FFFFFF',

    // Trạng thái thất bại / Lỗi / Hủy (Danger)
    DANGER_BG: 0xe74c3c,
    DANGER_TEXT: '#FFFFFF',

    // Trạng thái cảnh báo / Gợi ý (Warning)
    WARNING_BG: 0xf39c12,
    WARNING_TEXT: '#FFFFFF',

    // Trạng thái thông tin / Hướng dẫn (Info)
    INFO_BG: 0x2980b9,
    INFO_TEXT: '#FFFFFF',

    // Trạng thái tab đang chọn (Active)
    TAB_ACTIVE_BG: 0xf1c40f,
    TAB_ACTIVE_TEXT: '#000000',
  },
} as const;

// Types hỗ trợ auto-complete cho TypeScript
export type HexColor = (typeof GameColors.Hex)[keyof typeof GameColors.Hex];
export type StrColor = (typeof GameColors.Str)[keyof typeof GameColors.Str];
