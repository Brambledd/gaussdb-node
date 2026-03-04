import { ClientConfig } from 'gaussdb-node'

export function parse(connectionString: string, options?: Options): ConnectionOptions

export interface Options {
  // Use libpq semantics when interpreting the connection string
  useLibpqCompat?: boolean
}

interface SSLConfig {
  ca?: string
  cert?: string | null
  key?: string
  rejectUnauthorized?: boolean
}

export interface HostSpec {
  host: string
  port: number
}

export interface ConnectionOptions {
  host: string | null
  password?: string
  user?: string
  port?: string | null
  database: string | null | undefined
  client_encoding?: string
  ssl?: boolean | string | SSLConfig

  application_name?: string
  fallback_application_name?: string
  options?: string
  keepalives?: number

  // Multi-host configuration
  hosts?: HostSpec[]

  // Load balancing mode (corresponds to JDBC autoBalance)
  // false: no load balancing (default)
  // true/'roundrobin'/'balance': round-robin mode
  // 'shuffle': random mode
  // 'leastconn': least connection mode (phase 2)
  // 'priority[n]': priority round-robin mode (phase 2)
  loadBalanceHosts?: boolean | string

  // Target server type for connections (corresponds to JDBC targetServerType)
  // 'any': connect to any node (default)
  // 'master': connect to master node only
  // 'slave': connect to slave node only
  // 'preferSlave': prefer slave node, fallback to master if no slave available
  targetServerType?: 'any' | 'master' | 'slave' | 'preferSlave'

  // Host status recheck interval in seconds
  hostRecheckSeconds?: number

  // We allow any other options to be passed through
  [key: string]: unknown
}

export function toClientConfig(config: ConnectionOptions): ClientConfig
export function parseIntoClientConfig(connectionString: string): ClientConfig
