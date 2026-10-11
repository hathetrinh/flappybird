// src/services/ProgressService.ts

export interface LevelProgress {
  levelId: number;
  isUnlocked: boolean;
  highScore: number;
  // Fewest moves a Sokoban level has ever been won in. Separate from highScore since "best"
  // here means minimum, the opposite direction from the star/score high-water mark below.
  bestMoves?: number;
}

export class ProgressService {
  private static readonly STORAGE_KEY = 'matchstick_game_progress';
  // Separate key: the main store is Record<number, LevelProgress> and has no place for a
  // scalar. Cleared by resetAllProgress() along with the record.
  private static readonly LAST_PLAYED_KEY = 'brain_puzzle_last_played';

  /**
   * Đọc toàn bộ tiến trình chơi từ LocalStorage
   */
  public static getProgress(): Record<number, LevelProgress> {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      if (data) {
        return JSON.parse(data);
      }
    } catch (e) {
      console.error('Không thể đọc dữ liệu từ localStorage', e);
    }

    // Nếu chưa có dữ liệu (chơi lần đầu), mặc định mở khóa Màn 1
    return {
      1: { levelId: 1, isUnlocked: true, highScore: 0 },
    };
  }

  /**
   * Lưu tiến trình hiện tại vào LocalStorage
   */
  private static saveProgress(progress: Record<number, LevelProgress>): void {
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(progress));
    } catch (e) {
      console.error('Không thể ghi dữ liệu vào localStorage', e);
    }
  }

  /**
   * Kiểm tra trạng thái của một màn chơi cụ thể
   */
  public static isLevelUnlocked(levelId: number): boolean {
    if (levelId === 1) return true; // Màn 1 luôn luôn mở

    const progress = this.getProgress();
    return progress[levelId]?.isUnlocked ?? false;
  }

  /**
   * Lấy điểm số cao nhất của một màn chơi
   */
  public static getHighScore(levelId: number): number {
    const progress = this.getProgress();
    return progress[levelId]?.highScore ?? 0;
  }

  /**
   * Fewest moves a Sokoban level has ever been won in, or undefined if never won.
   */
  public static getBestMoves(levelId: number): number | undefined {
    const progress = this.getProgress();
    return progress[levelId]?.bestMoves;
  }

  /**
   * Xử lý dữ liệu khi người chơi vượt qua một màn thành công
   * @param currentLevelId ID của màn vừa thắng
   * @param score Điểm số đạt được trong lượt chơi này
   * @param nextLevelId ID của màn kế tiếp cần được mở khóa
   */
  public static completeLevel(currentLevelId: number, score: number, nextLevelId?: number, moves?: number): void {
    const progress = this.getProgress();

    // 1. Cập nhật hoặc khởi tạo tiến trình màn hiện tại
    if (!progress[currentLevelId]) {
      progress[currentLevelId] = { levelId: currentLevelId, isUnlocked: true, highScore: 0 };
    }

    // Lưu điểm số cao nhất (High Score)
    if (score > progress[currentLevelId].highScore) {
      progress[currentLevelId].highScore = score;
    }

    // Lưu số bước ít nhất (Best Moves) — "tốt nhất" ở đây là nhỏ nhất, ngược hướng so với highScore
    if (moves !== undefined) {
      const current = progress[currentLevelId].bestMoves;
      if (current === undefined || moves < current) {
        progress[currentLevelId].bestMoves = moves;
      }
    }

    // 2. Tự động mở khóa màn tiếp theo (nếu có)
    if (nextLevelId) {
      if (!progress[nextLevelId]) {
        progress[nextLevelId] = { levelId: nextLevelId, isUnlocked: true, highScore: 0 };
      } else {
        progress[nextLevelId].isUnlocked = true;
      }
    }

    // 3. Đồng bộ lại vào LocalStorage
    this.saveProgress(progress);
  }

  /**
   * Unlocks a level without completing anything — used when the player skips a level by
   * watching a rewarded ad, so the level they skip to stays playable from Level Select.
   */
  public static unlockLevel(levelId: number): void {
    const progress = this.getProgress();
    if (progress[levelId]) {
      progress[levelId].isUnlocked = true;
    } else {
      progress[levelId] = { levelId, isUnlocked: true, highScore: 0 };
    }
    this.saveProgress(progress);
  }

  /**
   * Xóa toàn bộ tiến trình (Dùng cho tính năng Reset Game)
   */
  public static resetAllProgress(): void {
    localStorage.removeItem(this.STORAGE_KEY);
    // Leaving this behind would make Continue offer a level from an erased profile.
    localStorage.removeItem(this.LAST_PLAYED_KEY);
  }

  /** The level the player most recently opened, or undefined if they never have. */
  public static getLastPlayedLevelId(): number | undefined {
    try {
      const raw = localStorage.getItem(this.LAST_PLAYED_KEY);
      if (raw === null) return undefined;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : undefined;
    } catch (e) {
      console.error('Could not read last played level from localStorage', e);
      return undefined;
    }
  }

  public static setLastPlayedLevelId(levelId: number): void {
    try {
      localStorage.setItem(this.LAST_PLAYED_KEY, String(levelId));
    } catch (e) {
      console.error('Could not write last played level to localStorage', e);
    }
  }
}
