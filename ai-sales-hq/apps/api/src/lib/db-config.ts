// Pure URL -> mariadb connection settings (no Prisma import, so ops tools stay small).

/** mysql://user:pass@host:port/db?socketPath=/path -> mariadb pool config. */
export function poolConfigFromUrl(databaseUrl: string) {
  const url = new URL(databaseUrl);
  const socketPath = url.searchParams.get('socketPath') ?? undefined;
  return {
    host: url.hostname || 'localhost',
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database: url.pathname.replace(/^\//, ''),
    ...(socketPath ? { socketPath } : {}),
    connectionLimit: Number(url.searchParams.get('connectionLimit') ?? 5),
    // MySQL 8 default auth (caching_sha2_password) over TCP without TLS.
    allowPublicKeyRetrieval: true,
    // Store and read DATETIME as UTC regardless of the server time zone.
    timezone: 'Z',
  };
}
