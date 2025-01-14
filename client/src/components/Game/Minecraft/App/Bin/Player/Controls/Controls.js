import * as THREE from 'three'

import PointerLockControls from './PointerLockControls'
import Config from '../../../../Data/Config'
import Helpers from '../../../../Utils/Helpers'
import Stateful from '../../../../Utils/Stateful'
import Keyboard from './Keyboard'

const HORZ_MAX_SPEED = Config.player.maxSpeed.horizontal,
  VERT_MAX_SPEED = Config.player.maxSpeed.vertical,
  INERTIA = Config.player.inertia,
  FRIC_INERTIA = Config.player.fricIntertia,
  IN_AIR_INERTIA = Config.player.inAirInertia,
  SPRINT_FACTOR = Config.player.sprintFactor,
  FORW_ACC = Config.player.acceleration.forward,
  OTHER_HORZ_ACC = Config.player.acceleration.other_horz,
  VERITCAL_ACC = Config.player.acceleration.vertical,
  JUMP_ACC = Config.player.acceleration.jump,
  GRAVITY = Config.world.gravity,
  COORD_DEC = Config.player.coordinateDec,
  DIMENSION = Config.block.dimension,
  P_WIDTH = Config.player.aabb.width,
  P_DEPTH = Config.player.aabb.depth,
  P_I_2_TOE = Config.player.aabb.eye2toe,
  P_I_2_TOP = Config.player.aabb.eye2top,
  {
    movements: MOVEMENT_KEYS,
    inventory: INVENTORY_KEYS,
    multiplayer: MULTIPLAYER_KEYS
  } = Config.keyboard

class Controls extends Stateful {
  constructor(
    player,
    status,
    world,
    chat,
    camera,
    container,
    blocker,
    initPos,
    initDirs
  ) {
    super()

    // Controls
    this.threeControls = new PointerLockControls(
      camera,
      container,
      initPos,
      initDirs
    )

    // Physics
    this.vel = new THREE.Vector3(0, 0, 0)
    this.acc = new THREE.Vector3(0, 0, 0)

    this.movements = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      down: false,
      up: false
    }

    // Keyboard & mouse
    this.mouseKey = null
    this.keyboard = new Keyboard()
    this.keyboard.initialize()

    // Connections to outer space
    this.player = player
    this.status = status
    this.world = world
    this.chat = chat
    this.blocker = blocker

    // Others
    this.prevTime = performance.now()

