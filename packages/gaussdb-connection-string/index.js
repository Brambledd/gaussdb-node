'use strict'

//Parse method copied from https://github.com/brianc/node-postgres
//Copyright (c) 2010-2014 Brian Carlson (brian.m.carlson@gmail.com)
//Copyright (c) 2025 happy-game
//MIT License

/**
 * Parse multiple hosts from hostname string
 * @param {string} hostnameString - Comma-separated host:port string
 * @param {number} defaultPort - Default port to use if not specified
 * @returns {Array<{host: string, port: number}>} Array of host specs
 */
function parseMultipleHosts(hostnameString, defaultPort) {
  const hostTokens = (hostnameString || '')
    .split(',')
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

  if (hostTokens.length === 0) return []

  return hostTokens.map((token) => {
    const colonIndex = token.indexOf(':')

    // Check if there's a port specification (host:port)
    if (colonIndex > 0) {
      const host = token.substring(0, colonIndex)
      const port = parseInt(token.substring(colonIndex + 1), 10)
      return {
        host: decodeURIComponent(host),
        port: port || defaultPort,
      }
    }

    // No port specified
    return {
      host: decodeURIComponent(token),
      port: defaultPort,
    }
  })
}

//parses a connection string
function parse(str, options = {}) {
  //unix socket
  if (str.charAt(0) === '/') {
    const config = str.split(' ')
    return { host: config[0], database: config[1] }
  }

  // Check for empty host in URL

  const config = {}
  let result
  let dummyHost = false
  let multiHostString = null
  let extractedPort = null

  // Extract multi-host format BEFORE URL encoding
  // Match pattern: gaussdb://[user:pass@]host1[:port1],host2[:port2],.../database
  const multiHostMatch = str.match(/^(gaussdb:\/\/(?:[^@]+@)?)([^/?]+)(\/.*)?$/)
  if (multiHostMatch && multiHostMatch[2] && multiHostMatch[2].includes(',')) {
    multiHostString = multiHostMatch[2]

    // Determine the default port by checking if only the last host has a port
    // e.g., "node1,node2,node3:5433" -> default port is 5433
    // e.g., "node1:5432,node2:5433" -> default port is 5432 (standard)
    const hostParts = multiHostString.split(',')
    let hasMultiplePortSpecifications = false
    let lastPartPort = null

    for (let i = 0; i < hostParts.length; i++) {
      const part = hostParts[i].trim()
      const colonIndex = part.indexOf(':')
      const hasPort = colonIndex > 0

      if (hasPort && i < hostParts.length - 1) {
        hasMultiplePortSpecifications = true
        break
      }
      if (hasPort && i === hostParts.length - 1) {
        lastPartPort = part.substring(colonIndex + 1)
      }
    }

    // If only last part has port, use it as default; otherwise use 5432
    extractedPort = !hasMultiplePortSpecifications && lastPartPort ? lastPartPort : '5432'

    // Replace with placeholder host
    str = multiHostMatch[1] + '__MULTI_HOST_PLACEHOLDER__' + (multiHostMatch[3] || '')
  }

  if (/ |%[^a-f0-9]|%[a-f0-9][^a-f0-9]/i.test(str)) {
    // Ensure spaces are encoded as %20
    str = encodeURI(str).replace(/%25(\d\d)/g, '%$1')
  }

  try {
    result = new URL(str, 'gaussdb://base')
  } catch (e) {
    // The URL is invalid so try again with a dummy host
    result = new URL(str.replace('@/', '@___DUMMY___/'), 'gaussdb://base')
    dummyHost = true
  }

  // We'd like to use Object.fromEntries() here but Node.js 10 does not support it
  for (const entry of result.searchParams.entries()) {
    config[entry[0]] = entry[1]
  }

  config.user = config.user || decodeURIComponent(result.username)
  config.password = config.password || decodeURIComponent(result.password)

  if (result.protocol == 'socket:') {
    config.host = decodeURI(result.pathname)
    config.database = result.searchParams.get('db')
    config.client_encoding = result.searchParams.get('encoding')
    return config
  }
  const hostname = dummyHost ? '' : result.hostname
  if (!config.host) {
    // Only set the host if there is no equivalent query param.
    config.host = decodeURIComponent(hostname)
  } else if (hostname && /^%2f/i.test(hostname)) {
    // Only prepend the hostname to the pathname if it is not a URL encoded Unix socket host.
    result.pathname = hostname + result.pathname
  }
  if (!config.port) {
    // Only set the port if there is no equivalent query param.
    config.port = result.port
  }

  const pathname = result.pathname.slice(1) || null
  config.database = pathname ? decodeURI(pathname) : null

  // Parse multiple hosts if we extracted multi-host string
  if (multiHostString) {
    const defaultPort = parseInt(extractedPort, 10)
    const hosts = parseMultipleHosts(multiHostString, defaultPort)
    if (hosts.length > 0) {
      config.hosts = hosts
      // Set first host as default for backward compatibility
      config.host = hosts[0].host
      config.port = hosts[0].port
    } else if (config.host === '__MULTI_HOST_PLACEHOLDER__') {
      config.host = ''
      config.port = defaultPort
    }
  }

  // Parse loadBalanceHosts parameter
  if (config.loadBalanceHosts === 'true' || config.loadBalanceHosts === '1') {
    config.loadBalanceHosts = true
  } else if (config.loadBalanceHosts === 'false' || config.loadBalanceHosts === '0') {
    config.loadBalanceHosts = false
  }

  if (config.ssl === 'true' || config.ssl === '1') {
    config.ssl = true
  }

  if (config.ssl === '0') {
    config.ssl = false
  }

  if (config.sslcert || config.sslkey || config.sslrootcert || config.sslmode) {
    config.ssl = {}
  }

  // Only try to load fs if we expect to read from the disk
  const fs = config.sslcert || config.sslkey || config.sslrootcert ? require('fs') : null

  if (config.sslcert) {
    config.ssl.cert = fs.readFileSync(config.sslcert).toString()
  }

  if (config.sslkey) {
    config.ssl.key = fs.readFileSync(config.sslkey).toString()
  }

  if (config.sslrootcert) {
    config.ssl.ca = fs.readFileSync(config.sslrootcert).toString()
  }

  if (options.useLibpqCompat && config.uselibpqcompat) {
    throw new Error('Both useLibpqCompat and uselibpqcompat are set. Please use only one of them.')
  }

  if (config.uselibpqcompat === 'true' || options.useLibpqCompat) {
    switch (config.sslmode) {
      case 'disable': {
        config.ssl = false
        break
      }
      case 'prefer': {
        config.ssl.rejectUnauthorized = false
        break
      }
      case 'require': {
        if (config.sslrootcert) {
          // If a root CA is specified, behavior of `sslmode=require` will be the same as that of `verify-ca`
          config.ssl.checkServerIdentity = function () {}
        } else {
          config.ssl.rejectUnauthorized = false
        }
        break
      }
      case 'verify-ca': {
        if (!config.ssl.ca) {
          throw new Error(
            'SECURITY WARNING: Using sslmode=verify-ca requires specifying a CA with sslrootcert. If a public CA is used, verify-ca allows connections to a server that somebody else may have registered with the CA, making you vulnerable to Man-in-the-Middle attacks. Either specify a custom CA certificate with sslrootcert parameter or use sslmode=verify-full for proper security.'
          )
        }
        config.ssl.checkServerIdentity = function () {}
        break
      }
      case 'verify-full': {
        break
      }
    }
  } else {
    switch (config.sslmode) {
      case 'disable': {
        config.ssl = false
        break
      }
      case 'prefer':
      case 'require':
      case 'verify-ca':
      case 'verify-full': {
        break
      }
      case 'no-verify': {
        config.ssl.rejectUnauthorized = false
        break
      }
    }
  }

  return config
}

