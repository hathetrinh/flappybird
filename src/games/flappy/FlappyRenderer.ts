// src/games/flappy/FlappyRenderer.ts
//
// Flappy Bird's 2D presentation. Replaces the old three.js FlappyWorld — see
// docs/adr/0009-flappy-2d-sprites.md for why the 3D version went away.
//
// It keeps FlappyWorld's contract on purpose (setBirdPose/setPipes/setScroll/playBirdClip plus
// the viewWidth/viewHeight getters), so FlappyGameScene's frame loop reads the same either way
// and, more importantly, so every playtested constant in FlappySim's FLAPPY_TUNING keeps its
// meaning: viewHeight is still exactly REFERENCE_VIEW_HEIGHT world units of flyable air.
//
// Like FlappyWorld, this module is told where things are and draws them. It does not import
// FlappySim and it decides no rules.
import * as Phaser from 'phaser';

/** Flyable air, in world units. Fixed regardless of screen shape — FLAPPY_TUNING is tuned
 *  against this value, so it must not become a function of the viewport. */
const REFERENCE_VIEW_HEIGHT = 13.3;

/**
 * The bits of the simulation's geometry the renderer has to draw to, handed in rather than
 * duplicated.
 *
 * These used to be local constants copied from FLAPPY_TUNING, with a comment asking whoever
 * changed one to change the other. That failed exactly as invited: the drawn gap was widened to
 * 3.6 while the simulation still collided against 2.6, so half a unit of apparently open sky at
 * each end of every gap quietly killed the bird. The renderer still must not import FlappySim
 * (see the module docstring), but FlappyGameScene knows both and can simply pass them.
 */
export interface FlappyGeometry {
  /** Vertical opening between a pipe pair, in world units. */
  pipeGap: number;
  /** Full width of a pipe, in world units. */
  pipeWidth: number;
}
/**
 * The bird CELL's edge in world units -- not the bird's own size.
 *
 * The pixel sheet's poses nearly fill their cell (the flying bird is 101 of 112px across), so
 * unlike the painterly chick sheet there is almost no headroom to compensate for: 1.25 puts the
 * drawn bird at about 1.13 units wide. Still far larger than the 0.62 x 0.4 collision box in
 * FLAPPY_TUNING, which is deliberate -- see the hitbox note there.
 */
const BIRD_SIZE = 1.25;

/** Drawn size of a gap coin, in world units. Larger than its 0.6 pickup box, like the bird. */
const COIN_SIZE = 0.85;
export const COIN_CELL = 96;

/**
 * Drawn size of the gap shield pickup. A shade larger than a coin, so the two read as different
 * things at a glance from across the gap.
 *
 * There is no size for a WORN bubble, because there is no worn bubble object: the sheet draws
 * the shielded bird as a complete pose, so holding a shield is a change of frame rather than a
 * second sprite composited over the first.
 */
const SHIELD_PICKUP_SIZE = 0.95;
const SHIELD_TEXTURE = 'flappy_shield_bubble';

/**
 * Drawn WIDTH of a gap heart, in world units -- width, not size, because the heart icon is the
 * only pickup art that is not square (78x66), so its height is taken from the texture instead of
 * mirrored from this. Stretching it to a square would make the gap heart a different shape from
 * the identical icon in the life row, which is the whole point of reusing that texture: the
 * player should see the thing they are about to get back.
 */
const HEART_PICKUP_WIDTH = 0.95;
const HEART_TEXTURE = 'flappy_heart_full';

/** Where unused pool slots wait. */
const OFFSCREEN_X = -9999;
/**
 * How far the hills are sunk beneath the ground line, as a fraction of the ground band.
 *
 * The ground art's top edge is an undulating grass line, not a flat band edge -- even eight
 * rows in it is only about a quarter opaque -- so resting the hills exactly on the ground line
 * let sky show through the troughs as a hairline along the horizon. The hills are drawn at a
 * lower depth than the ground, so overlapping them underneath it costs nothing visually.
 *
 * A fraction rather than a pixel count: the canvas is sized in physical pixels, so a constant
 * few px would cover the gap on a DPR-1 laptop and miss it on a DPR-2 phone.
 */
const HILL_SINK_FRACTION = 0.5;

