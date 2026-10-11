import * as Phaser from 'phaser';

export class ProgressBar {
  private scene: Phaser.Scene;
  private progressBar: Phaser.GameObjects.Graphics;
  private progressBox: Phaser.GameObjects.Graphics;
  private width: number;
  private height: number;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.width = this.scene.cameras.main.width;
    this.height = this.scene.cameras.main.height;
    this.progressBar = this.scene.add.graphics();
    this.progressBox = this.scene.add.graphics();
    this.progressBox.fillStyle(0x222222, 0.8);
    this.progressBox.fillRect(this.width / 2 - 160, this.height / 2 - 25, 320, 50);
  }

  update(value: number) {
    this.progressBar.clear();
    this.progressBar.fillStyle(0x00ff00, 1);
    this.progressBar.fillRect(this.width / 2 - 150, this.height / 2 - 15, 300 * Phaser.Math.Clamp(value, 0, 1), 30);
  }

  destroy() {
    this.progressBar.destroy();
    this.progressBox.destroy();
  }
}
