class State {
  // TODO: SAVE THE STATES
  constructor(flying) {
    this.flying = flying
    this.hasJumped = false
    this.isOnGround = true
    this.isSprinting = false
  }

  set = obj => {
    Object.assign(this, { obj })
  }
}

export default State