const GROUND_BAND = 0.1; // of canvas height
const HILL_BAND = 0.28; // of the flyable height

// Sampled from the sheet's own SKY PATCH tile by scripts/slice-flappy-pixel-sheet.sh, so the
// drawn sky and the art agree rather than merely being near each other.
const SKY_TOP = 0x56add5;
const SKY_BOTTOM = 0xc6e0ee;

// Three, not four: the sheet has three cloud drawings. There is no tree band at all -- this art
// puts a city behind the pipes, not a hedgerow in front of them.
const CLOUD_KEYS = ['flappy_cloud_0', 'flappy_cloud_1', 'flappy_cloud_2'];

/**
 * Frame layout of chick.png, written by scripts/slice-flappy-pixel-sheet.sh -- keep them in step.
 *
 * Four poses in one row: flying, dazed, collapsed, shielded. This art has ONE flying pose, so
 * the wingbeat the painterly chick had is gone -- the bird's sense of motion comes from its
 * pitch, exactly as it does in the game this sheet is drawn after. A tap therefore has no
 * animation to restart, which is why playBirdClip's 'flap' case now does nothing visible.
 */
const CHICK_FRAMES = {
  /** One pose. The sheet has a single flying bird, so the motion is all in the pitch. */
  flight: [0],
  /** The dazed pose, held for the whole drop. */
  fall: [1],
  /** The collapsed pose, held once it has hit the ground. */
  ko: [2],
};
/** Not part of any animation: shown instead of them while a shield is held. */
const CHICK_SHIELDED_FRAME = 3;
export const CHICK_CELL = 112;

/**
 * Where the bird's body sits inside its cell, as a fraction of cell height.
 *
 * Not 0.5, because the poses are bottom-aligned in their cells and differ in height -- the
 * collapsed bird is 52px tall against the flying bird's 71. Bottom alignment is what keeps the
 * bird's feet in one place across a pose change; this origin is the centre of the FLYING pose
 * within that arrangement ((112 - 3 - 71/2) / 112), so pitch rotates about the body rather than
 * about a point in the empty air below it.
 */
const CHICK_BODY_ORIGIN_Y = 0.656;

// The ground sits ABOVE the pipes, which is the one ordering here that is not simply
// back-to-front by distance: a pipe is rooted in the ground, so its shaft has to disappear
// behind the grass rather than paint over it and run on to the bottom of the screen. The bird
// and the gap pickups stay above both -- the bird lands ON the surface, it is not buried in it.
const DEPTH = { sky: 0, hills: 1, clouds: 2, pipe: 3, ground: 4, pickup: 6, bird: 7 };

// The bodies are plain Images stretched vertically, not TileSprites. pipe_body.png is a 6px
// slice of shaft whose detail is vertical streaks, so stretching it reads exactly like tiling
// it, and an Image takes its height from setDisplaySize -- a scale factor -- rather than
// needing a per-frame setSize(), which on a TileSprite also rebuilds its tile texture. It
// sidesteps a trap too: assigning .width/.height on a TileSprite does NOT re-run
// updateDisplayOrigin(), so it keeps the display origin it was constructed with, which
// detaches each body from its cap and flips which way it extends.
interface PipeSlot {
  lowerCap: Phaser.GameObjects.Image;
  lowerBody: Phaser.GameObjects.Image;
  upperCap: Phaser.GameObjects.Image;
  upperBody: Phaser.GameObjects.Image;
  /** Whatever sits in the gap. Hidden when this pipe carries nothing, or once it is taken. */
  pickup: Phaser.GameObjects.Sprite;
  /** What that sprite is currently dressed as, so a frame only pays for an actual change. */
  pickupKind: PickupKind;
}

/** Mirrors FlappySim's PipePickup, structurally -- the renderer never imports the rules. */
type PickupKind = 'none' | 'coin' | 'shield' | 'heart';

interface Prop {
  image: Phaser.GameObjects.Image;
  parallax: number;
  /** World-unit offset of this instance within its group's repeating span. */
  offset: number;
  span: number;
  /** 0 = sits on the ground line, 1 = top of the flyable air. */
  heightFraction: number;
}

