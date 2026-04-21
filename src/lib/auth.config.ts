// Edge-compatible auth config (no DB/Node.js-only imports)
import type { NextAuthConfig } from "next-auth";
import Credentials from "next-auth/providers/credentials";

export const authConfig: NextAuthConfig = {
  providers: [
    // Provider config here is minimal — actual credential verification
    // happens in auth.ts (Node.js runtime only)
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // authorize runs only in Node.js context (auth.ts overrides this)
      async authorize() {
        return null;
      },
    }),
  ],
  callbacks: {
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role: string }).role;
        token.id = user.id;
      }
      return token;
    },
    session({ session, token }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.user.role = (token as any).role as string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      session.user.id = (token as any).id as string;
      return session;
    },
    authorized({ auth }) {
      return !!auth?.user;
    },
  },
  pages: {
    signIn: "/login",
  },
  session: { strategy: "jwt" },
};
