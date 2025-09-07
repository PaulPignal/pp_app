// App Router + NextAuth v4
import NextAuth from 'next-auth';
import { authOptions } from '@/auth';

export const runtime = "nodejs";         // évite l'Edge (incompatible avec modules natifs/bcrypt/sqlite)
export const dynamic = "force-dynamic";  // empêche le pré-rendu / data collection
export const revalidate = 0;             // pas de cache SSG pour cette route
export const fetchCache = "force-no-store";

const handler = NextAuth(authOptions) ;
export { handler as GET, handler as POST };