/**
 * Loads every sprite the renderer needs. Called from the scene's own preload(), so a player who
 * never opens Flappy never downloads its art.
 */
export function preloadFlappySprites(scene: Phaser.Scene): void {
  // The pixel art, not the painterly sprites next door -- see
  // scripts/slice-flappy-pixel-sheet.sh, which supersedes scripts/slice-flappy-sheet.sh.
  const base = 'assets/games/flappy/pixel';
  scene.load.spritesheet('flappy_chick', `${base}/chick.png`, {
    frameWidth: CHICK_CELL,
    frameHeight: CHICK_CELL,
  });
  scene.load.image('flappy_pipe_cap', `${base}/pipe_cap.png`);
  scene.load.image('flappy_pipe_body', `${base}/pipe_body.png`);
  scene.load.image('flappy_ground', `${base}/ground.png`);
  // Named hillside for continuity with the layout code; the art is now a city skyline.
  scene.load.image('flappy_hillside', `${base}/hillside.png`);
  scene.load.image('flappy_score_box', `${base}/score_box.png`);
  scene.load.image('flappy_heart_full', `${base}/heart_full.png`);
  scene.load.image('flappy_heart_broken', `${base}/heart_broken.png`);
  scene.load.spritesheet('flappy_coin', `${base}/coin.png`, {
    frameWidth: COIN_CELL,
    frameHeight: COIN_CELL,
  });
  scene.load.image(SHIELD_TEXTURE, `${base}/shield_bubble.png`);
  CLOUD_KEYS.forEach((key, i) => scene.load.image(key, `${base}/cloud_${i}.png`));
}

/**
 * Switches every Flappy texture to nearest-neighbour sampling.
 *
 * Without this the default bilinear filter blurs the art the moment it is drawn at anything
 * other than 1:1 -- which is always, since the sprites are sized in world units against a
 * screen-dependent scale. Pixel art wants hard edges when magnified; blurring it is exactly the
 * mush that makes upscaled pixel art look wrong.
 *
 * Applied to the textures rather than via the game-wide `pixelArt` config flag, because that
 * flag is global and the other scenes' art is not pixel art.
 */
function usePixelFiltering(scene: Phaser.Scene, keys: string[]): void {
  for (const key of keys) {
    if (scene.textures.exists(key)) scene.textures.get(key).setFilter(Phaser.Textures.FilterMode.NEAREST);
  }
}

export class FlappyRenderer {
  private readonly scene: Phaser.Scene;

  private sky!: Phaser.GameObjects.Graphics;
  private hills!: Phaser.GameObjects.TileSprite;
  private ground!: Phaser.GameObjects.TileSprite;
  private bird!: Phaser.GameObjects.Sprite;
  /** Whether the bird is currently drawn in its shielded pose. */
  private shielded = false;
  private readonly pipes: PipeSlot[] = [];
  private readonly props: Prop[] = [];

  /** Canvas pixels per world unit. One value for both axes, so nothing is ever stretched. */
  private pxPerUnit = 1;
  /** Canvas y of world y = 0, i.e. the ground surface the bird dies on. */
  private groundY = 0;
  /** Drawn pipe size, derived in layout() and reused by setPipes() every frame. */
  private capWidth = 0;
  private capHeight = 0;
  private canvas = { width: 1, height: 1 };
  private view = { width: REFERENCE_VIEW_HEIGHT * 0.46, height: REFERENCE_VIEW_HEIGHT };

  private lastScroll = 0;
  private current: string | null = null;

  private readonly geometry: FlappyGeometry;

  constructor(scene: Phaser.Scene, geometry: FlappyGeometry) {
    this.scene = scene;
    this.geometry = geometry;
  }

  get viewWidth(): number {
    return this.view.width;
  }

  get viewHeight(): number {
    return this.view.height;
  }