// convert gaussdb-connection-string ssl config to a ClientConfig.ConnectionOptions
function toConnectionOptions(sslConfig) {
  const connectionOptions = Object.entries(sslConfig).reduce((c, [key, value]) => {
    // we explicitly check for undefined and null instead of `if (value)` because some
    // options accept falsy values. Example: `ssl.rejectUnauthorized = false`
    if (value !== undefined && value !== null) {
      c[key] = value
    }

    return c
  }, {})

  return connectionOptions
}

// convert gaussdb-connection-string config to a ClientConfig
function toClientConfig(config) {
  const poolConfig = Object.entries(config).reduce((c, [key, value]) => {
    if (key === 'ssl') {
      const sslConfig = value

      if (typeof sslConfig === 'boolean') {
        c[key] = sslConfig
      }

      if (typeof sslConfig === 'object') {
        c[key] = toConnectionOptions(sslConfig)
      }
    } else if (value !== undefined && value !== null) {
      if (key === 'port') {
        // when port is not specified, it is converted into an empty string
        // we want to avoid NaN or empty string as a values in ClientConfig
        if (value !== '') {
          const v = parseInt(value, 10)
          if (isNaN(v)) {
            throw new Error(`Invalid ${key}: ${value}`)
          }

          c[key] = v
        }
      } else {
        c[key] = value
      }
    }

    return c
  }, {})

  return poolConfig
}

// parses a connection string into ClientConfig
function parseIntoClientConfig(str) {
  return toClientConfig(parse(str))
}

module.exports = parse

parse.parse = parse
parse.parseMultipleHosts = parseMultipleHosts
parse.toClientConfig = toClientConfig
parse.parseIntoClientConfig = parseIntoClientConfig
