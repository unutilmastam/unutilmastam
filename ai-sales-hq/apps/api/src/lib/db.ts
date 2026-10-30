import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';
import { poolConfigFromUrl } from './db-config';

export { poolConfigFromUrl };

export type Db = PrismaClient;

export function createDb(databaseUrl: string): Db {
  const adapter = new PrismaMariaDb(poolConfigFromUrl(databaseUrl));
  return new PrismaClient({ adapter });
}