  build(): void {
    this.measure();
    this.registerAnimations();
    usePixelFiltering(this.scene, [
      'flappy_chick',
      'flappy_pipe_cap',
      'flappy_pipe_body',
      'flappy_ground',
      'flappy_hillside',
      'flappy_score_box',
      'flappy_heart_full',
      'flappy_heart_broken',
      'flappy_coin',
      SHIELD_TEXTURE,
      ...CLOUD_KEYS,
    ]);

    this.sky = this.scene.add.graphics().setDepth(DEPTH.sky);
    this.hills = this.scene.add.tileSprite(0, 0, 1, 1, 'flappy_hillside').setOrigin(0, 1).setDepth(DEPTH.hills);
    this.ground = this.scene.add.tileSprite(0, 0, 1, 1, 'flappy_ground').setOrigin(0, 0).setDepth(DEPTH.ground);

    // One prop band now -- the clouds. It wraps over a span wider than the screen, so a cloud
    // leaving on the left is the same object arriving on the right: no pooling logic, no
    // allocation per frame. The tree band it used to share this with is gone with the painterly
    // art; this sheet's mid-ground is the skyline drawn behind it.
    this.addPropBand(CLOUD_KEYS, DEPTH.clouds, 0.18, 0.62);

    this.bird = this.scene.add
      .sprite(OFFSCREEN_X, 0, 'flappy_chick', 0)
      .setOrigin(0.5, CHICK_BODY_ORIGIN_Y)
      .setDepth(DEPTH.bird);
    this.playBirdClip('glide');

    this.layout();
    this.scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }

  /**
   * Pipe slots are created on demand rather than from a fixed pool size.
   *
   * How many pipes the simulation holds is a function of viewWidth: a 1280x800 window is ~23.6
   * world units wide and carries about seven, where a phone carries three. A fixed pool sized
   * for the phone silently stopped drawing the overflow — a pipe that still existed, and could
   * still be collided with, but was invisible. Growing here also covers a mid-run resize.
   */
  private ensurePipeSlots(count: number): void {
    while (this.pipes.length < count) {
      this.pipes.push({
        lowerCap: this.scene.add.image(OFFSCREEN_X, 0, 'flappy_pipe_cap').setOrigin(0.5, 0).setDepth(DEPTH.pipe),
        lowerBody: this.scene.add.image(OFFSCREEN_X, 0, 'flappy_pipe_body').setOrigin(0.5, 0).setDepth(DEPTH.pipe),
        // Flipped, so the rim reads as an opening pointing down at the gap.
        upperCap: this.scene.add
          .image(OFFSCREEN_X, 0, 'flappy_pipe_cap')
          .setOrigin(0.5, 1)
          .setFlipY(true)
          .setDepth(DEPTH.pipe),
        upperBody: this.scene.add.image(OFFSCREEN_X, 0, 'flappy_pipe_body').setOrigin(0.5, 1).setDepth(DEPTH.pipe),
        // Every slot owns a pickup sprite and hides it when unused, so a pipe gaining or losing
        // one is a visibility flip rather than an allocation mid-run. One sprite covers both
        // kinds: a pipe never carries more than one thing.
        pickup: this.scene.add
          .sprite(OFFSCREEN_X, 0, 'flappy_coin', 0)
          .setOrigin(0.5)
          .setDepth(DEPTH.pickup)
          .setVisible(false)
          .play('flappy_coin_spin'),
        pickupKind: 'none',
      });
      this.sizePipeSlot(this.pipes[this.pipes.length - 1]);
    }
  }

  private sizePipeSlot(slot: PipeSlot): void {
    slot.lowerCap.setDisplaySize(this.capWidth, this.capHeight);
    slot.upperCap.setDisplaySize(this.capWidth, this.capHeight);
    this.sizePickup(slot);
  }

  private sizePickup(slot: PipeSlot): void {
    if (slot.pickupKind === 'heart') {
      const width = HEART_PICKUP_WIDTH * this.pxPerUnit;
      slot.pickup.setDisplaySize(width, (slot.pickup.height / slot.pickup.width) * width);
      return;
    }
    const size = (slot.pickupKind === 'shield' ? SHIELD_PICKUP_SIZE : COIN_SIZE) * this.pxPerUnit;
    slot.pickup.setDisplaySize(size, size);
  }

