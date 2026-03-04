'use strict'

/**
 * HostSpec - Represents a database host specification
 * Encapsulates host and port information for multi-host connections
 */
class HostSpec {
  /**
   * Constructor
   * @param {string} host - The hostname or IP address
   * @param {number} port - The port number
   */
  constructor(host, port) {
    this.host = host
    this.port = port
  }

  /**
   * Convert to string representation (host:port)
   * @returns {string} String representation of the host spec
   */
  toString() {
    return `${this.host}:${this.port}`
  }

  /**
   * Check equality with another HostSpec
   * @param {HostSpec} other - Another HostSpec instance
   * @returns {boolean} True if both host and port are equal
   */
  equals(other) {
    if (!other) return false
    return this.host === other.host && this.port === other.port
  }
}

module.exports = HostSpec