    this.initListeners()
  }

  initListeners = () => {
    this.blocker.addEventListener('click', this._unblockGame, false)

    this.threeControls.addEventListener('unlock', this._blockGame, false)

    // Register Game Keys
    this._registerKeys()
    document.addEventListener('mousedown', this._handleMouseDown, false)
  }

  tick = () => {
    this._handleMouseInputs()
    this._handleMovements()
  }

  /**
   * Getters
   */
  getDirections = () => {
    return {
      dirx: Helpers.round(this.threeControls.getPitch().rotation.x, COORD_DEC),
      diry: Helpers.round(this.threeControls.getObject().rotation.y, COORD_DEC)
    }
  }
  getObject = () => this.threeControls.getObject()
  getNormalizedCamPos = (dec = COORD_DEC) => {
    // Normalized as in normalized to world coordinates
    const position = this.getObject().position.clone()
    return Helpers.roundPos(Helpers.toGlobalBlock(position, false), dec)
  }

  /**
   * INTERNAL FUNCTIONS
   */
  _resetMovements = () =>
    (this.movements = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      down: false,
      up: false
    })

  _handleMouseInputs = () => {
    if (typeof this.mouseKey === 'number') {
      switch (this.mouseKey) {
        case 0: // Left Key
          this.world.breakBlock()
          break
        case 2: // Right Key
          const type = this.player.inventory.getHand()
          if (type) this.world.placeBlock(type)
          break
        default:
          break
      }
      this.mouseKey = null
    }
  }

  _registerKeys = () => {
    /**
     * CHAT KEYS ('chat')
     */
    this.keyboard.registerKey(13, 'chat', this.chat.handleEnter)
    // this.keyboard.registerKey(38, ) // up
    // this.keyboard.registerKey(40, ) // down
    this.keyboard.registerKey(37, 'chat', this.chat.input.moveLeft)
    this.keyboard.registerKey(39, 'chat', this.chat.input.moveRight)

    this.keyboard.registerKey(
      27,
      'chat',
      this.chat.disable,
      this._unblockGame,
      undefined,
      { repeat: false }
    )

    this.keyboard.setScopeDefaultHandler('chat', event => {
      const char = String.fromCharCode(event.keyCode)
      this.chat.input.insert(char)
    })

    /**
     * moving KEYS ('moving')
     */
    this.keyboard.registerIndexedKeyGroup(
      [
        INVENTORY_KEYS.h1,
        INVENTORY_KEYS.h2,
        INVENTORY_KEYS.h3,
        INVENTORY_KEYS.h4,
        INVENTORY_KEYS.h5,
        INVENTORY_KEYS.h6,
        INVENTORY_KEYS.h7,
        INVENTORY_KEYS.h8,
        INVENTORY_KEYS.h9
      ],
      'moving',
      index => {
        if (this.player.inventory.getCursor() !== index) {
          this.player.mutateSelf({ cursor: index })
          this.player.inventory.switchHotbar(index)
        }
      }
    )

    this.keyboard.registerKey(
      MOVEMENT_KEYS.forward,
      'moving',
      () => (this.movements.forward = true),
      () => {
        this.movements.forward = false
        this.status.registerWalk()
      },
      this.status.registerSprint,
      { immediate: true }
    )

    this.keyboard.registerKey(
      MOVEMENT_KEYS.backward,
      'moving',
      () => (this.movements.backward = true),
      () => (this.movements.backward = false)
    )

    this.keyboard.registerKey(
      MOVEMENT_KEYS.left,
      'moving',
      () => (this.movements.left = true),
      () => (this.movements.left = false)
    )

    this.keyboard.registerKey(
      MOVEMENT_KEYS.right,
      'moving',
      () => (this.movements.right = true),
      () => (this.movements.right = false)
    )

    this.keyboard.registerKey(
      MOVEMENT_KEYS.jump,
      'moving',
      () => (this.movements.up = true),
      () => (this.movements.up = false),
      () => {
        if (this.status.canFly && this.status.isCreative)
          this.status.toggleFly()
      },
      { immediate: true }
    )

    this.keyboard.registerKey(
      MOVEMENT_KEYS.sneak,
      'moving',
      () => (this.movements.down = true),
      () => (this.movements.down = false)
    )

    this.keyboard.registerKey(MULTIPLAYER_KEYS.openChat, 'moving', () => {
      this.chat.enable()
      this.threeControls.unlock()
      this.keyboard.setScope('chat')
    })

    /**
     * Not in game ('menu')
     */
    this.keyboard.registerKey(
      27, // esc
      'menu',
      undefined,
      this._unblockGame,
      undefined,
      { repeat: false }
    )

    /**
     * DEV TOOLS
     */
    this.keyboard.registerKey(66, 'moving', this.status.toggleSprint)
    this.keyboard.registerKey(78, 'moving', this.status.toggleFly)
  }

  _unblockGame = () => {
    this.blocker.style.display = 'none'
    this.keyboard.setScope('moving')
    this.threeControls.lock()
  }

  _blockGame = () => {
    this._resetMovements()
    if (!this.chat.enabled) {
      this.keyboard.setScope('menu')
      this.blocker.style.display = 'block'
    }
  }

  _handleMovements = () => {
    const now = performance.now()
    const isFlying = this.status.isFlying,
      isOnGround = this.status.isOnGround,
      shouldGravity = this.status.shouldGravity,
      isSprinting = this.status.isSprinting

    let delta = (now - this.prevTime) / 1000

    if (delta > 0.5) delta = 0.01

    this._calculateAccelerations()

    // Update velocity with inertia
    this.vel.x -=
      this.vel.x *
      (isFlying
        ? INERTIA
        : (isOnGround ? FRIC_INERTIA : IN_AIR_INERTIA) /
          (isSprinting ? SPRINT_FACTOR : 1)) *
      delta
    if (!shouldGravity) this.vel.y -= this.vel.y * INERTIA * delta
    this.vel.z -=
      this.vel.z *
      (isFlying
        ? INERTIA
        : (isOnGround ? FRIC_INERTIA : IN_AIR_INERTIA) /
          (isSprinting ? SPRINT_FACTOR : 1)) *
      delta

    this.vel.add(this.acc)
    this.acc.set(0.0, 0.0, 0.0)

    // APPLY GRAVITY
    if (shouldGravity && !this.freshlyJumped) this.vel.y += GRAVITY

    if (this.vel.x > HORZ_MAX_SPEED) this.vel.x = HORZ_MAX_SPEED
    else if (this.vel.x < -HORZ_MAX_SPEED) this.vel.x = -HORZ_MAX_SPEED
    if (this.vel.y > VERT_MAX_SPEED) this.vel.y = VERT_MAX_SPEED
    else if (this.vel.y < -VERT_MAX_SPEED) this.vel.y = -VERT_MAX_SPEED
    if (this.vel.z > HORZ_MAX_SPEED) this.vel.z = HORZ_MAX_SPEED
    else if (this.vel.z < -HORZ_MAX_SPEED) this.vel.z = -HORZ_MAX_SPEED

    this._handleCollisions(delta)

    this.prevTime = now
    this.freshlyJumped = false
  }

  _calculateAccelerations = () => {
    const { diry } = this.getDirections()

    // Extract movement info for later convenience
    const { up, down, left, right, forward, backward } = this.movements

    if (up) {
      if (this.status.isFlying) this.acc.y += VERITCAL_ACC
      else if (this.status.canJump) {
        // SURVIVAL MODE
        this.acc.y += JUMP_ACC
        this.freshlyJumped = true
        this.status.registerJump()
      }
    } else if (down) this.acc.y -= VERITCAL_ACC

    if (left) {
      this.acc.x += -Math.sin(diry + Math.PI / 2) * OTHER_HORZ_ACC
      this.acc.z += -Math.cos(diry + Math.PI / 2) * OTHER_HORZ_ACC
    }

    if (right) {
      this.acc.x += Math.sin(diry + Math.PI / 2) * OTHER_HORZ_ACC
      this.acc.z += Math.cos(diry + Math.PI / 2) * OTHER_HORZ_ACC
    }

    if (forward) {
      // TODO: implement sprint here.
      this.acc.x += -Math.sin(diry) * FORW_ACC
      this.acc.z += -Math.cos(diry) * FORW_ACC
    }

    if (backward) {
      this.acc.x += Math.sin(diry) * OTHER_HORZ_ACC
      this.acc.z += Math.cos(diry) * OTHER_HORZ_ACC
    }
  }

  _handleCollisions = delta => {
    // AABB
    const playerPos = this.getNormalizedCamPos(10)
    const scaledVel = this.vel.clone().multiplyScalar(delta / DIMENSION)

    const EPSILON = 1 / 1024

    let newX, newY, newZ

    if (!this.status.isSpectator) {
      // X-AXIS COLLISION
      if (!Helpers.approxEquals(scaledVel.x, 0)) {
        const min_x = playerPos.x - P_WIDTH / 2
        const max_x = playerPos.x + P_WIDTH / 2
        const min_y = Math.floor(playerPos.y - P_I_2_TOE)
        const max_y = Math.floor(playerPos.y + P_I_2_TOP)
        const min_z = Math.floor(playerPos.z - P_DEPTH / 2)
        const max_z = Math.floor(playerPos.z + P_DEPTH / 2)

        const isPos = scaledVel.x > 0

        let start_x, end_x
        if (scaledVel.x > 0) {
          start_x = max_x
          end_x = max_x + scaledVel.x
        } else {
          start_x = min_x + scaledVel.x
          end_x = min_x
        }

        for (
          let pos_x = isPos ? end_x : start_x;
          isPos ? pos_x >= start_x : pos_x <= end_x;
          isPos ? pos_x-- : pos_x++
        ) {
          let voxelExists = false
          for (let y = min_y; y <= max_y; y++) {
            if (voxelExists) break
            for (let z = min_z; z <= max_z; z++)
              if (this.world.getVoxelByVoxelCoords(Math.floor(pos_x), y, z)) {
                voxelExists = true
                break
              }
          }

          if (voxelExists) {
            if (scaledVel.x > 0)
              newX = Math.floor(pos_x) - P_WIDTH / 2 - EPSILON
            else newX = Math.floor(pos_x) + P_WIDTH / 2 + 1 + EPSILON
            scaledVel.x = 0
            break
          }
        }
      }

      // Y-AXIS COLLISION
      if (!Helpers.approxEquals(scaledVel.y, 0)) {
        const min_y = playerPos.y - P_I_2_TOE
        const max_y = playerPos.y + P_I_2_TOP
        const min_x = Math.floor(playerPos.x - P_WIDTH / 2)
        const max_x = Math.floor(playerPos.x + P_WIDTH / 2)
        const min_z = Math.floor(playerPos.z - P_DEPTH / 2)
        const max_z = Math.floor(playerPos.z + P_DEPTH / 2)

        const isPos = scaledVel.y > 0

        let start_y, end_y
        if (scaledVel.y > 0) {
          start_y = max_y
          end_y = max_y + scaledVel.y
        } else {
          start_y = min_y + scaledVel.y
          end_y = min_y
        }

        for (
          let pos_y = isPos ? end_y : start_y;
          isPos ? pos_y >= start_y : pos_y <= end_y;
          isPos ? pos_y-- : pos_y++
        ) {
          let voxelExists = false
          for (let x = min_x; x <= max_x; x++) {
            if (voxelExists) break
            for (let z = min_z; z <= max_z; z++)
              if (this.world.getVoxelByVoxelCoords(x, Math.floor(pos_y), z)) {
                voxelExists = true
                break
              }
          }

          if (voxelExists) {
            if (scaledVel.y > 0) newY = Math.floor(pos_y) - P_I_2_TOP - EPSILON
            else {
              this.status.registerLand()
              newY = Math.floor(pos_y) + 1 + P_I_2_TOE + EPSILON
            }

            scaledVel.y = 0
            break
          }
        }
      }

      // Z-AXIS COLLISION
      if (!Helpers.approxEquals(scaledVel.z, 0)) {
        const min_z = playerPos.z - P_DEPTH / 2
        const max_z = playerPos.z + P_DEPTH / 2
        const min_x = Math.floor(playerPos.x - P_WIDTH / 2)
        const max_x = Math.floor(playerPos.x + P_WIDTH / 2)
        const min_y = Math.floor(playerPos.y - P_I_2_TOE)
        const max_y = Math.floor(playerPos.y + P_I_2_TOP)

        const isPos = scaledVel.z > 0

        let start_z, end_z
        if (scaledVel.z > 0) {
          start_z = max_z
          end_z = max_z + scaledVel.z
        } else {
          start_z = min_z + scaledVel.z
          end_z = min_z
        }

        for (
          let pos_z = isPos ? end_z : start_z;
          isPos ? pos_z >= start_z : pos_z <= end_z;
          isPos ? pos_z-- : pos_z++
        ) {
          let voxelExists = false
          for (let x = min_x; x <= max_x; x++) {
            if (voxelExists) break
            for (let y = min_y; y <= max_y; y++)
              if (this.world.getVoxelByVoxelCoords(x, y, Math.floor(pos_z))) {
                voxelExists = true
                break
              }
          }

          if (voxelExists) {
            if (scaledVel.z > 0)
              newZ = Math.floor(pos_z) - P_DEPTH / 2 - EPSILON
            else newZ = Math.floor(pos_z) + P_DEPTH / 2 + 1 + EPSILON
            scaledVel.z = 0
            break
          }
        }
      }
    }

    if (newX) playerPos.x = newX
    if (newY) playerPos.y = newY
    if (newZ) playerPos.z = newZ

    playerPos.x += scaledVel.x
    playerPos.y += scaledVel.y
    playerPos.z += scaledVel.z

    scaledVel.multiplyScalar(DIMENSION / delta)
    this.vel.copy(scaledVel)

    const position = this.getObject().position
    position.set(playerPos.x, playerPos.y, playerPos.z)
    position.multiplyScalar(DIMENSION)
  }

  _handleMouseDown = e => {
    if (!this.chat.enabled && this.threeControls.isLocked)
      this.mouseKey = e.button
  }
}

export default Controls