  /** Dresses a slot's one pickup sprite as whatever that pipe is carrying now. */
  private setPickupKind(slot: PipeSlot, kind: PickupKind): void {
    if (slot.pickupKind !== kind) {
      slot.pickupKind = kind;
      if (kind === 'shield') {
        // The spin is a coin animation; leaving it running would step the bubble through the
        // coin's frames, which on a single-frame texture means the sprite simply vanishes.
        slot.pickup.stop();
        slot.pickup.setTexture(SHIELD_TEXTURE);
      } else if (kind === 'heart') {
        // Same reason as the bubble: the spin belongs to the coin's four frames and would step a
        // single-frame texture straight out of existence.
        slot.pickup.stop();
        slot.pickup.setTexture(HEART_TEXTURE);
      } else if (kind === 'coin') {
        slot.pickup.setTexture('flappy_coin', 0);
        slot.pickup.play('flappy_coin_spin');
      }
      this.sizePickup(slot);
    }
    slot.pickup.setVisible(kind !== 'none');
  }

  private registerAnimations(): void {
    const anims = this.scene.anims;
    const frames = (indices: number[]) => anims.generateFrameNumbers('flappy_chick', { frames: indices });
    // Guarded because animations live on the global manager, not the scene: a second visit to
    // FlappyGameScene would otherwise throw on the duplicate key.
    const define = (key: string, indices: number[], frameRate: number, repeat: number) => {
      if (!anims.exists(key)) anims.create({ key, frames: frames(indices), frameRate, repeat });
    };
    // All three are single-frame holds on this sheet. They stay animations rather than becoming
    // setFrame calls so that playBirdClip -- and any future sheet with real frames in it --
    // needs no change at the call sites.
    define('flappy_flight', CHICK_FRAMES.flight, 1, -1);
    define('flappy_fall', CHICK_FRAMES.fall, 1, 0);
    define('flappy_ko', CHICK_FRAMES.ko, 1, 0);

    if (!anims.exists('flappy_coin_spin')) {
      anims.create({
        key: 'flappy_coin_spin',
        frames: anims.generateFrameNumbers('flappy_coin', { start: 0, end: 3 }),
        frameRate: 10,
        repeat: -1,
      });
    }
  }

  private addPropBand(keys: string[], depth: number, parallax: number, heightFraction: number): void {
    // Spread evenly over a span of 1.6 screens, which keeps one or two on screen at a time
    // without them ever lining up into a visible repeat.
    const span = this.view.width * 1.6;
    keys.forEach((key, i) => {
      const image = this.scene.add.image(OFFSCREEN_X, 0, key).setDepth(depth);
      image.setOrigin(0.5, heightFraction === 0 ? 1 : 0.5);
      this.props.push({ image, parallax, offset: (span / keys.length) * i, span, heightFraction });
    });
  }

  /**
   * Derives the world-to-screen mapping.
   *
   * The ground band is drawn BELOW world y = 0, so the flyable air is the canvas minus that
   * band. That is what keeps viewHeight at exactly REFERENCE_VIEW_HEIGHT: the sim gets the same
   * vertical room it was tuned against, and the grass the bird crashes into is really the
   * surface at y = 0 rather than a strip painted over the play area.
   */
  private measure(): void {
    const { width, height } = this.scene.scale.gameSize;
    this.canvas = { width, height };
    const groundHeight = Math.round(height * GROUND_BAND);
    this.groundY = height - groundHeight;
    this.pxPerUnit = this.groundY / REFERENCE_VIEW_HEIGHT;
    // Derived from the mapping rather than clamped: this is exactly how many world units of
    // canvas width there are, so the sim's spawn and despawn edges always match what is visible.
    this.view = { width: width / this.pxPerUnit, height: REFERENCE_VIEW_HEIGHT };
  }

  private layout(): void {
    const { width, height } = this.canvas;
    const groundHeight = height - this.groundY;

    this.sky.clear();
    this.sky.fillGradientStyle(SKY_TOP, SKY_TOP, SKY_BOTTOM, SKY_BOTTOM, 1);
    this.sky.fillRect(0, 0, width, height);

    const hillHeight = this.groundY * HILL_BAND;
    const hillTexture = this.scene.textures.get('flappy_hillside').getSourceImage();
    const hillScale = hillHeight / hillTexture.height;
    this.hills
      .setPosition(0, this.groundY + groundHeight * HILL_SINK_FRACTION)
      .setSize(width, hillHeight)
      .setTileScale(hillScale, hillScale);

    const groundTexture = this.scene.textures.get('flappy_ground').getSourceImage();
    const groundScale = groundHeight / groundTexture.height;
    this.ground.setPosition(0, this.groundY).setSize(width, groundHeight).setTileScale(groundScale, groundScale);

    const capTexture = this.scene.textures.get('flappy_pipe_cap').getSourceImage();
    this.capWidth = this.geometry.pipeWidth * this.pxPerUnit;
    const capScale = this.capWidth / capTexture.width;
    this.capHeight = capTexture.height * capScale;
    for (const slot of this.pipes) this.sizePipeSlot(slot);

    this.bird.setDisplaySize(BIRD_SIZE * this.pxPerUnit, BIRD_SIZE * this.pxPerUnit);

    for (const prop of this.props) {
      const size = (prop.heightFraction === 0 ? 1.5 : 1.9) * this.pxPerUnit;
      const texture = prop.image.texture.getSourceImage();
      prop.image.setDisplaySize(size, (texture.height / texture.width) * size);
      prop.span = this.view.width * 1.6;
    }

    // Re-place anything whose position is a function of the layout, so a resize mid-run does
    // not leave the scenery a frame behind.
    this.setScroll(this.lastScroll);
  }

  private onResize(): void {
    this.measure();
    this.layout();
  }

  /** Canvas y for a world y. */
  private screenY(worldY: number): number {
    return this.groundY - worldY * this.pxPerUnit;
  }

  /** Canvas x for a world x. */
  private screenX(worldX: number): number {
    return this.canvas.width / 2 + worldX * this.pxPerUnit;
  }

  /**
   * `x` is passed in rather than fixed here because it is a simulation quantity — collision and
   * scoring are measured against it — and this module does not import FlappySim (see the module
   * docstring). FlappyGameScene, which owns both, hands it over.
   */
  setBirdPose(x: number, y: number, pitchRadians: number): void {
    this.bird.setPosition(this.screenX(x), this.screenY(y));
    // Negated: the sim's positive pitch is nose-up, and Phaser's positive rotation is clockwise
    // on a y-down canvas, which for a right-facing sprite is nose-DOWN.
    this.bird.setRotation(-pitchRadians);
  }

  /**
   * Draws the bird in its shielded pose, or back in its normal one.
   *
   * The sheet draws the shielded bird as a complete sprite -- bird inside bubble -- so this is a
   * frame swap, not a bubble composited over the bird. That is why it has to stop the animation
   * first: a running clip would step straight off frame 3 on its next tick.
   *
   * Called every frame with the same value, so it returns early rather than re-issuing the swap.
   */
  setShielded(shielded: boolean): void {
    if (shielded === this.shielded) return;
    this.shielded = shielded;
    if (shielded) {
      this.bird.stop();
      this.bird.setTexture('flappy_chick', CHICK_SHIELDED_FRAME);
      return;
    }
    // Cleared so playBirdClip does not treat 'glide' as already playing -- the pose swap left
    // `current` pointing at a clip that is no longer on screen.
    this.current = null;
    this.playBirdClip('glide');
  }

  setPipes(
    pipes: ReadonlyArray<{
      id: number;
      x: number;
      gapBottom: number;
      pickup: PickupKind;
      pickupTaken: boolean;
      pickupOffset: number;
    }>,
  ): void {
    this.ensurePipeSlots(pipes.length);
    for (let i = 0; i < this.pipes.length; i++) {
      const slot = this.pipes[i];
      const pipe = pipes[i];
      if (!pipe) {
        slot.lowerCap.x = OFFSCREEN_X;
        slot.lowerBody.x = OFFSCREEN_X;
        slot.upperCap.x = OFFSCREEN_X;
        slot.upperBody.x = OFFSCREEN_X;
        slot.pickup.setVisible(false);
        continue;
      }

      const x = this.screenX(pipe.x);
      const gapBottomY = this.screenY(pipe.gapBottom);
      const gapTopY = this.screenY(pipe.gapBottom + this.geometry.pipeGap);
      // The body starts slightly INSIDE the cap. Both sprites' facing edges are softened by the
      // keying pass, so butting them up exactly leaves a visible seam across the shaft. A
      // fraction of the cap rather than a fixed pixel count, since the canvas is sized in
      // physical pixels and a 1px nudge disappears at DPR 2.
      const overlap = Math.max(2, this.capHeight * 0.04);

      // Both bodies keep the cap's full width, so the shaft art inside them lines up under the
      // rim; only the height changes per frame.
      const lowerTop = gapBottomY + this.capHeight - overlap;
      slot.lowerCap.setPosition(x, gapBottomY);
      slot.lowerBody.setPosition(x, lowerTop);
      slot.lowerBody.setDisplaySize(this.capWidth, Math.max(1, this.canvas.height - lowerTop));

      const upperBottom = gapTopY - this.capHeight + overlap;
      slot.upperCap.setPosition(x, gapTopY);
      slot.upperBody.setPosition(x, upperBottom);
      slot.upperBody.setDisplaySize(this.capWidth, Math.max(1, upperBottom));

      // Taken from the pipe rather than derived here. This used to draw the pickup at the
      // midpoint of the gap, which was a second copy of a rule the simulation also held -- and
      // the moment pickups moved off centre, the drawn coin and the collectable one would have
      // parted company.
      const kind: PickupKind = pipe.pickupTaken ? 'none' : pipe.pickup;
      this.setPickupKind(slot, kind);
      if (kind !== 'none') {
        slot.pickup.setPosition(x, this.screenY(pipe.gapBottom + this.geometry.pipeGap / 2 + pipe.pickupOffset));
      }
    }
  }

  /**
   * Blinks the bird for the duration of the post-hit grace period, so "I passed straight through
   * that pipe" reads as intended rather than as a collision bug.
   *
   * Driven off the simulation's own countdown rather than wall-clock time, so the blink starts
   * and stops exactly with the invulnerability it is advertising.
   */
  setBirdInvulnerable(secondsLeft: number): void {
    this.bird.setAlpha(secondsLeft > 0 && Math.floor(secondsLeft * 12) % 2 === 0 ? 0.35 : 1);
  }

  setScroll(distance: number): void {
    this.lastScroll = distance;
    const travelled = distance * this.pxPerUnit;

    this.ground.tilePositionX = travelled / this.ground.tileScaleX;
    this.hills.tilePositionX = (travelled * 0.3) / this.hills.tileScaleX;

    for (const prop of this.props) {
      const span = prop.span;
      // Positive modulo, so the band keeps wrapping once `distance` is large.
      const wrapped = (((prop.offset - distance * prop.parallax) % span) + span) % span;
      prop.image.x = this.screenX(-this.view.width / 2) + wrapped * this.pxPerUnit;
      prop.image.y = prop.heightFraction === 0 ? this.groundY : this.screenY(this.view.height * prop.heightFraction);
    }
  }

  /**
   * `flap` is not its own animation: the flight loop always runs while the bird is alive, and a
   * tap restarts it from the top of the stroke so the wingbeat still lands on the input. Note
   * the deliberate absence of `true` on that play() -- play(key, ignoreIfPlaying) would skip the
   * call while the loop is mid-cycle, which is exactly when a tap needs to be felt.
   */
  playBirdClip(name: 'flap' | 'glide' | 'fall' | 'ko'): void {
    // While shielded the bird holds its bubble pose; only death overrides it, and the sim
    // cannot kill a shielded bird in the same hit that pops the bubble.
    if (this.shielded && (name === 'flap' || name === 'glide')) return;
    if (name === 'flap') {
      if (this.current === 'glide') this.bird.play('flappy_flight');
      return;
    }
    if (this.current === name) return;
    this.current = name;
    this.bird.play(name === 'glide' ? 'flappy_flight' : `flappy_${name}`, true);
  }

  destroy(): void {
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResize, this);
    this.sky.destroy();
    this.hills.destroy();
    this.ground.destroy();
    this.bird.destroy();
    for (const slot of this.pipes) {
      slot.lowerCap.destroy();
      slot.lowerBody.destroy();
      slot.upperCap.destroy();
      slot.upperBody.destroy();
      slot.pickup.destroy();
    }
    this.pipes.length = 0;
    for (const prop of this.props) prop.image.destroy();
    this.props.length = 0;
  }
}
